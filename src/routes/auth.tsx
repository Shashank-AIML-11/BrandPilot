import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      throw redirect({ to: safePath(search.redirect) });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign in — Kontenta" },
      { name: "description", content: "Sign in to your Kontenta content calendar workspace." },
      { property: "og:title", content: "Sign in — Kontenta" },
      { property: "og:description", content: "Access your AI-generated marketing content calendar." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {},
  component: AuthPage,
});

function safePath(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/calendar";
}

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const next = safePath(search.redirect);

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<"google" | "apple" | null>(null);

  useEffect(() => {
    let active = true;

    const enterApp = () => {
      if (!active) return;
      window.sessionStorage.removeItem("kontenta-auth-redirect");
      navigate({ to: next, replace: true });
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) enterApp();
    });

    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) enterApp();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [navigate, next]);

  async function handleSocialSignIn(provider: "google" | "apple") {
    setSocialBusy(provider);
    try {
      window.sessionStorage.setItem("kontenta-auth-redirect", next);
     const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      },
     });

     if (error) throw error;

     return data;
    //  if (result.error) throw result.error;
    //  if (result.redirected) return;
    //  toast.success(`Signed in with ${provider === "google" ? "Google" : "Apple"}`);
      window.sessionStorage.removeItem("kontenta-auth-redirect");
      navigate({ to: next, replace: true });

    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not sign in with ${provider}`);
    } finally {
      setSocialBusy(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
        navigate({ to: next });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${next}`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created");
          navigate({ to: next });
        } else {
          toast.success("Check your email to confirm your account.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset link sent. Check your inbox.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="grid-noise hidden flex-col justify-between p-12 lg:flex">
        <Link to="/" className="font-display text-lg font-bold">
          Kontenta<span className="text-primary">.</span>
        </Link>
        <div>
          <h2 className="max-w-sm text-4xl font-bold leading-tight">
            One brand profile in.
            <br />
            <span className="text-primary">A month of content out.</span>
          </h2>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Blogs, infographics and video packages generated daily and scheduled across every
            channel you run.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Kontenta</p>
      </div>

      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <Link to="/" className="font-display text-lg font-bold lg:hidden">
            Kontenta<span className="text-primary">.</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold">
            {mode === "signin" && "Sign in"}
            {mode === "signup" && "Create your account"}
            {mode === "forgot" && "Reset your password"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "forgot"
              ? "We'll email you a secure link to set a new password."
              : "Continue with Google, Apple, or your email."}
          </p>

          {mode !== "forgot" && (
            <>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full"
                  disabled={busy || socialBusy !== null}
                  onClick={() => void handleSocialSignIn("google")}
                >
                  {socialBusy === "google" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="currentColor" d="M21.6 12.23c0-.71-.06-1.23-.2-1.77H12v3.4h5.52a4.7 4.7 0 0 1-2.05 3.08l-.02.11 2.98 2.31.21.02c1.94-1.79 3.05-4.43 3.05-7.15Z" />
                      <path fill="currentColor" d="M12 22c2.76 0 5.08-.91 6.77-2.48l-3.22-2.49c-.86.58-2.03.98-3.55.98a6.17 6.17 0 0 1-5.84-4.27l-.1.01-3.1 2.4-.04.1A10 10 0 0 0 12 22Z" opacity=".8" />
                      <path fill="currentColor" d="M6.16 13.74A6.2 6.2 0 0 1 5.82 12c0-.61.12-1.2.33-1.74v-.12L3 7.7l-.1.05A10 10 0 0 0 2 12c0 1.53.35 2.98.92 4.25l3.24-2.51Z" opacity=".65" />
                      <path fill="currentColor" d="M12 5.99c1.92 0 3.22.83 3.96 1.51l2.88-2.81A9.8 9.8 0 0 0 12 2a10 10 0 0 0-9.08 5.75l3.23 2.51A6.18 6.18 0 0 1 12 5.99Z" opacity=".9" />
                    </svg>
                  )}
                  Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full"
                  disabled={busy || socialBusy !== null}
                  onClick={() => void handleSocialSignIn("apple")}
                >
                  {socialBusy === "apple" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="currentColor" d="M17.05 12.54c-.03-2.37 1.94-3.52 2.03-3.58a4.35 4.35 0 0 0-3.42-1.85c-1.44-.15-2.84.86-3.57.86-.74 0-1.87-.84-3.08-.81a4.54 4.54 0 0 0-3.82 2.33c-1.66 2.87-.42 7.08 1.17 9.4.8 1.13 1.72 2.4 2.93 2.35 1.18-.05 1.63-.75 3.06-.75 1.42 0 1.85.75 3.08.72 1.27-.02 2.07-1.14 2.83-2.28a9.4 9.4 0 0 0 1.3-2.65 4.1 4.1 0 0 1-2.51-3.74ZM14.72 5.58A4.16 4.16 0 0 0 15.67 2a4.25 4.25 0 0 0-2.75 1.7 3.96 3.96 0 0 0-.98 3.46 3.5 3.5 0 0 0 2.78-1.58Z" />
                    </svg>
                  )}
                  Apple
                </Button>
              </div>
              <div className="my-6 flex items-center gap-3" aria-hidden="true">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or continue with email</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className={mode === "forgot" ? "mt-8 space-y-4" : "space-y-4"}>
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Mercer"
                  maxLength={80}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" && "Sign in"}
              {mode === "signup" && "Create account"}
              {mode === "forgot" && "Send reset link"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signup" ? "Already have an account?" : "New to Kontenta?"}{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
