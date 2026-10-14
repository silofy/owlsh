import type { CoachMode } from "./llm";

export type SetupItemId = "guide" | "ai" | "connector" | "widget";
export interface SetupItem { id: SetupItemId; label: string; desc: string }

export function setupItems(opts: { desktop: boolean }): SetupItem[] {
  const base: SetupItem[] = [
    { id: "guide", label: "Setup guide", desc: "Walk through activation" },
    { id: "ai", label: "Connect a model", desc: "Claude, Gemini or a local model" },
    { id: "connector", label: "VM connector", desc: "Pull captures from your attack VM" },
  ];
  return opts.desktop ? [...base, { id: "widget", label: "Open widget", desc: "Floating live window" }] : base;
}

export function setupItemTarget(id: SetupItemId): { step?: number; jump?: "connector"; widget?: boolean } {
  switch (id) {
    case "guide": return { step: 0 };
    case "ai": return { step: 2 };
    case "connector": return { step: 1, jump: "connector" };
    case "widget": return { widget: true };
  }
}

export function setupIncomplete(opts: { onboarded: boolean; hasRealCapture: boolean }): boolean {
  return !opts.onboarded || !opts.hasRealCapture;
}

/** Whether the chosen coaching model is actually usable, given resolved per-path flags. `rules` is
 *  deterministic, not a connected model, so it's never "connected". Pure, for the header chip + menu. */
export function modelConnected(
  mode: CoachMode,
  flags: { planConnected: boolean; localReady: boolean; hasKey: boolean },
): boolean {
  if (mode === "rules") return false;
  if (mode === "plan") return flags.planConnected;
  if (mode === "local") return flags.localReady;
  return flags.hasKey; // a cloud (API-key) mode
}

/** Short, human label for the active coaching model — what the header chip shows. */
export function coachModelLabel(mode: CoachMode): string {
  switch (mode) {
    case "plan": return "Claude plan";
    case "local": return "Local model";
    case "rules": return "Rules only";
    case "anthropic": return "Claude API";
    case "openai": return "ChatGPT API";
    case "gemini": return "Gemini API";
    case "openrouter": return "OpenRouter";
  }
}
