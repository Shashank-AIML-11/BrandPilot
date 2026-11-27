import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "loviza_cookie_consent";
const PRIVACY_URL = "https://loviza.click/privacy-policy.html";

/** One-time notice about essential cookies. "Got It" is remembered in this browser. */
export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(KEY)) setShow(true);
    } catch {
      setShow(true); // storage blocked: still show it, it just returns next visit
    }
  }, []);

  if (!show) return null;

  const accept = () => {
    try {
      window.localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      /* ignore: the notice simply shows again next time */
    }
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed bottom-4 left-4 right-4 z-[60] max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl sm:right-auto"
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          We use cookies for essential website functions and to better understand how you use our site, so we can create
          the best possible experience for you.
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Privacy Policy
        </a>
        <Button size="sm" onClick={accept}>
          Got It
        </Button>
      </div>
    </div>
  );
}
