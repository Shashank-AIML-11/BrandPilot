import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/process-video-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedKey = request.headers.get("apikey");
        const expectedKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
        if (!expectedKey || providedKey !== expectedKey) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processGenerationQueue } = await import("@/lib/content-queue.server");
        const { processVideoQueue } = await import("@/lib/video-queue.server");
        const { processStrategyQueue } = await import("@/lib/strategy-queue.server");

        // Weekly learning loop first: it may re-queue the rest of the month so the
        // generator below immediately rebuilds it against the new strategy.
        let strategy: Awaited<ReturnType<typeof processStrategyQueue>> | null = null;
        try {
          strategy = await processStrategyQueue(supabaseAdmin);
        } catch (error) {
          console.error(error);
        }

        // Writing queued days first means media rendering picks them up in the
        // same cycle, so a month finishes without the browser being open.
        let generation: Awaited<ReturnType<typeof processGenerationQueue>> | null = null;
        try {
          generation = await processGenerationQueue(supabaseAdmin);
        } catch (error) {
          console.error(error);
        }

        const result = await processVideoQueue(supabaseAdmin);

        // Anything scheduled for now, with media ready, goes out to the connected channels.
        let publishing: Record<string, number> | null = null;
        try {
          const { processPublishQueue } = await import("@/lib/channels/publish-queue.server");
          publishing = await processPublishQueue(supabaseAdmin as never);
        } catch (error) {
          console.error(error);
        }

        return Response.json({ success: true, strategy, generation, ...result, ...publishing });


      },
    },
  },
});