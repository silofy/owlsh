import { describe, it, expect } from "vitest";
import { mergePulls, isStaleResult, canPull } from "../src/lib/hints/widget-logic";
import type { HintPull } from "../src/types/report";

const p = (atMs: number): HintPull => ({ tier: 1, atMs, phase: "x" });

describe("mergePulls", () => {
  it("excludes local pulls already echoed back in the saved list", () => {
    expect(mergePulls([p(1), p(5)], [p(5), p(9)], true).map((x) => x.atMs)).toEqual([1, 5, 9]);
  });
  it("counts only local pulls when saved ones are not counted (browser demo)", () => {
    expect(mergePulls([p(1)], [p(9)], false).map((x) => x.atMs)).toEqual([9]);
  });
});

describe("isStaleResult", () => {
  it("drops a result whose session is no longer current", () => {
    expect(isStaleResult("a", "b")).toBe(true);
    expect(isStaleResult("a", null)).toBe(true);
    expect(isStaleResult("a", "a")).toBe(false);
  });
});

describe("canPull", () => {
  it("is false while pending", () => {
    expect(canPull({ desktop: false, path: null, pending: true })).toBe(false);
  });
  it("is false on desktop without a sidecar path", () => {
    expect(canPull({ desktop: true, path: null, pending: false })).toBe(false);
    expect(canPull({ desktop: true, path: "/s.json", pending: false })).toBe(true);
  });
  it("needs no path in the browser", () => {
    expect(canPull({ desktop: false, path: null, pending: false })).toBe(true);
  });
});
