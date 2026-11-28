import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Loader2 } from "lucide-react";
import { getBrainStatus } from "@/lib/brand-knowledge.functions";

const KIND_LABEL: Record<string, string> = {
  document: "documents",
  product_photo: "product photos",
  asset: "brand assets",
  website: "website",
  competitor: "competitor sites",
};

/** What the Brand Brain has read, and how far its learning from posted content has got. */
export function BrainStatus({ brandId }: { brandId?: string | undefined }) {
  const status = useServerFn(getBrainStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["brain-status", brandId ?? "default"],
    enabled: !!brandId,
    queryFn: () => status({ data: brandId ? { brandId } : {} }),
    refetchInterval: (q) => (q.state.data?.knowledge.some((k) => k.status === "processing") ? 5000 : false),
  });

  if (!brandId) return null;
  if (isLoading || !data) {
    return (
      <section className="surface flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking the Brand Brain…
      </section>
    );
  }

  const counts: Record<string, { ready: number; busy: number; failed: number }> = {};
  for (const k of data.knowledge) {
    const c = (counts[k.kind] ??= { ready: 0, busy: 0, failed: 0 });
    if (k.status === "ready") c.ready += 1;
    else if (k.status === "failed") c.failed += 1;
    else c.busy += 1;
  }
  const l = data.learning;
  const pct = Math.min(100, Math.round((Math.min(l.measuredPosts / l.needPosts, 1) + Math.min(l.impressions / l.needImpressions, 1)) * 50));

  return (
    <section className="surface space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Brand Brain</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <p className="text-xs font-medium">Playbook</p>
          <p className="text-sm text-muted-foreground">
            {data.playbook.ready ? `Ready, ${data.playbook.pillars} content pillars` : "Builds after you save your profile"}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium">Read so far</p>
          {Object.keys(counts).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet. Scan your website or upload documents and photos.</p>
          ) : (
            <ul className="space-y-0.5 text-sm text-muted-foreground">
              {Object.entries(counts).map(([kind, c]) => (
                <li key={kind}>
                  {c.ready} {KIND_LABEL[kind] ?? kind}
                  {c.busy > 0 ? `, ${c.busy} being read` : ""}
                  {c.failed > 0 ? `, ${c.failed} could not be read` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium">Learning from your posts (last 14 days)</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            {l.enough
              ? `Enough data: ${l.measuredPosts} measured posts, ${l.impressions} impressions. Every new batch uses it.`
              : `${l.measuredPosts} of ${l.needPosts} measured posts, ${l.impressions} of ${l.needImpressions} impressions needed before it changes your next content.`}
          </p>
        </div>
      </div>
      {l.lastReview?.insights ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Latest weekly review{l.lastReview.weekEnd ? ` (to ${l.lastReview.weekEnd})` : ""}</p>
          <p className="whitespace-pre-line">
            {typeof l.lastReview.insights === "string" ? l.lastReview.insights : JSON.stringify(l.lastReview.insights, null, 2)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
