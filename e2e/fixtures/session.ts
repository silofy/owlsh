import type { HintGolden, HintPull, OwlshReport } from "../../src/types/report";
import base from "../../fixtures/session-htb-easy.json" with { type: "json" };

export const GOLDEN: HintGolden = {
  source: "0xdf",
  confidence: 0.8,
  golden: [{ objective: "access_widgetsvc", tactic: "TA0001", satisfied_by: ["widgettool"], user_satisfied_by_seq: null }],
};

export interface CaptureOpts {
  uuid?: string;
  recording?: boolean;
  platform?: "htb" | "thm";
  name?: string;
  hintGolden?: HintGolden;
  hints?: HintPull[];
}

export function makeCapture(o: CaptureOpts = {}): OwlshReport {
  const r = structuredClone(base) as unknown as OwlshReport;
  if (o.uuid) r.session.uuid = o.uuid;
  if (o.recording !== undefined) r.recording = o.recording;
  // A fresh heartbeat so isLiveRecording treats the capture as live.
  if (o.recording) r.session.ended_at = new Date().toISOString();
  if (o.platform || o.name) {
    const name = o.name ?? "Box";
    r.session.target = { platform: o.platform ?? "htb", kind: "box", name, slug: name.toLowerCase() };
  }
  if (o.hintGolden) r.hint_golden = o.hintGolden;
  if (o.hints) r.hints = o.hints;
  return r;
}

/** Default on-disk path the fake gives a capture. */
export const pathOf = (r: OwlshReport) => `/fake/sessions/${r.session.uuid}.json`;

/** Short test timeouts for the hint pipeline. */
export const FAST_TIMEOUTS = { hintTimeoutMs: 300, goldenBudgetMs: 300 };
/** Storage that turns the write-up lookup off. */
export const LOOKUP_OFF = { "owlsh.hintLookup": "off" };
/** Storage that skips the first-run wizard (key/value from src/lib/onboarding.ts). */
export const ONBOARDED = { "owlsh.onboarded": "1" };

/** The latest_session reply shape. */
export function asLatest(r: OwlshReport, path = pathOf(r)): { path: string; json: string } {
  return { path, json: JSON.stringify(r) };
}
