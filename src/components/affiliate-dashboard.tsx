import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift, Loader2, Wallet } from "lucide-react";
import {
  createMyReferral,
} from "@/lib/referrals.functions";
import {
  getMyAffiliate,
  requestMyPayout,
  saveMyPayoutDetails,
  type PayoutDetails,
} from "@/lib/affiliate.functions";
import {
  AFFILIATE_COMMISSION_PERCENT,
  AFFILIATE_HOLD_DAYS,
  commissionLabel,
  formatPaise,
  maskAccountNumber,
  type PayoutMethod,
} from "@/lib/affiliate.shared";
import { ReferralShare } from "@/components/referral-share";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const QUERY_KEY = ["my-affiliate"];

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function PayoutDetailsSummary({ details }: { details: PayoutDetails }) {
  return details.method === "upi" ? (
    <p className="text-sm">
      UPI: <strong>{details.upiId}</strong> ({details.accountName})
    </p>
  ) : (
    <p className="text-sm">
      Bank: <strong>{maskAccountNumber(details.bankAccount)}</strong>, IFSC{" "}
      <strong>{details.ifsc}</strong> ({details.accountName})
    </p>
  );
}

function PayoutDetailsForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: PayoutDetails | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [method, setMethod] = useState<PayoutMethod>(initial?.method ?? "upi");
  const [accountName, setAccountName] = useState(initial?.accountName ?? "");
  const [upiId, setUpiId] = useState(initial?.upiId ?? "");
  const [bankAccount, setBankAccount] = useState("");
  const [ifsc, setIfsc] = useState(initial?.ifsc ?? "");

  const save = useMutation({
    mutationFn: () =>
      method === "upi"
        ? saveMyPayoutDetails({ data: { method: "upi", accountName, upiId } })
        : saveMyPayoutDetails({ data: { method: "bank", accountName, bankAccount, ifsc } }),
    onSuccess: () => {
      toast.success("Payout details saved");
      onSaved();
    },
    onError: (err) => toast.error(errorMessage(err, "Could not save your payout details")),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={method === "upi" ? "default" : "outline"}
          onClick={() => setMethod("upi")}
        >
          UPI
        </Button>
        <Button
          type="button"
          size="sm"
          variant={method === "bank" ? "default" : "outline"}
          onClick={() => setMethod("bank")}
        >
          Bank account
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="aff-name">Account holder name</Label>
        <Input
          id="aff-name"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="Name as on the account"
          maxLength={100}
          required
        />
      </div>

      {method === "upi" ? (
        <div className="space-y-1.5">
          <Label htmlFor="aff-upi">UPI ID</Label>
          <Input
            id="aff-upi"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="name@bank"
            autoComplete="off"
            required
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="aff-acct">Account number</Label>
            <Input
              id="aff-acct"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, ""))}
              placeholder={initial?.bankAccount ? "Re-enter to change" : "9 to 18 digits"}
              inputMode="numeric"
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aff-ifsc">IFSC code</Label>
            <Input
              id="aff-ifsc"
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              placeholder="HDFC0001234"
              maxLength={11}
              autoComplete="off"
              required
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save payout details
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** The whole "Refer & earn" experience: link, earnings, payout details, payout requests. */
export function AffiliateDashboard() {
  const queryClient = useQueryClient();
  const [editingDetails, setEditingDetails] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getMyAffiliate(),
  });

  const create = useMutation({
    mutationFn: () => createMyReferral(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["my-referral"] });
      toast.success("Your referral link is ready");
    },
    onError: (err) => toast.error(errorMessage(err, "Could not create your link")),
  });

  const payout = useMutation({
    mutationFn: () => requestMyPayout(),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(`Payout of ${formatPaise(r.amountPaise)} requested`);
    },
    onError: (err) => toast.error(errorMessage(err, "Could not request the payout")),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-sm text-destructive">Could not load your affiliate details.</p>;
  }

  const canRequest =
    data.payoutDetails !== null &&
    data.availablePaise >= data.minPayoutPaise &&
    !payout.isPending;
  const payoutHint = !data.payoutDetails
    ? "Save your payout details below to request a payout."
    : data.availablePaise < data.minPayoutPaise
      ? `You can request a payout once your available balance reaches ${formatPaise(data.minPayoutPaise)}.`
      : `Request ${formatPaise(data.availablePaise)} to your ${data.payoutDetails.method === "upi" ? "UPI ID" : "bank account"}.`;

  return (
    <div className="space-y-6">
      {/* 1. The link */}
      {!data.code ? (
        <section className="surface p-6">
          <div className="flex items-start gap-3">
            <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">
                Become an affiliate: earn {AFFILIATE_COMMISSION_PERCENT}% on every referral
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your personal link. Friends get {data.discountPercent}% off their first plan,
                and you earn {AFFILIATE_COMMISSION_PERCENT}% of every plan payment they make.
              </p>
              <Button className="mt-4" onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create my link
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="surface space-y-5 p-6">
          <ReferralShare code={data.code} discountPercent={data.discountPercent} />
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <p>
              <strong>{data.referredCount}</strong>{" "}
              {data.referredCount === 1 ? "customer has" : "customers have"} paid using your link.
            </p>
          </div>
        </section>
      )}

      {/* 2. How it works */}
      <section className="surface p-6">
        <h2 className="font-semibold">How it works</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            Your friend gets <strong>{data.discountPercent}% off</strong> their first plan.
          </li>
          <li>
            You earn <strong>{AFFILIATE_COMMISSION_PERCENT}%</strong> of every plan payment they
            make: the first plan and every renewal, for as long as they keep paying.
          </li>
          <li>
            Each commission is held for {AFFILIATE_HOLD_DAYS} days (the refund window), then it
            becomes available.
          </li>
          <li>
            Once your available balance reaches {formatPaise(data.minPayoutPaise)}, request a payout
            to your UPI or bank account. The one-time pass does not earn commission.
          </li>
        </ul>
      </section>

      {/* 3. Earnings */}
      <section className="surface space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Wallet className="h-4 w-4" /> Your earnings
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Tile
            label="On hold"
            value={formatPaise(data.pendingPaise)}
            hint={`Released after ${AFFILIATE_HOLD_DAYS} days`}
          />
          <Tile label="Available" value={formatPaise(data.availablePaise)} hint="Ready to withdraw" />
          <Tile label="Requested" value={formatPaise(data.requestedPaise)} hint="Waiting to be paid" />
          <Tile label="Paid out" value={formatPaise(data.paidPaise)} hint="Sent to you" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={() => payout.mutate()} disabled={!canRequest}>
            {payout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Request payout
          </Button>
          <p className="text-sm text-muted-foreground">{payoutHint}</p>
        </div>
      </section>

      {/* 4. Payout details */}
      <section className="surface space-y-4 p-6">
        <h2 className="font-semibold">Payout details</h2>
        {data.payoutDetails && !editingDetails ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PayoutDetailsSummary details={data.payoutDetails} />
            <Button variant="outline" size="sm" onClick={() => setEditingDetails(true)}>
              Change
            </Button>
          </div>
        ) : (
          <PayoutDetailsForm
            initial={data.payoutDetails}
            onSaved={() => {
              setEditingDetails(false);
              queryClient.invalidateQueries({ queryKey: QUERY_KEY });
            }}
            onCancel={data.payoutDetails ? () => setEditingDetails(false) : undefined}
          />
        )}
      </section>

      {/* 5. History */}
      {data.recentCommissions.length > 0 && (
        <section className="surface space-y-3 p-6">
          <h2 className="font-semibold">Recent earnings</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Customer paid</TableHead>
                <TableHead className="text-right">You earned</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentCommissions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{formatDate(c.createdAt)}</TableCell>
                  <TableCell className="text-right">{formatPaise(c.amountPaise)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPaise(c.commissionPaise)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{commissionLabel(c.status, c.availableAt)}</Badge>
                    {c.status === "approved" && Date.parse(c.availableAt) > Date.now() && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        until {formatDate(c.availableAt)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {data.payouts.length > 0 && (
        <section className="surface space-y-3 p-6">
          <h2 className="font-semibold">Payout history</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.requestedAt)}</TableCell>
                  <TableCell className="text-right font-medium">{formatPaise(p.amountPaise)}</TableCell>
                  <TableCell className="capitalize">
                    <Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.reference ?? (p.settledAt ? formatDate(p.settledAt) : "-")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
