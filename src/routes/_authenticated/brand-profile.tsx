import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChannelConnections } from "@/components/channel-connections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/brand-profile")({
  head: () => ({
    meta: [
      { title: "Brand Profile — LOVIZA123" },
      {
        name: "description",
        content: "Store your website, products, ICP, propositions, tone and social handles once.",
      },
      { property: "og:title", content: "Brand Profile — LOVIZA123" },
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
};

function BrandProfilePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["brand-profile"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: row, error } = await supabase
        .from("brand_profiles")
        .select("*")
        .eq("user_id", userData.user!.id)
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
        updated_at: new Date().toISOString(),
      };

      const { data: saved, error } = await supabase
        .from("brand_profiles")
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();
      if (error) throw error;
      return saved;
    },
    onSuccess: (saved) => {
      toast.success("Brand profile saved — future content will use it");
      queryClient.setQueryData(["brand-profile"], saved);
      queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
    },
  //  onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
      onError: (e) => {
      console.error("Brand profile save error:", e);
      toast.error(e instanceof Error ? e.message : JSON.stringify(e));
      },


});

  const set = (key: keyof FormState, value: string) => setForm((f) => ({ ...f, [key]: value }));

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Brand Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything here feeds the generator. The richer this page, the sharper the content.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save profile
        </Button>
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

      <section className="surface space-y-4 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Channels & assets
        </h2>
        <p className="text-sm text-muted-foreground">
          Only the channels you fill in are used for scheduling.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIALS.map((s) => (
            <div key={s.key} className="space-y-2">
              <Label htmlFor={s.key}>{s.key}</Label>
              <Input
                id={s.key}
                maxLength={200}
                placeholder={s.placeholder}
                value={form.social_handles[s.key] ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    social_handles: { ...f.social_handles, [s.key]: e.target.value },
                  }))
                }
              />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="drive">Google Drive folder link</Label>
          <Input
            id="drive"
            maxLength={400}
            placeholder="https://drive.google.com/drive/folders/..."
            value={form.google_drive_folder}
            onChange={(e) => set("google_drive_folder", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Generated assets are stored in LOVIZA123; paste a Drive folder here to keep your source
            brand assets alongside them.
          </p>
        </div>
      </section>

      <ChannelConnections />
    </div>
  );
}
