-- Affiliate program.
--
--  * Anyone (paid or not) can have ONE personal referral link (referral_codes, already exists).
--  * The friend keeps the 20% first-plan discount.
--  * The affiliate earns 20% of EVERY plan payment that customer makes, for as long as they keep
--    paying (first plan, renewals, upgrades, annual). Commission is on the amount actually paid.
--    The one-time pass (INR 500) earns nothing: it is not a plan_orders row.
--  * Each commission is held for 30 days (refund window) before it can be withdrawn.
--  * Payouts are manual: the affiliate saves UPI / bank details and requests a payout once their
--    available balance reaches INR 1,000; the owner pays them outside the app and marks it paid.
--
-- All writes happen on the server (service role). Affiliates can only READ their own rows.
-- Safe to run more than once.

-- 1. Who referred whom. Set the first time a referred customer pays with a referral code.
CREATE TABLE IF NOT EXISTS public.referral_attributions (
  referred_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code_id UUID REFERENCES public.referral_codes(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (referred_user_id <> referrer_id)
);
CREATE INDEX IF NOT EXISTS referral_attributions_referrer_idx
  ON public.referral_attributions (referrer_id);

-- 2. Where to pay an affiliate.
CREATE TABLE IF NOT EXISTS public.affiliate_payout_details (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  method       TEXT NOT NULL CHECK (method IN ('upi', 'bank')),
  account_name TEXT NOT NULL,
  upi_id       TEXT,
  bank_account TEXT,
  ifsc         TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (method = 'upi'  AND upi_id IS NOT NULL) OR
    (method = 'bank' AND bank_account IS NOT NULL AND ifsc IS NOT NULL)
  )
);

-- 3. Payout requests. `details` is a snapshot of the payout details at request time.
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  status       TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'paid', 'rejected')),
  details      JSONB NOT NULL,
  reference    TEXT,
  note         TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS affiliate_payouts_user_idx
  ON public.affiliate_payouts (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_payouts_status_idx
  ON public.affiliate_payouts (status, requested_at);

-- 4. The ledger: one row per paid plan order that earns a commission.
--    approved  = earned (withdrawable once available_at has passed)
--    requested = locked into a payout request
--    paid      = included in a payout the owner has paid
--    void      = cancelled (e.g. the payment was refunded)
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id           TEXT NOT NULL UNIQUE,          -- razorpay order id of the plan payment
  amount_paise       INTEGER NOT NULL,              -- what the customer paid
  commission_percent INTEGER NOT NULL,
  commission_paise   INTEGER NOT NULL CHECK (commission_paise > 0),
  status             TEXT NOT NULL DEFAULT 'approved'
                       CHECK (status IN ('approved', 'requested', 'paid', 'void')),
  available_at       TIMESTAMPTZ NOT NULL,
  payout_id          UUID REFERENCES public.affiliate_payouts(id) ON DELETE SET NULL,
  void_reason        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS affiliate_commissions_referrer_idx
  ON public.affiliate_commissions (referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_commissions_payout_idx
  ON public.affiliate_commissions (payout_id);

-- 5. Row level security: affiliates read their own rows only; nobody writes from the browser.
ALTER TABLE public.referral_attributions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payout_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payouts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_attributions_select_own ON public.referral_attributions;
CREATE POLICY referral_attributions_select_own ON public.referral_attributions
  FOR SELECT TO authenticated USING (referrer_id = auth.uid());
DROP POLICY IF EXISTS affiliate_payout_details_select_own ON public.affiliate_payout_details;
CREATE POLICY affiliate_payout_details_select_own ON public.affiliate_payout_details
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS affiliate_payouts_select_own ON public.affiliate_payouts;
CREATE POLICY affiliate_payouts_select_own ON public.affiliate_payouts
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS affiliate_commissions_select_own ON public.affiliate_commissions;
CREATE POLICY affiliate_commissions_select_own ON public.affiliate_commissions
  FOR SELECT TO authenticated USING (referrer_id = auth.uid());

REVOKE ALL ON public.referral_attributions, public.affiliate_payout_details,
              public.affiliate_payouts, public.affiliate_commissions FROM authenticated, anon;
GRANT SELECT ON public.referral_attributions, public.affiliate_payout_details,
                public.affiliate_payouts, public.affiliate_commissions TO authenticated;
GRANT ALL ON public.referral_attributions, public.affiliate_payout_details,
             public.affiliate_payouts, public.affiliate_commissions TO service_role;

-- 6. Record the commission for a paid plan order. Idempotent: calling it again for the same
--    order does nothing. Called by the server right after a plan payment is applied.
--    The referrer is the person whose code gave the discount on the customer's first plan,
--    remembered in referral_attributions so later renewals still earn. Owner-made (root)
--    codes never earn, and nobody earns on their own payments.
CREATE OR REPLACE FUNCTION public.record_affiliate_commission(p_order_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o        public.plan_orders%ROWTYPE;
  c        public.referral_codes%ROWTYPE;
  v_ref    UUID;
  v_pct    CONSTANT INTEGER := 20;
  v_comm   INTEGER;
  v_rows   INTEGER;
BEGIN
  SELECT * INTO o FROM public.plan_orders WHERE razorpay_order_id = p_order_id;
  IF NOT FOUND OR o.status <> 'paid' THEN
    RETURN jsonb_build_object('recorded', FALSE, 'reason', 'order not paid');
  END IF;

  SELECT referrer_id INTO v_ref FROM public.referral_attributions WHERE referred_user_id = o.user_id;

  IF v_ref IS NULL AND o.referral_code_id IS NOT NULL THEN
    SELECT * INTO c FROM public.referral_codes WHERE id = o.referral_code_id;
    IF FOUND AND NOT c.created_by_root AND c.created_by <> o.user_id THEN
      INSERT INTO public.referral_attributions (referred_user_id, referrer_id, referral_code_id)
      VALUES (o.user_id, c.created_by, c.id)
      ON CONFLICT (referred_user_id) DO NOTHING;
      v_ref := c.created_by;
    END IF;
  END IF;

  IF v_ref IS NULL OR v_ref = o.user_id THEN
    RETURN jsonb_build_object('recorded', FALSE, 'reason', 'no referrer');
  END IF;

  v_comm := (o.amount_paise * v_pct) / 100;   -- integer division: rounds down to whole paise
  IF v_comm <= 0 THEN
    RETURN jsonb_build_object('recorded', FALSE, 'reason', 'amount too small');
  END IF;

  INSERT INTO public.affiliate_commissions
    (referrer_id, referred_user_id, order_id, amount_paise, commission_percent,
     commission_paise, status, available_at)
  VALUES
    (v_ref, o.user_id, o.razorpay_order_id, o.amount_paise, v_pct,
     v_comm, 'approved', COALESCE(o.paid_at, now()) + INTERVAL '30 days')
  ON CONFLICT (order_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object('recorded', v_rows > 0, 'referrer_id', v_ref, 'commission_paise', v_comm);
END;
$$;

-- 7. An affiliate asks to be paid everything that is withdrawable now. Atomic: the matching
--    commissions are locked into one payout, so two quick clicks can never pay the same
--    money twice.
CREATE OR REPLACE FUNCTION public.request_affiliate_payout(p_user UUID, p_min_paise INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d        public.affiliate_payout_details%ROWTYPE;
  v_total  INTEGER;
  v_payout UUID;
BEGIN
  SELECT * INTO d FROM public.affiliate_payout_details WHERE user_id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Add your payout details first.';
  END IF;

  SELECT COALESCE(SUM(commission_paise), 0) INTO v_total
  FROM (
    SELECT commission_paise FROM public.affiliate_commissions
    WHERE referrer_id = p_user AND status = 'approved' AND payout_id IS NULL AND available_at <= now()
    FOR UPDATE
  ) t;

  IF v_total < p_min_paise THEN
    RAISE EXCEPTION 'You can request a payout once your available balance reaches the minimum.';
  END IF;

  INSERT INTO public.affiliate_payouts (user_id, amount_paise, status, details)
  VALUES (p_user, v_total, 'requested', to_jsonb(d))
  RETURNING id INTO v_payout;

  UPDATE public.affiliate_commissions
  SET status = 'requested', payout_id = v_payout
  WHERE referrer_id = p_user AND status = 'approved' AND payout_id IS NULL AND available_at <= now();

  RETURN jsonb_build_object('payout_id', v_payout, 'amount_paise', v_total);
END;
$$;

-- 8. The owner settles a payout request: 'paid' (after sending the money) or 'rejected'
--    (the commissions go back to the affiliate's available balance).
CREATE OR REPLACE FUNCTION public.settle_affiliate_payout(
  p_payout    UUID,
  p_action    TEXT,
  p_reference TEXT,
  p_note      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.affiliate_payouts%ROWTYPE;
BEGIN
  IF p_action NOT IN ('paid', 'rejected') THEN
    RAISE EXCEPTION 'Unknown action.';
  END IF;

  SELECT * INTO p FROM public.affiliate_payouts WHERE id = p_payout FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found.';
  END IF;
  IF p.status <> 'requested' THEN
    RAISE EXCEPTION 'This payout has already been settled.';
  END IF;

  IF p_action = 'paid' THEN
    UPDATE public.affiliate_payouts
    SET status = 'paid', reference = p_reference, note = p_note, settled_at = now()
    WHERE id = p_payout;
    UPDATE public.affiliate_commissions
    SET status = 'paid', paid_at = now()
    WHERE payout_id = p_payout AND status = 'requested';
  ELSE
    UPDATE public.affiliate_payouts
    SET status = 'rejected', note = p_note, settled_at = now()
    WHERE id = p_payout;
    UPDATE public.affiliate_commissions
    SET status = 'approved', payout_id = NULL
    WHERE payout_id = p_payout AND status = 'requested';
  END IF;

  RETURN jsonb_build_object('payout_id', p_payout, 'status', p_action);
END;
$$;

REVOKE ALL ON FUNCTION public.record_affiliate_commission(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_affiliate_payout(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_affiliate_payout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_affiliate_commission(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_affiliate_payout(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_affiliate_payout(UUID, TEXT, TEXT, TEXT) TO service_role;
