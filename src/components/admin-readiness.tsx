import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getBrandReadiness } from "@/lib/admin.functions";

const DOT: Record<string, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500" };

/** Pre-flight check for a brand before generating a week. */
export function AdminReadiness() {
  const load = useServerFn(getBrandReadiness);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const { data, isFetching } = useQuery({ queryKey: ["admin-readiness", search], queryFn: () => load({ data: { search } }) });

  const row = (c: { label: string; status: string; detail: string }) => (
    <li key={c.label} className="flex items-start gap-2 text-sm">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[c.status] ?? "bg-muted"}`} />
      <span>
        <span className="font-medium">{c.label}</span>
        {c.detail && <span className="text-muted-foreground"> · {c.detail}</span>}
      </span>
    </li>
  );

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(text);
        }}
      >
        <Input placeholder="Find a brand by name (blank shows the latest 12)" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="secondary">Check</Button>
      </form>
      {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
      {data && (
        <>
          <div className="surface p-4">
            <p className="mb-2 text-sm font-semibold">This environment</p>
            <ul className="space-y-1.5">{data.services.map(row)}</ul>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.brands.map((b) => (
              <div key={b.id} className="surface p-4">
                <p className="text-sm font-semibold">{b.name || "Unnamed"}</p>
                <p className="mb-2 text-xs text-muted-foreground">{b.industry || "no industry set"}</p>
                <ul className="space-y-1.5">{b.checks.map(row)}</ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
