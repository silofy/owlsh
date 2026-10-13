/** Pure builders for the "Use your Claude plan" setup: what to paste into a Claude client so it launches `owlsh mcp`. */

/** `claude_desktop_config.json` snippet that registers owlsh as an MCP server. */
export function mcpDesktopConfigSnippet(): string {
  return JSON.stringify({ mcpServers: { owlsh: { command: "owlsh", args: ["mcp"] } } }, null, 2);
}

/** One-liner that registers owlsh with Claude Code. */
export function mcpClaudeCodeCommand(): string {
  return "claude mcp add owlsh -- owlsh mcp";
}

/** One-liner that registers owlsh with Gemini CLI. */
export function mcpGeminiCommand(): string {
  return "gemini mcp add owlsh owlsh mcp";
}

/** `~/.gemini/settings.json` snippet that registers owlsh as an MCP server. */
export function mcpGeminiConfigSnippet(): string {
  return JSON.stringify({ mcpServers: { owlsh: { command: "owlsh", args: ["mcp"] } } }, null, 2);
}

/** Clients the "Connect a model" step offers. ChatGPT only reaches remote MCP servers, so it stays advanced. */
export const MCP_CLIENTS: {
  id: "claude" | "gemini" | "chatgpt";
  label: string;
  tier: "first-class" | "advanced";
  note?: string;
  href?: string;
}[] = [
  { id: "claude", label: "Claude", tier: "first-class" },
  { id: "gemini", label: "Gemini", tier: "first-class" },
  {
    id: "chatgpt",
    label: "ChatGPT",
    tier: "advanced",
    note: "ChatGPT only connects to remote MCP servers — wrap `owlsh mcp` with OpenAI's Secure MCP Tunnel.",
    href: "https://platform.openai.com/docs/mcp",
  },
];
