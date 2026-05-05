-- Todos (personal)
CREATE TABLE public.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium',
  due_date date,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own todos" ON public.todos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND public.is_store_member(auth.uid(), store_id));
CREATE TRIGGER trg_todos_upd BEFORE UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Tasks (assigned to staff)
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  assigned_to uuid,
  assigned_by uuid,
  deadline date,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view tasks" ON public.tasks FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage tasks" ON public.tasks FOR ALL USING (public.is_store_admin(auth.uid(), store_id)) WITH CHECK (public.is_store_admin(auth.uid(), store_id));
CREATE POLICY "assignee updates tasks" ON public.tasks FOR UPDATE USING (auth.uid() = assigned_to);
CREATE TRIGGER trg_tasks_upd BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Goals
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  target_value numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  unit text,
  deadline date,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view goals" ON public.goals FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage goals" ON public.goals FOR ALL USING (public.is_store_admin(auth.uid(), store_id)) WITH CHECK (public.is_store_admin(auth.uid(), store_id));
CREATE POLICY "members insert goals" ON public.goals FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "members update goals" ON public.goals FOR UPDATE USING (public.is_store_member(auth.uid(), store_id));
CREATE TRIGGER trg_goals_upd BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Activity log
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  user_id uuid,
  user_name text,
  activity text NOT NULL,
  type text NOT NULL DEFAULT 'general',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view activity" ON public.activity_log FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "members insert activity" ON public.activity_log FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));

-- Chat messages (DMs and groups)
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  recipient_id uuid,
  channel text NOT NULL DEFAULT 'general',
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view messages" ON public.chat_messages FOR SELECT USING (
  public.is_store_member(auth.uid(), store_id) AND (
    recipient_id IS NULL OR sender_id = auth.uid() OR recipient_id = auth.uid()
  )
);
CREATE POLICY "members send messages" ON public.chat_messages FOR INSERT WITH CHECK (
  public.is_store_member(auth.uid(), store_id) AND sender_id = auth.uid()
);
CREATE POLICY "recipient marks read" ON public.chat_messages FOR UPDATE USING (recipient_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

-- Webhook logs
CREATE TABLE public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  topic text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  summary text,
  duration_ms integer,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view webhooks" ON public.webhook_logs FOR SELECT USING (public.is_store_member(auth.uid(), store_id));
CREATE POLICY "admins manage webhooks" ON public.webhook_logs FOR ALL USING (public.is_store_admin(auth.uid(), store_id)) WITH CHECK (public.is_store_admin(auth.uid(), store_id));
CREATE POLICY "members insert webhooks" ON public.webhook_logs FOR INSERT WITH CHECK (public.is_store_member(auth.uid(), store_id));
