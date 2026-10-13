import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StepCapture } from "../src/components/Onboarding";

describe("StepCapture", () => {
  it("includes the VM connector under All setup options", () => {
    const html = renderToStaticMarkup(<StepCapture />);
    expect(html).toContain("All setup options");
    expect(html).toContain("remote VM");
  });
});
