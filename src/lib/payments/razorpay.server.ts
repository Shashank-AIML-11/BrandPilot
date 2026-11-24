import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanId } from "@/lib/plans";

// Server-only Razorpay integration. Never import this from a route file
// or a *.functions.ts file directly at the top level — those ship to
// the client bundle. Load it inside server handlers/functions with a
// dynamic import, same pattern as the other *.server.ts modules here.

const API_BASE = "https://api.razorpay.com/v1";

function keyId(): string {
  const v = process.env["RAZORPAY_KEY_ID"];
  if (!v) throw new Error("Payments are not configured (missing RAZORPAY_KEY_ID).");
  return v;
}

function keySecret(): string {
  const v = process.env["RAZORPAY_KEY_SECRET"];
  if (!v) throw new Error("Payments are not configured (missing RAZORPAY_KEY_SECRET).");
  return v;
}

function webhookSecret(): string {
  const v = process.env["RAZORPAY_WEBHOOK_SECRET"];
  if (!v) throw new Error("Payments are not configured (missing RAZORPAY_WEBHOOK_SECRET).");
  return v;
}

/**
 * Razorpay Plans are created once (via the Razorpay dashboard or a
 * one-time setup script) and reused for every subscription, rather
 * than created on the fly per checkout. Set the resulting plan IDs as
 * env vars after creating them:
 *   RAZORPAY_PLAN_STARTER, RAZORPAY_PLAN_GROWTH, RAZORPAY_PLAN_SCALE
 */
function razorpayPlanId(planId: PlanId): string {
  const map: Record<PlanId, string | undefined> = {
    starter: process.env["RAZORPAY_PLAN_STARTER"],
    growth: process.env["RAZORPAY_PLAN_GROWTH"],
    scale: process.env["RAZORPAY_PLAN_SCALE"],
  };
  const value = map[planId];
  if (!value) {
    throw new Error(
      `Payments are not configured for the "${planId}" plan (missing Razorpay plan ID env var).`,
    );
  }
  return value;
}

async function razorpayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const message = json?.error?.description || `Razorpay request failed [${res.status}]`;
    throw new Error(message);
  }

  return json as T;
}

interface RazorpayCustomer {
  id: string;
}

/** Finds an existing Razorpay customer by email, or creates one. */
export async function ensureCustomer(params: {
  email: string;
  name?: string | null | undefined;
}): Promise<RazorpayCustomer> {
  // Razorpay customers can be created with a fail_existing:0 flag,
  // which returns the existing customer instead of erroring if one
  // already exists for this email — simplest way to make this
  // idempotent across repeated checkout attempts.
  return razorpayFetch<RazorpayCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: params.name || params.email,
      email: params.email,
      fail_existing: "0",
    }),
  });
}

interface RazorpaySubscription {
  id: string;
  status: string;
  short_url?: string;
  current_start?: number;
  current_end?: number;
}

/**
 * Creates a Razorpay Subscription for the given plan. total_count is
 * set high (120 months = 10 years) since Razorpay subscriptions run
 * until cancelled, not indefinitely by default — this just avoids the
 * subscription auto-completing after a low charge count.
 */
export async function createSubscription(params: {
  planId: PlanId;
  customerId: string;
  userId: string;
  notifyCustomer?: boolean;
}): Promise<RazorpaySubscription> {
  return razorpayFetch<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: razorpayPlanId(params.planId),
      customer_id: params.customerId,
      total_count: 120,
      customer_notify: params.notifyCustomer === false ? 0 : 1,
      notes: {
        userId: params.userId,
        planId: params.planId,
      },
    }),
  });
}

/**
 * Razorpay plan id for an auto-renewing subscription. Monthly plans keep the
 * original variable names; annual plans use a "_ANNUAL" suffix:
 *   RAZORPAY_PLAN_STARTER / _GROWTH / _SCALE            (billed every month)
 *   RAZORPAY_PLAN_STARTER_ANNUAL / _GROWTH_ANNUAL / _SCALE_ANNUAL  (billed every year)
 * Create them once per Razorpay mode (Test and Live) with scripts/create-razorpay-plans.mjs.
 */
export function autorenewPlanId(planId: PlanId, cycle: "monthly" | "annual"): string {
  const base = `RAZORPAY_PLAN_${planId.toUpperCase()}`;
  const value = process.env[cycle === "annual" ? `${base}_ANNUAL` : base];
  if (!value) {
    throw new Error(
      `Auto-renew is not set up for the ${planId} ${cycle} plan (missing ${cycle === "annual" ? `${base}_ANNUAL` : base}).`,
    );
  }
  return value;
}

export interface AutorenewSubscription {
  id: string;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  charge_at?: number | null;
}

/**
 * Starts an auto-renewing Razorpay subscription. With startAt (unix seconds) the
 * customer only authorises the mandate now and the first charge happens then;
 * without it, the first charge happens immediately at checkout.
 */
export async function createAutorenewSubscription(params: {
  planId: PlanId;
  cycle: "monthly" | "annual";
  userId: string;
  startAt?: number;
}): Promise<AutorenewSubscription> {
  return razorpayFetch<AutorenewSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: autorenewPlanId(params.planId, params.cycle),
      // Razorpay needs a charge count; this is "until cancelled" in practice.
      total_count: params.cycle === "annual" ? 10 : 120,
      customer_notify: 1,
      ...(params.startAt ? { start_at: params.startAt } : {}),
      notes: { userId: params.userId, planId: params.planId, billingCycle: params.cycle },
    }),
  });
}

export async function fetchRazorpaySubscription(id: string): Promise<AutorenewSubscription> {
  return razorpayFetch<AutorenewSubscription>(`/subscriptions/${id}`);
}

/**
 * Stops future charges. An active subscription is cancelled at the end of the
 * current Razorpay cycle; one that has not started charging yet is cancelled now.
 */
export async function cancelAutorenewSubscription(id: string, active: boolean): Promise<void> {
  try {
    await razorpayFetch(`/subscriptions/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ cancel_at_cycle_end: active ? 1 : 0 }),
    });
  } catch (err) {
    if (!active) throw err;
    // Some states do not accept "at cycle end"; stop it right away instead.
    await razorpayFetch(`/subscriptions/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ cancel_at_cycle_end: 0 }),
    });
  }
}

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * Creates a one-time Razorpay Order for a 30-day plan period. The amount is
 * always taken from our own plan table by the caller, never from the browser.
 */
export async function createOrder(params: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  return razorpayFetch<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: "INR",
      receipt: params.receipt.slice(0, 40),
      notes: params.notes,
    }),
  });
}

/**
 * Verifies the signature Razorpay Checkout returns for an Order payment:
 * HMAC-SHA256 of "<order_id>|<payment_id>" with the key secret.
 */
export function verifyOrderPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const payload = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
  return safeEqual(hmacHex(payload, keySecret()), params.razorpaySignature);
}

export async function cancelSubscription(razorpaySubscriptionId: string): Promise<void> {
  await razorpayFetch(`/subscriptions/${razorpaySubscriptionId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ cancel_at_cycle_end: 0 }),
  });
}

function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the `x-razorpay-signature` header on incoming webhook
 * requests against the raw request body. Must be called with the raw
 * (unparsed) body text — signature verification fails silently if the
 * body has been re-serialized from parsed JSON.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = hmacHex(rawBody, webhookSecret());
  return safeEqual(expected, signatureHeader);
}

/**
 * Verifies the signature returned to the client's success handler
 * after a Razorpay Checkout payment. This is a fast, optimistic check
 * for immediate UI feedback — the webhook remains the authoritative
 * source of truth and is idempotent, so this is a defence-in-depth
 * check, not the only one.
 */
export function verifyPaymentSignature(params: {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}): boolean {
  const payload = `${params.razorpayPaymentId}|${params.razorpaySubscriptionId}`;
  const expected = hmacHex(payload, keySecret());
  return safeEqual(expected, params.razorpaySignature);
}

export function publicKeyId(): string {
  return keyId();
}
