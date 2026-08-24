-- Razorpay integration: add fields needed to track a real recurring
-- subscription, and lock down direct client writes now that money is
-- actually involved. Status transitions from here on are only ever
-- written by the server (service role), via:
--   1. src/lib/payments.functions.ts   (creating a subscription)
--   2. src/routes/api/public/webhooks/razorpay.ts   (lifecycle events)

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_razorpay_subscription_id_key
  ON public.subscriptions (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id);

-- Lock down direct client writes: the old "subs_own" policy allowed
-- authenticated users to INSERT/UPDATE/DELETE their own row directly
-- from the browser, which is fine for an unpaid placeholder but not
-- once Razorpay is handling real charges. Replace with SELECT-only.
DROP POLICY IF EXISTS subs_own ON public.subscriptions;

DROP POLICY IF EXISTS subs_select_own ON public.subscriptions;

CREATE POLICY subs_select_own ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
-- service_role already has ALL from the earlier migration; server
-- functions and the webhook use supabaseAdmin (service role) for
-- every write from here on.
