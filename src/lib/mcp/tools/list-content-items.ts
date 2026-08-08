import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export default defineTool({
  name: "list_content_items",
  title: "List scheduled content",
  description:
    "List the signed-in user's scheduled content for a date range. Returns one row per piece (blog, infographic or video) with its date, time, type, title, platforms, status and whether it is enabled. Use it to review what is on the content calendar.",
  inputSchema: {
    start_date: DATE.describe("First scheduled date to include, YYYY-MM-DD."),
    end_date: DATE.describe("Last scheduled date to include, YYYY-MM-DD."),
    type: z
      .enum(["blog", "infographic", "video"])
      .optional()
      .describe("Only return this content type."),
    enabled_only: z.boolean().optional().describe("When true, only return items that are enabled."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum rows to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (input.end_date < input.start_date) {
      return { content: [{ type: "text", text: "end_date must not be before start_date." }], isError: true };
    }

    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("content_items")
      .select("id, scheduled_date, scheduled_time, type, title, summary, platforms, status, enabled")
      .eq("user_id", ctx.getUserId())
      .gte("scheduled_date", input.start_date)
      .lte("scheduled_date", input.end_date)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })
      .limit(input.limit ?? 100);

    if (input.type) query = query.eq("type", input.type);
    if (input.enabled_only) query = query.eq("enabled", true);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const items = data ?? [];
    return {
      content: [
        {
          type: "text",
          text: items.length
            ? JSON.stringify(items, null, 2)
            : `No content scheduled between ${input.start_date} and ${input.end_date}.`,
        },
      ],
      structuredContent: { count: items.length, items },
    };
  },
});
