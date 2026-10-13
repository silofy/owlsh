import { describe, it, expect } from "vitest";
import { setupItems, setupIncomplete } from "./setup-menu";

describe("setupItems", () => {
  it("includes guide, ai, connector always; widget only on desktop", () => {
    expect(setupItems({ desktop: false }).map((i) => i.id)).toEqual(["guide", "ai", "connector"]);
    expect(setupItems({ desktop: true }).map((i) => i.id)).toEqual(["guide", "ai", "connector", "widget"]);
  });
});

describe("setupIncomplete", () => {
  it("is true until onboarded and a real capture exists", () => {
    expect(setupIncomplete({ onboarded: true, hasRealCapture: false })).toBe(true);
    expect(setupIncomplete({ onboarded: false, hasRealCapture: true })).toBe(true);
    expect(setupIncomplete({ onboarded: true, hasRealCapture: true })).toBe(false);
  });
});
