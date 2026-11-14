import { createFileRoute } from "@tanstack/react-router";

// Daily plan housekeeping: expires lapsed plans and emails renewal reminders.
// Scheduled in vercel.json. Same auth as process-video-queue: Vercel's cron
// sends "Authorization: Bearer <CRON_SECRET>".
async function run(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env["CRON_SECRET"];
  const isCronAuthorized = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  const providedKey = request.headers.get("apikey");
  const expectedKey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  const isApiKeyAuthorized = !!expectedKey && providedKey === expectedKey;

  if (!isCronAuthorized && !isApiKeyAuthorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runPlanRenewals } = await import("@/lib/plan-renewals.server");
    const result = await runPlanRenewals(supabaseAdmin as never);
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("[plan-renewals]", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "failed" },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/hooks/plan-renewals")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
