import { describe, it, expect } from "vitest";
import { buildHintPrompt, generateHint } from "./ai-hint";
import { hintFor } from "../widget/hints";
import type { LlmProvider } from "../llm/provider";
import type { Episode, GoldenObjective } from "../../types/report";

const ep = (seq: number, cmd: string, out = ""): Episode => ({ seq, cmd, binary: cmd.split(" ")[0], duration_ms: 0, actor: "human_active", output_digest: out, tactic: "TA0007" } as Episode);
const golden: GoldenObjective[] = [{ objective: "access_widgetsvc", tactic: "TA0001", satisfied_by: ["widgettool"], user_satisfied_by_seq: null }];
const stub = (reply: unknown, delayMs = 0): LlmProvider => ({
  name: "stub",
  available: async () => true,
  generateJson: () => new Promise((r) => setTimeout(() => r(reply), delayMs)),
});
const base = { tier: 1 as const, box: "Demo", platform: "htb", episodes: [ep(1, "ls -la", "notes.txt")], golden };

describe("buildHintPrompt", () => {
  it("includes recent steps, tier rule and objective status but never a write-up body", () => {
    const p = buildHintPrompt(base);
    expect(p).toContain("ls -la");
    expect(p).toMatch(/UNSATISFIED/);
    expect(p).toContain("access_widgetsvc");
    expect(p).toMatch(/at most 30 words/i);
  });
  it("asks for model knowledge when there is no golden path", () => {
    expect(buildHintPrompt({ ...base, golden: null })).toMatch(/own knowledge of Demo/);
  });
  it("keeps only the last 20 steps", () => {
    const many = Array.from({ length: 30 }, (_, i) => ep(i, `cmd${i}`));
    const p = buildHintPrompt({ ...base, episodes: many });
    expect(p).not.toContain('"cmd9"');
    expect(p).toContain('"cmd29"');
  });
});

describe("generateHint", () => {
  it("returns the guarded AI text tagged by source", async () => {
    const r = await generateHint(base, stub({ hint: "Re-read your last output for something unexplored.", kind: "process" }));
    expect(r).toEqual({ text: "Re-read your last output for something unexplored.", source: "ai:golden" });
    const k = await generateHint({ ...base, golden: null }, stub({ hint: "Slow down and list what you know.", kind: "process" }));
    expect(k.source).toBe("ai:knowledge");
  });
  it.each([
    ["null reply", null],
    ["bad shape", { nope: 1 }],
    ["guard block", { hint: "Try widgettool now.", kind: "process" }],
  ])("falls back to the static hint on %s", async (_, reply) => {
    expect(await generateHint(base, stub(reply))).toEqual({ text: hintFor(1), source: "static" });
  });
  it("falls back on timeout", async () => {
    expect(await generateHint(base, stub({ hint: "late", kind: "process" }, 50), 10)).toEqual({ text: hintFor(1), source: "static" });
  });
  it("falls back when the provider throws", async () => {
    const boom: LlmProvider = { name: "x", available: async () => true, generateJson: async () => { throw new Error("x"); } };
    expect((await generateHint(base, boom)).source).toBe("static");
  });
  it("uses the test override for the timeout when set", async () => {
    (globalThis as { __OWLSH_TEST__?: object }).__OWLSH_TEST__ = { hintTimeoutMs: 10 };
    try {
      expect(await generateHint(base, stub({ hint: "late", kind: "process" }, 50))).toEqual({ text: hintFor(1), source: "static" });
    } finally {
      delete (globalThis as { __OWLSH_TEST__?: object }).__OWLSH_TEST__;
    }
  });
});
