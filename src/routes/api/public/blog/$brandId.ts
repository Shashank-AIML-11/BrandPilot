import { createFileRoute } from "@tanstack/react-router";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Public, read-only blog of everything LOVIZA has posted for one brand.
 *   /api/public/blog/<brandId>              hosted blog page (link or embed it in any website)
 *   /api/public/blog/<brandId>?format=rss   RSS feed (Wix, Squarespace, any importer)
 *   /api/public/blog/<brandId>?format=json  JSON
 */
async function handle(request: Request, brandId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) return new Response("Not found", { status: 404 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { mdToHtml } = await import("@/lib/channels/blog-sites.server");

  const { data: brand } = await supabaseAdmin
    .from("brand_profiles")
    .select("business_name, website")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand) return new Response("Not found", { status: 404 });

  const { data } = await supabaseAdmin
    .from("content_items")
    .select("id, title, summary, body, scheduled_date, posted_at")
    .eq("brand_id", brandId)
    .eq("type", "blog")
    .eq("status", "posted")
    .order("scheduled_date", { ascending: false })
    .limit(50);
  const posts = (data ?? []) as unknown as Array<{
    id: string; title: string | null; summary: string | null; body: string | null;
    scheduled_date: string; posted_at: string | null;
  }>;

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const name = (brand as { business_name: string | null }).business_name || "Blog";
  const self = `${url.origin}${url.pathname}`;
  const headers = { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" };

  if (format === "json") {
    return Response.json(
      posts.map((p) => ({
        id: p.id, title: p.title, summary: p.summary, body_markdown: p.body,
        body_html: mdToHtml(p.body ?? ""), date: p.posted_at ?? p.scheduled_date,
      })),
      { headers },
    );
  }

  if (format === "rss") {
    const items = posts
      .map(
        (p) => `<item><title>${esc(p.title ?? "")}</title><link>${esc(`${self}#${p.id}`)}</link><guid isPermaLink="false">${p.id}</guid><pubDate>${new Date(p.posted_at ?? p.scheduled_date).toUTCString()}</pubDate><description>${esc(p.summary ?? "")}</description><content:encoded><![CDATA[${mdToHtml(p.body ?? "")}]]></content:encoded></item>`,
      )
      .join("");
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>${esc(name)} Blog</title><link>${esc(self)}</link><description>Latest posts from ${esc(name)}</description>${items}</channel></rss>`,
      { headers: { ...headers, "content-type": "application/rss+xml; charset=utf-8" } },
    );
  }

  const articles = posts
    .map(
      (p) => `<article id="${p.id}"><h2>${esc(p.title ?? "")}</h2><time>${esc((p.posted_at ?? p.scheduled_date).slice(0, 10))}</time>${mdToHtml(p.body ?? "")}</article>`,
    )
    .join("") || "<p>No posts yet.</p>";
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)} Blog</title><link rel="alternate" type="application/rss+xml" href="${esc(self)}?format=rss"><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px;line-height:1.65;color:#1a1a1a}article{margin:0 0 48px}time{color:#777;font-size:14px}h1{font-size:30px}h2{margin-bottom:4px}a{color:#0a58ca}</style></head><body><h1>${esc(name)} Blog</h1>${articles}</body></html>`,
    { headers: { ...headers, "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/blog/$brandId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handle(request, (params as { brandId: string }).brandId),
    },
  },
});
