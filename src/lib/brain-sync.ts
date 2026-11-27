import type { QueryClient } from "@tanstack/react-query";
import { refreshBrandPlaybook } from "@/lib/brand-brain.functions";
import { syncBrandKnowledge } from "@/lib/brand-knowledge.functions";

/*
 * After anything is uploaded or deleted, the Brand Brain reads it (a few sources per call, a long
 * document one piece per step), then the playbook is rebuilt once. Runs are queued so two uploads
 * never read the same file twice.
 */
let chain: Promise<void> = Promise.resolve();

export function syncBrain(brandId: string | undefined, qc: QueryClient): Promise<void> {
  if (!brandId) return Promise.resolve();
  const run = async () => {
    try {
      let guard = 0;
      for (;;) {
        const r = await syncBrandKnowledge({ data: { brandId } });
        void qc.invalidateQueries({ queryKey: ["brain-status"] });
        void qc.invalidateQueries({ queryKey: ["brand-documents"] });
        guard += 1;
        if (r.remaining <= 0 || guard > 60) break;
      }
      await refreshBrandPlaybook({ data: { brandId } }).catch(() => undefined);
    } catch (error) {
      console.error("[brain] sync failed", error);
    } finally {
      void qc.invalidateQueries({ queryKey: ["brain-status"] });
      void qc.invalidateQueries({ queryKey: ["brand-documents"] });
    }
  };
  chain = chain.then(run, run);
  return chain;
}
