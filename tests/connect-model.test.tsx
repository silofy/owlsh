import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectModelPaths } from "../src/components/ConnectModelPaths";

describe("ConnectModelPaths", () => {
  const html = renderToStaticMarkup(<ConnectModelPaths />);
  it("lists MCP first, then Local", () => {
    const iMcp = html.indexOf("Claude plan");
    const iLocal = html.indexOf("Ollama");
    expect(iMcp).toBeGreaterThanOrEqual(0);
    expect(iMcp).toBeLessThan(iLocal);
  });
  it("hides the API-key path until the MCP connector ships", () => {
    // The API-key card (heading + "needs separate API credits" copy) is gone. The MCP card's own
    // "not API credits" selling point is fine, so assert the card, not the word "credits" outright.
    expect(html).not.toMatch(/API key/i);
    expect(html).not.toMatch(/separate API credits/i);
  });
});
