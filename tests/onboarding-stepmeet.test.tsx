import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StepMeet } from "../src/components/Onboarding";

describe("StepMeet", () => {
  const html = renderToStaticMarkup(<StepMeet />);
  it("no longer offers the 60-second demo", () => {
    expect(html).not.toMatch(/60-second demo/i);
    expect(html).not.toMatch(/streaming/i);
  });
});
