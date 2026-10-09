/**
 * One hint pull, surface-agnostic: tier → golden (cached / opt-in lookup) → guarded AI text → record.
 * The widget, the live dashboard and the terminal widget all go through here so a pull counts once.
 */
import type { LlmProvider } from "../llm/provider";
import type { HintGolden, HintPull, OwlshReport } from "../../types/report";
import { nextTier } from "../widget/hints";
import { deriveWidgetState } from "../widget/state";
import { targetOf } from "../platform";
import { generateHint } from "./ai-hint";
import type { LookupPref } from "./golden-source";

export interface PullDeps {
  provider(): Promise<LlmProvider>;
  lookupPref(): LookupPref;
  resolveGolden(target: { platform: string; name: string }): Promise<HintGolden>;
  saveGolden(g: HintGolden): Promise<void>;
  record(pull: HintPull): Promise<void>;
}

async function goldenFor(report: OwlshReport, deps: PullDeps): Promise<HintGolden | null> {
  const cached = report.hint_golden;
  if (cached) return cached.golden.length ? cached : null;
  if (deps.lookupPref() !== "on") return null;
  const g = await deps.resolveGolden(targetOf(report));
  await deps.saveGolden(g).catch(() => {});
  return g.golden.length ? g : null;
}

export async function runHintPull(report: OwlshReport, pulls: HintPull[], deps: PullDeps, now = Date.now()): Promise<{ text: string; pull: HintPull }> {
  const tier = nextTier(pulls);
  const golden = await goldenFor(report, deps).catch(() => null);
  const target = targetOf(report);
  const { text, source } = await generateHint(
    { tier, box: target.name, platform: target.platform, episodes: report.episodes, golden: golden?.golden ?? null },
    await deps.provider(),
  );
  const pull: HintPull = { tier, atMs: now, phase: deriveWidgetState(report, now).phase, source };
  await deps.record(pull).catch(() => {});
  return { text, pull };
}

export function createPuller(deps: PullDeps) {
  let busy = false;
  return {
    async pull(report: OwlshReport, pulls: HintPull[]) {
      if (busy) return null;
      busy = true;
      try {
        return await runHintPull(report, pulls, deps);
      } finally {
        busy = false;
      }
    },
  };
}
