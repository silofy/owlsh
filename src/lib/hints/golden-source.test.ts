import { describe, it, expect, vi } from "vitest";
import { resolveGolden, NONE, type GoldenDeps } from "./golden-source";

const G = { source: "0xdf", confidence: 0.8, golden: [{ objective: "a", tactic: "TA0001", satisfied_by: [] }] };
const deps = (o: Partial<GoldenDeps> = {}): GoldenDeps => ({
  fetch0xdf: vi.fn(async () => "text"),
  fetchHtb: vi.fn(async () => "official"),
  hasHtbToken: vi.fn(async () => false),
  extract: vi.fn(async (_t, _b, source) => ({ ...G, source })),
  ...o,
});

describe("resolveGolden", () => {
  it("prefers HTB official when a token is set", async () => {
    const d = deps({ hasHtbToken: async () => true });
    expect((await resolveGolden({ platform: "htb", name: "Demo" }, d)).source).toBe("htb-official");
    expect(d.fetch0xdf).not.toHaveBeenCalled();
  });
  it("falls back to 0xdf", async () => {
    expect((await resolveGolden({ platform: "htb", name: "Demo" }, deps())).source).toBe("0xdf");
  });
  it("falls through to 0xdf when the official fetch fails", async () => {
    const d = deps({ hasHtbToken: async () => true, fetchHtb: async () => { throw new Error("not retired"); } });
    expect((await resolveGolden({ platform: "htb", name: "Demo" }, d)).source).toBe("0xdf");
  });
  it("returns NONE when every source misses or extraction is empty", async () => {
    const d = deps({ fetch0xdf: async () => { throw new Error("no post"); } });
    expect(await resolveGolden({ platform: "htb", name: "Demo" }, d)).toEqual(NONE);
    expect(await resolveGolden({ platform: "htb", name: "Demo" }, deps({ extract: async () => null }))).toEqual(NONE);
  });
  it("never looks anything up for non-HTB platforms", async () => {
    const d = deps();
    expect(await resolveGolden({ platform: "thm", name: "Room" }, d)).toEqual(NONE);
    expect(d.fetch0xdf).not.toHaveBeenCalled();
  });
  it("returns NONE when the budget runs out", async () => {
    const slow = deps({ fetch0xdf: () => new Promise((r) => setTimeout(() => r("t"), 50)) });
    expect(await resolveGolden({ platform: "htb", name: "Demo" }, slow, 10)).toEqual(NONE);
  });
});
