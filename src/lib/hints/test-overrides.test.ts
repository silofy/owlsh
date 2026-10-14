import { afterEach, describe, it, expect } from "vitest";
import { testOverride } from "./test-overrides";

const g = globalThis as { __OWLSH_TEST__?: Record<string, unknown> };
afterEach(() => { delete g.__OWLSH_TEST__; });

describe("testOverride", () => {
  it("is undefined when the global is absent (production)", () => {
    expect(testOverride("hintTimeoutMs")).toBeUndefined();
    expect(testOverride("goldenBudgetMs")).toBeUndefined();
  });
  it("returns a finite positive number", () => {
    g.__OWLSH_TEST__ = { hintTimeoutMs: 300 };
    expect(testOverride("hintTimeoutMs")).toBe(300);
  });
  it.each([0, -5, NaN, Infinity, "300", null])("ignores %s", (v) => {
    g.__OWLSH_TEST__ = { hintTimeoutMs: v };
    expect(testOverride("hintTimeoutMs")).toBeUndefined();
  });
});
