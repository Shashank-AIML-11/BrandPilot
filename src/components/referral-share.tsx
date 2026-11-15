import { useMemo } from "react";
import { toast } from "sonner";
import { Copy, Mail, Share2 } from "lucide-react";
import { referralLink, shareMessage } from "@/lib/referrals.shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The link box with Copy / Share / Email. Used on the Refer page and in the
 * Admin Portal. `recipientEmail` pre-fills the To: field of the email button.
 */
export function ReferralShare({
  code,
  discountPercent,
  recipientEmail,
}: {
  code: string;
  discountPercent: number;
  recipientEmail?: string | null;
}) {
  const link = useMemo(
    () =>
      referralLink(
        typeof window !== "undefined" ? window.location.origin : "https://app.loviza.click",
        code,
      ),
    [code],
  );
  const message = shareMessage(discountPercent, link);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
    } catch {
      toast.error("Couldn't copy automatically. Select the text and copy it manually.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "LOVIZA", text: message, url: link });
    } catch {
      // The person closed the share sheet; nothing to do.
    }
  }

  const mailto = `mailto:${recipientEmail ?? ""}?subject=${encodeURIComponent(
    `${discountPercent}% off LOVIZA`,
  )}&body=${encodeURIComponent(message)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Referral link"
        />
        <Button type="button" onClick={() => copy(link, "Link copied")}>
          <Copy className="mr-2 h-4 w-4" />
          Copy link
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canNativeShare && (
          <Button type="button" variant="outline" size="sm" onClick={share}>
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={mailto}>
            <Mail className="mr-2 h-4 w-4" />
            Email
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => copy(message, "Message copied")}
        >
          Copy message
        </Button>
        <span className="text-xs text-muted-foreground">
          Code: <span className="font-mono">{code}</span>
        </span>
      </div>
    </div>
  );
}
