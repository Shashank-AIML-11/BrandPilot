import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_content_item",
  title: "Get content item",
  description:
    "Read one scheduled content item in full for the signed-in user, including the blog body, caption, hashtags, image prompt, video script, platforms and performance metrics.",
  inputSchema: {
    id: z.string().uuid().describe("The content item id, as returned by list_content_items."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("content_items")
      .select(
        "id, scheduled_date, scheduled_time, type, title, summary, body, caption, hashtags, image_prompt, video_script, platforms, status, enabled, posted_at, impressions, clicks, engagements",
      )
      .eq("id", id)
      .eq("user_id", ctx.getUserId())
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return { content: [{ type: "text", text: `No content item found with id ${id}.` }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { item: data },
    };
  },
});
