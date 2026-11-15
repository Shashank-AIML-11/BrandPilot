-- One "content is ready" email per finished generation job.
-- The job id is the primary key, so the same job can never email twice,
-- even if the generation queue finishes it from two places at once.
CREATE TABLE IF NOT EXISTS public.content_ready_notifications (
  job_id     uuid PRIMARY KEY,
  user_id    uuid NOT NULL,
  brand_id   uuid,
  autopost   boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_ready_notifications ENABLE ROW LEVEL SECURITY;
-- No policies: only the server (service role) reads or writes this table.

NOTIFY pgrst, 'reload schema';
