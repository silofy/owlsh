import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StepAI } from "../src/components/Onboarding";

describe("StepAI", () => {
  const html = renderToStaticMarkup(<StepAI />);
  it("offers MCP (your Claude plan) and Local, not an API-key field", () => {
    expect(html).toContain("Claude plan");
    expect(html).toContain("Ollama");
    expect(html).not.toMatch(/API key/i);
  });
  it("shows the MCP add command", () => {
    expect(html).toContain("claude mcp add owlsh -- owlsh mcp");
  });
  it("offers Claude, Gemini and ChatGPT, plus Local; no API-key field", () => {
    expect(html).toMatch(/Claude/);
    expect(html).toMatch(/Gemini/);
    expect(html).toMatch(/ChatGPT/);
    expect(html).toMatch(/Ollama/);
    expect(html).not.toMatch(/API key/i);
  });
  it("marks ChatGPT as advanced (needs a tunnel)", () => {
    expect(html).toMatch(/advanced/i);
    expect(html).toMatch(/tunnel/i);
  });
});
