import type { CoachMode } from "../llm";

/** True when the active mode can't actually produce an AI hint (rules; local with Ollama down; cloud with no key). */
export function shouldPromptConnect(mode: CoachMode, ollamaReachable: boolean, hasKey: boolean): boolean {
  if (mode === "rules") return true;
  if (mode === "local") return !ollamaReachable;
  if (mode === "plan") return true; // owlsh never generates for `plan` — see connectCta for the real affordance
  return !hasKey; // a cloud mode needs a key
}

/**
 * What the hint surface shows *instead of* an in-widget AI hint, so `[h]` never dead-ends:
 * - `none` — the mode can generate in-app (local/cloud ready); the `[h]` button itself gives the AI hint.
 * - `coach-elsewhere` — `plan` mode with the MCP server connected: coaching happens in the user's
 *   Claude/Gemini client, so offer "Coach this run in Claude →" rather than a dead generate button.
 * - `connect` — nothing is wired up yet (rules, Ollama down, no key, or `plan` not yet registered):
 *   nudge the user to set a model up.
 *
 * `[h]` keeps working in every case — it always yields at least the deterministic static hint; this
 * only decides the secondary affordance line.
 */
export type ConnectCta = "none" | "connect" | "coach-elsewhere";

export function connectCta(
  mode: CoachMode,
  flags: { ollamaReachable: boolean; hasKey: boolean; planConnected: boolean },
): ConnectCta {
  if (mode === "plan") return flags.planConnected ? "coach-elsewhere" : "connect";
  return shouldPromptConnect(mode, flags.ollamaReachable, flags.hasKey) ? "connect" : "none";
}
