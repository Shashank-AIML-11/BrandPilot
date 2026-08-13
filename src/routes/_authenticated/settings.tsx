import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — LOVIZA123" },
      { name: "description", content: "Update your LOVIZA123 account details and password." },
      { property: "og:title", content: "Settings — LOVIZA123" },
      { property: "og:description", content: "Update your LOVIZA123 account details and password." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const id = userData.user!.id;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
      ]);
      return { user: userData.user, profile, roles: (roles ?? []).map((r) => r.role as string) };
    },
  });

  useEffect(() => {
    if (data?.profile?.full_name) setFullName(data.profile.full_name);
  }, [data?.profile?.full_name]);

  async function saveProfile() {
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", data!.user!.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Profile updated");
      queryClient.invalidateQueries();
    }
  }

  async function changePassword() {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password changed");
      setPassword("");
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your account details and security.</p>
      </div>

      <section className="surface space-y-4 p-6">
        <h2 className="text-sm font-semibold">Account</h2>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={data?.user?.email ?? ""} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="full-name">Full name</Label>
          <Input
            id="full-name"
            maxLength={80}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Roles:</span>
          {(data?.roles.length ? data.roles : ["viewer"]).map((r) => (
            <Badge key={r} variant="outline" className="capitalize">
              {r}
            </Badge>
          ))}
        </div>
        <Button onClick={saveProfile} disabled={busy}>
          Save changes
        </Button>
      </section>

      <section className="surface space-y-4 p-6">
        <h2 className="text-sm font-semibold">Change password</h2>
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            minLength={6}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={changePassword} disabled={busy}>
          Update password
        </Button>
      </section>
    </div>
  );
}
