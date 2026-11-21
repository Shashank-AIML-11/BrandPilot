/**
 * Daily spend guard for paid media calls. Counts today's paid calls (IST day) in `ai_usage` and
 * refuses a new one once the limit is reached, so a bug, a retry loop or repeated clicks on
 * Generate can never burn more than a fixed amount per day. A refused call costs nothing.
 *
 * Env (per environment):
 *   FAL_DAILY_IMAGE_CAP         default 24    paid fal images per day ("off" = no limit)
 *   SHOTSTACK_DAILY_RENDER_CAP  default 6     Shotstack video renders per day ("off" = no limit)
 *
 * If the database cannot be read, the call is allowed (and the problem logged) so a missing table
 * never stops content generation.
 */
export type SpendKind = "fal_image" | "shotstack_render";

const RULES: Record<SpendKind, { env: string; fallback: number; label: string }> = {
  fal_image: { env: "FAL_DAILY_IMAGE_CAP", fallback: 24, label: "image" },
  shotstack_render: { env: "SHOTSTACK_DAILY_RENDER_CAP", fallback: 6, label: "video render" },
};

function istDayStartIso(): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const midnightIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return new Date(midnightIst - 5.5 * 3_600_000).toISOString();
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
}

export async function spendGuard(kind: SpendKind): Promise<void> {
  const rule = RULES[kind];
  const raw = (process.env[rule.env] ?? "").trim().toLowerCase();
  if (raw === "off") return;
  const cap = Number.parseInt(raw, 10);
  const limit = Number.isFinite(cap) && cap >= 0 ? cap : rule.fallback;
  try {
    const { count, error } = await (await admin())
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("kind", kind)
      .gte("created_at", istDayStartIso());
    if (error) throw error;
    if ((count ?? 0) >= limit) {
      throw new Error(`Daily ${rule.label} limit reached (${limit}). No more paid ${rule.label}s today to protect your credits.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Daily ")) throw error;
    console.error("[spend-guard] could not check the daily limit, allowing the call", error);
  }
}

export async function recordSpend(kind: SpendKind): Promise<void> {
  try {
    await (await admin()).from("ai_usage").insert({ kind });
  } catch (error) {
    console.error("[spend-guard] could not record usage", error);
  }
}
