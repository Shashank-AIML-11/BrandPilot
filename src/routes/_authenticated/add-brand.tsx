import { useState, type FormEvent } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/components/app-shell";
import { agencyPlanFor, setActiveBrandId, useAgencyBrands } from "@/lib/agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/add-brand")({
  head: () => ({
    meta: [
      { title: "Add brand — LOVIZA" },
      { name: "description", content: "Add a new brand to your agency workspace." },
    ],
  }),
  component: AddBrandPage,
});

function AddBrandPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();
  const plan = agencyPlanFor(me);
  const { data: brands = [], isLoading: brandsLoading } = useAgencyBrands(!!plan);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  if (meLoading || (plan && brandsLoading)) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Add brand</h1>
        <p className="text-muted-foreground">
          Managing several brands is part of the Scale plan.
        </p>
        <Button asChild>
          <Link to="/pricing">See plans</Link>
        </Button>
      </div>
    );
  }

  const atLimit = brands.length >= plan.brandProfileLimit;

  async function addBrand(e: FormEvent) {
    e.preventDefault();
    const businessName = name.trim();
    if (!businessName || saving) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Your login session could not be verified.");
      // The database also enforces the plan's brand limit, so this cannot be bypassed.
      const { data: created, error } = await supabase
        .from("brand_profiles")
        .insert({ user_id: userData.user.id, business_name: businessName })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await queryClient.invalidateQueries({ queryKey: ["agency-brands"] });
      setActiveBrandId(created.id);
      toast.success(`${businessName} added`);
      await navigate({ to: "/brand-profile" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the brand.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-10">
      <div>
        <h1 className="text-2xl font-bold">Add brand</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every brand gets its own Brand Profile, Content Calendar, Content Library and Analytics.
          {" "}
          {brands.length} of {plan.brandProfileLimit} brands used.
        </p>
      </div>

      {atLimit ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Your {plan.name} plan includes {plan.brandProfileLimit} brands, and all of them are in use.
        </p>
      ) : (
        <form onSubmit={addBrand} className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="brand-name">Brand name</Label>
            <Input
              id="brand-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Greenleaf Organics"
              maxLength={120}
              autoFocus
              required
            />
          </div>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add brand
          </Button>
        </form>
      )}
    </div>
  );
}
