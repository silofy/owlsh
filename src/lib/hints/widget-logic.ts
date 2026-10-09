/** Pure decisions behind the widget's hint pull, split out so they can be unit-tested. */
import type { HintGolden, HintPull, OwlshReport } from "../../types/report";
import type { LookupPref } from "./golden-source";

export interface SavedGolden {
  uuid: string;
  golden: HintGolden;
}

/** The write-up opt-in is asked once, on desktop, for HTB targets, while the pref is unset. */
export function shouldAskLookup(desktop: boolean, pref: LookupPref, platform: string): boolean {
  return desktop && pref === "unset" && platform === "htb";
}

/** Bridge until the next poll returns hint_golden: use this window's saved golden, for the same session only. */
export function reportForPull(report: OwlshReport, saved: SavedGolden | null): OwlshReport {
  if (report.hint_golden || !saved || saved.uuid !== report.session.uuid) return report;
  return { ...report, hint_golden: saved.golden };
}

/** Saved pulls plus this surface's newer local ones (not yet echoed back by a poll). Browser demo counts local only. */
export function mergePulls(saved: HintPull[], local: HintPull[], countSaved: boolean): HintPull[] {
  if (!countSaved) return local;
  const lastSaved = saved.reduce((m, p) => Math.max(m, p.atMs), 0);
  return [...saved, ...local.filter((p) => p.atMs > lastSaved)];
}

/** A pull's result belongs to the box it started for; drop it if the session changed meanwhile. */
export function isStaleResult(startedUuid: string, currentUuid: string | null): boolean {
  return startedUuid !== currentUuid;
}

/** On desktop a pull needs a sidecar path, otherwise it would count locally but never reach the grade. */
export function canPull(s: { desktop: boolean; path: string | null; pending: boolean }): boolean {
  return !s.pending && (!s.desktop || s.path !== null);
}
