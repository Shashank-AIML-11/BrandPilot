import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { confirmOneTimePayment, createOneTimeOrder, getPlanStatus } from "@/lib/payments.functions";
import { loadRazorpayScript } from "@/lib/payments/load-razorpay-script";
import { ONE_TIME_PASS_DAYS, ONE_TIME_PRICE_INR } from "@/lib/one-time-pass";
import { formatIstDate } from "@/lib/plan-access";
import { formatINR } from "@/lib/plans";
import { Button } from "@/components/ui/button";

/**
 * "Generate One Time with INR 500": for people without a plan. Pays once, then
 * returns to the Content Calendar where the current week's content can be
 * generated one time (no autoposting).
 */
/** Starts the one-time payment; after paying, returns to the Content Calendar. */
export function useOneTimePayment() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    try {
      await loadRazorpayScript();
      const order = await createOneTimeOrder();
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "LOVIZA",
        description: "One-time content generation · current week",
        prefill: { name: order.customerName, email: order.customerEmail },
        theme: { color: "#00a8c6" },
        handler: async (response) => {
          try {
            await confirmOneTimePayment({
              data: {
                razorpayOrderId: response.razorpay_order_id ?? order.orderId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            });
            await queryClient.invalidateQueries();
            toast.success("Payment received. You can now generate this week's content.");
          } catch (err) {
            // Paid on Razorpay's side; the webhook will still unlock it.
            console.error("[one-time] confirm failed", err);
            toast.info(
              "Payment received. We're unlocking your generation; it can take a few seconds.",
            );
          } finally {
            setBusy(false);
            navigate({ to: "/calendar" });
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      checkout.open();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the payment");
      setBusy(false);
    }
  }

  return { pay, busy };
}

export function OneTimeGenerate() {
  const { pay, busy } = useOneTimePayment();
  const { data: status } = useQuery({
    queryKey: ["plan-status"],
    queryFn: () => getPlanStatus(),
  });

  const pass = status?.oneTime ?? null;

  if (pass && !pass.used) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Your one-time generation is ready.</p>
        <p className="mt-1 text-muted-foreground">
          Open the Content Calendar and press Generate Content. Valid until{" "}
          {formatIstDate(pass.expiresAt)}.
        </p>
        <Button className="mt-3" asChild>
          <Link to="/calendar">Go to Content Calendar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-sm">
      <p className="font-medium">Just need this week's content?</p>
      <p className="mt-1 text-muted-foreground">
        Pay {formatINR(ONE_TIME_PRICE_INR)} once to generate the current week's content one time. No
        subscription, no autoposting; you post it yourself within {ONE_TIME_PASS_DAYS} days.
      </p>
      <Button className="mt-3" onClick={pay} disabled={busy || !status}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Generate One Time with {formatINR(ONE_TIME_PRICE_INR)}
      </Button>
    </div>
  );
}

/**
 * Sidebar version: an "or" divider plus "Generate One Time with INR 500", shown under
 * "Choose a plan" for people without a running plan. Same payment flow as everywhere else.
 */
export function SidebarOneTimeButton() {
  const { pay, busy } = useOneTimePayment();
  const { data: status } = useQuery({
    queryKey: ["plan-status"],
    queryFn: () => getPlanStatus(),
  });

  if (!status) return null;
  const hasPlan = status.isRoot || status.state === "active" || status.state === "expiring";
  if (hasPlan) return null;
  const passReady = Boolean(status.oneTime && !status.oneTime.used);

  return (
    <>
      <div className="my-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      {passReady ? (
        <Button size="sm" className="h-auto w-full whitespace-normal py-2" asChild>
          <Link to="/calendar">Go to Content Calendar</Link>
        </Button>
      ) : (
        <Button
          size="sm"
          className="h-auto w-full whitespace-normal py-2"
          onClick={pay}
          disabled={busy}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />}
          Generate One Time with {formatINR(ONE_TIME_PRICE_INR)}
        </Button>
      )}
    </>
  );
}

const ONE_TIME_FLAG = "loviza_onetime";

/**
 * "Generate One Time with INR 500" for the public Pricing page, shown beside
 * "Pick your plan". Signed-out visitors are sent to sign in first and the
 * payment then starts by itself when they come back (no query string is put in
 * the sign-in redirect). A visit to /pricing?onetime=1 (from the landing page)
 * does the same.
 */
export function OneTimePricingButton() {
  const navigate = useNavigate();
  const { pay, busy } = useOneTimePayment();
  const started = useRef(false);

  const { data: session, isFetched } = useQuery({
    queryKey: ["session-check"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
  });
  const { data: status } = useQuery({
    queryKey: ["plan-status"],
    enabled: Boolean(session),
    queryFn: () => getPlanStatus(),
  });

  const hasPlan = Boolean(
    status && (status.isRoot || status.state === "active" || status.state === "expiring"),
  );
  const passReady = Boolean(status?.oneTime && !status.oneTime.used);

  function rememberIntent() {
    try {
      localStorage.setItem(ONE_TIME_FLAG, "1");
    } catch {
      /* storage blocked: the visitor can press the button again after signing in */
    }
  }

  async function click() {
    if (!session) {
      rememberIntent();
      void navigate({ to: "/auth", search: { redirect: "/pricing" } });
      return;
    }
    if (passReady) {
      void navigate({ to: "/calendar" });
      return;
    }
    await pay();
  }

  // Resume after sign-in, or when arriving from the landing page with ?onetime=1.
  useEffect(() => {
    if (!isFetched || started.current) return;
    let wanted = new URLSearchParams(window.location.search).get("onetime") === "1";
    try {
      if (localStorage.getItem(ONE_TIME_FLAG) === "1") wanted = true;
    } catch {
      /* ignore */
    }
    if (!wanted) return;

    if (!session) {
      started.current = true;
      rememberIntent();
      void navigate({ to: "/auth", search: { redirect: "/pricing" } });
      return;
    }
    if (!status) return;
    started.current = true;
    try {
      localStorage.removeItem(ONE_TIME_FLAG);
    } catch {
      /* ignore */
    }
    window.history.replaceState(null, "", window.location.pathname);
    if (hasPlan) return;
    if (passReady) void navigate({ to: "/calendar" });
    else void pay();
  }, [isFetched, session, status, hasPlan, passReady, navigate, pay]);

  if (hasPlan) return null;

  return (
    <Button onClick={click} disabled={busy} size="sm">
      {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {passReady
        ? "Go to Content Calendar"
        : `Generate One Time with ${formatINR(ONE_TIME_PRICE_INR)}`}
    </Button>
  );
}
