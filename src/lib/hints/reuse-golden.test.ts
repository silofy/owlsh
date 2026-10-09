import { describe, it, expect } from "vitest";
import { hintGoldenToApply } from "./reuse-golden";
import type { GoldenObjective, OwlshReport } from "../../types/report";

const obj: GoldenObjective[] = [{ objective: "o", tactic: "TA0001", satisfied_by: ["x"], user_satisfied_by_seq: null }];
const rep = (over: Partial<OwlshReport>): OwlshReport => ({ golden_dag: [], ...over }) as OwlshReport;
const hg = { source: "0xdf", confidence: 0.8, golden: obj };

describe("hintGoldenToApply", () => {
  it("returns a real resolved golden", () => {
    expect(hintGoldenToApply(rep({ hint_golden: hg }), null)).toBe(hg);
  });
  it("skips a cached miss, even with a non-empty golden", () => {
    expect(hintGoldenToApply(rep({ hint_golden: { ...hg, golden: [] , source: "none" } }), null)).toBeNull();
    expect(hintGoldenToApply(rep({ hint_golden: { ...hg, source: "none" } }), null)).toBeNull();
  });
  it("skips an empty golden", () => {
    expect(hintGoldenToApply(rep({ hint_golden: { ...hg, golden: [] } }), null)).toBeNull();
  });
  it("skips when golden_dag is already populated", () => {
    expect(hintGoldenToApply(rep({ hint_golden: hg, golden_dag: obj }), null)).toBeNull();
  });
  it("skips when a write-up is applied", () => {
    expect(hintGoldenToApply(rep({ hint_golden: hg }), { source: "pasted", confidence: 0.7 })).toBeNull();
  });
  it("skips when hint_golden is absent", () => {
    expect(hintGoldenToApply(rep({}), null)).toBeNull();
  });
});
