import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  agencyPlanFor,
  resolveActiveBrand,
  setActiveBrandId,
  useStoredBrandId,
} from "@/lib/agency";
import { archiveBrand } from "@/lib/brands.functions";
import { useMe } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/brand-management")({
  head: () => ({ meta: [{ title: "Brand Management — LOVIZA" }] }),
  component: BrandManagementPage,
});

interface BrandRow {
  id: string;
  business_name: string;
  website: string;
  description: string;
  products_services: string;
  icp: string;
  keywords: string;
  status?: string | null;
}

interface ArchivedRow {
  id: string;
  business_name: string;
  website: string;
  archived_at: string;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line break-words text-sm">
        {value.trim() ? value : <span className="text-muted-foreground">Not filled in yet</span>}
      </p>
    </div>
  );
}

function websiteHref(site: string) {
  const s = site.trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function BrandManagementPage() {
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();
  const isScale = Boolean(agencyPlanFor(me));
  const [target, setTarget] = useState<BrandRow | null>(null);
  const storedBrandId = useStoredBrandId();

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ["brand-management"],
    enabled: isScale,
    queryFn: async (): Promise<BrandRow[]> => {
      const { data, error } = await supabase
        .from("brand_profiles")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BrandRow[];
    },
  });

  const { data: archived = [] } = useQuery({
    queryKey: ["brand-archives"],
    enabled: isScale,
    queryFn: async (): Promise<ArchivedRow[]> => {
      const { data, error } = await (
        supabase as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => Promise<{ data: ArchivedRow[] | null; error: { message: string } | null }>;
            };
          };
        }
      )
        .from("brand_archives")
        .select("id, business_name, website, archived_at")
        .order("archived_at", { ascending: false });
      if (error) return [];
      return data ?? [];
    },
  });

  const archive = useMutation({
    mutationFn: (brandId: string) => archiveBrand({ data: { brandId } }),
    onSuccess: (_res, brandId) => {
      const name = target?.business_name?.trim() || "The brand";
      setTarget(null);
      // If the archived brand was the one being worked on, move to the next one.
      const remaining = brands.filter((b) => b.id !== brandId);
      if (storedBrandId === brandId && remaining[0]) setActiveBrandId(remaining[0].id);
      // Brand list, nav count, connections and content all change.
      void queryClient.invalidateQueries();
      toast.success(`${name} was archived and its social connections were disabled.`);
    },
    onError: (err) => {
      setTarget(null);
      toast.error(err instanceof Error ? err.message : "Could not archive this brand");
    },
  });

  if (meLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isScale) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Brand Management</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Managing and archiving several brands is part of the Scale plan.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/pricing">See plans</Link>
        </Button>
      </div>
    );
  }

  const active = resolveActiveBrand(
    brands.map((b) => ({ id: b.id, name: b.business_name, status: "active" as const })),
    storedBrandId,
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Brand Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {brands.length} of 20 brands onboarded. Archive a brand you no longer manage to free a
            place for a new one.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/add-brand">Add brand</Link>
        </Button>
      </div>

      <div className="mt-6 space-y-4">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {brands.map((brand) => {
          const href = websiteHref(brand.website);
          return (
            <section key={brand.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-display text-lg font-semibold">
                      {brand.business_name.trim() || "Untitled brand"}
                    </h2>
                    {active?.id === brand.id && <Badge variant="secondary">Current</Badge>}
                    {brand.status === "intake_pending" && (
                      <Badge variant="outline">Intake pending</Badge>
                    )}
                  </div>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {brand.website}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">No website added</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-none"
                  onClick={() => setTarget(brand)}
                  disabled={archive.isPending}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </Button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="Business description" value={brand.description} />
                <Field label="Products and services" value={brand.products_services} />
                <Field label="ICP" value={brand.icp} />
                <Field label="Focus keywords" value={brand.keywords} />
              </div>
            </section>
          );
        })}
        {!isLoading && brands.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No brands onboarded yet.
          </p>
        )}
      </div>

      {archived.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold">Archived brands</h2>
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="truncate font-medium">{a.business_name || "Untitled brand"}</span>
                <span className="flex-none text-xs text-muted-foreground">
                  Archived {new Date(a.archived_at).toLocaleDateString("en-IN")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AlertDialog open={Boolean(target)} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive {target?.business_name?.trim() || "this brand"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The brand will leave your list and all its social connections will be disabled. Its
              details are kept in your archive. This frees one place, so you can onboard a new
              brand. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archive.isPending}>No</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={archive.isPending}
              onClick={() => target && archive.mutate(target.id)}
            >
              {archive.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
