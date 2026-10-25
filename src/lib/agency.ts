import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ROOT_EMAIL } from "@/lib/generation-entitlements";
import { planById, type Plan } from "@/lib/plans";

/**
 * Agency view (Scale plan).
 *
 * MULTI_BRAND_ENABLED gates the "Add brand" button. It stays off until the
 * database migration (drop UNIQUE(user_id) on brand_profiles) AND the
 * brand-scoping of generation, channels and publishing are done — every
 * server query that does `.eq("user_id", ...).maybeSingle()` on
 * brand_profiles would otherwise fail the moment a user has two brands.
 * Turn it on with VITE_MULTI_BRAND_ENABLED=true.
 */
export const MULTI_BRAND_ENABLED = import.meta.env["VITE_MULTI_BRAND_ENABLED"] === "true";

/** Sentinel stored as the active brand while the "new brand" form is open. */
export const NEW_BRAND_ID = "new";

type MeLike =
  | {
      activeSubscription?: { plan?: string | null } | null;
      profile?: { email?: string | null } | null;
    }
  | null
  | undefined;

/**
 * Returns the Scale plan when this user should get the agency view, else
 * undefined. The root account is treated as Scale — the same rule the
 * server applies in getGenerationEntitlement().
 */
export function agencyPlanFor(me: MeLike): Plan | undefined {
  if (me?.profile?.email?.trim().toLowerCase() === ROOT_EMAIL) return planById("scale");
  const plan = planById(me?.activeSubscription?.plan);
  return plan?.id === "scale" ? plan : undefined;
}

export interface AgencyBrand {
  id: string;
  name: string;
  /** "intake_pending" = the client hasn't completed their intake form yet. */
  status: "active" | "intake_pending";
}

/** All brands this user owns (RLS already restricts rows to the caller). */
export function useAgencyBrands(enabled: boolean) {
  return useQuery({
    queryKey: ["agency-brands"],
    enabled,
    queryFn: async (): Promise<AgencyBrand[]> => {
      const { data, error } = await supabase
        .from("brand_profiles")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.business_name.trim() || "Untitled brand",
        // `status` only exists after the multi-brand migration.
        status:
          (row as { status?: string | null }).status === "intake_pending"
            ? "intake_pending"
            : "active",
      }));
    },
  });
}

/* ---- active brand: tiny localStorage-backed store, shared by every page ---- */

const STORAGE_KEY = "loviza.activeBrandId";
const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function setActiveBrandId(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable — selection just won't persist across reloads */
  }
  listeners.forEach((l) => l());
}

export function useStoredBrandId(): string | null {
  return useSyncExternalStore(subscribe, readStored, () => null);
}

/** The stored brand if it still exists, otherwise the first one. */
export function resolveActiveBrand(
  brands: AgencyBrand[] | undefined,
  storedId: string | null,
): AgencyBrand | undefined {
  if (!brands?.length) return undefined;
  return brands.find((b) => b.id === storedId) ?? brands[0];
}
