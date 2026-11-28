import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Called (without waiting) right after a Brand Profile is saved, so the brand's playbook
 * is rebuilt straight away. Generation also rebuilds a stale playbook by itself, so this
 * is only a head start and may safely fail.
 */
export const refreshBrandPlaybook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ brandId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadBrand } = await import("@/lib/brand.server");
    const { ensurePlaybook } = await import("@/lib/playbook.server");
    const brand = await loadBrand(supabaseAdmin, context.userId, data.brandId);
    if (!brand) return { ok: false as const };
    const playbook = await ensurePlaybook(supabaseAdmin, brand as never);
    // Head start for the reels: fetch relevant stock clips for this brand's filmable subjects now.
    if (playbook?.photo_subjects?.length) {
      const { prefetchFootage } = await import("@/lib/stock-media.server");
      await prefetchFootage(supabaseAdmin as never, { userId: context.userId, brandId: data.brandId, subjects: playbook.photo_subjects });
    }
    return { ok: !!playbook };
  });
