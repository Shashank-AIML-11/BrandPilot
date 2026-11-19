import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AUTOPOST_CONSENT_TEXT } from "@/lib/autopost";

/**
 * Stores a permanent record each time the user accepts (or turns off) Autopost:
 * who, when, the exact notice text, IP address, browser and the plan they were on.
 * Written on the server so the IP and plan cannot be faked from the browser.
 */
export const recordAutopostConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ action: z.enum(["accepted", "turned_off"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const forwarded = getRequestHeader("x-forwarded-for");
    const ip =
      (forwarded ? forwarded.split(",")[0]?.trim() : "") ||
      getRequestHeader("x-real-ip") ||
      null;
    const userAgent = (getRequestHeader("user-agent") ?? "").slice(0, 300) || null;

    // Plan at this moment: latest subscription, else a live one-time pass, else free.
    let plan = "free";
    let planStatus = "none";
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", context.userId)
      .in("status", ["active", "expired"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sub) {
      plan = String(sub.plan ?? "free");
      const ended = sub.current_period_end && new Date(sub.current_period_end) < new Date();
      planStatus = sub.status === "expired" || ended ? "expired" : "active";
    } else {
      try {
        const { activeOneTimePass } = await import("@/lib/generation-entitlements");
        const pass = await activeOneTimePass(supabaseAdmin, context.userId);
        if (pass) {
          plan = "one_time_pass";
          planStatus = "active";
        }
      } catch {
        // keep "free"
      }
    }

    const { error } = await supabaseAdmin.from("autopost_consents" as never).insert({
      user_id: context.userId,
      action: data.action,
      consent_text: data.action === "accepted" ? AUTOPOST_CONSENT_TEXT : null,
      ip_address: ip,
      user_agent: userAgent,
      plan,
      plan_status: planStatus,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
