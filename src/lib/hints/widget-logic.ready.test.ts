import { describe, it, expect } from "vitest";
import { isReady } from "./widget-logic";

describe("isReady", () => {
  it("browser is always ready", () => expect(isReady({ desktop: false, path: null })).toBe(true));
  it("desktop needs a path", () => {
    expect(isReady({ desktop: true, path: null })).toBe(false);
    expect(isReady({ desktop: true, path: "/s.json" })).toBe(true);
  });
});
