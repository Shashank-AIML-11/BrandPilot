import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const sendInput = z.object({
  subject: z.string().max(200).default(""),
  message: z.string().trim().min(1, "Message is required").max(5000),
});

export const sendSupportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();

    const { error } = await context.supabase.from("support_messages").insert({
      user_id: context.userId,
      email: profile?.email ?? "",
      subject: data.subject.trim(),
      message: data.message,
    } as never);
    if (error) throw new Error(error.message);

    return { ok: true };
  });