import { describe, it, expect, vi } from "vitest";
import { runHintPull, createPuller, type PullDeps } from "./pull";
import { hintFor } from "../widget/hints";
import { NONE } from "./golden-source";
import fixture from "../../../fixtures/session-htb-easy.json";
import type { OwlshReport, HintGolden } from "../../types/report";

const report = fixture as unknown as OwlshReport;
const G: HintGolden = { source: "0xdf", confidence: 0.8, golden: [{ objective: "access_widgetsvc", tactic: "TA0001", satisfied_by: [], user_satisfied_by_seq: null }] };
const okProvider = { name: "s", available: async () => true, generateJson: async () => ({ hint: "List what you know so far and pick the thinnest lead.", kind: "process" }) };
const leakyProvider = { ...okProvider, generateJson: async () => ({ hint: "Visit http://example.test now.", kind: "process" }) };
const deps = (o: Partial<PullDeps> = {}): PullDeps => ({
  provider: async () => okProvider,
  lookupPref: () => "on",
  resolveGolden: vi.fn(async () => G),
  saveGolden: vi.fn(async () => {}),
  record: vi.fn(async () => {}),
  ...o,
});

describe("runHintPull", () => {
  it("resolves, caches and uses the golden path when opted in", async () => {
    const d = deps();
    const r = await runHintPull(report, [], d, 1000);
    expect(d.resolveGolden).toHaveBeenCalledOnce();
    expect(d.saveGolden).toHaveBeenCalledWith(G);
    expect(r.pull).toMatchObject({ tier: 1, atMs: 1000, source: "ai:golden" });
    expect(d.record).toHaveBeenCalledWith(r.pull);
  });
  it("reuses a cached golden path and never re-resolves a cached miss", async () => {
    const d = deps();
    await runHintPull({ ...report, hint_golden: G }, [], d);
    await runHintPull({ ...report, hint_golden: NONE }, [], d);
    expect(d.resolveGolden).not.toHaveBeenCalled();
  });
  it("does no lookup when the opt-in is off or unset, and uses model knowledge", async () => {
    for (const pref of ["off", "unset"] as const) {
      const d = deps({ lookupPref: () => pref });
      const r = await runHintPull(report, [], d);
      expect(d.resolveGolden).not.toHaveBeenCalled();
      expect(r.pull.source).toBe("ai:knowledge");
    }
  });
  it("shows and records the static hint when the guard blocks", async () => {
    const d = deps({ provider: async () => leakyProvider });
    const r = await runHintPull({ ...report, hint_golden: G }, [], d);
    expect(r.text).toBe(hintFor(1));
    expect(r.pull.source).toBe("static");
    expect(d.record).toHaveBeenCalledOnce();
  });
  it("escalates the tier from earlier pulls", async () => {
    const r = await runHintPull(report, [{ tier: 1, atMs: 1, phase: "x" }], deps());
    expect(r.pull.tier).toBe(2);
  });
  it("still returns text when recording fails", async () => {
    const r = await runHintPull(report, [], deps({ record: async () => { throw new Error("disk"); } }));
    expect(r.text.length).toBeGreaterThan(0);
  });
});

describe("runHintPull failure paths", () => {
  it("falls back to static and records when provider() rejects", async () => {
    const d = deps({ provider: async () => { throw new Error("no provider"); } });
    const r = await runHintPull(report, [], d);
    expect(r.text).toBe(hintFor(1));
    expect(r.pull.source).toBe("static");
    expect(d.record).toHaveBeenCalledWith(r.pull);
  });
  it("returns {text, pull} when record throws synchronously", async () => {
    const r = await runHintPull(report, [], deps({ record: (() => { throw new Error("sync"); }) as never }));
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.pull.tier).toBe(1);
  });
  it("keeps the resolved golden when saveGolden throws synchronously", async () => {
    const r = await runHintPull(report, [], deps({ saveGolden: (() => { throw new Error("sync"); }) as never }));
    expect(r.pull.source).toBe("ai:golden");
  });
  it("shows static and records for a malformed report", async () => {
    const d = deps();
    const bad = { session: null, episodes: null } as unknown as OwlshReport;
    const r = await runHintPull(bad, [], d);
    expect(r.text).toBe(hintFor(1));
    expect(r.pull.source).toBe("static");
    expect(d.record).toHaveBeenCalledOnce();
  });
});

describe("createPuller", () => {
  it("ignores a second pull while the first is pending", async () => {
    let release!: () => void;
    const slow = { ...okProvider, generateJson: () => new Promise((r) => { release = () => r({ hint: "Slow down and re-read.", kind: "process" }); }) };
    const d = deps({ provider: async () => slow });
    const p = createPuller(d);
    const first = p.pull(report, []);
    expect(await p.pull(report, [])).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    release();
    expect(await first).not.toBeNull();
    expect(d.record).toHaveBeenCalledOnce();
  });
});
