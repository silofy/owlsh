import { useEffect } from "react";
import { useReport } from "../store/report";
import { hintGoldenToApply } from "../lib/hints/reuse-golden";

/**
 * Applies the hint-resolved golden path (`<report>.golden`) so the debrief needs no paste. It never
 * applies while the capture is recording (that would reveal the objectives mid-run); it runs when the
 * session changes and again when recording ends. Deps are intentionally just `[uuid, recording]`:
 * re-running on every report/writeup change would fight a user's later manual write-up choice.
 */
export function useReuseHintGolden() {
  const { report, applyGoldenDag, writeup } = useReport();
  const recording = report.recording;
  useEffect(() => {
    const g = hintGoldenToApply(report, writeup);
    if (g) applyGoldenDag(g.golden, { source: g.source, confidence: g.confidence });
  }, [report.session.uuid, recording]);
}
