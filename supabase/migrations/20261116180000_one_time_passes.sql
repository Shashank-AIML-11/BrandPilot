-- One-time "Generate once for INR 300" pass.
-- A person with no plan pays once and may generate the current week's content
-- one time. The pass is valid for 7 days from payment and allows ONE generation.
CREATE TABLE IF NOT EXISTS public.one_time_passes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  razorpay_order_id   text NOT NULL UNIQUE,
  razorpay_payment_id text,
  amount_paise        integer NOT NULL,
  status              text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid')),
  paid_at             timestamptz,
  expires_at          timestamptz,
  used_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS one_time_passes_user_idx ON public.one_time_passes (user_id, status);

ALTER TABLE public.one_time_passes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS one_time_passes_select_own ON public.one_time_passes;
CREATE POLICY one_time_passes_select_own ON public.one_time_passes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Writes happen only on the server (service role).

-- Marks an order paid (atomic and idempotent): the browser's confirm step and the
-- Razorpay webhook may both call it; the second call changes nothing.
CREATE OR REPLACE FUNCTION public.apply_one_time_pass(p_order_id text, p_payment_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.one_time_passes%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.one_time_passes WHERE razorpay_order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown one-time order %', p_order_id;
  END IF;

  IF o.status = 'paid' THEN
    RETURN jsonb_build_object('applied', false, 'expires_at', o.expires_at);
  END IF;

  UPDATE public.one_time_passes
     SET status = 'paid',
         razorpay_payment_id = p_payment_id,
         paid_at = now(),
         expires_at = now() + interval '7 days'
   WHERE id = o.id
   RETURNING * INTO o;

  RETURN jsonb_build_object('applied', true, 'expires_at', o.expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_one_time_pass(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_one_time_pass(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
