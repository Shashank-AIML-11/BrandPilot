-- Prepaid 30-day plans, expiry and renewal.
--
-- Rules implemented here and in the app:
--   * Every paid period is exactly 30 days.
--   * Features stop when current_period_end passes (enforced in
--     src/lib/generation-entitlements.ts; the daily job also flips the row
--     to status = 'expired').
--   * Renewing BEFORE expiry adds 30 days on top of the existing expiry date.
--     Renewing AFTER expiry starts a fresh 30 days from the payment time.
--   * Reminder emails are tracked in renewal_notifications so each one is
--     sent only once.
--
-- All writes happen on the server (service role). Clients can only read
-- their own rows.

-- ---------------------------------------------------------------------------
-- 1. subscriptions: period start + expiry marker
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

-- One-time grace for rows that are active today but have no end date (rows
-- created by the old autopay flow before Razorpay reported a cycle end):
-- they get 30 days from now instead of being locked out immediately.
UPDATE public.subscriptions
SET current_period_start = COALESCE(current_period_start, now()),
    current_period_end   = now() + interval '30 days'
WHERE status = 'active'
  AND current_period_end IS NULL;

CREATE INDEX IF NOT EXISTS subscriptions_status_period_end_idx
  ON public.subscriptions (status, current_period_end);

-- ---------------------------------------------------------------------------
-- 2. plan_orders: one row per Razorpay order we create (server-trusted intent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_orders (
  razorpay_order_id   TEXT PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                TEXT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('new', 'renew')),
  amount_paise        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'INR',
  status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid')),
  razorpay_payment_id TEXT,
  subscription_id     UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  period_start        TIMESTAMPTZ,
  period_end          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at             TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_orders_payment_id_key
  ON public.plan_orders (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS plan_orders_user_idx ON public.plan_orders (user_id, created_at DESC);

ALTER TABLE public.plan_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_orders_select_own ON public.plan_orders;
CREATE POLICY plan_orders_select_own ON public.plan_orders FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE ALL ON public.plan_orders FROM authenticated, anon;
GRANT SELECT ON public.plan_orders TO authenticated;
GRANT ALL ON public.plan_orders TO service_role;

-- ---------------------------------------------------------------------------
-- 3. renewal_notifications: dedupe for reminder / expiry emails
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.renewal_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('reminder', 'expired')),
  days_left       INTEGER NOT NULL DEFAULT 0,
  period_end      TIMESTAMPTZ NOT NULL,
  email           TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, kind, days_left, period_end)
);

ALTER TABLE public.renewal_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.renewal_notifications FROM authenticated, anon;
GRANT ALL ON public.renewal_notifications TO service_role;

-- ---------------------------------------------------------------------------
-- 4. apply_plan_payment: the single place a paid order becomes plan time.
--    Atomic and idempotent: the client confirm call and the Razorpay webhook
--    may both call it for the same payment; only the first one extends.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_plan_payment(p_order_id TEXT, p_payment_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o          public.plan_orders%ROWTYPE;
  s          public.subscriptions%ROWTYPE;
  v_now      TIMESTAMPTZ := now();
  v_start    TIMESTAMPTZ;
  v_end      TIMESTAMPTZ;
  v_sub      UUID;
  v_found    BOOLEAN := FALSE;
  v_cancel   TEXT[] := '{}';
  v_legacy   TEXT;
BEGIN
  SELECT * INTO o FROM public.plan_orders WHERE razorpay_order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown plan order %', p_order_id;
  END IF;

  -- Already applied (confirm call + webhook race, or a webhook retry).
  IF o.status = 'paid' THEN
    RETURN jsonb_build_object(
      'applied', FALSE, 'plan', o.plan, 'kind', o.kind,
      'period_start', o.period_start, 'period_end', o.period_end,
      'cancel_razorpay_subscriptions', '[]'::jsonb
    );
  END IF;

  IF o.kind = 'renew' THEN
    SELECT * INTO s
    FROM public.subscriptions
    WHERE user_id = o.user_id AND plan = o.plan AND status IN ('active', 'expired')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
    v_found := FOUND;
  END IF;

  IF o.kind = 'renew' AND v_found THEN
    -- Still running: stack 30 days on top of the existing expiry date.
    -- Already expired: start a fresh 30 days from now.
    IF s.status = 'active' AND s.current_period_end IS NOT NULL AND s.current_period_end > v_now THEN
      v_start := COALESCE(s.current_period_start, s.created_at);
      v_end   := s.current_period_end + interval '30 days';
    ELSE
      v_start := v_now;
      v_end   := v_now + interval '30 days';
    END IF;

    v_legacy := s.razorpay_subscription_id;
    IF v_legacy IS NOT NULL THEN
      v_cancel := array_append(v_cancel, v_legacy);
    END IF;

    UPDATE public.subscriptions
    SET status               = 'active',
        current_period_start = v_start,
        current_period_end   = v_end,
        expired_at           = NULL,
        cancelled_at         = NULL,
        failure_reason       = NULL,
        last_payment_id      = p_payment_id,
        price_cents          = o.amount_paise,
        payment_method       = 'razorpay',
        -- Detach from the old autopay subscription so its later "cancelled"
        -- webhook can't flip this renewed row.
        razorpay_subscription_id = NULL
    WHERE id = s.id;
    v_sub := s.id;
  ELSE
    -- New plan (first purchase, or a switch): close every other live plan
    -- and start a fresh 30-day period now.
    WITH closed AS (
      UPDATE public.subscriptions
      SET status = 'cancelled', cancelled_at = v_now
      WHERE user_id = o.user_id AND status IN ('pending', 'active')
      RETURNING razorpay_subscription_id
    )
    SELECT COALESCE(array_agg(razorpay_subscription_id) FILTER (WHERE razorpay_subscription_id IS NOT NULL), '{}')
    INTO v_cancel FROM closed;

    v_start := v_now;
    v_end   := v_now + interval '30 days';

    INSERT INTO public.subscriptions (
      user_id, plan, price_cents, billing_period, payment_method, status, currency,
      current_period_start, current_period_end, last_payment_id
    ) VALUES (
      o.user_id, o.plan, o.amount_paise, 'monthly', 'razorpay', 'active', o.currency,
      v_start, v_end, p_payment_id
    )
    RETURNING id INTO v_sub;
  END IF;

  UPDATE public.profiles SET plan = o.plan WHERE id = o.user_id;

  UPDATE public.plan_orders
  SET status = 'paid',
      razorpay_payment_id = p_payment_id,
      subscription_id = v_sub,
      period_start = v_start,
      period_end = v_end,
      paid_at = v_now
  WHERE razorpay_order_id = p_order_id;

  RETURN jsonb_build_object(
    'applied', TRUE, 'plan', o.plan, 'kind', o.kind,
    'period_start', v_start, 'period_end', v_end,
    'cancel_razorpay_subscriptions', to_jsonb(v_cancel)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_plan_payment(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_plan_payment(TEXT, TEXT) TO service_role;
