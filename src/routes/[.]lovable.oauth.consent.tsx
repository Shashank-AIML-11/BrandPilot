import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type AuthorizationDetails = {
  client?: { name?: string; client_id?: string; redirect_uris?: string[] } | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthResult = { data: AuthorizationDetails | null; error: { message: string } | null };

// `supabase.auth.oauth` is a beta namespace that is not in the generated types yet.
const oauth = (
  supabase.auth as unknown as {
    oauth: {
      getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
      approveAuthorization: (id: string) => Promise<OAuthResult>;
      denyAuthorization: (id: string) => Promise<OAuthResult>;
    };
  }
).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage,
  // which is absent during SSR.
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id: typeof search["authorization_id"] === "string" ? search["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { redirect: location.pathname + location.searchStr } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.searchStr).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <ConsentShell>
      <h1 className="font-display text-2xl font-semibold text-foreground">Authorization unavailable</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        We couldn't load this connection request: {String((error as Error)?.message ?? error)}
      </p>
    </ConsentShell>
  ),
});

function ConsentShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">{children}</div>
    </main>
  );
}

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name?.trim() || "this app";
  const redirectUri = details?.client?.redirect_uris?.[0];
  const scopes = (details?.scope ?? "").split(" ").filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    const { data, error: decisionError } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);

    if (decisionError) {
      setBusy(null);
      setError(decisionError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(null);
      setError("No redirect was returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <ConsentShell>
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Connect {clientName} to Brand Spark Suite
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        This lets {clientName} use Brand Spark Suite as you — reading your brand profile and content calendar, and
        enabling or disabling scheduled content.
      </p>

      <dl className="mt-6 space-y-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Requesting app</dt>
          <dd className="text-right font-medium text-foreground">{clientName}</dd>
        </div>
        {redirectUri ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Redirects to</dt>
            <dd className="max-w-[60%] truncate text-right font-medium text-foreground">{redirectUri}</dd>
          </div>
        ) : null}
        {scopes.length ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Shares</dt>
            <dd className="text-right font-medium text-foreground">{scopes.join(", ")}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-4 text-xs text-muted-foreground">
        This does not bypass Brand Spark Suite's permissions — {clientName} only sees what your account can see.
      </p>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex gap-3">
        <Button className="flex-1" disabled={busy !== null} onClick={() => decide(true)}>
          {busy === "approve" ? "Connecting…" : "Approve"}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          disabled={busy !== null}
          onClick={() => decide(false)}
        >
          {busy === "deny" ? "Cancelling…" : "Cancel connection"}
        </Button>
      </div>
    </ConsentShell>
  );
}
