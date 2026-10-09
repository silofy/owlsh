import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WidgetWindow } from "../src/components/WidgetWindow";

describe("WidgetWindow (browser preview of the floating widget)", () => {
  const html = renderToStaticMarkup(<WidgetWindow />);

  it("shows the demo run's target, phase and stats", () => {
    expect(html).toContain("owlsh · Saltmarsh");
    expect(html).toContain("stealth");
    expect(html).toContain("finds");
  });

  it("offers the opt-in hint with its cost, and no close button outside the desktop app", () => {
    expect(html).toContain("[h] hint · costs independence");
    expect(html).not.toContain("Close widget");
  });

  it("marks the header as the window's drag region", () => {
    expect(html).toContain("data-tauri-drag-region");
  });
});

describe("WidgetWindow size switch", () => {
  const html = renderToStaticMarkup(<WidgetWindow />);
  it("offers small, medium and large, with medium selected by default", () => {
    expect(html).toContain('aria-label="Widget size"');
    expect(html).toMatch(/aria-pressed="true"[^>]*title="medium widget"/);
  });
});

describe("WidgetWindow opt-in for write-up lookup", () => {
  it("renders no opt-in prompt until a hint is pulled", () => {
    const html = renderToStaticMarkup(<WidgetWindow />);
    expect(html).not.toContain("Look up a write-up");
  });
});

describe("HintLine", () => {
  it("tags the source of an AI hint and shows a pending state", async () => {
    const { HintLine } = await import("../src/components/HintLine");
    expect(renderToStaticMarkup(<HintLine text="Re-read it." source="ai:golden" pending={false} />)).toContain("ai · write-up");
    expect(renderToStaticMarkup(<HintLine text="Re-read it." source="ai:knowledge" pending={false} />)).toContain("ai · model");
    expect(renderToStaticMarkup(<HintLine text="Re-read it." source="static" pending={false} />)).not.toContain("ai ·");
    expect(renderToStaticMarkup(<HintLine text={null} source={null} pending />)).toContain("thinking…");
  });
});
