import type { CoachMode } from "../llm";

/** True when the active mode can't actually produce an AI hint (rules; local with Ollama down; cloud with no key). */
export function shouldPromptConnect(mode: CoachMode, ollamaReachable: boolean, hasKey: boolean): boolean {
  if (mode === "rules") return true;
  if (mode === "local") return !ollamaReachable;
  return !hasKey; // a cloud mode needs a key
}
