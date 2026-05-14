
-- Staff salary configuration
CREATE TABLE public.staff_salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  user_id uuid NOT NULL,
  base_salary numeric NOT NULL DEFAULT 0,
  hourly_rate numeric NOT NULL DEFAULT 0,
  pay_type text NOT NULL DEFAULT 'monthly', -- monthly | hourly
  allowances numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, user_id)
);
ALTER TABLE public.staff_salaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage salaries" ON public.staff_salaries FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));
CREATE POLICY "view own salary" ON public.staff_salaries FOR SELECT USING (auth.uid() = user_id);
CREATE TRIGGER tg_staff_salaries_updated BEFORE UPDATE ON public.staff_salaries FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Payroll periods
CREATE TABLE public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft', -- draft | processing | approved | paid
  total_amount numeric NOT NULL DEFAULT 0,
  staff_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage payroll_periods" ON public.payroll_periods FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));
CREATE POLICY "members view payroll_periods" ON public.payroll_periods FOR SELECT USING (is_store_member(auth.uid(), store_id));
CREATE TRIGGER tg_payroll_periods_updated BEFORE UPDATE ON public.payroll_periods FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Payslips
CREATE TABLE public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  staff_name text,
  base_salary numeric NOT NULL DEFAULT 0,
  hours_worked numeric NOT NULL DEFAULT 0,
  hourly_pay numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  allowances numeric NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  bonus numeric NOT NULL DEFAULT 0,
  gross_pay numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'draft', -- draft | approved | paid
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_id, user_id)
);
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage payslips" ON public.payslips FOR ALL USING (is_store_admin(auth.uid(), store_id)) WITH CHECK (is_store_admin(auth.uid(), store_id));
CREATE POLICY "view own payslips" ON public.payslips FOR SELECT USING (auth.uid() = user_id);
CREATE TRIGGER tg_payslips_updated BEFORE UPDATE ON public.payslips FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Generate payslips for a period: pulls attendance hours + pending commissions per staff
CREATE OR REPLACE FUNCTION public.generate_payslips(_period_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pp record;
  ur record;
  sal record;
  hrs numeric;
  comm numeric;
  hourly_pay_calc numeric;
  base_pay numeric;
  allow numeric;
  gross numeric;
  net numeric;
  cnt int := 0;
  total_sum numeric := 0;
BEGIN
  SELECT * INTO pp FROM public.payroll_periods WHERE id = _period_id;
  IF pp IS NULL THEN RAISE EXCEPTION 'period not found'; END IF;
  IF NOT public.is_store_admin(auth.uid(), pp.store_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Wipe existing payslips for this period (allow re-generation while draft)
  DELETE FROM public.payslips WHERE period_id = _period_id;

  -- Iterate active staff in this store
  FOR ur IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.store_id = pp.store_id AND COALESCE(ur.is_suspended, false) = false
  LOOP
    SELECT * INTO sal FROM public.staff_salaries WHERE store_id = pp.store_id AND user_id = ur.user_id;

    -- Sum hours from attendance within window
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out, clock_in)) - clock_in)/3600), 0)
      INTO hrs
      FROM public.attendance
      WHERE store_id = pp.store_id AND user_id = ur.user_id
        AND clock_in::date BETWEEN pp.period_start AND pp.period_end;

    -- Sum pending+approved commissions in window
    SELECT COALESCE(SUM(amount), 0) INTO comm
      FROM public.commissions c
      JOIN public.agents a ON a.id = c.agent_id
      WHERE c.store_id = pp.store_id
        AND c.status IN ('pending','approved')
        AND c.created_at::date BETWEEN pp.period_start AND pp.period_end
        AND a.email = (SELECT email FROM public.profiles WHERE id = ur.user_id);

    base_pay := COALESCE(sal.base_salary, 0);
    hourly_pay_calc := CASE WHEN sal.pay_type = 'hourly' THEN COALESCE(sal.hourly_rate,0) * hrs ELSE 0 END;
    allow := COALESCE(sal.allowances, 0);
    gross := base_pay + hourly_pay_calc + comm + allow;
    net := gross; -- deductions added later by admin

    IF gross > 0 OR base_pay > 0 OR hrs > 0 THEN
      INSERT INTO public.payslips(store_id, period_id, user_id, staff_name, base_salary, hours_worked, hourly_pay, commission_amount, allowances, gross_pay, net_pay)
      VALUES (pp.store_id, _period_id, ur.user_id,
        (SELECT full_name FROM public.profiles WHERE id = ur.user_id),
        base_pay, ROUND(hrs::numeric, 2), hourly_pay_calc, comm, allow, gross, net);
      cnt := cnt + 1;
      total_sum := total_sum + net;
    END IF;
  END LOOP;

  UPDATE public.payroll_periods
    SET staff_count = cnt, total_amount = total_sum, status = 'processing', updated_at = now()
    WHERE id = _period_id;

  RETURN cnt;
END $$;

-- Mark period paid: log finance expense + update payslips
CREATE OR REPLACE FUNCTION public.mark_payroll_paid(_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pp record;
BEGIN
  SELECT * INTO pp FROM public.payroll_periods WHERE id = _period_id;
  IF pp IS NULL THEN RAISE EXCEPTION 'period not found'; END IF;
  IF NOT public.is_store_admin(auth.uid(), pp.store_id) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.payslips SET status = 'paid', paid_at = now() WHERE period_id = _period_id;
  UPDATE public.payroll_periods SET status = 'paid', paid_at = now() WHERE id = _period_id;

  INSERT INTO public.finance_records(store_id, type, category, description, amount, source, created_by)
  VALUES (pp.store_id, 'expense', 'Payroll', 'Payroll: ' || pp.name, pp.total_amount, 'payroll-' || _period_id::text, auth.uid());

  -- Mark commissions paid
  UPDATE public.commissions SET status = 'paid', paid_at = now(), paid_by = auth.uid()
    WHERE store_id = pp.store_id AND status IN ('pending','approved')
      AND created_at::date BETWEEN pp.period_start AND pp.period_end;
END $$;
