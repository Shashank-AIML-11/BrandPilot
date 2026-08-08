import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_brand_profile",
  title: "Get brand profile",
  description:
    "Read the signed-in user's brand profile: business name, website, description, products and services, ICP, propositions, tone, keywords and social handles. This is the source material used to generate content.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("brand_profiles")
      .select(
        "business_name, website, description, products_services, icp, propositions, tone, keywords, social_handles, google_drive_folder, updated_at",
      )
      .eq("user_id", ctx.getUserId())
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return {
        content: [{ type: "text", text: "No brand profile has been created yet." }],
        structuredContent: { profile: null },
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { profile: data },
    };
  },
});
