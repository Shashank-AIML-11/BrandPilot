import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { scanBrandWebsite } from "@/lib/brand-knowledge.functions";

type Suggestion = Awaited<ReturnType<typeof scanBrandWebsite>>;

const FIELDS: Array<{ key: keyof Suggestion["fields"]; label: string; long: boolean }> = [
  { key: "business_name", label: "Business name", long: false },
  { key: "industry", label: "Industry", long: false },
  { key: "description", label: "Business description", long: true },
  { key: "products_services", label: "Products & services", long: true },
  { key: "icp", label: "Ideal customer", long: true },
  { key: "propositions", label: "Value propositions", long: true },
  { key: "tone", label: "Tone of voice", long: false },
  { key: "keywords", label: "Keywords", long: false },
  { key: "current_offers", label: "Current offers", long: true },
  { key: "testimonials", label: "Testimonials", long: true },
  { key: "competitors", label: "Competitors", long: false },
  { key: "locations", label: "Locations", long: false },
  { key: "languages", label: "Languages", long: false },
  { key: "voice_dos_donts", label: "Voice do's and don'ts", long: true },
  { key: "compliance_notes", label: "Compliance notes", long: true },
];

export interface ScanApproval {
  fields: Partial<Record<keyof Suggestion["fields"], string>>;
  handles: Record<string, string>;
  color: string | null;
}

/**
 * Reads the website and shows what it found. Nothing changes in the profile until the person
 * ticks what to keep, edits it if needed and presses Approve.
 */
export function WebsiteScan({
  website,
  brandId,
  current,
  currentHandles,
  onApprove,
}: {
  website: string;
  brandId?: string | undefined;
  current: Record<string, string>;
  currentHandles: Record<string, string>;
  onApprove: (a: ScanApproval) => void;
}) {
  const scan = useServerFn(scanBrandWebsite);
  const [found, setFound] = useState<Suggestion | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [use, setUse] = useState<Record<string, boolean>>({});
  const [handles, setHandles] = useState<Record<string, string>>({});
  const [useHandle, setUseHandle] = useState<Record<string, boolean>>({});
  const [color, setColor] = useState("");
  const [useColor, setUseColor] = useState(false);

  const run = useMutation({
    mutationFn: () => {
      if (!website.trim()) throw new Error("Enter your website address first.");
      return scan({ data: { url: website.trim(), ...(brandId ? { brandId } : {}) } });
    },
    onSuccess: (s) => {
      const v: Record<string, string> = {};
      const u: Record<string, boolean> = {};
      for (const f of FIELDS) {
        const text = (s.fields[f.key] ?? "").trim();
        if (!text) continue;
        v[f.key] = text;
        u[f.key] = !(current[f.key] ?? "").trim(); // never overwrite filled fields unless ticked
      }
      const h: Record<string, string> = {};
      const uh: Record<string, boolean> = {};
      for (const [k, val] of Object.entries(s.social_handles)) {
        if (!val) continue;
        h[k] = val;
        uh[k] = !(currentHandles[k] ?? "").trim();
      }
      setValues(v);
      setUse(u);
      setHandles(h);
      setUseHandle(uh);
      setColor(s.brand_color || "");
      setUseColor(!!s.brand_color);
      setFound(s);
      if (Object.keys(v).length === 0 && Object.keys(h).length === 0) {
        toast.message("The website did not give enough to fill any field.");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not read the website"),
  });

  const approve = () => {
    const fields: ScanApproval["fields"] = {};
    for (const f of FIELDS) {
      const text = (values[f.key] ?? "").trim();
      if (use[f.key] && text) fields[f.key] = text;
    }
    const picked: Record<string, string> = {};
    for (const [k, v] of Object.entries(handles)) if (useHandle[k] && v.trim()) picked[k] = v.trim();
    const validColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
    onApprove({ fields, handles: picked, color: useColor ? validColor : null });
    setFound(null);
  };

  const rows = FIELDS.filter((f) => values[f.key] !== undefined);
  const handleRows = Object.keys(handles);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="secondary" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Globe className="mr-1.5 h-3.5 w-3.5" />}
          Scan website and fill profile
        </Button>
        <p className="text-xs text-muted-foreground">
          Reads your website and suggests what it finds. Fields it cannot find stay blank. You review everything before it is used.
        </p>
      </div>

      {found && (
        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-medium">Review what we found</p>
            <p className="text-xs text-muted-foreground">
              Tick what to use, edit anything, then approve. Fields that are already filled are unticked so nothing is
              overwritten by accident.
              {found.source_pages.length > 0 ? ` Read ${found.source_pages.length} page${found.source_pages.length === 1 ? "" : "s"}.` : ""}
            </p>
          </div>

          {rows.length === 0 && handleRows.length === 0 && !found.brand_color && (
            <p className="text-sm text-muted-foreground">Nothing usable was found on that website.</p>
          )}

          {rows.map((f) => {
            const filled = !!(current[f.key] ?? "").trim();
            const guess = found.inferred.includes(f.key);
            const id = `scan-${f.key}`;
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox id={`${id}-use`} checked={!!use[f.key]} onCheckedChange={(c) => setUse((u) => ({ ...u, [f.key]: c === true }))} />
                  <Label htmlFor={id}>{f.label}</Label>
                  {guess && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">inferred, please check</span>}
                  {filled && <span className="text-[11px] text-muted-foreground">already filled, ticking replaces it</span>}
                </div>
                {f.long ? (
                  <Textarea id={id} rows={3} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                ) : (
                  <Input id={id} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                )}
              </div>
            );
          })}

          {handleRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium">Social handles found on the site</p>
              {handleRows.map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <Checkbox checked={!!useHandle[k]} onCheckedChange={(c) => setUseHandle((u) => ({ ...u, [k]: c === true }))} aria-label={`Use ${k}`} />
                  <Label className="w-24 shrink-0 text-xs">{k}</Label>
                  <Input value={handles[k] ?? ""} onChange={(e) => setHandles((h) => ({ ...h, [k]: e.target.value }))} className="h-9" />
                </div>
              ))}
            </div>
          )}

          {found.brand_color && (
            <div className="flex items-center gap-2">
              <Checkbox checked={useColor} onCheckedChange={(c) => setUseColor(c === true)} aria-label="Use theme colour" />
              <Label className="text-xs">Primary colour from the site</Label>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#4f46e5"} onChange={(e) => setColor(e.target.value)} className="h-8 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5" />
              <Input value={color} maxLength={7} onChange={(e) => setColor(e.target.value)} className="h-9 w-24 text-xs" />
            </div>
          )}

          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={approve}>Approve and save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setFound(null)}>Discard</Button>
          </div>
        </div>
      )}
    </div>
  );
}
