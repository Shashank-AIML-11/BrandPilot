import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const archiveInput = z.object({ brandId: z.string().uuid() });

/**
 * Archives one of the caller's brands (Scale plan only): the brand is copied into
 * brand_archives, its social connections are removed and the brand leaves the list,
 * which frees a place under the 20-brand limit.
 */
export const archiveBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => archiveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { getGenerationEntitlement } = await import("@/lib/generation-entitlements");
    const entitlement = await getGenerationEntitlement(context.supabase, context.userId);
    if (entitlement.plan.id !== "scale") {
      throw new Error("Brand Management is available on the Scale plan.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { untyped } = await import("@/lib/untyped-db.server");
    const { data: archiveId, error } = await untyped(supabaseAdmin).rpc("archive_brand", {
      p_user_id: context.userId,
      p_brand_id: data.brandId,
    });
    if (error) throw new Error(error.message);
    return { archiveId: archiveId as string };
  });
