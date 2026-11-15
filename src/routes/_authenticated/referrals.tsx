import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift, Loader2, Lock } from "lucide-react";
import { createMyReferral, getMyReferral } from "@/lib/referrals.functions";
import { USER_REFERRAL_PERCENT } from "@/lib/referrals.shared";
import { ReferralShare } from "@/components/referral-share";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({
    meta: [
      { title: "Refer & save — LOVIZA" },
      {
        name: "description",
        content: "Share your LOVIZA referral link and give friends a discount.",
      },
    ],
  }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-referral"],
    queryFn: () => getMyReferral(),
  });

  const create = useMutation({
    mutationFn: () => createMyReferral(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-referral"] });
      toast.success("Your referral link is ready");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not create your link"),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-destructive">Could not load your referral link.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Refer &amp; save</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Give a friend {USER_REFERRAL_PERCENT}% off their first LOVIZA plan with your personal
          link.
        </p>
      </div>

      {!data.canCreate && !data.code ? (
        <section className="surface p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Referral links are for paid plans</p>
              <p className="mt-1 text-sm text-muted-foreground">{data.reason}</p>
              <Button className="mt-4" asChild>
                <Link to="/pricing">See plans</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : !data.code ? (
        <section className="surface p-6">
          <div className="flex items-start gap-3">
            <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Create your {USER_REFERRAL_PERCENT}% discount link</p>
              <p className="mt-1 text-sm text-muted-foreground">
                One personal link, yours to share anywhere. Whoever signs up through it gets{" "}
                {USER_REFERRAL_PERCENT}% off their first plan.
              </p>
              <Button className="mt-4" onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create my link
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="surface space-y-5 p-6">
          <ReferralShare code={data.code} discountPercent={data.discountPercent} />
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <p>
              <strong>{data.usesCount}</strong>{" "}
              {data.usesCount === 1 ? "person has" : "people have"} paid using your link.
            </p>
            <p className="mt-1 text-muted-foreground">
              The {data.discountPercent}% discount applies to a new customer's first plan, once per
              person.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
