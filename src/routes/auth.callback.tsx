import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — Kontenta" },
      { name: "description", content: "Completing your Kontenta sign-in." },
      { property: "og:title", content: "Signing you in — Kontenta" },
      { property: "og:description", content: "Completing your Kontenta sign-in." },
    ],
  }),
  component: AuthCallback,
});

function safePath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/brand-profile";
}

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let done = false;
    const target = safePath(window.sessionStorage.getItem("kontenta-auth-redirect"));

    const finish = () => {
      if (done) return;
      done = true;
      window.sessionStorage.removeItem("kontenta-auth-redirect");
      navigate({ to: target, replace: true });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish();
    });

    const timeout = window.setTimeout(() => {
      if (!done) {
        done = true;
        navigate({ to: "/auth", replace: true });
      }
    }, 8000);

    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Finishing sign-in…</span>
      </div>
    </div>
  );
}
