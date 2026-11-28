import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { refreshBrandPlaybook } from "@/lib/brand-brain.functions";
import {
  getBrandLogoUrl,
  listBrandAssets,
  removeBrandAsset,
  removeBrandLogo,
  uploadBrandAsset,
  uploadBrandLogo,
} from "@/lib/brand-assets.functions";
import { supabase } from "@/integrations/supabase/client";
import { ChannelConnections } from "@/components/channel-connections";
import { ProductPhotos } from "@/components/product-photos";
import { BrandDocuments } from "@/components/brand-documents";
import { FilePreview, usePreview } from "@/components/file-preview";
import { WebsiteScan, type ScanApproval } from "@/components/website-scan";
import { syncBrain } from "@/lib/brain-sync";
import { useMe } from "@/components/app-shell";
import {
  agencyPlanFor,
  resolveActiveBrand,
  setActiveBrandId,
  useAgencyBrands,
  useStoredBrandId,
} from "@/lib/agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/brand-profile")({
  head: () => ({
    meta: [
      { title: "Brand Profile — LOVIZA" },
      {
        name: "description",
        content: "Store your website, products, ICP, propositions, tone and social handles once.",
      },
      { property: "og:title", content: "Brand Profile — LOVIZA" },
      {
        property: "og:description",
        content: "The single source of truth every generated asset is built from.",
      },
    ],
  }),
  component: BrandProfilePage,
});

const SOCIALS = [
  { key: "LinkedIn", placeholder: "linkedin.com/company/acme" },
  { key: "Instagram", placeholder: "@acme" },
  { key: "Facebook", placeholder: "facebook.com/acme" },
  { key: "X", placeholder: "@acme" },
  { key: "YouTube", placeholder: "youtube.com/@acme" },
  { key: "Pinterest", placeholder: "pinterest.com/acme" },
  { key: "TikTok", placeholder: "@acme" },
  { key: "Threads", placeholder: "@acme" },
  { key: "Quora", placeholder: "quora.com/profile/acme" },
  { key: "Medium", placeholder: "medium.com/@acme" },
];


interface FormState {
  business_name: string;
  website: string;
  description: string;
  products_services: string;
  icp: string;
  propositions: string;
  tone: string;
  keywords: string;
  google_drive_folder: string;
  industry: string;
  current_offers: string;
  testimonials: string;
  competitors: string;
  locations: string;
  languages: string;
  voice_dos_donts: string;
  compliance_notes: string;
  social_handles: Record<string, string>;
  logo_url: string;
  brand_colors: { primary: string; secondary: string; accent: string };
}

const EMPTY: FormState = {
  business_name: "",
  website: "",
  description: "",
  products_services: "",
  icp: "",
  propositions: "",
  tone: "",
  keywords: "",
  google_drive_folder: "",
  industry: "",
  current_offers: "",
  testimonials: "",
  competitors: "",
  locations: "",
  languages: "",
  voice_dos_donts: "",
  compliance_notes: "",
  social_handles: {},
  logo_url: "",
  brand_colors: { primary: "#4f46e5", secondary: "#0f172a", accent: "#f59e0b" },
};

const COLOR_FIELDS: Array<{ key: "primary" | "secondary" | "accent"; label: string }> = [
  { key: "primary", label: "Primary colour" },
  { key: "secondary", label: "Secondary colour" },
  { key: "accent", label: "Accent colour" },
];

/** Logo upload + brand colours. Used by the poster designer so posts match the brand. */
function BrandAssets({
  brandId,
  form,
  setForm,
  onChanged,
}: {
  brandId?: string;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  onChanged: () => void;
}) {
  const upload = useServerFn(uploadBrandLogo);
  const remove = useServerFn(removeBrandLogo);
  const signed = useServerFn(getBrandLogoUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const assetRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const listAssets = useServerFn(listBrandAssets);
  const uploadAsset = useServerFn(uploadBrandAsset);
  const removeAsset = useServerFn(removeBrandAsset);
  const qc = useQueryClient();
  const preview = usePreview();

  const { data: assetData } = useQuery({
    queryKey: ["brand-assets", brandId ?? "default"],
    queryFn: () => listAssets({ data: brandId ? { brandId } : {} }),
  });
  const assets = assetData?.assets ?? [];

  const upAsset = useMutation({
    mutationFn: async ({ file, replacePath }: { file: File; replacePath?: string }) => {
      if (file.size > 3_000_000) throw new Error("Each brand asset must be smaller than 3 MB.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });
      return uploadAsset({
        data: {
          ...(brandId ? { brandId } : {}),
          name: file.name,
          mime: file.type,
          base64,
          ...(replacePath ? { replacePath } : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("Brand asset saved");
      void qc.invalidateQueries({ queryKey: ["brand-assets"] });
      void syncBrain(brandId, qc);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const delAsset = useMutation({
    mutationFn: (path: string) => removeAsset({ data: { ...(brandId ? { brandId } : {}), path } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["brand-assets"] });
      void syncBrain(brandId, qc);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const { data: logo } = useQuery({
    queryKey: ["brand-logo", form.logo_url],
    enabled: !!form.logo_url,
    queryFn: () => signed({ data: { path: form.logo_url } }),
  });

  const up = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 1_500_000) throw new Error("Logo must be smaller than 1.5 MB.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });
      return upload({ data: { ...(brandId ? { brandId } : {}), mime: file.type, base64 } });
    },
    onSuccess: ({ path }) => {
      setForm((f) => ({ ...f, logo_url: path }));
      toast.success("Logo uploaded");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const del = useMutation({
    mutationFn: () => remove({ data: brandId ? { brandId } : {} }),
    onSuccess: () => {
      setForm((f) => ({ ...f, logo_url: "" }));
      onChanged();
    },
  });

  const setColor = (key: "primary" | "secondary" | "accent", value: string) =>
    setForm((f) => ({ ...f, brand_colors: { ...f.brand_colors, [key]: value } }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="space-y-2">
        <Label>Brand logo</Label>
        <div className="flex flex-wrap items-start gap-6">
          <div className="space-y-2">
            <button
              type="button"
              disabled={!logo?.url}
              onClick={() => preview.open({ name: "Brand logo", url: logo?.url, mime: "image/*" })}
              className="flex h-16 w-28 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30 disabled:cursor-default"
              title={logo?.url ? "Click to preview" : undefined}
            >
              {logo?.url ? (
                <img src={logo.url} alt="Brand logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">No logo</span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) up.mutate(file);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={up.isPending}>
                {up.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                {form.logo_url ? "Replace" : "Upload"}
              </Button>
              {form.logo_url && (
                <Button type="button" size="sm" variant="ghost" onClick={() => del.mutate()} disabled={del.isPending} aria-label="Delete logo">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Logo: PNG, JPG or SVG, up to 1.5 MB (a transparent PNG looks best).
        </p>
      </div>
      <div className="min-w-0"><ProductPhotos brandId={brandId} /></div>
      </div>
      <div className="space-y-2">
        <Label>Brand colours</Label>
        <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
          {COLOR_FIELDS.map((c) => (
            <div key={c.key} className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={c.label}
                  value={form.brand_colors[c.key]}
                  onChange={(e) => setColor(c.key, e.target.value)}
                  className="h-9 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
                />
                <Input
                  value={form.brand_colors[c.key]}
                  maxLength={7}
                  onChange={(e) => setColor(c.key, e.target.value)}
                  className="h-9 px-2 text-xs"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">{c.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <Label>Brand assets</Label>
            <input
              ref={assetRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                for (const file of Array.from(e.target.files ?? [])) upAsset.mutate({ file });
                e.target.value = "";
              }}
            />
            <input
              ref={replaceRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                const target = replaceTarget.current;
                if (file && target) upAsset.mutate({ file, replacePath: target });
                replaceTarget.current = null;
                e.target.value = "";
              }}
            />
            {assets.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {assets.map((a) => (
                  <div key={a.path} className="w-24 space-y-1">
                    <button
                      type="button"
                      onClick={() => preview.open({ name: a.name, url: a.url, mime: a.mime })}
                      className="flex h-16 w-24 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30"
                      title="Click to preview"
                    >
                      {a.mime.startsWith("image/") && a.url ? (
                        <img src={a.url} alt={a.name} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      )}
                    </button>
                    <p className="truncate text-[11px] text-muted-foreground" title={a.name}>{a.name}</p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-xs"
                        disabled={upAsset.isPending}
                        onClick={() => {
                          replaceTarget.current = a.path;
                          replaceRef.current?.click();
                        }}
                      >
                        Replace
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        disabled={delAsset.isPending}
                        onClick={() => delAsset.mutate(a.path)}
                        aria-label={`Delete ${a.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              PNG, JPG, SVG, WebP or PDF, up to 3 MB each, 20 per brand. The Brand Brain studies them to learn your look and feel.
            </p>
            <Button type="button" size="sm" variant="secondary" onClick={() => assetRef.current?.click()} disabled={upAsset.isPending}>
              {upAsset.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              Upload Brand Assets
            </Button>
          </div>
        <BrandDocuments brandId={brandId} />
      </div>
      <FilePreview {...preview} />
    </div>
  );
}

const COMPLETION_FIELDS: Array<{ key: keyof FormState; label: string }> = [
  { key: "business_name", label: "Business name" },
  { key: "website", label: "Website" },
  { key: "description", label: "Business description" },
  { key: "products_services", label: "Products & services" },
  { key: "icp", label: "Ideal customer" },
  { key: "propositions", label: "Value propositions" },
  { key: "tone", label: "Tone of voice" },
  { key: "keywords", label: "Focus keywords" },
  { key: "industry", label: "Industry" },
  { key: "current_offers", label: "Current offers" },
  { key: "testimonials", label: "Testimonials" },
  { key: "competitors", label: "Competitors" },
  { key: "locations", label: "Locations" },
  { key: "languages", label: "Languages" },
  { key: "voice_dos_donts", label: "Voice do's and don'ts" },
  { key: "compliance_notes", label: "Compliance notes" },
];

/** Live "% complete" next to the heading: counts what is typed in the form (saved or not). Hover lists what is empty. */
function ProfileCompletion({ form }: { form: FormState }) {
  const missing = COMPLETION_FIELDS.filter((f) => !String(form[f.key] ?? "").trim());
  const pct = Math.round(((COMPLETION_FIELDS.length - missing.length) / COMPLETION_FIELDS.length) * 100);
  const color = pct >= 100 ? "text-emerald-500" : pct >= 70 ? "text-amber-500" : "text-rose-500";
  return (
    <span
      className={`text-sm font-semibold ${color}`}
      data-testid="profile-completion"
      title={missing.length ? `Still empty: ${missing.map((f) => f.label).join(", ")}` : "Everything is filled in"}
    >
      {pct}% complete
    </span>
  );
}

function BrandProfilePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  // What is saved right now. "Discard" returns the form to this, and any difference means unsaved edits.
  const [baseline, setBaseline] = useState<FormState>(EMPTY);
  const [nudge, setNudge] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const dirtyRef = useRef(false);
  const loadedIdRef = useRef<string | null>(null);

  // Scale-plan (agency) users can own several brands; everyone else keeps the single-brand behaviour.
  const { data: me, isLoading: meLoading } = useMe();
  const isAgency = !!agencyPlanFor(me);
  const { data: brands, isLoading: brandsLoading } = useAgencyBrands(isAgency);
  const storedBrandId = useStoredBrandId();
  const activeBrand = resolveActiveBrand(brands, storedBrandId);
  // Channel connections are per account for now, so they belong to the first brand only.
  const isPrimary = !isAgency || (!!activeBrand && brands?.[0]?.id === activeBrand.id);
  const profileKey = [
    "brand-profile",
    isAgency ? (activeBrand?.id ?? "none") : "self",
  ];

  const { data, isLoading } = useQuery({
    queryKey: profileKey,
    enabled: !meLoading && !(isAgency && brandsLoading),
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const base = supabase.from("brand_profiles").select("*");
      const scoped =
        isAgency && activeBrand ? base.eq("id", activeBrand.id) : base.eq("user_id", userData.user!.id);
      // order + limit(1) keeps maybeSingle() safe even if a user ever has more than one row.
      const { data: row, error } = await scoped
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return row;
    },
  });

  // Unsaved edits only matter once a profile exists. A first-time form just saves normally.
  const editing = dirty && !!data?.id;
  dirtyRef.current = editing;

  useEffect(() => {
    if (!data) return;
    // A background refresh of the same brand must not wipe edits the user is in the middle of.
    if (loadedIdRef.current === data.id && dirtyRef.current) return;
    loadedIdRef.current = data.id;
    const loaded: FormState = {
      business_name: data.business_name ?? "",
      website: data.website ?? "",
      description: data.description ?? "",
      products_services: data.products_services ?? "",
      icp: data.icp ?? "",
      propositions: data.propositions ?? "",
      tone: data.tone ?? "",
      keywords: data.keywords ?? "",
      google_drive_folder: data.google_drive_folder ?? "",
      industry: (data as { industry?: string }).industry ?? "",
      current_offers: (data as { current_offers?: string }).current_offers ?? "",
      testimonials: (data as { testimonials?: string }).testimonials ?? "",
      competitors: (data as { competitors?: string }).competitors ?? "",
      locations: (data as { locations?: string }).locations ?? "",
      languages: (data as { languages?: string }).languages ?? "",
      voice_dos_donts: (data as { voice_dos_donts?: string }).voice_dos_donts ?? "",
      compliance_notes: (data as { compliance_notes?: string }).compliance_notes ?? "",
      social_handles: (data.social_handles as Record<string, string>) ?? {},
      logo_url: (data as { logo_url?: string }).logo_url ?? "",
      brand_colors: {
        ...EMPTY.brand_colors,
        ...(((data as { brand_colors?: Record<string, string> }).brand_colors) ?? {}),
      },
    };
    setForm(loaded);
    setBaseline(loaded);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.business_name.trim()) throw new Error("Business name is required");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Your session expired — sign in again");

      const handles: Record<string, string> = {};
      for (const [k, v] of Object.entries(form.social_handles)) {
        const trimmed = (v ?? "").trim();
        if (trimmed) handles[k] = trimmed;
      }

      const payload = {
        user_id: userData.user.id,
        business_name: form.business_name.trim(),
        website: form.website.trim(),
        description: form.description.trim(),
        products_services: form.products_services.trim(),
        icp: form.icp.trim(),
        propositions: form.propositions.trim(),
        tone: form.tone.trim(),
        keywords: form.keywords.trim(),
        google_drive_folder: form.google_drive_folder.trim(),
        industry: form.industry.trim(),
        current_offers: form.current_offers.trim(),
        testimonials: form.testimonials.trim(),
        competitors: form.competitors.trim(),
        locations: form.locations.trim(),
        languages: form.languages.trim(),
        voice_dos_donts: form.voice_dos_donts.trim(),
        compliance_notes: form.compliance_notes.trim(),
        social_handles: handles,
        brand_colors: form.brand_colors,
        updated_at: new Date().toISOString(),
      };

      // Save to the brand being edited. Without one (a first-ever save, or a
      // single-brand account) update the user's existing brand, else create it.
      let targetId: string | undefined = isAgency ? activeBrand?.id : undefined;
      if (!targetId) {
        const { data: existing, error: lookupError } = await supabase
          .from("brand_profiles")
          .select("id")
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (lookupError) throw lookupError;
        targetId = existing?.id;
      }
      const table = supabase.from("brand_profiles");
      const { data: saved, error } = await (
        targetId ? table.update(payload).eq("id", targetId) : table.insert(payload)
      )
        .select()
        .single();
      if (error) throw error;
      return saved;
    },
    onSuccess: (saved) => {
      setBaseline(form);
      toast.success("Brand profile saved — future content will use it");
      // Rebuild this brand's playbook in the background (generation also does it if this fails).
      void refreshBrandPlaybook({ data: { brandId: saved.id } }).catch(() => undefined);
      if (isAgency) {
        setActiveBrandId(saved.id);
        queryClient.invalidateQueries({ queryKey: ["agency-brands"] });
      } else {
        queryClient.setQueryData(profileKey, saved);
      }
      queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
    },
  //  onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
      onError: (e) => {
      console.error("Brand profile save error:", e);
      toast.error(e instanceof Error ? e.message : JSON.stringify(e));
      },


});

  /*
   * Connected channels fill the brand's social handles by themselves, so there is no
   * separate handles form. Only empty handles are filled; anything already saved stays.
   */
  const syncedRef = useRef<string>("");
  const syncHandles = useCallback(
    async (connected: Array<{ channel: string; accountName: string }>) => {
      if (!data?.id) return;
      const current = ((data.social_handles as Record<string, string> | null) ?? {}) as Record<
        string,
        string
      >;
      const missing: Record<string, string> = {};
      for (const c of connected) {
        const name = (c.accountName ?? "").trim();
        if (name && !(current[c.channel] ?? "").trim()) missing[c.channel] = name;
      }
      const signature = `${data.id}:${JSON.stringify(missing)}`;
      if (Object.keys(missing).length === 0 || syncedRef.current === signature) return;
      syncedRef.current = signature;
      const { error } = await supabase
        .from("brand_profiles")
        .update({ social_handles: { ...current, ...missing } })
        .eq("id", data.id);
      if (!error) void queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
    },
    [data, queryClient],
  );

  // "Approve" on the website scan fills the form, then saves it once the new values are in state.
  const [pendingSave, setPendingSave] = useState(false);
  useEffect(() => {
    if (!pendingSave) return;
    setPendingSave(false);
    save.mutate();
  }, [pendingSave, save]);

  const applyScan = (a: ScanApproval) => {
    setForm((f) => ({
      ...f,
      ...a.fields,
      social_handles: { ...f.social_handles, ...a.handles },
      brand_colors: a.color ? { ...f.brand_colors, primary: a.color } : f.brand_colors,
    }));
    if (!(a.fields.business_name ?? form.business_name).trim()) {
      toast.message("Filled in. Add your business name, then press Save profile.");
      return;
    }
    setPendingSave(true);
  };

  const set = (key: keyof FormState, value: string) => setForm((f) => ({ ...f, [key]: value }));

  // Leaving with unsaved edits is blocked: the two buttons light up instead.
  const pulse = useCallback(() => {
    setNudge(false);
    window.setTimeout(() => setNudge(true), 20);
    window.setTimeout(() => setNudge(false), 1600);
  }, []);
  useBlocker({
    shouldBlockFn: () => {
      if (!dirtyRef.current) return false;
      pulse();
      return true;
    },
    enableBeforeUnload: () => dirtyRef.current,
  });
  const discard = () => {
    setForm(baseline);
    toast.message("Changes discarded");
  };

  if (meLoading || (isAgency && brandsLoading) || isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 pb-8">
      <div className="sticky top-12 z-20 -mx-4 -mt-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold">Brand Profile</h1>
            <ProfileCompletion form={form} />
          </div>
          {editing ? (
            <div className={`flex items-center gap-2 rounded-lg p-1 ${nudge ? "nudge-attention" : ""}`}>
              <span className="hidden text-xs text-amber-500 sm:inline">Unsaved changes</span>
              <Button variant="secondary" onClick={discard} disabled={save.isPending}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Discard
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save changes
              </Button>
            </div>
          ) : (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save profile
            </Button>
          )}
        </div>
      </div>

      <ProfileSection
        title="Your business"
        hint="Start with your website. LOVIZA reads it and fills in what it can."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field id="business_name" label="Business name *">
            <Input
              id="business_name"
              maxLength={120}
              value={form.business_name}
              onChange={(e) => set("business_name", e.target.value)}
            />
          </Field>
          <Field id="website" label="Website">
            <Input
              id="website"
              maxLength={200}
              placeholder="https://acme.com"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </Field>
        </div>
        <WebsiteScan
          website={form.website}
          brandId={isAgency ? activeBrand?.id : data?.id}
          current={form as unknown as Record<string, string>}
          currentHandles={form.social_handles}
          onApprove={applyScan}
        />
      </ProfileSection>

      <ProfileSection title="Logo and photos" hint="Used on your posters and videos.">
        <BrandAssets
          brandId={isAgency ? activeBrand?.id : data?.id}
          form={form}
          setForm={setForm}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ["brand-profile"] })}
        />
      </ProfileSection>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ProfileSection title="What you sell" hint="Facts LOVIZA may use in your content.">
          <Field id="description" label="Business description">
            <Textarea
              id="description"
              rows={4}
              maxLength={2000}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <Field id="products_services" label="Products & services">
            <Textarea
              id="products_services"
              rows={4}
              maxLength={3000}
              placeholder="List each product/service and what it does."
              value={form.products_services}
              onChange={(e) => set("products_services", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="industry" label="Industry">
              <Input
                id="industry"
                maxLength={120}
                placeholder="Skincare, CA firm, restaurant, SaaS..."
                value={form.industry}
                onChange={(e) => set("industry", e.target.value)}
              />
            </Field>
            <Field id="languages" label="Languages your audience speaks">
              <Input
                id="languages"
                maxLength={120}
                placeholder="English, Hindi, Marathi"
                value={form.languages}
                onChange={(e) => set("languages", e.target.value)}
              />
            </Field>
          </div>
          <Field id="locations" label="Locations you serve">
            <Textarea
              id="locations"
              rows={2}
              maxLength={400}
              placeholder="Bengaluru, Pune, pan-India online"
              value={form.locations}
              onChange={(e) => set("locations", e.target.value)}
            />
          </Field>
        </ProfileSection>

        <ProfileSection title="Who you speak to" hint="Your audience and how you sound.">
          <Field id="icp" label="Ideal customer profile (ICP)">
            <Textarea
              id="icp"
              rows={3}
              maxLength={2000}
              value={form.icp}
              onChange={(e) => set("icp", e.target.value)}
            />
          </Field>
          <Field id="propositions" label="Value propositions">
            <Textarea
              id="propositions"
              rows={3}
              maxLength={2000}
              value={form.propositions}
              onChange={(e) => set("propositions", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="tone" label="Tone of voice">
              <Input
                id="tone"
                maxLength={200}
                placeholder="Confident, warm, jargon-free"
                value={form.tone}
                onChange={(e) => set("tone", e.target.value)}
              />
            </Field>
            <Field id="keywords" label="Focus keywords">
              <Input
                id="keywords"
                maxLength={300}
                placeholder="crm for clinics, patient retention"
                value={form.keywords}
                onChange={(e) => set("keywords", e.target.value)}
              />
            </Field>
          </div>
          <Field id="voice_dos_donts" label="Voice do's and don'ts">
            <Textarea
              id="voice_dos_donts"
              rows={3}
              maxLength={1000}
              placeholder="Do: speak plainly, use real examples. Don't: use slang, emojis in headlines, or the word 'cheap'."
              value={form.voice_dos_donts}
              onChange={(e) => set("voice_dos_donts", e.target.value)}
            />
          </Field>
        </ProfileSection>
      </div>

      <ProfileSection
        title="Offers, proof and rules"
        hint="Optional. The more you add, the more specific your content gets. Leave anything blank to skip it."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field id="current_offers" label="Current offers">
            <Textarea
              id="current_offers"
              rows={3}
              maxLength={1000}
              placeholder="Free audit this month; 20% off annual plans until 31 Dec"
              value={form.current_offers}
              onChange={(e) => set("current_offers", e.target.value)}
            />
          </Field>
          <Field id="testimonials" label="Real customer testimonials">
            <Textarea
              id="testimonials"
              rows={3}
              maxLength={1500}
              placeholder={'"Saved us 10 hours a week" - Priya, founder, Acme (only real quotes you have permission to use)'}
              value={form.testimonials}
              onChange={(e) => set("testimonials", e.target.value)}
            />
          </Field>
          <Field id="competitors" label="Competitors">
            <Textarea
              id="competitors"
              rows={3}
              maxLength={400}
              placeholder="Used only to position you differently. They are never named in posts."
              value={form.competitors}
              onChange={(e) => set("competitors", e.target.value)}
            />
          </Field>
          <Field id="compliance_notes" label="Compliance notes">
            <Textarea
              id="compliance_notes"
              rows={3}
              maxLength={1000}
              placeholder="Claims or words that must or must not appear, e.g. 'Never promise results' or 'Always add: T&C apply'"
              value={form.compliance_notes}
              onChange={(e) => set("compliance_notes", e.target.value)}
            />
          </Field>
        </div>
      </ProfileSection>

      <ChannelConnections
        brandId={isAgency ? (activeBrand?.id ?? null) : (data?.id ?? null)}
        onConnections={syncHandles}
      />
    </div>
  );
}

function ProfileSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
