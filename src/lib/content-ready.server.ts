/**
 * "Your content is ready" email. Server-only.
 *
 * Sent once, the moment a generation job finishes:
 *   Autopost ON  -> "Current Week Content Generated, it will be autoposted as per Schedule"
 *   Autopost OFF -> "Current Week Content Generated, Please review and Submit for Posting"
 * Both link to {PUBLIC_APP_URL}/calendar. The link carries no token: opening it
 * asks the reader to sign in, and the calendar only ever shows the signed-in
 * user's own content, so only that paid user can see it.
 *
 * Never throws: a failed email must not break content generation.
 */
import { contentReadyEmail, sendEmail } from "@/lib/email.server";
import { getGenerationEntitlement, usersWithAccess } from "@/lib/generation-entitlements";
import { untyped } from "@/lib/untyped-db.server";

interface JobRef {
  id: string;
  user_id: string;
  brand_id?: string | null;
}

export async function notifyContentReady(admin: unknown, job: JobRef): Promise<void> {
  const db = untyped(admin);
  let claimed = false;
  try {
    // Paid (or owner) accounts only.
    const paid = await usersWithAccess(admin as never, [job.user_id]);
    if (!paid.has(job.user_id)) return;

    const { data: profile } = await db
      .from("profiles")
      .select("email, full_name, autopost_enabled")
      .eq("id", job.user_id)
      .maybeSingle();

    let email: string | null = (profile?.email as string | undefined)?.trim() || null;
    if (!email) {
      const { data } = await (
        admin as {
          auth: {
            admin: {
              getUserById: (id: string) => Promise<{ data: { user: { email?: string } | null } }>;
            };
          };
        }
      ).auth.admin.getUserById(job.user_id);
      email = data.user?.email?.trim() || null;
    }
    if (!email) return;

    // Same meaning as the header toggle: ON unless the user switched it off.
    // It only counts as autoposting if the plan includes autoposting too.
    const entitlement = await getGenerationEntitlement(admin as never, job.user_id);
    const autopost =
      (profile?.autopost_enabled as boolean | null) !== false && entitlement.plan.autoPost;

    // Claim the job first; if it was already claimed, someone else sent it.
    const { error: claimError } = await db.from("content_ready_notifications").insert({
      job_id: job.id,
      user_id: job.user_id,
      brand_id: job.brand_id ?? null,
      autopost,
    });
    if (claimError) {
      if (claimError.code !== "23505")
        console.error("[content-ready] claim failed", claimError.message);
      return;
    }
    claimed = true;

    let brandName: string | null = null;
    if (job.brand_id) {
      const { data: brand } = await db
        .from("brand_profiles")
        .select("business_name")
        .eq("id", job.brand_id)
        .maybeSingle();
      brandName = (brand?.business_name as string | undefined) ?? null;
    }

    const message = contentReadyEmail({
      name: (profile?.full_name as string | null) ?? null,
      brandName,
      autopost,
    });
    const sent = await sendEmail({ to: email, ...message });
    if (!sent.ok) {
      // Let a later completion check try again.
      await db.from("content_ready_notifications").delete().eq("job_id", job.id);
      claimed = false;
    }
  } catch (error) {
    console.error("[content-ready] failed", error);
    if (claimed) {
      try {
        await db.from("content_ready_notifications").delete().eq("job_id", job.id);
      } catch {
        /* ignore */
      }
    }
  }
}
