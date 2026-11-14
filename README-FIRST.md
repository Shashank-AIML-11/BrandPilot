# Plan expiry + renewal: setup

Copy every file in this zip into your BrandPilot folder, keeping the folder paths
(the zip already uses repo-relative paths). Then run `git diff` and check that only
the files below changed.

## Order matters
1. FIRST run the SQL: open Supabase -> SQL editor on the STAGING project, paste the
   contents of `supabase/migrations/20261115090000_plan_expiry_renewal.sql`, run it.
   (Later, run the same SQL on the production project before promoting to main.)
2. Add these Vercel environment variables (staging, later production):
   - RESEND_API_KEY   (from resend.com; verify the loviza.click domain there)
   - EMAIL_FROM       e.g.  LOVIZA <billing@loviza.click>
   - PUBLIC_APP_URL   https://test.app.loviza.click on staging, https://app.loviza.click on production
   - CRON_SECRET      you already have it (the new cron uses it too)
3. Add this entry to the "crons" list in vercel.json (do not replace the file):
       { "path": "/api/public/hooks/plan-renewals", "schedule": "30 3 * * *" }
   (03:30 UTC = 9:00 AM IST, once a day)
4. In Razorpay dashboard -> Webhooks, tick the event `payment.captured` on your existing webhook.
5. Run `npm run dev` once locally (it regenerates src/routeTree.gen.ts with the new /renew
   page), commit that file with the rest, then push to staging.

## Files
New:
  supabase/migrations/20261115090000_plan_expiry_renewal.sql
  src/lib/plan-access.ts
  src/lib/email.server.ts
  src/lib/plan-renewals.server.ts
  src/lib/untyped-db.server.ts
  src/lib/payments/apply-payment.server.ts
  src/components/plan-status-banner.tsx
  src/routes/_authenticated/renew.tsx
  src/routes/api/public/hooks/plan-renewals.ts
Replaced:
  src/lib/payments.functions.ts
  src/lib/payments/razorpay.server.ts
  src/lib/generation-entitlements.ts
  src/lib/channels/publish-queue.server.ts
  src/lib/channels/publish.server.ts
  src/routes/_authenticated/checkout.tsx
  src/routes/_authenticated/plan.tsx
  src/routes/_authenticated/route.tsx
  src/routes/api/public/webhooks/razorpay.ts
  src/types/razorpay.d.ts

## Test on staging (Razorpay TEST keys)
- Buy a plan on /pricing -> /plan shows "Active until <date>".
- Supabase SQL: update subscriptions set current_period_end = now() + interval '3 days'
  where user_id = '<your id>' and status = 'active';   -> banner shows "ends in 3 days".
- Click Renew -> pay -> new end date = old end + 30 days.
- Send reminders now (PowerShell):
  curl.exe -H "Authorization: Bearer YOUR_CRON_SECRET" https://test.app.loviza.click/api/public/hooks/plan-renewals
- Set current_period_end to yesterday, reload the app -> "plan ended" banner; generation and
  Post now are refused until renewed.
