/**
 * Daily plan housekeeping (run by the cron route):
 *   1. Mark plans whose 30 days are over as "expired" and send one notice.
 *   2. Email a renewal reminder on each of the last 5 days before expiry.
 * Server-only. Safe to run more than once a day: every email is claimed in
 * renewal_notifications first, so nobody gets the same one twice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { planById } from "@/lib/plans";
import {
  daysUntilExpiry,
  formatIstDateTime,
  LEGACY_AUTOPAY_GRACE_DAYS,
  REMINDER_DAYS,
} from "@/lib/plan-access";
import { planExpiredEmail, renewalReminderEmail, sendEmail } from "@/lib/email.server";
import { untyped, type UntypedDb } from "@/lib/untyped-db.server";

const DAY_MS = 86_400_000;

interface SubRow {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  current_period_end: string;
  razorpay_subscription_id: string | null;
  auto_renew?: boolean | null;
}

export interface RenewalRunResult {
  expired: number;
  remindersSent: number;
  expiredEmailsSent: number;
  skipped: number;
  errors: number;
}

async function recipient(
  db: UntypedDb,
  admin: SupabaseClient<never, never, never>,
  userId: string,
): Promise<{ email: string | null; name: string | null }> {
  const { data: profile } = await db
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();
  let email: string | null = (profile?.email as string | undefined)?.trim() || null;
  if (!email) {
    const { data } = await (
      admin as unknown as {
        auth: {
          admin: {
            getUserById: (id: string) => Promise<{ data: { user: { email?: string } | null } }>;
          };
        };
      }
    ).auth.admin.getUserById(userId);
    email = data.user?.email?.trim() || null;
  }
  return { email, name: (profile?.full_name as string | undefined)?.trim() || null };
}

/**
 * Claims a notification slot, sends the email, and releases the slot again if
 * the send fails so tomorrow's run retries it.
 */
async function sendOnce(
  db: UntypedDb,
  row: SubRow,
  kind: "reminder" | "expired",
  daysLeft: number,
  email: string,
  message: { subject: string; html: string; text: string },
): Promise<"sent" | "duplicate" | "failed"> {
  const { data: claimed, error: claimError } = await db
    .from("renewal_notifications")
    .upsert(
      {
        user_id: row.user_id,
        subscription_id: row.id,
        kind,
        days_left: daysLeft,
        period_end: row.current_period_end,
        email,
      },
      { onConflict: "subscription_id,kind,days_left,period_end", ignoreDuplicates: true },
    )
    .select("id");
  if (claimError) {
    console.error("[plan-renewals] could not record notification", claimError.message);
    return "failed";
  }
  if (!claimed || claimed.length === 0) return "duplicate";

  const sent = await sendEmail({ to: email, ...message });
  if (!sent.ok) {
    await db.from("renewal_notifications").delete().eq("id", claimed[0].id);
    return "failed";
  }
  return "sent";
}

export async function runPlanRenewals(
  admin: SupabaseClient<never, never, never>,
  now: Date = new Date(),
): Promise<RenewalRunResult> {
  const db = untyped(admin);
  const result: RenewalRunResult = {
    expired: 0,
    remindersSent: 0,
    expiredEmailsSent: 0,
    skipped: 0,
    errors: 0,
  };

  // ---- 1. Expire lapsed plans -------------------------------------------
  const { data: lapsedRows, error: lapsedError } = await db
    .from("subscriptions")
    .select("id, user_id, plan, status, current_period_end, razorpay_subscription_id, auto_renew")
    .eq("status", "active")
    .not("current_period_end", "is", null)
    .lt("current_period_end", now.toISOString())
    .limit(500);
  if (lapsedError) throw new Error(lapsedError.message);

  for (const row of (lapsedRows ?? []) as SubRow[]) {
    try {
      // Old autopay rows: give Razorpay's charge webhook a few days to extend them.
      const grace = row.razorpay_subscription_id || row.auto_renew ? LEGACY_AUTOPAY_GRACE_DAYS * DAY_MS : 0;
      if (new Date(row.current_period_end).getTime() + grace > now.getTime()) continue;

      const { data: updated } = await db
        .from("subscriptions")
        .update({ status: "expired", expired_at: now.toISOString() })
        .eq("id", row.id)
        .eq("status", "active")
        .select("id");
      if (!updated || updated.length === 0) continue; // renewed in the meantime
      result.expired += 1;

      const { data: otherLive } = await db
        .from("subscriptions")
        .select("id")
        .eq("user_id", row.user_id)
        .eq("status", "active")
        .limit(1);
      if (!otherLive?.length) {
        await db.from("profiles").update({ plan: "free" }).eq("id", row.user_id);
      }

      const plan = planById(row.plan);
      const { email, name } = await recipient(db, admin, row.user_id);
      if (!plan || !email) {
        result.skipped += 1;
        continue;
      }
      const outcome = await sendOnce(
        db,
        row,
        "expired",
        0,
        email,
        planExpiredEmail({
          name,
          planName: plan.name,
          expiresAt: formatIstDateTime(row.current_period_end),
        }),
      );
      if (outcome === "sent") result.expiredEmailsSent += 1;
      if (outcome === "failed") result.errors += 1;
    } catch (err) {
      result.errors += 1;
      console.error("[plan-renewals] expiry step failed", err);
    }
  }

  // ---- 2. Reminders: each of the last 5 days before expiry ---------------
  const windowEnd = new Date(now.getTime() + (REMINDER_DAYS + 1) * DAY_MS);
  const { data: soonRows, error: soonError } = await db
    .from("subscriptions")
    .select("id, user_id, plan, status, current_period_end, razorpay_subscription_id")
    .eq("status", "active")
    .is("razorpay_subscription_id", null) // autopay customers renew by themselves
    .eq("auto_renew", false) // auto-renew customers are charged automatically, no reminder needed
    .gt("current_period_end", now.toISOString())
    .lte("current_period_end", windowEnd.toISOString())
    .limit(1000);
  if (soonError) throw new Error(soonError.message);

  for (const row of (soonRows ?? []) as SubRow[]) {
    try {
      const daysLeft = daysUntilExpiry(row.current_period_end, now);
      if (daysLeft < 1 || daysLeft > REMINDER_DAYS) continue;

      const plan = planById(row.plan);
      const { email, name } = await recipient(db, admin, row.user_id);
      if (!plan || !email) {
        result.skipped += 1;
        continue;
      }
      const outcome = await sendOnce(
        db,
        row,
        "reminder",
        daysLeft,
        email,
        renewalReminderEmail({
          name,
          planName: plan.name,
          expiresAt: formatIstDateTime(row.current_period_end),
          daysLeft,
        }),
      );
      if (outcome === "sent") result.remindersSent += 1;
      if (outcome === "failed") result.errors += 1;
    } catch (err) {
      result.errors += 1;
      console.error("[plan-renewals] reminder step failed", err);
    }
  }

  return result;
}
