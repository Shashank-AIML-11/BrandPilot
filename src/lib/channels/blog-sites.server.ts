/** Blog publishing to a customer's own website + Medium. Server-only. */

export const BLOG_PLATFORMS = ["wordpress", "ghost", "webflow", "shopify", "webhook", "hosted"] as const;
export type BlogPlatform = (typeof BLOG_PLATFORMS)[number];

export interface BlogSiteConfig {
  platform: BlogPlatform;
  url: string; // site address (or webhook endpoint)
  username?: string; // WordPress user
  secret: string; // app password / API key / token
  collectionId?: string; // Webflow
  blogId?: string; // Shopify (optional)
}

export interface BlogPost {
  id: string;
  title: string;
  summary: string;
  body: string; // markdown
  hashtags: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" rel="noopener">$1</a>',
    );
}

/** Small, safe markdown -> HTML (headings, lists, bold, italic, links, paragraphs). */
export function mdToHtml(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of (md ?? "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) { close(); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      close();
      const level = Math.min(Math.max((h[1] ?? "#").length, 2), 4);
      out.push(`<h${level}>${inline(h[2] ?? "")}</h${level}>`);
      continue;
    }
    const li = /^([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      const kind = /^\d/.test(li[1] ?? "") ? "ol" : "ul";
      if (list !== kind) { close(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline(li[2] ?? "")}</li>`);
      continue;
    }
    close();
    out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join("\n");
}

const slugOf = (title: string, id: string) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)}-${id.slice(0, 6)}`;

const trimUrl = (u: string) => u.trim().replace(/\/+$/, "");

async function ok(res: Response, what: string) {
  if (res.ok) return res;
  const text = (await res.text().catch(() => "")).slice(0, 300);
  throw new Error(`${what} returned ${res.status}${text ? `: ${text}` : ""}`);
}

/* ------------------------------- Ghost JWT ------------------------------- */
async function ghostToken(key: string) {
  const [id, secretHex] = key.split(":");
  if (!id || !secretHex) throw new Error("Ghost key must look like id:secret (Admin API key).");
  const b64u = (b: ArrayBuffer | string) => {
    const bin =
      typeof b === "string" ? b : String.fromCharCode(...new Uint8Array(b));
    return btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  };
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "HS256", kid: id, typ: "JWT" }));
  const body = b64u(JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" }));
  const raw = new Uint8Array((secretHex.match(/.{1,2}/g) ?? []).map((h) => parseInt(h, 16)));
  const k = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

/* --------------------------------- verify -------------------------------- */
/** Cheap read-only call so a wrong key/URL is caught when the customer saves. */
export async function verifyBlogSite(c: BlogSiteConfig): Promise<void> {
  const url = trimUrl(c.url);
  if (c.platform === "wordpress") {
    await ok(
      await fetch(`${url}/wp-json/wp/v2/users/me`, {
        headers: { authorization: `Basic ${btoa(`${c.username}:${c.secret}`)}` },
      }),
      "WordPress",
    );
  } else if (c.platform === "ghost") {
    await ok(
      await fetch(`${url}/ghost/api/admin/site/`, {
        headers: { authorization: `Ghost ${await ghostToken(c.secret)}`, "accept-version": "v5.0" },
      }),
      "Ghost",
    );
  } else if (c.platform === "webflow") {
    await ok(
      await fetch(`https://api.webflow.com/v2/collections/${encodeURIComponent(c.collectionId ?? "")}`, {
        headers: { authorization: `Bearer ${c.secret}` },
      }),
      "Webflow",
    );
  } else if (c.platform === "shopify") {
    await ok(
      await fetch(`https://${shopHost(url)}/admin/api/2024-10/blogs.json`, {
        headers: { "x-shopify-access-token": c.secret },
      }),
      "Shopify",
    );
  }
}

const shopHost = (u: string) => u.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");

/* --------------------------------- publish ------------------------------- */
export async function publishBlogToSite(
  meta: Record<string, unknown>,
  secret: string,
  post: BlogPost,
): Promise<{ url: string }> {
  const platform = String(meta["platform"] ?? "webhook") as BlogPlatform;
  const url = trimUrl(String(meta["url"] ?? ""));
  const html = mdToHtml(post.body || post.summary || post.title);

  if (platform === "wordpress") {
    const res = await ok(
      await fetch(`${url}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Basic ${btoa(`${String(meta["username"] ?? "")}:${secret}`)}`,
        },
        body: JSON.stringify({ title: post.title, content: html, excerpt: post.summary, status: "publish" }),
      }),
      "WordPress",
    );
    const j = (await res.json()) as { link?: string };
    return { url: j.link ?? url };
  }

  if (platform === "ghost") {
    const res = await ok(
      await fetch(`${url}/ghost/api/admin/posts/?source=html`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Ghost ${await ghostToken(secret)}`,
          "accept-version": "v5.0",
        },
        body: JSON.stringify({
          posts: [{ title: post.title, html, custom_excerpt: post.summary.slice(0, 290), status: "published" }],
        }),
      }),
      "Ghost",
    );
    const j = (await res.json()) as { posts?: Array<{ url?: string }> };
    return { url: j.posts?.[0]?.url ?? url };
  }

  if (platform === "webflow") {
    const res = await ok(
      await fetch(
        `https://api.webflow.com/v2/collections/${encodeURIComponent(String(meta["collection_id"] ?? ""))}/items/live`,
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            isArchived: false,
            isDraft: false,
            // Default field names of Webflow's blog collection.
            fieldData: {
              name: post.title,
              slug: slugOf(post.title, post.id),
              "post-body": html,
              "post-summary": post.summary,
            },
          }),
        },
      ),
      "Webflow",
    );
    await res.text();
    return { url };
  }

  if (platform === "shopify") {
    const host = shopHost(url);
    const base = `https://${host}/admin/api/2024-10`;
    const headers = { "content-type": "application/json", "x-shopify-access-token": secret };
    let blogId = String(meta["blog_id"] ?? "");
    if (!blogId) {
      const list = await ok(await fetch(`${base}/blogs.json`, { headers }), "Shopify");
      blogId = String(((await list.json()) as { blogs?: Array<{ id: number }> }).blogs?.[0]?.id ?? "");
      if (!blogId) throw new Error("Shopify store has no blog. Create one under Online Store > Blog posts.");
    }
    await ok(
      await fetch(`${base}/blogs/${blogId}/articles.json`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          article: { title: post.title, body_html: html, summary_html: `<p>${esc(post.summary)}</p>`, published: true },
        }),
      }),
      "Shopify",
    );
    return { url: `https://${host}` };
  }

  if (platform === "hosted") return { url };

  // Custom endpoint: signed JSON POST.
  const body = JSON.stringify({
    id: post.id,
    type: "blog",
    title: post.title,
    summary: post.summary,
    body: post.body,
    html,
    hashtags: post.hashtags,
    published_at: new Date().toISOString(),
  });
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret || "LOVIZA"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  await ok(
    await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-LOVIZA-signature": sig }, body }),
    "Your endpoint",
  );
  return { url };
}

/* --------------------------------- Medium -------------------------------- */
export async function mediumUser(token: string): Promise<{ id: string; username: string }> {
  const res = await ok(
    await fetch("https://api.medium.com/v1/me", { headers: { authorization: `Bearer ${token}` } }),
    "Medium",
  );
  return ((await res.json()) as { data: { id: string; username: string } }).data;
}

export async function publishMedium(token: string, post: BlogPost): Promise<{ url: string }> {
  const me = await mediumUser(token);
  const tags = (post.hashtags || "").split(/[\s,]+/).map((t) => t.replace(/^#/, "")).filter(Boolean).slice(0, 5);
  const res = await ok(
    await fetch(`https://api.medium.com/v1/users/${me.id}/posts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: post.title,
        contentFormat: "markdown",
        content: `# ${post.title}\n\n${post.body}`,
        tags,
        publishStatus: "public",
      }),
    }),
    "Medium",
  );
  return { url: ((await res.json()) as { data?: { url?: string } }).data?.url ?? "https://medium.com" };
}
