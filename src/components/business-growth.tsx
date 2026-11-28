import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { getGrowthSeries } from "@/lib/admin.functions";

const C = { a: "#22d3ee", b: "#a78bfa", c: "#f59e0b", d: "#34d399", grid: "rgba(148,163,184,0.18)", text: "#94a3b8" };
const tip = {
  contentStyle: { background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#e2e8f0" },
};
const axis = { stroke: C.text, fontSize: 11, tickLine: false, axisLine: false } as const;

function Card({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="surface p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{note}</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Admin-only: month-by-month growth of subscribers, plans, billing cycles and MRR. */
export function BusinessGrowth() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["business-growth"],
    queryFn: () => getGrowthSeries(),
    staleTime: 5 * 60_000,
  });

  if (isLoading)
    return (
      <div className="surface flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (error || !data)
    return <div className="surface p-4 text-sm text-muted-foreground">Business growth could not be loaded.</div>;

  const margin = { top: 4, right: 8, left: -12, bottom: 0 };
  const inr = (v: number) => `₹${v.toLocaleString("en-IN")}`;

  return (
    <section className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Subscribers" note="All sign-ups to date (area) and new sign-ups each month (bars).">
          <ComposedChart data={data} margin={margin}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="month" {...axis} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip {...tip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="subscribers" name="Total subscribers" stroke={C.a} fill={C.a} fillOpacity={0.15} />
            <Bar dataKey="newSignups" name="New sign-ups" fill={C.b} radius={[3, 3, 0, 0]} />
          </ComposedChart>
        </Card>
        <Card title="Paying customers by plan" note="Active paid subscriptions in each month.">
          <BarChart data={data} margin={margin}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="month" {...axis} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip {...tip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="starter" name="Starter" stackId="p" fill={C.a} />
            <Bar dataKey="growth" name="Growth" stackId="p" fill={C.b} />
            <Bar dataKey="scale" name="Scale" stackId="p" fill={C.c} radius={[3, 3, 0, 0]} />
          </BarChart>
        </Card>
        <Card title="Monthly vs annual billing" note="Active paid subscriptions by billing cycle.">
          <ComposedChart data={data} margin={margin}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="month" {...axis} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip {...tip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="monthlyBilled" name="Monthly" fill={C.a} radius={[3, 3, 0, 0]} />
            <Bar dataKey="annualBilled" name="Annual" fill={C.d} radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="paying" name="All paying" stroke={C.c} strokeWidth={2} dot={false} />
          </ComposedChart>
        </Card>
        <Card title="Monthly recurring revenue (MRR)" note="Monthly plans at full price; annual plans counted at one twelfth.">
          <AreaChart data={data} margin={{ ...margin, left: 4 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...axis} tickFormatter={(v: number) => (v >= 1000 ? `₹${v / 1000}k` : `₹${v}`)} />
            <Tooltip {...tip} formatter={(v: number) => [inr(v), "MRR"]} />
            <Area type="monotone" dataKey="mrr" name="MRR" stroke={C.d} fill={C.d} fillOpacity={0.18} />
          </AreaChart>
        </Card>
      </div>
    </section>
  );
}
