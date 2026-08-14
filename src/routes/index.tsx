import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Sparkles, BarChart3, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR, PLANS } from "@/lib/plans";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kontenta — A month of marketing content, generated in minutes" },
      {
        name: "description",
        content:
          "Store your brand once. Kontenta generates daily blogs, infographics and video scripts, drops them into a calendar and schedules them across every channel.",
      },
      { property: "og:title", content: "Kontenta — AI marketing content on autopilot" },
      {
        property: "og:description",
        content:
          "One brand profile in. A full month of blogs, infographics and videos out — scheduled, reviewable and ready to post.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Sparkles,
    title: "Brand-aware generation",
    body: "Website, products, ICP, propositions and tone are stored once and drive every single asset.",
  },
  {
    icon: CalendarDays,
    title: "A full month, day by day",
    body: "1 blog, 4 infographics and 2 video packages per day, dropped into a calendar you can open and edit.",
  },
  {
    icon: BarChart3,
    title: "Performance analytics",
    body: "Track impressions, clicks and engagement by channel and content type as the month runs.",
  },
  {
    icon: ShieldCheck,
    title: "Roles & admin control",
    body: "Grant viewer, editor, admin or root access by email from a dedicated admin portal.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-lg font-bold tracking-tight">
          Kontenta<span className="text-primary">.</span>
        </span>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link to="/pricing">Pricing</Link>
          </Button>
          <Button asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
        </nav>
      </header>

      <section className="grid-noise">
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-16 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Generate an entire month in one click
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold leading-[1.05] sm:text-6xl">
            <span className="text-gradient">Your marketing calendar,</span>
            <br />
            filled before Monday.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground">
            Kontenta reads your brand profile and writes the blogs, designs the infographics and
            scripts the videos — then schedules all of it, day by day, across every channel you use.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">
                Start free <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="surface p-5 text-left">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="text-center text-3xl font-bold">Simple, predictable pricing</h2>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`surface p-6 ${plan.highlight ? "ring-1 ring-primary" : ""}`}
            >
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
              <p className="mt-5 font-display text-4xl font-bold">
                {formatINR(plan.priceMonthly)}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <Button className="mt-5 w-full" variant={plan.highlight ? "default" : "outline"} asChild>
                <Link to="/auth">Choose {plan.name}</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Kontenta. Built for marketers who ship daily.
      </footer>
    </div>
  );
}
