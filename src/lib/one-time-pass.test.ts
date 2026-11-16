import { describe, expect, it } from "vitest";
import { getGenerationEntitlement, usersWithAccess } from "@/lib/generation-entitlements";

/** Tiny chainable stand-in for the Supabase client: every table returns the rows given. */
function fakeClient(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const q: Record<string, unknown> = {};
      const chain = () => q;
      for (const m of ["select", "eq", "in", "gt", "order", "limit"]) q[m] = chain;
      q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
      return q;
    },
  } as never;
}

const future = new Date(Date.now() + 3 * 86_400_000).toISOString();

describe("one-time pass entitlement", () => {
  it("no plan and no pass still says Upgrade Plan", async () => {
    const db = fakeClient({ profiles: [{ email: "a@b.c" }] });
    await expect(getGenerationEntitlement(db, "u1")).rejects.toThrow("Upgrade Plan");
  });

  it("no plan but a paid pass gives a limited, no-autopost entitlement", async () => {
    const db = fakeClient({
      profiles: [{ email: "a@b.c" }],
      one_time_passes: [{ id: "p1", expires_at: future, used_at: null }],
    });
    const e = await getGenerationEntitlement(db, "u1");
    expect(e.plan.autoPost).toBe(false);
    expect(e.plan.name).toBe("One-time week");
    expect(e.oneTimePass).toEqual({ id: "p1", expiresAt: future, usedAt: null });
    expect(e.isRoot).toBe(false);
  });

  it("a used pass is still returned, flagged as used", async () => {
    const used = new Date().toISOString();
    const db = fakeClient({
      profiles: [{ email: "a@b.c" }],
      one_time_passes: [{ id: "p1", expires_at: future, used_at: used }],
    });
    const e = await getGenerationEntitlement(db, "u1");
    expect(e.oneTimePass?.usedAt).toBe(used);
  });

  it("pass holders count as having access for background jobs", async () => {
    const db = fakeClient({
      subscriptions: [],
      profiles: [{ id: "u1", email: "a@b.c" }],
      one_time_passes: [{ user_id: "u1" }],
    });
    expect((await usersWithAccess(db, ["u1"])).has("u1")).toBe(true);
  });
});
