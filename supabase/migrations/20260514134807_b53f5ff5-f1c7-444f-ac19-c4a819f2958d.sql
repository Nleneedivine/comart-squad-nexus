-- App errors table (Sentry mirror)
CREATE TABLE public.app_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  tenant_id uuid,
  user_id uuid,
  module text NOT NULL DEFAULT 'unknown',
  message text NOT NULL,
  stack_trace text,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  environment text DEFAULT 'production',
  sentry_event_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);
CREATE INDEX idx_app_errors_created ON public.app_errors (created_at DESC);
CREATE INDEX idx_app_errors_status ON public.app_errors (status);
CREATE INDEX idx_app_errors_severity ON public.app_errors (severity);
CREATE INDEX idx_app_errors_module ON public.app_errors (module);
CREATE INDEX idx_app_errors_store ON public.app_errors (store_id);

ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmins manage app_errors"
  ON public.app_errors FOR ALL
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- Authenticated users can insert errors for their own store (or null store).
CREATE POLICY "auth insert app_errors"
  ON public.app_errors FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IS NULL
    OR public.is_store_member(auth.uid(), store_id)
  );

-- Failed webhooks
CREATE TABLE public.failed_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  provider text NOT NULL DEFAULT 'paystack',
  event_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  status text NOT NULL DEFAULT 'failed',
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_retry_at timestamptz
);
CREATE INDEX idx_failed_webhooks_created ON public.failed_webhooks (created_at DESC);
ALTER TABLE public.failed_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmins manage failed_webhooks"
  ON public.failed_webhooks FOR ALL
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- Failed jobs
CREATE TABLE public.failed_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  job_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  status text NOT NULL DEFAULT 'failed',
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_retry_at timestamptz
);
CREATE INDEX idx_failed_jobs_created ON public.failed_jobs (created_at DESC);
ALTER TABLE public.failed_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmins manage failed_jobs"
  ON public.failed_jobs FOR ALL
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- Enable realtime for live feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_errors;
