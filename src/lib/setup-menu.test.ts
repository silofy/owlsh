import { describe, it, expect } from "vitest";
import { setupItems, setupIncomplete, setupItemTarget } from "./setup-menu";

describe("setupItems", () => {
  it("includes guide, ai, connector always; widget only on desktop", () => {
    expect(setupItems({ desktop: false }).map((i) => i.id)).toEqual(["guide", "ai", "connector"]);
    expect(setupItems({ desktop: true }).map((i) => i.id)).toEqual(["guide", "ai", "connector", "widget"]);
  });
});

describe("setupItemTarget", () => {
  it("maps each item to its wizard step / action", () => {
    expect(setupItemTarget("guide")).toEqual({ step: 0 });
    expect(setupItemTarget("ai")).toEqual({ step: 2 });
    expect(setupItemTarget("connector")).toEqual({ step: 1, jump: "connector" });
    expect(setupItemTarget("widget")).toEqual({ widget: true });
  });
});

describe("setupItems labels", () => {
  it("labels the ai item 'Connect a model'", () => {
    expect(setupItems({ desktop: false }).find((i) => i.id === "ai")?.label).toBe("Connect a model");
  });
});

describe("setupItems descriptions", () => {
  it("gives every item a non-empty one-line desc", () => {
    for (const it of setupItems({ desktop: true })) {
      expect(it.desc.trim().length).toBeGreaterThan(0);
      expect(it.desc).not.toContain("\n");
    }
    expect(setupItems({ desktop: true }).find((i) => i.id === "guide")?.desc).toBe("Walk through activation");
  });
});

describe("setupIncomplete", () => {
  it("is true until onboarded and a real capture exists", () => {
    expect(setupIncomplete({ onboarded: true, hasRealCapture: false })).toBe(true);
    expect(setupIncomplete({ onboarded: false, hasRealCapture: true })).toBe(true);
    expect(setupIncomplete({ onboarded: true, hasRealCapture: true })).toBe(false);
  });
});
