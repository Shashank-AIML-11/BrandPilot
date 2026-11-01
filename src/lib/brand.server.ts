import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
export type BrandProfileRow = Database["public"]["Tables"]["brand_profiles"]["Row"];

/**
 * One of the user's brands. A Scale-plan user owns several, so callers pass the
 * brand they are working on; without an id (or if it isn't theirs) this falls
 * back to the user's oldest brand, which keeps single-brand accounts unchanged.
 */
export async function loadBrand(
  client: Client,
  userId: string,
  brandId?: string | null,
): Promise<BrandProfileRow | null> {
  let query = client.from("brand_profiles").select("*").eq("user_id", userId);
  if (brandId) query = query.eq("id", brandId);
  // order + limit(1) keeps maybeSingle() safe when the user has several brands.
  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * The oldest brand is the account's "primary" brand. Channel connections
 * (YouTube, LinkedIn, ...) are still per account, so only the primary brand may
 * publish to them until connections become per-brand.
 */
export async function isPrimaryBrand(
  client: Client,
  userId: string,
  brandId: string,
): Promise<boolean> {
  const first = await loadBrand(client, userId, null);
  return !!first && first.id === brandId;
}
