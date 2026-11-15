-- Referral / discount links.
--
--  * Every PAID user can create ONE personal link that gives the person they
--    refer 20% off their first plan (enforced in the app: only users with a
--    running paid plan can create it).
--  * The root account can create links with any discount (1-99%), optionally
--    locked to one email address, with an optional use limit and expiry.
--  * A discount applies once per person, on their first paid plan only, and
--    never to the code's own creator. The amount charged is always computed on
--    the server; the browser never sends a price.
--
-- All writes happen on the server (service role).

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT NOT NULL UNIQUE,
  created_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_root  BOOLEAN NOT NULL DEFAULT FALSE,
  discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 99),
  restricted_email TEXT,
  note             TEXT,
  max_uses         INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count       INTEGER NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One personal (non-root) link per user.
CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_one_personal_per_user
  ON public.referral_codes (created_by) WHERE created_by_root = FALSE;
CREATE INDEX IF NOT EXISTS referral_codes_created_by_idx ON public.referral_codes (created_by);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_codes_select_own ON public.referral_codes;
CREATE POLICY referral_codes_select_own ON public.referral_codes FOR SELECT TO authenticated
  USING (created_by = auth.uid());
REVOKE ALL ON public.referral_codes FROM authenticated, anon;
GRANT SELECT ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;

-- What a paid order was charged and which code (if any) gave the discount.
ALTER TABLE public.plan_orders
  ADD COLUMN IF NOT EXISTS referral_code_id UUID REFERENCES public.referral_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_percent INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS list_amount_paise INTEGER;

-- Count a use when (and only when) the discounted order is actually paid.
CREATE OR REPLACE FUNCTION public.count_referral_use()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code_id IS NOT NULL AND NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    UPDATE public.referral_codes SET uses_count = uses_count + 1 WHERE id = NEW.referral_code_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plan_orders_count_referral_use ON public.plan_orders;
CREATE TRIGGER plan_orders_count_referral_use
  AFTER UPDATE OF status ON public.plan_orders
  FOR EACH ROW EXECUTE FUNCTION public.count_referral_use();
