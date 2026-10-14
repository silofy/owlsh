import { useEffect, useState } from "react";
import { useReport } from "../store/report";
import { isDesktop } from "../lib/net";
import { getCoachMode, llmStatus, nextSetupStep, hasApiKey, type CoachMode, type CloudName } from "../lib/llm";
import { mcpPlanStatus } from "../lib/hints/mcp-connect";
import { modelConnected, coachModelLabel } from "../lib/setup-menu";

const CLOUD = new Set<CoachMode>(["anthropic", "openai", "gemini", "openrouter"]);

export interface CoachStatus {
  mode: CoachMode;
  connected: boolean;
  label: string;
}

/**
 * Probe whether the *active* coaching model is actually connected — plan via the MCP registration,
 * local via a reachable Ollama with the model pulled, or a cloud mode via a stored key. Re-runs when
 * `pollKey` changes, so callers can refresh it (e.g. when the setup wizard closes). Any probe failure
 * resolves to "not connected" rather than throwing.
 */
export function useCoachStatus(pollKey?: unknown): CoachStatus {
  const [state, setState] = useState<{ mode: CoachMode; connected: boolean }>(() => ({ mode: getCoachMode(), connected: false }));
  useEffect(() => {
    let alive = true;
    (async () => {
      const mode = getCoachMode();
      const flags = { planConnected: false, localReady: false, hasKey: false };
      if (mode === "plan") flags.planConnected = (await mcpPlanStatus()).connected;
      else if (mode === "local") { const s = await llmStatus(); flags.localReady = nextSetupStep(s, { isDesktop: isDesktop() }) === "ready"; }
      else if (CLOUD.has(mode)) flags.hasKey = await hasApiKey(mode as CloudName);
      if (alive) setState({ mode, connected: modelConnected(mode, flags) });
    })().catch(() => {});
    return () => { alive = false; };
  }, [pollKey]);
  return { ...state, label: coachModelLabel(state.mode) };
}

/**
 * Header chip: always shows which coaching model is active and whether it's connected (green dot =
 * connected, amber = picked but not reachable, faint = rules only). Clicking jumps to the
 * "Connect a model" wizard step.
 */
export function CoachStatusChip() {
  const { onboardingOpen, openOnboarding, setOnboardingStep } = useReport();
  // Re-probe when the wizard closes — a connection may have just been made.
  const { mode, connected, label } = useCoachStatus(onboardingOpen);
  const dot = mode === "rules" ? "var(--color-faint)" : connected ? "var(--color-signal)" : "var(--color-stuck)";
  const state = mode === "rules" ? "rules only, no model" : connected ? "connected" : "needs setup";
  return (
    <button
      type="button"
      onClick={() => { setOnboardingStep(2); openOnboarding(); }}
      title={`Coaching model: ${label} — ${state}`}
      className="label inline-flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1.5 text-muted transition-colors hover:border-muted hover:bg-panel-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/70"
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      <span className="text-fg">{label}</span>
      {!connected && mode !== "rules" && <span className="text-faint">· setup</span>}
    </button>
  );
}
