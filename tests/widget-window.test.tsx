import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WidgetWindow } from "../src/components/WidgetWindow";

describe("WidgetWindow (browser preview of the floating widget)", () => {
  const html = renderToStaticMarkup(<WidgetWindow />);

  it("shows the demo run's target, phase and stats", () => {
    expect(html).toContain("owlsh · Abducted");
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
