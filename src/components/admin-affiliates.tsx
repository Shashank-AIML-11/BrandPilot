import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  adminAffiliateOverview,
  adminSettlePayout,
  adminVoidCommission,
  type AdminPayoutRow,
} from "@/lib/affiliate.functions";
import { formatPaise } from "@/lib/affiliate.shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const KEY = ["admin-affiliates"];

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function msg(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

function PayTo({ p }: { p: AdminPayoutRow }) {
  const d = p.details;
  return d.method === "upi" ? (
    <div className="text-sm">
      <div className="font-medium">UPI: {d.upiId}</div>
      <div className="text-muted-foreground">{d.accountName}</div>
    </div>
  ) : (
    <div className="text-sm">
      <div className="font-medium">A/c {d.bankAccount}</div>
      <div className="text-muted-foreground">
        IFSC {d.ifsc} · {d.accountName}
      </div>
    </div>
  );
}

function PayoutActions({ p }: { p: AdminPayoutRow }) {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState("");

  const settle = useMutation({
    mutationFn: (action: "paid" | "rejected") =>
      adminSettlePayout({
        data: { id: p.id, action, reference: reference.trim() || undefined },
      }),
    onSuccess: (_r, action) => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast.success(action === "paid" ? "Marked as paid" : "Payout rejected");
    },
    onError: (err) => toast.error(msg(err, "Could not update the payout")),
  });

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="UTR / reference"
        className="h-8 w-40"
        aria-label="Payment reference"
      />
      <Button size="sm" disabled={settle.isPending} onClick={() => settle.mutate("paid")}>
        Mark paid
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={settle.isPending}
        onClick={() => {
          if (window.confirm("Reject this payout? The money returns to the affiliate's balance.")) {
            settle.mutate("rejected");
          }
        }}
      >
        Reject
      </Button>
    </div>
  );
}

/** Admin Portal tab (root only): pay affiliates and keep an eye on commissions. */
export function AdminAffiliates() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => adminAffiliateOverview(),
  });

  const voidIt = useMutation({
    mutationFn: (id: string) => {
      const reason = window.prompt("Why is this commission being cancelled? (e.g. payment refunded)");
      if (!reason) throw new Error("Cancelled");
      return adminVoidCommission({ data: { id, reason } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast.success("Commission cancelled");
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "Cancelled") return;
      toast.error(msg(err, "Could not cancel the commission"));
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        Could not load affiliates. Make sure the affiliate migration has been run.
      </p>
    );
  }

  const open = data.payouts.filter((p) => p.status === "requested");
  const settled = data.payouts.filter((p) => p.status !== "requested");

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["You owe affiliates", formatPaise(data.totals.owedPaise)],
          ["Paid so far", formatPaise(data.totals.paidPaise)],
          ["Affiliates earning", String(data.totals.affiliates)],
          ["Referred customers", String(data.totals.referredCustomers)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h3 className="font-semibold">Payout requests ({open.length})</h3>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payouts waiting.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Affiliate</TableHead>
                <TableHead>Pay to</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{p.email ?? p.userId}</TableCell>
                  <TableCell>
                    <PayTo p={p} />
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatPaise(p.amountPaise)}</TableCell>
                  <TableCell>{formatDate(p.requestedAt)}</TableCell>
                  <TableCell>
                    <PayoutActions p={p} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          Send the money yourself (UPI / bank), then enter the UTR and press Mark paid. Payouts to
          individuals can involve PAN, TDS or GST rules; check with your accountant.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Recent commissions</h3>
        {data.commissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No commissions yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Affiliate</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.commissions.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{formatDate(c.createdAt)}</TableCell>
                  <TableCell className="text-sm">{c.referrerEmail ?? "-"}</TableCell>
                  <TableCell className="text-sm">{c.referredEmail ?? "-"}</TableCell>
                  <TableCell className="text-right">{formatPaise(c.amountPaise)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPaise(c.commissionPaise)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {c.status}
                    </Badge>
                    {c.voidReason && (
                      <span className="ml-2 text-xs text-muted-foreground">{c.voidReason}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.status === "approved" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={voidIt.isPending}
                        onClick={() => voidIt.mutate(c.id)}
                      >
                        Void
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          Void a commission if the customer's payment was refunded. It can only be cancelled before
          the affiliate has put it into a payout request.
        </p>
      </section>

      {settled.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-semibold">Settled payouts</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Affiliate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Settled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settled.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{p.email ?? p.userId}</TableCell>
                  <TableCell className="text-right">{formatPaise(p.amountPaise)}</TableCell>
                  <TableCell className="capitalize">{p.status}</TableCell>
                  <TableCell>{p.reference ?? "-"}</TableCell>
                  <TableCell>{formatDate(p.settledAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
