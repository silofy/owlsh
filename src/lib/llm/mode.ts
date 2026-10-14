/**
 * The chosen coaching model, persisted locally. `plan` (the recommended path) coaches through the
 * user's own Claude/Gemini client over MCP — owlsh is the server, so it produces no hint in-app;
 * the client does. `local` tries Ollama and falls back to rules (offline-first); cloud modes are a
 * deliberate key-based opt-in. Default stays `local` so a fresh user with nothing installed still
 * gets a working offline fallback rather than a dead button.
 */
import type { CloudName } from "./cloud";

export type CoachMode = "rules" | "local" | "plan" | CloudName;

const KEY = "owlsh.coachMode";

export function getCoachMode(): CoachMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "rules" || v === "local" || v === "plan" || v === "anthropic" || v === "openai" || v === "gemini" || v === "openrouter") return v;
  } catch {
    /* no localStorage (SSR / tests) */
  }
  return "local";
}

export function setCoachMode(mode: CoachMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}

/** True for the modes that keep everything on the device (used to drive the offline/leaves-device UI). */
export function isOffline(mode: CoachMode): boolean {
  return mode === "rules" || mode === "local";
}
