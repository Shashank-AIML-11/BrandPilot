-- Annual billing.
--   * monthly = 30 days, annual = 365 days paid up front (12 x the per-month annual rate).
--   * plan_orders remembers which one was bought; apply_plan_payment() uses it
--     for the length of the period and records it on the subscription.
-- Existing orders and subscriptions stay monthly (30 days).

ALTER TABLE public.plan_orders
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS period_days INTEGER NOT NULL DEFAULT 30
    CHECK (period_days IN (30, 365));

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
    -- Still running: stack the paid period (30 or 365 days) on top of the existing expiry date.
    -- Already expired: start a fresh period from now.
    IF s.status = 'active' AND s.current_period_end IS NOT NULL AND s.current_period_end > v_now THEN
      v_start := COALESCE(s.current_period_start, s.created_at);
      v_end   := s.current_period_end + make_interval(days => o.period_days);
    ELSE
      v_start := v_now;
      v_end   := v_now + make_interval(days => o.period_days);
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
        billing_period       = o.billing_cycle,
        -- Detach from the old autopay subscription so its later "cancelled"
        -- webhook can't flip this renewed row.
        razorpay_subscription_id = NULL
    WHERE id = s.id;
    v_sub := s.id;
  ELSE
    -- New plan (first purchase, or a switch): close every other live plan
    -- and start a fresh period (30 or 365 days) now.
    WITH closed AS (
      UPDATE public.subscriptions
      SET status = 'cancelled', cancelled_at = v_now
      WHERE user_id = o.user_id AND status IN ('pending', 'active')
      RETURNING razorpay_subscription_id
    )
    SELECT COALESCE(array_agg(razorpay_subscription_id) FILTER (WHERE razorpay_subscription_id IS NOT NULL), '{}')
    INTO v_cancel FROM closed;

    v_start := v_now;
    v_end   := v_now + make_interval(days => o.period_days);

    INSERT INTO public.subscriptions (
      user_id, plan, price_cents, billing_period, payment_method, status, currency,
      current_period_start, current_period_end, last_payment_id
    ) VALUES (
      o.user_id, o.plan, o.amount_paise, o.billing_cycle, 'razorpay', 'active', o.currency,
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

NOTIFY pgrst, 'reload schema';
