import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Server functions behind the Brand Profile page's Brand Brain features:
 *   scanBrandWebsite      read a website and suggest Brand Profile fields (nothing is saved)
 *   uploadBrandDocument   store a strategy or guidelines document for the Brand Brain to read
 *   listBrandDocuments / removeBrandDocument
 *   syncBrandKnowledge    read new uploads (a few at a time; call again while `remaining` > 0)
 *   getBrainStatus        what the Brand Brain has read, and how far its performance learning is
 */

const DOC_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
};
const DOC_EXT = /\.(pdf|docx|txt|md|markdown)$/i;
const DOC_MAX_BYTES = 3_000_000;
const DOC_MAX_COUNT = 10;

async function loadOwnBrand(userId: string, brandId?: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadBrand } = await import("@/lib/brand.server");
  const brand = await loadBrand(supabaseAdmin as never, userId, brandId ?? null);
  return { supabaseAdmin, brand };
}

export const scanBrandWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string; brandId?: string }) => input)
  .handler(async ({ data, context }) => {
    const { suggestProfileFromWebsite, saveWebsiteKnowledge } = await import("@/lib/brand-knowledge.server");
    const { suggestion, scan } = await suggestProfileFromWebsite(String(data.url ?? ""));

    // If the brand already exists, keep what the site says in the Brand Brain too.
    try {
      const { supabaseAdmin, brand } = await loadOwnBrand(context.userId, data.brandId);
      if (brand) await saveWebsiteKnowledge(supabaseAdmin, { id: brand.id, user_id: brand.user_id }, scan.siteUrl, suggestion.fields);
    } catch (error) {
      console.error("[brain] could not store the website scan", error instanceof Error ? error.message : error);
    }
    return suggestion;
  });

export interface BrandDocument {
  path: string;
  name: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  url: string | null;
}

export const listBrandDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string }) => input ?? {})
  .handler(async ({ data, context }): Promise<{ documents: BrandDocument[] }> => {
    const { supabaseAdmin, brand } = await loadOwnBrand(context.userId, data.brandId);
    if (!brand) return { documents: [] };
    const { knowledgeOverview } = await import("@/lib/brand-knowledge.server");
    const root = `${context.userId}/brand/${brand.id}/docs/`;
    const { data: files } = await supabaseAdmin.storage
      .from("content-media")
      .list(root.slice(0, -1), { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    const rows = await knowledgeOverview(supabaseAdmin, brand.id).catch(() => []);
    const byPath = new Map(rows.filter((r) => r.kind === "document").map((r) => [r.name, r]));
    const kept = (files ?? []).filter((f) => f.name && !f.name.startsWith("."));
    const { data: signed } = kept.length
      ? await supabaseAdmin.storage.from("content-media").createSignedUrls(kept.map((f) => `${root}${f.name}`), 60 * 60)
      : { data: [] as Array<{ path: string | null; signedUrl: string }> };
    const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    return {
      documents: kept.map((f) => {
        const name = f.name.replace(/^\d+-/, "");
        const row = byPath.get(name);
        return {
          path: `${root}${f.name}`,
          name,
          status: row?.status ?? "processing",
          error: row?.error ?? null,
          url: urlByPath.get(`${root}${f.name}`) ?? null,
        };
      }),
    };
  });

export const uploadBrandDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string; name: string; mime: string; base64: string }) => input)
  .handler(async ({ data, context }) => {
    const name = String(data.name ?? "document");
    const ext = DOC_TYPES[data.mime] ?? (DOC_EXT.test(name) ? name.split(".").pop()!.toLowerCase() : "");
    if (!ext || !DOC_EXT.test(`x.${ext}`)) throw new Error("Documents must be PDF, DOCX, TXT or MD files.");
    const bytes = Buffer.from(data.base64, "base64");
    if (!bytes.length || bytes.length > DOC_MAX_BYTES) throw new Error("Each document must be smaller than 3 MB.");

    const { supabaseAdmin, brand } = await loadOwnBrand(context.userId, data.brandId);
    if (!brand) throw new Error("Save your Brand Profile once, then upload documents.");

    // Read it now, so an unreadable file (a scanned PDF, a damaged Word file) is refused straight away.
    const { extractDocumentText } = await import("@/lib/brand-knowledge.server");
    const text = await extractDocumentText(new Uint8Array(bytes), `${name.replace(/\.[^.]+$/, "")}.${ext}`);

    const folder = `${context.userId}/brand/${brand.id}/docs`;
    const { data: existing } = await supabaseAdmin.storage.from("content-media").list(folder, { limit: DOC_MAX_COUNT + 1 });
    if ((existing ?? []).filter((f) => f.name && !f.name.startsWith(".")).length >= DOC_MAX_COUNT) {
      throw new Error(`You can keep up to ${DOC_MAX_COUNT} documents. Delete one first.`);
    }

    const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "document";
    const file = `${Date.now()}-${base}.${ext}`;
    const path = `${folder}/${file}`;
    const { error } = await supabaseAdmin.storage
      .from("content-media")
      .upload(path, bytes, { contentType: data.mime || "application/octet-stream", upsert: false });
    if (error) throw new Error(error.message);

    const { untyped } = await import("@/lib/untyped-db.server");
    const { error: rowError } = await untyped(supabaseAdmin).from("brand_knowledge").upsert(
      {
        brand_id: brand.id,
        user_id: context.userId,
        kind: "document",
        source_path: path,
        source_name: `${base}.${ext}`,
        status: "processing",
        error: null,
        text_content: text,
        progress: 0,
        analysis: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brand_id,kind,source_path" },
    );
    if (rowError) {
      await supabaseAdmin.storage.from("content-media").remove([path]);
      throw new Error("The Brand Brain tables are not set up yet. Run the brand_knowledge migration, then try again.");
    }
    return { path };
  });

export const removeBrandDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string; path: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, brand } = await loadOwnBrand(context.userId, data.brandId);
    if (!brand) return { ok: true };
    const folder = `${context.userId}/brand/${brand.id}/docs/`;
    if (!data.path.startsWith(folder)) throw new Error("Not your file.");
    await supabaseAdmin.storage.from("content-media").remove([data.path]);
    const { untyped } = await import("@/lib/untyped-db.server");
    await untyped(supabaseAdmin).from("brand_knowledge").delete().eq("brand_id", brand.id).eq("kind", "document").eq("source_path", data.path);
    // Touch the profile so the playbook is rebuilt without this document.
    await supabaseAdmin.from("brand_profiles").update({ updated_at: new Date().toISOString() }).eq("id", brand.id);
    return { ok: true };
  });

/** Reads new uploads. Cheap when there is nothing new. Call again while `remaining` is above zero. */
export const syncBrandKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, brand } = await loadOwnBrand(context.userId, data.brandId);
    if (!brand) return { changed: false, remaining: 0, failed: 0 };
    const { syncBrandKnowledge: sync } = await import("@/lib/brand-knowledge.server");
    try {
      return await sync(supabaseAdmin, { id: brand.id, user_id: brand.user_id, competitors: brand.competitors ?? "" });
    } catch (error) {
      console.error("[brain] knowledge sync failed", error instanceof Error ? error.message : error);
      throw new Error("The Brand Brain could not read your uploads just now. It will try again on the next change.");
    }
  });

export const getBrainStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, brand } = await loadOwnBrand(context.userId, data.brandId);
    if (!brand) return null;
    const { knowledgeOverview } = await import("@/lib/brand-knowledge.server");
    const { assessSignal, learningThresholds } = await import("@/lib/strategy-queue.server");

    const [knowledge, playbook, strategy, posted] = await Promise.all([
      knowledgeOverview(supabaseAdmin, brand.id).catch(() => []),
      supabaseAdmin.from("brand_playbooks" as never).select("playbook, updated_at").eq("brand_id", brand.id).maybeSingle(),
      supabaseAdmin
        .from("content_strategies")
        .select("week_start, week_end, insights, directives, created_at")
        .eq("brand_id", brand.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("content_items")
        .select("user_id, brand_id, scheduled_date, scheduled_time, type, title, status, platforms, impressions, clicks, engagements, metrics_updated_at")
        .eq("brand_id", brand.id)
        .eq("status", "posted")
        .gte("scheduled_date", new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)),
    ]);

    const pb = playbook.data as { playbook?: { pillars?: unknown[] }; updated_at?: string } | null;
    const signal = assessSignal((posted.data ?? []) as never);
    const need = learningThresholds();
    const last = strategy.data;
    return {
      playbook: { ready: !!pb?.playbook, pillars: pb?.playbook?.pillars?.length ?? 0, updatedAt: pb?.updated_at ?? null },
      knowledge,
      learning: {
        measuredPosts: signal.pieces,
        impressions: signal.impressions,
        needPosts: need.minPieces,
        needImpressions: need.minImpressions,
        enough: signal.enough,
        lastReview: last ? { weekEnd: last.week_end, insights: last.insights, directives: last.directives } : null,
      },
    };
  });
