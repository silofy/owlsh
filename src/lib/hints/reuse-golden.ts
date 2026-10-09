import { useEffect } from "react";
import { useReport } from "../../store/report";
import type { HintGolden, OwlshReport } from "../../types/report";

/** The golden path the live hints already resolved, when it is safe to apply without a paste. */
export function hintGoldenToApply(report: OwlshReport, writeup: { source: string; confidence: number } | null): HintGolden | null {
  const g = report.hint_golden;
  if (!g || g.source === "none" || g.golden.length === 0) return null;
  if (report.golden_dag.length > 0 || writeup) return null;
  return g;
}

/**
 * Applies the hint-resolved golden path (`<report>.golden`) once per mount/session, so the debrief
 * needs no paste. Deps are intentionally just the session uuid: re-running on every report/writeup
 * change would fight a user's later manual write-up choice.
 */
export function useReuseHintGolden() {
  const { report, applyGoldenDag, writeup } = useReport();
  useEffect(() => {
    const g = hintGoldenToApply(report, writeup);
    if (g) applyGoldenDag(g.golden, { source: g.source, confidence: g.confidence });
  }, [report.session.uuid]);
}
