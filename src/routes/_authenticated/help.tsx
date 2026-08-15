import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { sendSupportMessage } from "@/lib/support.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({ meta: [{ title: "Help — LOVIZA" }] }),
  component: HelpPage,
});

function HelpPage() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const send = useServerFn(sendSupportMessage);

  const submit = useMutation({
    mutationFn: async () => send({ data: { subject, message } }),
    onSuccess: () => {
      toast.success("Message sent — we'll reply to the email on your account.");
      setSubject("");
      setMessage("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send message"),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Help</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send us a message and we'll reply to the email on your account.
        </p>
      </div>

      <section className="surface space-y-4 p-6">
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            maxLength={200}
            placeholder="What's this about?"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="message">Message *</Label>
          <Textarea
            id="message"
            rows={6}
            maxLength={5000}
            placeholder="Describe the issue or question…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending || !message.trim()}>
          {submit.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Send
        </Button>
      </section>
    </div>
  );
}