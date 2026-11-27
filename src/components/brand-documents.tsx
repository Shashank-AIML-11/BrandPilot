import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { listBrandDocuments, removeBrandDocument, uploadBrandDocument } from "@/lib/brand-knowledge.functions";
import { syncBrain } from "@/lib/brain-sync";

const MAX_BYTES = 3_000_000;

/** Strategy and guidelines documents. The Brand Brain reads them and uses them in the playbook and every post. */
export function BrandDocuments({ brandId }: { brandId?: string | undefined }) {
  const list = useServerFn(listBrandDocuments);
  const upload = useServerFn(uploadBrandDocument);
  const remove = useServerFn(removeBrandDocument);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["brand-documents", brandId ?? "default"],
    queryFn: () => list({ data: brandId ? { brandId } : {} }),
    refetchInterval: (q) => (q.state.data?.documents.some((d) => d.status === "processing") ? 4000 : false),
  });
  const docs = data?.documents ?? [];

  const up = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error("Each document must be smaller than 3 MB.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });
      return upload({ data: { ...(brandId ? { brandId } : {}), name: file.name, mime: file.type, base64 } });
    },
    onSuccess: () => {
      toast.success("Document received. The Brand Brain is reading it now.");
      void qc.invalidateQueries({ queryKey: ["brand-documents"] });
      void syncBrain(brandId, qc);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const del = useMutation({
    mutationFn: (path: string) => remove({ data: { ...(brandId ? { brandId } : {}), path } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["brand-documents"] });
      void syncBrain(brandId, qc);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="space-y-2">
      <Label>Strategy & guidelines documents</Label>
      <p className="text-xs text-muted-foreground">
        Brand guidelines, a marketing strategy, a product brief. PDF, DOCX, TXT or MD, up to 3 MB each, 10 per brand.
        The Brand Brain reads every page and uses it in your playbook, content strategy and posts. Save your profile once
        before uploading.
      </p>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
        className="hidden"
        onChange={(e) => {
          for (const file of Array.from(e.target.files ?? [])) up.mutate(file);
          e.target.value = "";
        }}
      />
      <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={up.isPending}>
        {up.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
        Upload documents
      </Button>
      {docs.length > 0 && (
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <li key={d.path} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs" title={d.name}>{d.name}</p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {d.status === "ready" && <><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Read by the Brand Brain</>}
                  {d.status === "processing" && <><Loader2 className="h-3 w-3 animate-spin" /> Reading…</>}
                  {d.status === "failed" && <><AlertCircle className="h-3 w-3 text-destructive" /> {d.error ?? "Could not be read"}</>}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={del.isPending} onClick={() => del.mutate(d.path)} aria-label={`Delete ${d.name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
