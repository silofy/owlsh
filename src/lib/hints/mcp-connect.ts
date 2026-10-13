/** Pure builders for the "Use your Claude plan" setup: what to paste into a Claude client so it launches `owlsh mcp`. */

/** `claude_desktop_config.json` snippet that registers owlsh as an MCP server. */
export function mcpDesktopConfigSnippet(): string {
  return JSON.stringify({ mcpServers: { owlsh: { command: "owlsh", args: ["mcp"] } } }, null, 2);
}

/** One-liner that registers owlsh with Claude Code. */
export function mcpClaudeCodeCommand(): string {
  return "claude mcp add owlsh -- owlsh mcp";
}
