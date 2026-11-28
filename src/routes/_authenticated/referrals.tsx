import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AFFILIATE_COMMISSION_PERCENT } from "@/lib/affiliate.shared";
import { USER_REFERRAL_PERCENT } from "@/lib/referrals.shared";
import { AffiliateDashboard } from "@/components/affiliate-dashboard";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({
    meta: [
      { title: "Refer & earn — LOVIZA" },
      {
        name: "description",
        content: "Share your LOVIZA link, give friends a discount and earn commission.",
      },
    ],
  }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const router = useRouter();
  const navigate = useNavigate();

  /** Back to the page the person came from; falls back to the calendar if there is no history. */
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void navigate({ to: "/calendar" });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Refer &amp; earn</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Give a friend {USER_REFERRAL_PERCENT}% off their first LOVIZA plan and earn{" "}
            {AFFILIATE_COMMISSION_PERCENT}% on every payment they make.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={goBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      <AffiliateDashboard />
    </div>
  );
}
