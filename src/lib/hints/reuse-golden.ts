import type { HintGolden, OwlshReport } from "../../types/report";
import { isLiveRecording } from "../live";

/**
 * The golden path the live hints already resolved, when it is safe to apply without a paste.
 * Never while the session is live: applying it makes the report render objectives, which would
 * show the user the intended path mid-run.
 */
export function hintGoldenToApply(report: OwlshReport, writeup: { source: string; confidence: number } | null, nowMs: number = Date.now()): HintGolden | null {
  if (isLiveRecording(report, nowMs)) return null;
  const g = report.hint_golden;
  if (!g || g.source === "none" || g.golden.length === 0) return null;
  if (report.golden_dag.length > 0 || writeup) return null;
  return g;
}
