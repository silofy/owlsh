import { useEffect, useState } from "react";
import type { OwlshReport } from "../types/report";
import { liveSessionPath } from "../lib/hints/desktop";
import { useHint } from "../lib/hints/use-hint";
import { targetOf } from "../lib/platform";
import { HintLine } from "./HintLine";
import { LookupOptIn } from "./LookupOptIn";

/** Hint button for the live dashboard. Shares the widget's controller and `.hints` sidecar, so a pull counts once. */
export function LiveHint({ report }: { report: OwlshReport }) {
  const uuid = report.session.uuid;
  const [found, setFound] = useState<{ uuid: string; path: string } | null>(null);
  const path = found?.uuid === uuid ? found.path : null;

  // Retry on every report update (the capture grows) until this session's file is found.
  useEffect(() => {
    if (path) return;
    let alive = true;
    void liveSessionPath(uuid).then((p) => alive && p && setFound({ uuid, path: p }));
    return () => {
      alive = false;
    };
  }, [report, uuid, path]);

  const { hint, pending, askLookup, penalty, ready, pull, lookupDone } = useHint(report, path, true);

  return (
    <div className="flex w-full flex-col gap-1.5">
      {askLookup && <LookupOptIn box={targetOf(report).name} onDone={lookupDone} />}
      <HintLine text={hint?.text ?? null} source={hint?.source ?? null} pending={pending} />
      <button
        type="button"
        disabled={!ready}
        onClick={() => void pull()}
        className="self-start rounded border border-edge px-2 py-1 text-faint transition-colors enabled:hover:border-loud enabled:hover:text-fg disabled:opacity-60"
      >
        {ready ? `hint · ${penalty ? `−${penalty} independence so far` : "costs independence"}` : "hint · connecting…"}
      </button>
    </div>
  );
}
