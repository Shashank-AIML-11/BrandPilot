import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Loader2, Save, Trash2, Upload } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getBrandLogoUrl, removeBrandLogo, uploadBrandLogo } from "@/lib/brand-assets.functions";
import { supabase } from "@/integrations/supabase/client";
import { ChannelConnections } from "@/components/channel-connections";
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
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Brand logo</Label>
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
            {logo?.url ? (
              <img src={logo.url} alt="Brand logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">No logo</span>
            )}
          </div>
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
          <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={up.isPending}>
            {up.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            {form.logo_url ? "Replace" : "Upload"}
          </Button>
          {form.logo_url && (
            <Button type="button" size="sm" variant="ghost" onClick={() => del.mutate()} disabled={del.isPending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPG or SVG, up to 1.5 MB. A transparent PNG looks best.</p>
      </div>
      <div className="space-y-2">
        <Label>Brand colours</Label>
        <div className="grid grid-cols-3 gap-3">
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
    </div>
  );
}

function BrandProfilePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);

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

  useEffect(() => {
    if (!data) return;
    setForm({
      business_name: data.business_name ?? "",
      website: data.website ?? "",
      description: data.description ?? "",
      products_services: data.products_services ?? "",
      icp: data.icp ?? "",
      propositions: data.propositions ?? "",
      tone: data.tone ?? "",
      keywords: data.keywords ?? "",
      google_drive_folder: data.google_drive_folder ?? "",
      social_handles: (data.social_handles as Record<string, string>) ?? {},
      logo_url: (data as { logo_url?: string }).logo_url ?? "",
      brand_colors: {
        ...EMPTY.brand_colors,
        ...(((data as { brand_colors?: Record<string, string> }).brand_colors) ?? {}),
      },
    });
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
      toast.success("Brand profile saved — future content will use it");
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

  const set = (key: keyof FormState, value: string) => setForm((f) => ({ ...f, [key]: value }));

  if (meLoading || (isAgency && brandsLoading) || isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="sticky top-16 z-10 -mx-4 border-b border-border bg-background/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        {isAgency && (
          <nav
            aria-label="Breadcrumb"
            className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span>Brands</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">{activeBrand?.name ?? "Your brand"}</span>
          </nav>
        )}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Brand Profile</h1>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save profile
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything here feeds the generator. The richer this page, the sharper the content.
        </p>
      </div>

      <section className="surface space-y-4 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Business
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="business_name">Business name *</Label>
            <Input
              id="business_name"
              maxLength={120}
              value={form.business_name}
              onChange={(e) => set("business_name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              maxLength={200}
              placeholder="https://acme.com"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </div>
        </div>
        <BrandAssets
          brandId={isAgency ? activeBrand?.id : data?.id}
          form={form}
          setForm={setForm}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ["brand-profile"] })}
        />
        <div className="space-y-2">
          <Label htmlFor="description">Business description</Label>
          <Textarea
            id="description"
            rows={4}
            maxLength={2000}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="products_services">Products & services</Label>
          <Textarea
            id="products_services"
            rows={4}
            maxLength={3000}
            placeholder="List each product/service and what it does."
            value={form.products_services}
            onChange={(e) => set("products_services", e.target.value)}
          />
        </div>
      </section>

      <section className="surface space-y-4 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Positioning
        </h2>
        <div className="space-y-2">
          <Label htmlFor="icp">Ideal customer profile (ICP)</Label>
          <Textarea
            id="icp"
            rows={3}
            maxLength={2000}
            value={form.icp}
            onChange={(e) => set("icp", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="propositions">Value propositions</Label>
          <Textarea
            id="propositions"
            rows={3}
            maxLength={2000}
            value={form.propositions}
            onChange={(e) => set("propositions", e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tone">Tone of voice</Label>
            <Input
              id="tone"
              maxLength={200}
              placeholder="Confident, warm, jargon-free"
              value={form.tone}
              onChange={(e) => set("tone", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="keywords">Focus keywords</Label>
            <Input
              id="keywords"
              maxLength={300}
              placeholder="crm for clinics, patient retention"
              value={form.keywords}
              onChange={(e) => set("keywords", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="surface space-y-3 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Other channels & assets
        </h2>
        <p className="text-sm text-muted-foreground">
          These networks have no connect button. Add your handle so they count as ready channels.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {SOCIALS.filter((x) => ["Threads", "Quora", "Medium"].includes(x.key)).map((x) => (
            <div key={x.key} className="space-y-2">
              <Label htmlFor={x.key}>{x.key}</Label>
              <Input
                id={x.key}
                maxLength={200}
                placeholder={x.placeholder}
                value={form.social_handles[x.key] ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    social_handles: { ...f.social_handles, [x.key]: e.target.value },
                  }))
                }
              />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="drive">Google Drive folder link (optional)</Label>
          <Input
            id="drive"
            maxLength={400}
            placeholder="https://drive.google.com/drive/folders/..."
            value={form.google_drive_folder}
            onChange={(e) => set("google_drive_folder", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Generated assets are stored in LOVIZA; paste a Drive folder here to keep your source
            brand assets alongside them.
          </p>
        </div>
      </section>

      <ChannelConnections
        brandId={isAgency ? (activeBrand?.id ?? null) : (data?.id ?? null)}
        onConnections={syncHandles}
      />
    </div>
  );
}
