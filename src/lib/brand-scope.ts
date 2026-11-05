import { useMe } from "@/components/app-shell";
import {
  agencyPlanFor,
  resolveActiveBrand,
  useAgencyBrands,
  useStoredBrandId,
} from "@/lib/agency";

export interface BrandScope {
  /** Agency (Scale) account: pages show one brand at a time. */
  isAgency: boolean;
  /** The brand the page should show; null for single-brand accounts (no filtering). */
  brandId: string | null;
  brandName: string | null;
  /** Channel connections are still per account, so only the first brand may publish. */
  isPrimary: boolean;
  loading: boolean;
}

/** Which brand the current page is working on (Brand Profile, Calendar, Library, Analytics). */
export function useBrandScope(): BrandScope {
  const { data: me, isLoading: meLoading } = useMe();
  const isAgency = !!agencyPlanFor(me);
  const { data: brands, isLoading: brandsLoading } = useAgencyBrands(isAgency);
  const stored = useStoredBrandId();
  const active = isAgency ? resolveActiveBrand(brands, stored) : undefined;
  return {
    isAgency,
    brandId: active?.id ?? null,
    brandName: active?.name ?? null,
    // Every brand now has its own channel connections, so any brand may publish.
    isPrimary: true,
    loading: meLoading || (isAgency && brandsLoading),
  };
}
