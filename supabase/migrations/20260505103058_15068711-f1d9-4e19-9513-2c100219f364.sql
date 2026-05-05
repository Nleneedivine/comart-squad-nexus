
-- finance_records
CREATE TYPE public.finance_type AS ENUM ('income','expense');

CREATE TABLE public.finance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  type public.finance_type NOT NULL,
  category text,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  source text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view finance" ON public.finance_records FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert finance" ON public.finance_records FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage finance" ON public.finance_records FOR ALL USING (public.is_store_admin(auth.uid(), store_id)) WITH CHECK (public.is_store_admin(auth.uid(), store_id));

-- wallets
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  pin_hash text,
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view wallet" ON public.wallets FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage wallet" ON public.wallets FOR ALL USING (public.is_store_admin(auth.uid(), store_id)) WITH CHECK (public.is_store_admin(auth.uid(), store_id));
CREATE TRIGGER wallets_updated BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- wallet_transactions
CREATE TYPE public.wallet_tx_kind AS ENUM ('sale','funding','withdrawal');
CREATE TYPE public.wallet_tx_status AS ENUM ('pending','success','failed');

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  wallet_id uuid NOT NULL,
  kind public.wallet_tx_kind NOT NULL,
  amount numeric NOT NULL,
  status public.wallet_tx_status NOT NULL DEFAULT 'pending',
  reference text,
  paystack_reference text,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view wallet_tx" ON public.wallet_transactions FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert wallet_tx" ON public.wallet_transactions FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage wallet_tx" ON public.wallet_transactions FOR ALL USING (public.is_store_admin(auth.uid(), store_id)) WITH CHECK (public.is_store_admin(auth.uid(), store_id));

-- sales_forms
CREATE TABLE public.sales_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  status text NOT NULL DEFAULT 'active',
  product_ids uuid[] NOT NULL DEFAULT '{}',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view sales_forms" ON public.sales_forms FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "public view active sales_forms" ON public.sales_forms FOR SELECT USING (status = 'active');
CREATE POLICY "members manage sales_forms" ON public.sales_forms FOR ALL USING (public.is_store_member(auth.uid(), store_id)) WITH CHECK (public.is_store_member(auth.uid(), store_id));
CREATE TRIGGER sales_forms_updated BEFORE UPDATE ON public.sales_forms FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- form_submissions
CREATE TABLE public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  form_id uuid NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  customer_address text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view submissions" ON public.form_submissions FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "public submit form" ON public.form_submissions FOR INSERT WITH CHECK (true);

-- agents
CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  commission_pct numeric NOT NULL DEFAULT 0,
  area text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view agents" ON public.agents FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert agents" ON public.agents FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "members update agents" ON public.agents FOR UPDATE USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage agents" ON public.agents FOR ALL USING (public.is_store_admin(auth.uid(), store_id)) WITH CHECK (public.is_store_admin(auth.uid(), store_id));
CREATE TRIGGER agents_updated BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
