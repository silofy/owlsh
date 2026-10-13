import { describe, it, expect } from "vitest";
import {
  mcpDesktopConfigSnippet,
  mcpClaudeCodeCommand,
  mcpGeminiCommand,
  mcpGeminiConfigSnippet,
  MCP_CLIENTS,
} from "./mcp-connect";

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

describe("mcp clients", () => {
  it("gemini + claude add-commands are exact", () => {
    expect(mcpClaudeCodeCommand()).toBe("claude mcp add owlsh -- owlsh mcp");
    expect(mcpGeminiCommand()).toBe("gemini mcp add owlsh owlsh mcp");
  });
  it("gemini config snippet is valid and points owlsh at mcp", () => {
    const c = JSON.parse(mcpGeminiConfigSnippet());
    expect(c.mcpServers.owlsh).toEqual({ command: "owlsh", args: ["mcp"] });
  });
  it("claude+gemini are first-class, chatgpt is advanced with a note", () => {
    const by = Object.fromEntries(MCP_CLIENTS.map((c) => [c.id, c]));
    expect(by.claude.tier).toBe("first-class");
    expect(by.gemini.tier).toBe("first-class");
    expect(by.chatgpt.tier).toBe("advanced");
    expect(by.chatgpt.note).toMatch(/tunnel/i);
  });
});
