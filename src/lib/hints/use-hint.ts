/** Shared hint-pull state for every React surface (floating widget, live dashboard): one controller, one sidecar. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { HintPull, HintSource, OwlshReport } from "../../types/report";
import { independencePenalty } from "../widget/hints";
import { isDesktop } from "../net";
import { targetOf } from "../platform";
import { createPuller } from "./pull";
import { desktopPullDeps } from "./desktop";
import { getLookupPref } from "./golden-source";
import { reportForPull, shouldAskLookup, type SavedGolden } from "./widget-logic";

export interface UseHint {
  hint: { text: string; source: HintSource } | null;
  pending: boolean;
  askLookup: boolean;
  penalty: number;
  pull(): Promise<void>;
  /** The opt-in was answered: close it and pull. */
  lookupDone(): void;
}

/**
 * `path` is the session's sidecar anchor (null until known). `countSaved` merges the report's saved pulls with
 * this surface's newer local ones (desktop); otherwise only local pulls count (browser demo).
 */
export function useHint(report: OwlshReport | null, path: string | null, countSaved: boolean): UseHint {
  const desktop = isDesktop();
  const [hint, setHint] = useState<UseHint["hint"]>(null);
  const [pending, setPending] = useState(false);
  const [askLookup, setAskLookup] = useState(false);
  // Golden saved by this surface's pull; bridges the gap until the next poll returns report.hint_golden.
  const [savedGolden, setSavedGolden] = useState<SavedGolden | null>(null);
  const [localPulls, setLocalPulls] = useState<HintPull[]>([]);

  // Saved pulls arrive with the next poll; count this surface's newer pulls optimistically until then,
  // so two quick presses escalate instead of recording the same tier twice.
  const saved = report?.hints ?? [];
  const lastSaved = saved.reduce((m, p) => Math.max(m, p.atMs), 0);
  const pulls = countSaved ? [...saved, ...localPulls.filter((p) => p.atMs > lastSaved)] : localPulls;
  const penalty = independencePenalty(pulls);

  const os = report ? (targetOf(report).os ?? null) : null;
  const uuid = report?.session.uuid ?? null;
  const uuidRef = useRef(uuid);
  uuidRef.current = uuid;
  const puller = useMemo(
    () => createPuller(desktopPullDeps(path, os, (golden) => uuid && setSavedGolden({ uuid, golden }))),
    [path, os, uuid],
  );

  // A different session is a different box: drop the hint on screen and the optimistic pulls.
  useEffect(() => {
    setHint(null);
    setAskLookup(false);
    setLocalPulls([]);
  }, [uuid]);

  async function pull() {
    if (!report || pending) return;
    if (shouldAskLookup(desktop, getLookupPref(), targetOf(report).platform)) {
      setAskLookup(true);
      return;
    }
    const startedFor = report.session.uuid;
    setPending(true);
    try {
      const r = await puller.pull(reportForPull(report, savedGolden), pulls);
      // The session changed while this pull was in flight: its result belongs to the old box.
      if (r && uuidRef.current === startedFor) {
        setHint({ text: r.text, source: r.pull.source ?? "static" });
        setLocalPulls((p) => [...p, r.pull]);
      }
    } finally {
      setPending(false);
    }
  }

  return {
    hint,
    pending,
    askLookup,
    penalty,
    pull,
    lookupDone: () => {
      setAskLookup(false);
      void pull();
    },
  };
}
