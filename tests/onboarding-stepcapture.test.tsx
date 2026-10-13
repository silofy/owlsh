import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StepCapture } from "../src/components/Onboarding";

describe("StepCapture", () => {
  it("offers the where-do-you-hack chooser with the own-machine path by default", () => {
    const html = renderToStaticMarkup(<StepCapture />);
    expect(html).toContain("On your own machine");
    expect(html).toContain("In a remote VM");
    // static markup HTML-escapes the <box> placeholder
    expect(html).toContain("owlsh --attach --platform htb --target &lt;box&gt;");
  });
});
