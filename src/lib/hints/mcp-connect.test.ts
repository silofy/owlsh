import { describe, it, expect } from "vitest";
import { mcpDesktopConfigSnippet, mcpClaudeCodeCommand } from "./mcp-connect";

describe("mcp connect", () => {
  it("emits a valid claude_desktop_config snippet for owlsh", () => {
    const cfg = JSON.parse(mcpDesktopConfigSnippet());
    expect(cfg.mcpServers.owlsh.command).toBe("owlsh");
    expect(cfg.mcpServers.owlsh.args).toEqual(["mcp"]);
  });
  it("emits the claude code add command", () => {
    expect(mcpClaudeCodeCommand()).toBe("claude mcp add owlsh -- owlsh mcp");
  });
});
