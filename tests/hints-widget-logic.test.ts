import { describe, it, expect } from "vitest";
import { shouldAskLookup, reportForPull } from "../src/lib/hints/widget-logic";
import type { HintGolden, OwlshReport } from "../src/types/report";

const g = (s: string): HintGolden => ({ source: "htb", confidence: 1, golden: [s] }) as unknown as HintGolden;
const rep = (uuid: string, hint_golden?: HintGolden) => ({ session: { uuid }, hint_golden }) as unknown as OwlshReport;

describe("shouldAskLookup", () => {
  it("asks only on desktop, HTB, with the pref unset", () => {
    expect(shouldAskLookup(true, "unset", "htb")).toBe(true);
    expect(shouldAskLookup(false, "unset", "htb")).toBe(false);
    expect(shouldAskLookup(true, "on", "htb")).toBe(false);
    expect(shouldAskLookup(true, "off", "htb")).toBe(false);
    expect(shouldAskLookup(true, "unset", "thm")).toBe(false);
  });
});

describe("reportForPull", () => {
  it("applies the saved golden only for the matching session", () => {
    expect(reportForPull(rep("a"), { uuid: "a", golden: g("x") }).hint_golden).toEqual(g("x"));
    expect(reportForPull(rep("b"), { uuid: "a", golden: g("x") }).hint_golden).toBeUndefined();
  });
  it("never overrides an existing hint_golden, and passes through with nothing saved", () => {
    expect(reportForPull(rep("a", g("own")), { uuid: "a", golden: g("x") }).hint_golden).toEqual(g("own"));
    const r = rep("a");
    expect(reportForPull(r, null)).toBe(r);
  });
});
