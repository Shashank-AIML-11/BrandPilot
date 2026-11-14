/**
 * Transactional email through Resend (https://resend.com). Server-only.
 *
 * Env vars:
 *   RESEND_API_KEY   required. Without it emails are skipped (and logged).
 *   EMAIL_FROM       optional, default "LOVIZA <billing@loviza.click>". The sending
 *                    domain must be verified in Resend.
 *   PUBLIC_APP_URL   optional, default "https://app.loviza.click". Base for the Renew link.
 */

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export function appUrl(): string {
  return (process.env["PUBLIC_APP_URL"] ?? "https://app.loviza.click").replace(/\/$/, "");
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY is not set; email not sent:", params.subject);
    return { ok: false, skipped: true, error: "RESEND_API_KEY is not set" };
  }

  const from = process.env["EMAIL_FROM"] ?? "LOVIZA <billing@loviza.click>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error(`[email] Resend rejected the message [${res.status}]: ${detail}`);
      return { ok: false, error: `Resend ${res.status}: ${detail}` };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] send failed:", message);
    return { ok: false, error: message };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title: string, bodyHtml: string, buttonLabel: string, buttonUrl: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
    <tr><td>
      <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em">LOVIZA</div>
      <h1 style="font-size:20px;margin:20px 0 8px">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="margin:24px 0">
        <a href="${escapeHtml(buttonUrl)}" style="background:#00a8c6;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(buttonLabel)}</a>
      </p>
      <p style="font-size:12px;color:#64748b;margin:0">If the button doesn't work, open ${escapeHtml(buttonUrl)}</p>
    </td></tr>
  </table>
</body></html>`;
}

export interface RenewalEmailInput {
  name?: string | null;
  planName: string;
  /** Pre-formatted, e.g. "5 Dec 2026, 6:30 pm IST". */
  expiresAt: string;
  daysLeft: number;
}

/** Reminder sent on each of the last 5 days before the plan ends. */
export function renewalReminderEmail(input: RenewalEmailInput) {
  const renewUrl = `${appUrl()}/renew`;
  const hello = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,";
  const when = input.daysLeft === 1 ? "tomorrow" : `in ${input.daysLeft} days`;
  const subject =
    input.daysLeft === 1
      ? `Your LOVIZA ${input.planName} plan ends tomorrow`
      : `Your LOVIZA ${input.planName} plan ends in ${input.daysLeft} days`;
  const html = layout(
    `Your plan ends ${when}`,
    `<p style="line-height:1.6;margin:0 0 12px">${hello}</p>
     <p style="line-height:1.6;margin:0 0 12px">Your <strong>${escapeHtml(input.planName)}</strong> plan ends on <strong>${escapeHtml(input.expiresAt)}</strong>.
     After that, content generation, auto-posting and the rest of LOVIZA's automation will pause until you renew.</p>
     <p style="line-height:1.6;margin:0">Renew before then and your plan is extended by 30 days from the date it ends, so you don't lose a single day.</p>`,
    "Renew my plan",
    renewUrl,
  );
  const text = `${input.name ? `Hi ${input.name},` : "Hi,"}

Your LOVIZA ${input.planName} plan ends on ${input.expiresAt}. After that, content generation and auto-posting will pause until you renew.

Renew before then and your plan is extended by 30 days from the date it ends.

Renew: ${renewUrl}`;
  return { subject, html, text };
}

/** Sent once, after the plan has ended. */
export function planExpiredEmail(
  input: Pick<RenewalEmailInput, "name" | "planName" | "expiresAt">,
) {
  const renewUrl = `${appUrl()}/renew`;
  const hello = input.name ? `Hi ${escapeHtml(input.name)},` : "Hi,";
  const subject = `Your LOVIZA ${input.planName} plan has ended`;
  const html = layout(
    "Your plan has ended",
    `<p style="line-height:1.6;margin:0 0 12px">${hello}</p>
     <p style="line-height:1.6;margin:0 0 12px">Your <strong>${escapeHtml(input.planName)}</strong> plan ended on <strong>${escapeHtml(input.expiresAt)}</strong>, so content generation and auto-posting are paused.</p>
     <p style="line-height:1.6;margin:0">Your brand profile and all your content are safe. Renew to pick up where you left off.</p>`,
    "Renew my plan",
    renewUrl,
  );
  const text = `${input.name ? `Hi ${input.name},` : "Hi,"}

Your LOVIZA ${input.planName} plan ended on ${input.expiresAt}, so content generation and auto-posting are paused. Your brand profile and content are safe.

Renew: ${renewUrl}`;
  return { subject, html, text };
}
