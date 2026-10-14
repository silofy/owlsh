/** Pure builders for the "Use your Claude plan" setup: what to paste into a Claude client so it launches `owlsh mcp`. */

import { isDesktop } from "../net";
import type { HintTier } from "../widget/hints";

/** Whether owlsh is registered with the user's Claude client and the client can reach it. */
export interface PlanStatus {
  registered: boolean;
  connected: boolean;
}

/**
 * The one line a `plan`-mode user pastes into their Claude/Gemini client to pull a graded hint: it
 * asks the client to call owlsh's `coach` tool, which reads the sanitized session and records the
 * pull (so the penalty still lands). Kept short and tier-aware, mirroring the widget's own escalation.
 */
export function coachInClientPrompt(tier: HintTier = 1): string {
  return `coach my current owlsh run, tier ${tier}`;
}

/**
 * Live "is my plan connected?" probe. Desktop-only: it asks the native side to run `claude mcp get
 * owlsh` and reports what it found. In a plain browser (or if the CLI is absent) it reports neither
 * registered nor connected, so the UI degrades to the "set it up" affordance rather than lying.
 */
export async function mcpPlanStatus(): Promise<PlanStatus> {
  if (!isDesktop()) return { registered: false, connected: false };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke("mcp_status")) as PlanStatus;
  } catch {
    return { registered: false, connected: false };
  }
}

/**
 * The absolute path to the owlsh MCP binary, so a copied registration command doesn't depend on
 * `owlsh` being on the user's PATH. Desktop-only; the browser (and any failure) falls back to the
 * bare name `owlsh`, which still works wherever it is on PATH.
 */
export async function owlshBinPath(): Promise<string> {
  if (!isDesktop()) return "owlsh";
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke("owlsh_bin_path")) as string;
  } catch {
    return "owlsh";
  }
}

/** Quote a command path for a shell one-liner only when it contains spaces. */
function shellArg(bin: string): string {
  return bin.includes(" ") ? `"${bin}"` : bin;
}

/** `claude_desktop_config.json` snippet that registers owlsh as an MCP server. */
export function mcpDesktopConfigSnippet(bin = "owlsh"): string {
  return JSON.stringify({ mcpServers: { owlsh: { command: bin, args: ["mcp"] } } }, null, 2);
}

/** One-liner that registers owlsh with Claude Code (at user scope, available in every project). */
export function mcpClaudeCodeCommand(bin = "owlsh"): string {
  return `claude mcp add owlsh --scope user -- ${shellArg(bin)} mcp`;
}

/** One-liner that registers owlsh with Gemini CLI. */
export function mcpGeminiCommand(bin = "owlsh"): string {
  return `gemini mcp add owlsh ${shellArg(bin)} mcp`;
}

/** `~/.gemini/settings.json` snippet that registers owlsh as an MCP server. */
export function mcpGeminiConfigSnippet(bin = "owlsh"): string {
  return JSON.stringify({ mcpServers: { owlsh: { command: bin, args: ["mcp"] } } }, null, 2);
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
