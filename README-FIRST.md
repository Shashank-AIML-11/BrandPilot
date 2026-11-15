# Referral / discount links: setup

Copy every file in this zip into your BrandPilot folder, keeping the paths, then run `git diff`
and confirm only these files changed.

## Order
1. Run the SQL FIRST: Supabase -> SQL editor on the STAGING project, paste
   `supabase/migrations/20261115150000_referral_codes.sql`, run. (Needs the earlier
   plan-renewal SQL to have been run already: it adds columns to `plan_orders`.)
   Later run the same SQL on the production project before promoting to main.
2. Run `npm run dev` once locally so `src/routeTree.gen.ts` picks up the new /referrals page,
   commit it with the rest, push to staging.
   No new environment variables are needed.

## Files
New:
  supabase/migrations/20261115150000_referral_codes.sql
  src/lib/referrals.shared.ts
  src/lib/referrals.server.ts
  src/lib/referrals.functions.ts
  src/components/referral-share.tsx
  src/components/admin-referrals.tsx
  src/routes/_authenticated/referrals.tsx
Replaced:
  src/lib/payments.functions.ts
  src/routes/_authenticated/admin.tsx
  src/routes/_authenticated/plan.tsx
  src/routes/_authenticated/checkout.tsx
  src/routes/pricing.tsx

## How to try it on staging (Razorpay TEST keys)
Paid user:   Plan page -> "Refer & save 20%" -> Create my link -> Copy / Share / Email.
Friend:      open the link in a private window -> pricing shows "20% off applied" -> sign up
             with a DIFFERENT email -> Choose plan -> checkout shows the discount and the
             reduced total -> pay -> your link's "people have paid" count goes to 1.
Root:        Admin Portal -> Referrals tab -> set % (1-99), optional email, Create link.
