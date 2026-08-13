import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Users, CreditCard, FileStack, Trash2, UserX } from "lucide-react";
import { getAdminStats, grantRole, revokeRole, deleteUser } from "@/lib/admin.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

function AdminPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");

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
    { icon: Users, label: "Total accounts", value: data.subscribers },
    { icon: CreditCard, label: "Active subscriptions", value: data.activeSubscriptions },
    { icon: CreditCard, label: "MRR", value: `$${data.mrr.toLocaleString()}` },
    { icon: FileStack, label: "Content generated", value: data.contentGenerated },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin Portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform KPIs and role-based access control.
          </p>
        </div>
        <Badge variant={data.isRoot ? "default" : "secondary"} className="capitalize">
          <ShieldCheck className="mr-1 h-3.5 w-3.5" />
          {data.isRoot ? "Root access" : "Admin access"}
        </Badge>
      </div>


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
          <h2 className="text-sm font-semibold">Newest accounts</h2>
          <ul className="mt-4 divide-y divide-border text-sm">
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

      <div className="surface p-5">
        <h2 className="text-sm font-semibold">Access control (RBAC)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter any email and grant a role. If they haven't signed up yet the role is held as an
          invite and applies automatically on their first sign-in.
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
              placeholder="teammate@company.com"
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
            Grant access
          </Button>
        </form>

        <ul className="mt-6 divide-y divide-border text-sm">
          {data.roles.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate">
                {r.email}
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

    </div>
  );
}
