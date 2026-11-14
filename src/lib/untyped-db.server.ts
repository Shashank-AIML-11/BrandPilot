import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The generated Supabase types only know tables that existed when
 * types.ts was last generated. Newer tables (plan_orders,
 * renewal_notifications) and the apply_plan_payment() function are reached
 * through this loosely-typed view of the service-role client instead.
 * Server-only.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UntypedDb = SupabaseClient<any, "public", any>;

export function untyped(admin: unknown): UntypedDb {
  return admin as UntypedDb;
}
