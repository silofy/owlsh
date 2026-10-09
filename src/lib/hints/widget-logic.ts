/** Pure decisions behind the widget's hint pull, split out so they can be unit-tested. */
import type { HintGolden, OwlshReport } from "../../types/report";
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
