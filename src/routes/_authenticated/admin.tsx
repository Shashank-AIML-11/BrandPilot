import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  ShieldCheck,
  Users,
  CreditCard,
  FileStack,
  Trash2,
  UserX,
  Pencil,
} from "lucide-react";
import { getAdminStats, grantRole, revokeRole, deleteUser, editSubscriber } from "@/lib/admin.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Portal — LOVIZA" },
      { name: "description", content: "Subscriber KPIs and role-based access control." },
      { property: "og:title", content: "Admin Portal — LOVIZA" },
      { property: "og:description", content: "SaaS performance KPIs and access management." },
    ],
  }),
  component: AdminPage,
});

type Role = "viewer" | "editor" | "admin" | "root";
type Plan = "starter" | "growth" | "scale";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function AdminPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [editingSubscriber, setEditingSubscriber] = useState<{
    id: string;
    email: string;
    plan: Plan;
    status: "active" | "cancelled" | "none";
  } | null>(null);
  const [editPlan, setEditPlan] = useState<Plan>("starter");
  const [editStatus, setEditStatus] = useState<"active" | "cancelled">("active");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => getAdminStats(),
    retry: false,
  });

  const grant = useMutation({
    mutationFn: () => grantRole({ data: { email, role } }),
    onSuccess: () => {
      toast.success(`${email} is now ${role}`);
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not grant access"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeRole({ data: { id } }),
    onSuccess: () => {
      toast.success("Access revoked");
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not revoke"),
  });

  const removeUser = useMutation({
    mutationFn: (userId: string) => deleteUser({ data: { userId } }),
    onSuccess: () => {
      toast.success("User removed");
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove user"),
  });

  const editSub = useMutation({
    mutationFn: () =>
      editSubscriber({
        data: { userId: editingSubscriber!.id, plan: editPlan, status: editStatus },
      }),
    onSuccess: () => {
      toast.success("Subscriber updated");
      setEditingSubscriber(null);
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update subscriber"),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="surface p-10 text-center">
        <ShieldCheck className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          You don't have permission to view the admin portal.
        </p>
      </div>
    );
  }

  const kpis = [
    { icon: Users, label: "Total subscribers", value: data.subscribers },
    { icon: Users, label: "Active", value: data.activeSubscriptions },
    { icon: UserX, label: "Expired", value: data.expiredSubscriptions },
    { icon: CreditCard, label: "Est. MRR", value: `₹${data.mrr.toLocaleString()}` },
  ];

  function openEdit(s: (typeof data.subscriberRows)[number]) {
    setEditingSubscriber({
      id: s.id,
      email: s.email,
      plan: (s.plan as Plan) ?? "starter",
      status: s.status === "active" ? "active" : "cancelled",
    });
    setEditPlan((s.plan as Plan) ?? "starter");
    setEditStatus(s.status === "active" ? "active" : "cancelled");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin Portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as Admin</p>
        </div>
        <Badge variant={data.isRoot ? "default" : "secondary"} className="capitalize">
          <ShieldCheck className="mr-1 h-3.5 w-3.5" />
          {data.isRoot ? "Root access" : "Admin access"}
        </Badge>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
          <TabsTrigger value="access">User Access</TabsTrigger>
        </TabsList>

        {/* ===================== DASHBOARD ===================== */}
        <TabsContent value="dashboard" className="space-y-6 pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="surface p-5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <k.icon className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-wide">{k.label}</span>
                </div>
                <p className="mt-3 font-display text-3xl font-bold">{k.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="surface p-5">
              <h2 className="text-sm font-semibold">Plan distribution</h2>
              <div className="mt-4 space-y-3">
                {data.planSplit.map((p) => (
                  <div key={p.plan} className="flex items-center gap-3">
                    <span className="w-20 text-sm capitalize">{p.plan}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${data.subscribers ? (p.count / data.subscribers) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm text-muted-foreground">{p.count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Posted pieces</p>
                  <p className="mt-1 font-display text-xl font-semibold">{data.contentPosted}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total impressions</p>
                  <p className="mt-1 font-display text-xl font-semibold">
                    {data.impressions.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="surface p-5">
              <h2 className="text-sm font-semibold">Billing cycle split</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="font-display text-3xl font-bold">{data.billingCycleSplit.monthly}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">Monthly</p>
                </div>
                <div>
                  <p className="font-display text-3xl font-bold">{data.billingCycleSplit.yearly}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">Yearly</p>
                </div>
              </div>

              <h2 className="mt-6 border-t border-border pt-4 text-sm font-semibold">
                Newest accounts
              </h2>
              <ul className="mt-3 divide-y divide-border text-sm">
                {data.recentUsers.map((u) => (
                  <li key={u.id} className="flex items-center justify-between py-2">
                    <span className="truncate">{u.email}</span>
                    <Badge variant="secondary" className="capitalize">
                      {u.plan}
                    </Badge>
                  </li>
                ))}
                {data.recentUsers.length === 0 && (
                  <li className="py-2 text-muted-foreground">No accounts yet.</li>
                )}
              </ul>
            </div>
          </div>
        </TabsContent>

        {/* ===================== SUBSCRIBERS ===================== */}
        <TabsContent value="subscribers" className="pt-4">
          <div className="surface overflow-x-auto p-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subscriber</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Start date</TableHead>
                  <TableHead>End date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.subscriberRows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.fullName || s.email}</div>
                      <div className="text-xs text-muted-foreground">{s.email}</div>
                    </TableCell>
                    <TableCell className="capitalize">{s.plan}</TableCell>
                    <TableCell className="capitalize">{s.billingPeriod}</TableCell>
                    <TableCell>{formatDate(s.startDate)}</TableCell>
                    <TableCell>{s.status === "active" ? formatDate(s.endDate) : "Never"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={s.status === "active" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {data.subscriberRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No subscribers yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ===================== USER ACCESS ===================== */}
        <TabsContent value="access" className="space-y-6 pt-4">
          <div className="surface p-5">
            <h2 className="text-sm font-semibold">Access control (RBAC)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter any email and grant a role. If they haven't signed up yet the role is held as
              an invite and applies automatically on their first sign-in.
            </p>
            <form
              className="mt-4 flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                grant.mutate();
              }}
            >
              <div className="min-w-56 flex-1 space-y-2">
                <Label htmlFor="grant-email">Email</Label>
                <Input
                  id="grant-email"
                  type="email"
                  required
                  maxLength={255}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@example.com"
                />
              </div>
              <div className="w-40 space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="root" disabled={!data.isRoot}>
                      Root
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={grant.isPending}>
                {grant.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                + Add
              </Button>
            </form>

            <ul className="mt-6 divide-y divide-border text-sm">
              {data.roles.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">
                    {r.email}
                    {r.email.toLowerCase() === data.primaryRootEmail && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                    {!r.user_id && (
                      <span className="ml-2 text-xs text-muted-foreground">(invite pending)</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {r.role}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={
                        revoke.isPending ||
                        (r.role === "root" && r.email.toLowerCase() === data.primaryRootEmail)
                      }
                      onClick={() => revoke.mutate(r.id)}
                      aria-label={`Revoke ${r.role} from ${r.email}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
              {data.roles.length === 0 && (
                <li className="py-2 text-muted-foreground">No roles granted yet.</li>
              )}
            </ul>
          </div>

          {data.isRoot && (
            <div className="surface p-5">
              <h2 className="text-sm font-semibold">User management</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Root only — removing an account deletes its sign-in, brand profile and content.
              </p>
              <ul className="mt-4 divide-y divide-border text-sm">
                {data.users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate">{u.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.roles.length ? u.roles.join(", ") : "no roles"} · {u.plan}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={
                        removeUser.isPending || u.email.toLowerCase() === data.primaryRootEmail
                      }
                      onClick={() => removeUser.mutate(u.id)}
                      aria-label={`Remove ${u.email}`}
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
                {data.users.length === 0 && (
                  <li className="py-2 text-muted-foreground">No accounts yet.</li>
                )}
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit subscriber dialog */}
      <Dialog open={!!editingSubscriber} onOpenChange={(open) => !open && setEditingSubscriber(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit subscriber</DialogTitle>
          </DialogHeader>
          {editingSubscriber && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{editingSubscriber.email}</p>
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={editPlan} onValueChange={(v) => setEditPlan(v as Plan)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="scale">Scale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as "active" | "cancelled")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                This is a manual admin override (e.g. comping an account) — it does not charge or
                refund anything via Razorpay.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingSubscriber(null)}>
              Cancel
            </Button>
            <Button onClick={() => editSub.mutate()} disabled={editSub.isPending}>
              {editSub.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
