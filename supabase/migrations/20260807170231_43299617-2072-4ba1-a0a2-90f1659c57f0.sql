CREATE TABLE public.content_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month text NOT NULL,
  pending_dates text[] NOT NULL DEFAULT '{}',
  days_done integer NOT NULL DEFAULT 0,
  days_total integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX content_generation_jobs_active_uniq
  ON public.content_generation_jobs (user_id, month)
  WHERE status IN ('pending', 'running');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_generation_jobs TO authenticated;
GRANT ALL ON public.content_generation_jobs TO service_role;

ALTER TABLE public.content_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_generation_jobs_own ON public.content_generation_jobs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER t_content_generation_jobs_updated
  BEFORE UPDATE ON public.content_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();