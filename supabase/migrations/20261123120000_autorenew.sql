-- Auto-renew (Razorpay Subscriptions / UPI AutoPay / card standing instruction)
-- on top of the prepaid 30-day / 365-day plan periods.
--
--   * The plan period itself is still extended by public.apply_plan_payment():
--     every automatic charge is recorded as a plan_orders row (order id
--     "auto_<razorpay payment id>") and applied through that same function, so
--     stacking, switching, idempotency and profiles.plan all behave as they
--     do for one-time payments.
--   * autorenew_subscriptions remembers the Razorpay subscription (mandate) a
--     customer set up, so the toggle can show ON/OFF and cancel it.
--   * subscriptions.auto_renew lets the app give a few days of grace while a
--     charge is on its way (same idea as the old autopay grace).
--
-- All writes happen on the server (service role). Clients can only read their own row.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.autorenew_subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  razorpay_subscription_id  TEXT NOT NULL UNIQUE,
  plan                      TEXT NOT NULL,
  billing_cycle             TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  period_days               INTEGER NOT NULL DEFAULT 30 CHECK (period_days IN (30, 365)),
  amount_paise              INTEGER NOT NULL,
  -- created -> authenticated -> active -> (pending | halted | cancelled | completed)
  status                    TEXT NOT NULL DEFAULT 'created',
  -- When the first charge happens. NULL = immediately (customer had no running plan).
  starts_at                 TIMESTAMPTZ,
  last_payment_id           TEXT,
  failure_reason            TEXT,
  cancelled_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS autorenew_user_idx
  ON public.autorenew_subscriptions (user_id, created_at DESC);

ALTER TABLE public.autorenew_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS autorenew_select_own ON public.autorenew_subscriptions;
CREATE POLICY autorenew_select_own ON public.autorenew_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
