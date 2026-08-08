import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export default defineTool({
  name: "set_content_enabled",
  title: "Enable or disable content",
  description:
    "Turn scheduled content on or off for the signed-in user. Pass an item id to change a single piece, or a date to change every piece scheduled that day. Disabled content stays on the calendar but is not posted.",
  inputSchema: {
    enabled: z.boolean().describe("True to enable the content, false to disable it."),
    id: z.string().uuid().optional().describe("A single content item id to change."),
    scheduled_date: DATE.optional().describe("Change every item scheduled on this date, YYYY-MM-DD."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ enabled, id, scheduled_date }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (!id && !scheduled_date) {
      return { content: [{ type: "text", text: "Provide either id or scheduled_date." }], isError: true };
    }
    if (id && scheduled_date) {
      return { content: [{ type: "text", text: "Provide only one of id or scheduled_date." }], isError: true };
    }

    const supabase = supabaseForUser(ctx);
    let query = supabase.from("content_items").update({ enabled }).eq("user_id", ctx.getUserId());
    query = id ? query.eq("id", id) : query.eq("scheduled_date", scheduled_date!);

    const { data, error } = await query.select("id, scheduled_date, type, title, enabled");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = data ?? [];
    if (rows.length === 0) {
      return { content: [{ type: "text", text: "No matching content items were found." }], isError: true };
    }

    return {
      content: [
        {
          type: "text",
          text: `${enabled ? "Enabled" : "Disabled"} ${rows.length} item(s).\n${JSON.stringify(rows, null, 2)}`,
        },
      ],
      structuredContent: { updated: rows.length, items: rows },
    };
  },
});
