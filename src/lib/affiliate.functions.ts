import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  AFFILIATE_MIN_PAYOUT_PAISE,
  BANK_ACCOUNT_PATTERN,
  IFSC_PATTERN,
  UPI_ID_PATTERN,
  normalizeIfsc,
  type CommissionStatus,
  type PayoutMethod,
  type PayoutStatus,
} from "@/lib/affiliate.shared";

/**
 * Affiliate program (see supabase/migrations/20261124120000_affiliate_program.sql).
 * Everyone can have a referral link and earn commission on the plan payments of the
 * customers who sign up through it. All money movement is decided on the server.
 */

// ---------------------------------------------------------------------------
// Types sent to the browser
// ---------------------------------------------------------------------------

export interface PayoutDetails {
  method: PayoutMethod;
  accountName: string;
  upiId: string | null;
  bankAccount: string | null;
  ifsc: string | null;
}

export interface AffiliateCommissionRow {
  id: string;
  createdAt: string;
  availableAt: string;
  amountPaise: number;
  commissionPaise: number;
  status: CommissionStatus;
}

export interface AffiliatePayoutRow {
  id: string;
  amountPaise: number;
  status: PayoutStatus;
  requestedAt: string;
  settledAt: string | null;
  reference: string | null;
}

export interface AffiliateSummary {
  code: string | null;
  discountPercent: number;
  /** Customers who paid using this person's link. */
  referredCount: number;
  pendingPaise: number;
  availablePaise: number;
  requestedPaise: number;
  paidPaise: number;
  minPayoutPaise: number;
  payoutDetails: PayoutDetails | null;
  recentCommissions: AffiliateCommissionRow[];
  payouts: AffiliatePayoutRow[];
}

type Row = Record<string, unknown>;

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { untyped } = await import("@/lib/untyped-db.server");
  return untyped(supabaseAdmin);
}

// ---------------------------------------------------------------------------
// The signed-in affiliate
// ---------------------------------------------------------------------------

export const getMyAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AffiliateSummary> => {
    const d = await adminDb();
    const uid = context.userId;

    const [codeRes, referredRes, commissionRes, payoutRes, detailsRes] = await Promise.all([
      d
        .from("referral_codes")
        .select("code, discount_percent")
        .eq("created_by", uid)
        .eq("created_by_root", false)
        .maybeSingle(),
      d
        .from("referral_attributions")
        .select("referred_user_id", { count: "exact", head: true })
        .eq("referrer_id", uid),
      d
        .from("affiliate_commissions")
        .select("id, created_at, available_at, amount_paise, commission_paise, status")
        .eq("referrer_id", uid)
        .order("created_at", { ascending: false })
        .limit(1000),
      d
        .from("affiliate_payouts")
        .select("id, amount_paise, status, requested_at, settled_at, reference")
        .eq("user_id", uid)
        .order("requested_at", { ascending: false })
        .limit(20),
      d.from("affiliate_payout_details").select("*").eq("user_id", uid).maybeSingle(),
    ]);

    // A missing table (migration not run yet) should read as "nothing earned", not a crash.
    const commissions = (commissionRes.data ?? []) as Row[];
    const now = Date.now();
    let pending = 0;
    let available = 0;
    let requested = 0;
    let paid = 0;
    for (const c of commissions) {
      const amount = c["commission_paise"] as number;
      const status = c["status"] as CommissionStatus;
      if (status === "approved") {
        if (Date.parse(c["available_at"] as string) > now) pending += amount;
        else available += amount;
      } else if (status === "requested") requested += amount;
      else if (status === "paid") paid += amount;
    }

    const det = detailsRes.data as Row | null;
    return {
      code: ((codeRes.data as Row | null)?.["code"] as string | undefined) ?? null,
      discountPercent: ((codeRes.data as Row | null)?.["discount_percent"] as number | undefined) ?? 20,
      referredCount: referredRes.count ?? 0,
      pendingPaise: pending,
      availablePaise: available,
      requestedPaise: requested,
      paidPaise: paid,
      minPayoutPaise: AFFILIATE_MIN_PAYOUT_PAISE,
      payoutDetails: det
        ? {
            method: det["method"] as PayoutMethod,
            accountName: det["account_name"] as string,
            upiId: (det["upi_id"] as string | null) ?? null,
            bankAccount: (det["bank_account"] as string | null) ?? null,
            ifsc: (det["ifsc"] as string | null) ?? null,
          }
        : null,
      recentCommissions: commissions.slice(0, 20).map((c) => ({
        id: c["id"] as string,
        createdAt: c["created_at"] as string,
        availableAt: c["available_at"] as string,
        amountPaise: c["amount_paise"] as number,
        commissionPaise: c["commission_paise"] as number,
        status: c["status"] as CommissionStatus,
      })),
      payouts: ((payoutRes.data ?? []) as Row[]).map((p) => ({
        id: p["id"] as string,
        amountPaise: p["amount_paise"] as number,
        status: p["status"] as PayoutStatus,
        requestedAt: p["requested_at"] as string,
        settledAt: (p["settled_at"] as string | null) ?? null,
        reference: (p["reference"] as string | null) ?? null,
      })),
    };
  });

const accountName = z.string().trim().min(2, "Enter the account holder's name.").max(100);

const payoutDetailsInput = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("upi"),
    accountName,
    upiId: z
      .string()
      .trim()
      .regex(UPI_ID_PATTERN, "Enter a valid UPI ID, like name@bank."),
  }),
  z.object({
    method: z.literal("bank"),
    accountName,
    bankAccount: z
      .string()
      .trim()
      .regex(BANK_ACCOUNT_PATTERN, "Bank account number must be 9 to 18 digits."),
    ifsc: z
      .string()
      .transform(normalizeIfsc)
      .refine((v) => IFSC_PATTERN.test(v), "Enter a valid IFSC code, like HDFC0001234."),
  }),
]);

export const saveMyPayoutDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => payoutDetailsInput.parse(input))
  .handler(async ({ data, context }) => {
    const d = await adminDb();
    const row =
      data.method === "upi"
        ? {
            user_id: context.userId,
            method: "upi",
            account_name: data.accountName,
            upi_id: data.upiId,
            bank_account: null,
            ifsc: null,
            updated_at: new Date().toISOString(),
          }
        : {
            user_id: context.userId,
            method: "bank",
            account_name: data.accountName,
            upi_id: null,
            bank_account: data.bankAccount,
            ifsc: data.ifsc,
            updated_at: new Date().toISOString(),
          };
    const { error } = await d.from("affiliate_payout_details").upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const requestMyPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const d = await adminDb();
    const { data, error } = await d.rpc("request_affiliate_payout", {
      p_user: context.userId,
      p_min_paise: AFFILIATE_MIN_PAYOUT_PAISE,
    });
    if (error) throw new Error(error.message);
    const r = data as { payout_id: string; amount_paise: number };
    return { payoutId: r.payout_id, amountPaise: r.amount_paise };
  });

// ---------------------------------------------------------------------------
// Owner (root) tools
// ---------------------------------------------------------------------------

async function assertRoot(context: {
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >;
  userId: string;
}) {
  const { isRootEmail } = await import("@/lib/root-email");
  const { data: roles } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if ((roles ?? []).some((r) => r.role === "root")) return;
  const { data } = await context.supabase.auth.getUser();
  if (isRootEmail(data.user?.email)) return;
  throw new Error("Root access required");
}

export interface AdminPayoutRow {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  amountPaise: number;
  status: PayoutStatus;
  requestedAt: string;
  settledAt: string | null;
  reference: string | null;
  note: string | null;
  details: PayoutDetails;
}

export interface AdminCommissionRow {
  id: string;
  createdAt: string;
  availableAt: string;
  referrerEmail: string | null;
  referredEmail: string | null;
  amountPaise: number;
  commissionPaise: number;
  status: CommissionStatus;
  voidReason: string | null;
}

export interface AdminAffiliateOverview {
  payouts: AdminPayoutRow[];
  commissions: AdminCommissionRow[];
  totals: {
    owedPaise: number; // earned but not yet paid out (approved + requested)
    paidPaise: number;
    affiliates: number;
    referredCustomers: number;
  };
}

export const adminAffiliateOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAffiliateOverview> => {
    await assertRoot(context);
    const d = await adminDb();

    const [payoutRes, commissionRes, allRes, attrRes] = await Promise.all([
      d.from("affiliate_payouts").select("*").order("requested_at", { ascending: false }).limit(200),
      d
        .from("affiliate_commissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      d.from("affiliate_commissions").select("referrer_id, commission_paise, status").limit(20000),
      d.from("referral_attributions").select("referred_user_id", { count: "exact", head: true }),
    ]);
    if (payoutRes.error) throw new Error(payoutRes.error.message);
    if (commissionRes.error) throw new Error(commissionRes.error.message);

    const payouts = (payoutRes.data ?? []) as Row[];
    const commissions = (commissionRes.data ?? []) as Row[];

    const ids = new Set<string>();
    for (const p of payouts) ids.add(p["user_id"] as string);
    for (const c of commissions) {
      ids.add(c["referrer_id"] as string);
      if (c["referred_user_id"]) ids.add(c["referred_user_id"] as string);
    }
    const { data: profiles } = ids.size
      ? await d.from("profiles").select("id, email, full_name").in("id", [...ids])
      : { data: [] as Row[] };
    const byId = new Map<string, { email: string | null; name: string | null }>(
      ((profiles ?? []) as Row[]).map((p) => [
        p["id"] as string,
        { email: (p["email"] as string | null) ?? null, name: (p["full_name"] as string | null) ?? null },
      ]),
    );

    let owed = 0;
    let paid = 0;
    const affiliates = new Set<string>();
    for (const c of (allRes.data ?? []) as Row[]) {
      const status = c["status"] as CommissionStatus;
      const amount = c["commission_paise"] as number;
      affiliates.add(c["referrer_id"] as string);
      if (status === "approved" || status === "requested") owed += amount;
      else if (status === "paid") paid += amount;
    }

    return {
      payouts: payouts.map((p) => {
        const det = (p["details"] ?? {}) as Row;
        return {
          id: p["id"] as string,
          userId: p["user_id"] as string,
          email: byId.get(p["user_id"] as string)?.email ?? null,
          name: byId.get(p["user_id"] as string)?.name ?? null,
          amountPaise: p["amount_paise"] as number,
          status: p["status"] as PayoutStatus,
          requestedAt: p["requested_at"] as string,
          settledAt: (p["settled_at"] as string | null) ?? null,
          reference: (p["reference"] as string | null) ?? null,
          note: (p["note"] as string | null) ?? null,
          details: {
            method: (det["method"] as PayoutMethod) ?? "upi",
            accountName: (det["account_name"] as string) ?? "",
            upiId: (det["upi_id"] as string | null) ?? null,
            bankAccount: (det["bank_account"] as string | null) ?? null,
            ifsc: (det["ifsc"] as string | null) ?? null,
          },
        };
      }),
      commissions: commissions.map((c) => ({
        id: c["id"] as string,
        createdAt: c["created_at"] as string,
        availableAt: c["available_at"] as string,
        referrerEmail: byId.get(c["referrer_id"] as string)?.email ?? null,
        referredEmail: c["referred_user_id"]
          ? (byId.get(c["referred_user_id"] as string)?.email ?? null)
          : null,
        amountPaise: c["amount_paise"] as number,
        commissionPaise: c["commission_paise"] as number,
        status: c["status"] as CommissionStatus,
        voidReason: (c["void_reason"] as string | null) ?? null,
      })),
      totals: {
        owedPaise: owed,
        paidPaise: paid,
        affiliates: affiliates.size,
        referredCustomers: attrRes.count ?? 0,
      },
    };
  });

const settleInput = z.object({
  id: z.string().uuid(),
  action: z.enum(["paid", "rejected"]),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(300).optional(),
});

export const adminSettlePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settleInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertRoot(context);
    if (data.action === "paid" && (data.reference?.length ?? 0) < 3) {
      throw new Error("Enter the payment reference (UTR / transaction ID) before marking it paid.");
    }
    const d = await adminDb();
    const { error } = await d.rpc("settle_affiliate_payout", {
      p_payout: data.id,
      p_action: data.action,
      p_reference: data.reference ?? null,
      p_note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const voidInput = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3, "Give a short reason.").max(200),
});

/** Cancels a commission that has not been put into a payout yet (e.g. the payment was refunded). */
export const adminVoidCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => voidInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertRoot(context);
    const d = await adminDb();
    const { data: updated, error } = await d
      .from("affiliate_commissions")
      .update({ status: "void", void_reason: data.reason })
      .eq("id", data.id)
      .eq("status", "approved")
      .is("payout_id", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) {
      throw new Error("Only commissions that are not yet in a payout request can be cancelled.");
    }
    return { ok: true as const };
  });
