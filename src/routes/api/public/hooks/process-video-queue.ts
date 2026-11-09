import { createFileRoute } from "@tanstack/react-router";

async function runQueuePump(request: Request) {
  // Vercel Cron Jobs can only send the standard Authorization header
  // (Bearer <CRON_SECRET>), not a custom apikey header — so this
  // route accepts EITHER: Vercel's cron secret (for the scheduled
  // trigger) or the Supabase key (for any manual/service calls).
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env["CRON_SECRET"];
  const isCronAuthorized =
    !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  const providedKey = request.headers.get("apikey");
  const expectedKey =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  const isApiKeyAuthorized = !!expectedKey && providedKey === expectedKey;

  if (!isCronAuthorized && !isApiKeyAuthorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const task = new URL(request.url).searchParams.get("task") ?? "all";
  const budgetMs = Number(process.env["PUMP_BUDGET_SECONDS"] ?? 50) * 1000;
  const startedAt = Date.now();

  // 01:00 IST: queue the day's generation (production only, 4 per 30 days).
  if (task === "generate") {
    const { runAutoGeneration } = await import("@/lib/auto-schedule.server");
    const generated = await runAutoGeneration(supabaseAdmin as never);
    // Start writing right away; the pump task keeps going afterwards.
    const { processGenerationQueue } = await import("@/lib/content-queue.server");
    let generation: unknown = null;
    try {
      if (process.env["VERCEL_ENV"] === "production") generation = await processGenerationQueue(supabaseAdmin);
    } catch (error) {
      console.error(error);
    }
    return Response.json({ success: true, task, generated, generation });
  }

  // 07:00 IST: publish today's content for users with Autopost on, then pull performance.
  if (task === "post") {
    const { processPublishQueue } = await import("@/lib/channels/publish-queue.server");
    const skipIds = new Set<string>();
    const total = { publishChecked: 0, publishPosted: 0, publishFailed: 0 };
    while (Date.now() - startedAt < budgetMs) {
      const r = await processPublishQueue(supabaseAdmin as never, { ignoreTime: true, skipIds });
      if (!r || r.publishChecked === 0) break;
      total.publishChecked += r.publishChecked;
      total.publishPosted += r.publishPosted;
      total.publishFailed += r.publishFailed;
    }
    let metrics = null;
    try {
      const { syncPostMetrics } = await import("@/lib/channels/metrics.server");
      metrics = await syncPostMetrics(supabaseAdmin as never);
    } catch (error) {
      console.error(error);
    }
    return Response.json({ success: true, task, ...total, metrics });
  }

  const { processGenerationQueue } = await import("@/lib/content-queue.server");
  const { processVideoQueue } = await import("@/lib/video-queue.server");
  const { processStrategyQueue } = await import("@/lib/strategy-queue.server");

  // task=pump: only the media/writing work, repeated within the time budget (no learning,
  // no publishing). Call it every few minutes from Supabase pg_cron.
  if (task === "pump") {
    let generation: unknown = null;
    let result: unknown = null;
    do {
      try {
        generation = await processGenerationQueue(supabaseAdmin);
      } catch (error) {
        console.error(error);
      }
      result = await processVideoQueue(supabaseAdmin);
    } while (Date.now() - startedAt < budgetMs - 15_000 && (await hasWork(supabaseAdmin)));
    return Response.json({ success: true, task, generation, ...(result as object) });
  }

  // Default (manual / legacy): the full pass, as before.
  let metrics: Awaited<ReturnType<typeof import("@/lib/channels/metrics.server").syncPostMetrics>> | null = null;
  try {
    const { syncPostMetrics } = await import("@/lib/channels/metrics.server");
    metrics = await syncPostMetrics(supabaseAdmin as never);
  } catch (error) {
    console.error(error);
  }

  let strategy: Awaited<ReturnType<typeof processStrategyQueue>> | null = null;
  try {
    strategy = await processStrategyQueue(supabaseAdmin);
  } catch (error) {
    console.error(error);
  }

  let generation: Awaited<ReturnType<typeof processGenerationQueue>> | null = null;
  try {
    generation = await processGenerationQueue(supabaseAdmin);
  } catch (error) {
    console.error(error);
  }

  const result = await processVideoQueue(supabaseAdmin);

  let publishing: Record<string, number> | null = null;
  try {
    const { processPublishQueue } = await import("@/lib/channels/publish-queue.server");
    publishing = await processPublishQueue(supabaseAdmin as never);
  } catch (error) {
    console.error(error);
  }

  return Response.json({ success: true, metrics, strategy, generation, ...result, ...publishing });
}

/** True while a generation job is open or any item is still rendering. */
async function hasWork(admin: { from: (t: string) => any }) {
  const { count: jobs } = await admin
    .from("content_generation_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "running"]);
  if (jobs) return true;
  const { count: rendering } = await admin
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "draft");
  return !!rendering;
}

export const Route = createFileRoute("/api/public/hooks/process-video-queue")({
  server: {
    handlers: {
      // Vercel Cron Jobs only ever send GET — without this handler the
      // scheduled trigger in vercel.json's `crons` block 404s every time,
      // silently, with no error surfaced anywhere in the app.
      GET: async ({ request }) => runQueuePump(request),
      // Kept for any manual/service-triggered calls (e.g. from a Supabase
      // Edge Function or a manual curl with the apikey header).
      POST: async ({ request }) => runQueuePump(request),
    },
  },
});
