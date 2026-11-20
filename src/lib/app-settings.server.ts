/** Admin on/off switches stored in public.app_settings. Read fresh on every run. Server-only. */
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient<never, never, never>;

export const AUTOMATION_KEYS = ["auto_generate_enabled", "autopost_enabled"] as const;
export type AutomationKey = (typeof AUTOMATION_KEYS)[number];

/** Used when the row (or the table) does not exist yet. Generation fails safe to OFF. */
export const AUTOMATION_DEFAULTS: Record<AutomationKey, boolean> = {
  auto_generate_enabled: false,
  autopost_enabled: true,
};

export async function getAutomationSetting(admin: Admin, key: AutomationKey): Promise<boolean> {
  try {
    const { data, error } = await (admin as unknown as SupabaseClient)
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return AUTOMATION_DEFAULTS[key];
    return Boolean((data as { value: boolean }).value);
  } catch {
    return AUTOMATION_DEFAULTS[key];
  }
}
