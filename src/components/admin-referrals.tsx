import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  adminCreateReferral,
  adminListReferrals,
  adminSetReferralActive,
} from "@/lib/referrals.functions";
import { MAX_REFERRAL_PERCENT, referralLink } from "@/lib/referrals.shared";
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

function toInt(value: string): number | undefined {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Admin Portal tab (root only): create discount links with a custom rate. */
export function AdminReferrals() {
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState("20");
  const [email, setEmail] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<{
    code: string;
    discountPercent: number;
    email: string | null;
  } | null>(null);

  const { data: referrals, isLoading } = useQuery({
    queryKey: ["admin-referrals"],
    queryFn: () => adminListReferrals(),
  });

  const create = useMutation({
    mutationFn: () => {
      const discountPercent = toInt(percent);
      if (!discountPercent || discountPercent < 1 || discountPercent > MAX_REFERRAL_PERCENT) {
        throw new Error(`Discount must be a whole number from 1 to ${MAX_REFERRAL_PERCENT}.`);
      }
      return adminCreateReferral({
        data: {
          discountPercent,
          email: email.trim() || undefined,
          maxUses: toInt(maxUses),
          expiresInDays: toInt(expiresInDays),
          note: note.trim() || undefined,
        },
      });
    },
    onSuccess: (row) => {
      setCreated({
        code: row.code,
        discountPercent: row.discountPercent,
        email: row.restrictedEmail,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-referrals"] });
      toast.success("Referral link created");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create the link"),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => adminSetReferralActive({ data: v }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-referrals"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update the link"),
  });

  async function copyLink(code: string) {
    try {
      await navigator.clipboard.writeText(referralLink(window.location.origin, code));
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy automatically.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="surface space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Create a discount link</h2>
          <p className="text-sm text-muted-foreground">
            Pick any discount. Add an email to lock the link to one person, or leave it blank for
            anyone. Each person can use a discount once, on their first plan.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ref-percent">Discount (%)</Label>
            <Input
              id="ref-percent"
              type="number"
              min={1}
              max={MAX_REFERRAL_PERCENT}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-email">For email (optional)</Label>
            <Input
              id="ref-email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-max">Max uses (optional)</Label>
            <Input
              id="ref-max"
              type="number"
              min={1}
              placeholder="Unlimited"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-exp">Expires in (days, optional)</Label>
            <Input
              id="ref-exp"
              type="number"
              min={1}
              placeholder="Never"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ref-note">Note (only you see this)</Label>
            <Input
              id="ref-note"
              placeholder="e.g. Launch partner, Diwali offer"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create link
        </Button>

        {created && (
          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium">
              Your {created.discountPercent}% link{created.email ? ` for ${created.email}` : ""} is
              ready:
            </p>
            <ReferralShare
              code={created.code}
              discountPercent={created.discountPercent}
              recipientEmail={created.email}
            />
          </div>
        )}
      </section>

      <section className="surface p-5">
        <h2 className="mb-3 text-lg font-semibold">All referral links</h2>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !referrals?.length ? (
          <p className="text-sm text-muted-foreground">No links yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Owner / for</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map((r) => {
                const expired = r.expiresAt ? new Date(r.expiresAt).getTime() <= Date.now() : false;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">
                      {r.code}
                      {r.note && (
                        <div className="font-sans text-xs text-muted-foreground">{r.note}</div>
                      )}
                    </TableCell>
                    <TableCell>{r.discountPercent}%</TableCell>
                    <TableCell className="text-sm">
                      <div>{r.createdByRoot ? "Root link" : (r.ownerEmail ?? "User link")}</div>
                      {r.restrictedEmail && (
                        <div className="text-xs text-muted-foreground">
                          Only {r.restrictedEmail}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.usesCount}
                      {r.maxUses !== null ? ` / ${r.maxUses}` : ""}
                    </TableCell>
                    <TableCell>
                      {!r.active ? (
                        <Badge variant="secondary">Off</Badge>
                      ) : expired ? (
                        <Badge variant="secondary">Expired</Badge>
                      ) : (
                        <Badge>Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => copyLink(r.code)}>
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate({ id: r.id, active: !r.active })}
                      >
                        {r.active ? "Turn off" : "Turn on"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
