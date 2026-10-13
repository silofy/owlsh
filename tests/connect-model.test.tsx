import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectModelPaths } from "../src/components/ConnectModelPaths";

describe("ConnectModelPaths", () => {
  const html = renderToStaticMarkup(<ConnectModelPaths />);
  it("lists MCP first, then Local, then API key", () => {
    const iMcp = html.indexOf("Claude plan");
    const iLocal = html.indexOf("Ollama");
    const iApi = html.search(/API key/i);
    expect(iMcp).toBeGreaterThanOrEqual(0);
    expect(iMcp).toBeLessThan(iLocal);
    expect(iLocal).toBeLessThan(iApi);
  });
  it("labels the API path as needing credits, not a subscription", () => {
    expect(html).toMatch(/credits/i);
  });
});
