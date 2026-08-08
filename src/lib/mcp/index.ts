import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getBrandProfile from "./tools/get-brand-profile";
import updateBrandProfile from "./tools/update-brand-profile";
import listContentItems from "./tools/list-content-items";
import getContentItem from "./tools/get-content-item";
import setContentEnabled from "./tools/set-content-enabled";

// The OAuth issuer must be the direct Supabase host: the project ref is the only
// value that survives publish unchanged, and Vite inlines it at build time.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "brand-spark-suite",
  title: "Brand Spark Suite",
  version: "0.1.0",
  instructions:
    "Tools for Brand Spark Suite, a marketing content studio. Use `get_brand_profile` and `update_brand_profile` to read and refine the brand's positioning, tone and audience. Use `list_content_items` to review the content calendar for a date range, `get_content_item` to read a single blog, infographic or video in full, and `set_content_enabled` to turn a piece — or a whole day — on or off before it posts. All tools act as the signed-in user and only see that user's data.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  // Cast: tools without an `outputSchema` widen to `undefined`, which the SDK's
  // optional property type rejects under exactOptionalPropertyTypes.
  tools: [
    getBrandProfile,
    updateBrandProfile,
    listContentItems,
    getContentItem,
    setContentEnabled,
  ] as unknown as Parameters<typeof defineMcp>[0]["tools"],
});
