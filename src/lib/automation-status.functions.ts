import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The Admin Portal on/off switches, readable by any signed-in user (they override each person's own switch). */
export const getAutomationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAutomationSetting } = await import("@/lib/app-settings.server");
    return {
      autoGenerate: await getAutomationSetting(supabaseAdmin as never, "auto_generate_enabled"),
      autopost: await getAutomationSetting(supabaseAdmin as never, "autopost_enabled"),
    };
  });
