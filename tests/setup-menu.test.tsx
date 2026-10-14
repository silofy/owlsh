import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SetupMenu } from "../src/components/SetupMenu";

describe("SetupMenu (closed state)", () => {
  const html = renderToStaticMarkup(<SetupMenu />);
  it("renders the Setup trigger and never inlines the wizard's config panels", () => {
    // positive anchor: the menu actually rendered
    expect(html).toContain("<button");
    expect(html).toContain("Setup");
    expect(html).toContain("<svg");
    // landmark strings confirmed in VmConnector.tsx / Onboarding.tsx StepAI (MCP card)
    expect(html).not.toContain("Auto-pull over SSH");
    expect(html).not.toContain("Use your Claude plan");
  });
});

import { modelConnected, coachModelLabel } from "../src/lib/setup-menu";

describe("modelConnected", () => {
  const off = { planConnected: false, localReady: false, hasKey: false };
  it("rules is never a connected model", () => { expect(modelConnected("rules", off)).toBe(false); });
  it("plan is connected only when the MCP registration is live", () => {
    expect(modelConnected("plan", off)).toBe(false);
    expect(modelConnected("plan", { ...off, planConnected: true })).toBe(true);
  });
  it("local is connected only when Ollama is ready", () => {
    expect(modelConnected("local", { ...off, localReady: true })).toBe(true);
  });
  it("a cloud mode is connected only with a key", () => {
    expect(modelConnected("anthropic", { ...off, hasKey: true })).toBe(true);
    expect(modelConnected("gemini", off)).toBe(false);
  });
});

describe("coachModelLabel", () => {
  it("names each mode in human terms", () => {
    expect(coachModelLabel("plan")).toBe("Claude plan");
    expect(coachModelLabel("local")).toBe("Local model");
    expect(coachModelLabel("rules")).toBe("Rules only");
    expect(coachModelLabel("anthropic")).toBe("Claude API");
  });
});
