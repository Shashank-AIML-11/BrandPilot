import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getGenerationDecisions } from "@/lib/admin.functions";

/** What the Brand Brain decided for each recent post, and how the editor and poster design treated it. */
export function AdminBrain() {
  const load = useServerFn(getGenerationDecisions);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-generation-decisions"], queryFn: () => load() });

  if (isLoading) return <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin" />;
  if (error) return <p className="p-4 text-sm text-destructive">Could not load decisions.</p>;
  const items = data?.items ?? [];
  const scored = items.filter((i) => i.score !== null);
  const avg = scored.length ? (scored.reduce((a, i) => a + (i.score ?? 0), 0) / scored.length).toFixed(1) : "n/a";
  const rewritten = items.filter((i) => i.rewritten).length;
  const plain = items.filter((i) => i.design.startsWith("plain")).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Posts shown", String(items.length)],
          ["Average editor score", avg],
          ["Rewritten by editor", String(rewritten)],
          ["Posters left plain", String(plain)],
        ].map(([k, v]) => (
          <div key={k} className="surface p-4">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="text-2xl font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <div className="surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="p-3">Post</th>
              <th className="p-3">Brain's choice</th>
              <th className="p-3">Why</th>
              <th className="p-3">Editor</th>
              <th className="p-3">Poster</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-border/60 align-top">
                <td className="max-w-[240px] p-3">
                  <p className="truncate font-medium" title={i.title}>{i.title || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground">{[i.brand, i.type, i.date].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="p-3 text-xs">
                  <p>Pillar: {i.pillar || "n/a"}</p>
                  <p>Hook: {i.hook || "n/a"}</p>
                  {i.recipe && <p>Reel recipe: {i.recipe}</p>}
                  {i.angle && <p className="max-w-[260px] text-muted-foreground">Angle: {i.angle}</p>}
                </td>
                <td className="max-w-[220px] p-3 text-xs">{i.why || <span className="text-muted-foreground">rotation pick</span>}</td>
                <td className="p-3 text-xs">
                  {i.score === null ? (
                    <span className="text-muted-foreground">not scored</span>
                  ) : (
                    <>
                      <Badge variant={i.score >= 7 ? "secondary" : "destructive"}>{i.score}/10</Badge>
                      {i.rewritten && <p className="mt-1 text-muted-foreground">rewritten</p>}
                      {i.note && <p className="mt-1 max-w-[200px] text-muted-foreground">{i.note}</p>}
                    </>
                  )}
                </td>
                <td className="p-3 text-xs">
                  {i.design ? (
                    <span className={i.design.startsWith("plain") ? "text-destructive" : ""}>{i.design}</span>
                  ) : (
                    <span className="text-muted-foreground">n/a</span>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">No generated posts with brain data yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
