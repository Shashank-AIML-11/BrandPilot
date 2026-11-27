import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { syncBrain } from "@/lib/brain-sync";
import { FilePreview, usePreview } from "@/components/file-preview";
import { listBrandAssets, removeBrandAsset, uploadBrandAsset } from "@/lib/brand-assets.functions";

const MAX_BYTES = 3_000_000;

/**
 * Hero product photos (optional): clear pictures of the brand's product, pack or storefront.
 * LOVIZA uses them to place the real product into new scenes and ads.
 */
export function ProductPhotos({ brandId }: { brandId?: string | undefined }) {
  const list = useServerFn(listBrandAssets);
  const upload = useServerFn(uploadBrandAsset);
  const remove = useServerFn(removeBrandAsset);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = usePreview();

  const { data } = useQuery({
    queryKey: ["brand-products", brandId ?? "default"],
    queryFn: () => list({ data: { ...(brandId ? { brandId } : {}), kind: "products" as const } }),
  });
  const photos = data?.assets ?? [];

  const up = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error("Each product photo must be smaller than 3 MB.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });
      return upload({
        data: { ...(brandId ? { brandId } : {}), kind: "products" as const, name: file.name, mime: file.type, base64 },
      });
    },
    onSuccess: () => {
      toast.success("Product photo saved. The Brand Brain is studying it.");
      void qc.invalidateQueries({ queryKey: ["brand-products"] });
      void syncBrain(brandId, qc);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const del = useMutation({
    mutationFn: (path: string) =>
      remove({ data: { ...(brandId ? { brandId } : {}), kind: "products" as const, path } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["brand-products"] });
      void syncBrain(brandId, qc);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="space-y-2">
      <Label>Hero product photos</Label>
      <p className="text-xs text-muted-foreground">
        Clear photos of your product, pack or storefront (PNG, JPG or WebP, up to 3 MB each, 8 per brand). Save your
        profile once before uploading.
      </p>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          for (const file of Array.from(e.target.files ?? [])) up.mutate(file);
          e.target.value = "";
        }}
      />
      <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={up.isPending}>
        {up.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
        Upload product photos
      </Button>
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {photos.map((p) => (
            <div key={p.path} className="w-24 space-y-1">
              <button
                type="button"
                onClick={() => preview.open({ name: p.name, url: p.url, mime: "image/*" })}
                className="flex h-24 w-24 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30"
                title="Click to preview"
              >
                {p.url ? <img src={p.url} alt={p.name} className="h-full w-full object-cover" /> : null}
              </button>
              <div className="flex items-center justify-between gap-1">
                <p className="truncate text-[11px] text-muted-foreground" title={p.name}>{p.name}</p>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={del.isPending} onClick={() => del.mutate(p.path)} aria-label={`Delete ${p.name}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <FilePreview {...preview} />
    </div>
  );
}
