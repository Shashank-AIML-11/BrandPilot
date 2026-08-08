import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const FIELDS = [
  "business_name",
  "website",
  "description",
  "products_services",
  "icp",
  "propositions",
  "tone",
  "keywords",
  "google_drive_folder",
] as const;

export default defineTool({
  name: "update_brand_profile",
  title: "Update brand profile",
  description:
    "Update one or more fields on the signed-in user's brand profile. Only the fields you pass are changed; everything else is left as-is. Creates the profile if it does not exist yet.",
  inputSchema: {
    business_name: z.string().trim().max(200).optional().describe("Business or brand name."),
    website: z.string().trim().max(500).optional().describe("Business website URL."),
    description: z.string().trim().max(4000).optional().describe("What the business does."),
    products_services: z.string().trim().max(4000).optional().describe("Products and services offered."),
    icp: z.string().trim().max(4000).optional().describe("Ideal customer profile / target audience."),
    propositions: z.string().trim().max(4000).optional().describe("Value propositions and differentiators."),
    tone: z.string().trim().max(1000).optional().describe("Brand voice and tone of the content."),
    keywords: z.string().trim().max(2000).optional().describe("Comma-separated SEO or topic keywords."),
    google_drive_folder: z.string().trim().max(500).optional().describe("Google Drive folder link for brand assets."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }

    const patch: Record<string, string> = {};
    for (const field of FIELDS) {
      const value = input[field];
      if (typeof value === "string") patch[field] = value;
    }
    if (Object.keys(patch).length === 0) {
      return { content: [{ type: "text", text: "No fields provided to update." }], isError: true };
    }

    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const { data: existing, error: readError } = await supabase
      .from("brand_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) return { content: [{ type: "text", text: readError.message }], isError: true };

    const query = existing
      ? supabase.from("brand_profiles").update(patch).eq("id", existing.id)
      : supabase.from("brand_profiles").insert({ ...patch, user_id: userId });

    const { data, error } = await query.select(
      "business_name, website, description, products_services, icp, propositions, tone, keywords, google_drive_folder",
    );
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [
        {
          type: "text",
          text: `Updated ${Object.keys(patch).join(", ")}.\n${JSON.stringify(data?.[0] ?? {}, null, 2)}`,
        },
      ],
      structuredContent: { profile: data?.[0] ?? null, updated_fields: Object.keys(patch) },
    };
  },
});
