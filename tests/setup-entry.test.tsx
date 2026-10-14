import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../src/App";
import { StepCapture } from "../src/components/Onboarding";

describe("setup has one entry point: the wizard", () => {
  it("has no Install tab", () => {
    expect(renderToStaticMarkup(<App />)).not.toMatch(/>Install</);
  });

  it("shows the capture path chooser", () => {
    const html = renderToStaticMarkup(<StepCapture />);
    for (const s of ["On your own machine", "In a remote VM", "curl -fsSL https://raw.githubusercontent.com/silofy/owlsh/main/install.sh | sh"]) {
      expect(html).toContain(s);
    }
  });
});
