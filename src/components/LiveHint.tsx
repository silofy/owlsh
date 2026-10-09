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
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setPath(null);
    void liveSessionPath(uuid).then((p) => alive && setPath(p));
    return () => {
      alive = false;
    };
  }, [uuid]);

  const { hint, pending, askLookup, penalty, pull, lookupDone } = useHint(report, path, true);

  return (
    <div className="flex w-full flex-col gap-1.5">
      {askLookup && <LookupOptIn box={targetOf(report).name} onDone={lookupDone} />}
      <HintLine text={hint?.text ?? null} source={hint?.source ?? null} pending={pending} />
      <button
        type="button"
        onClick={() => void pull()}
        className="self-start rounded border border-edge px-2 py-1 text-faint transition-colors hover:border-loud hover:text-fg"
      >
        hint · {penalty ? `−${penalty} independence so far` : "costs independence"}
      </button>
    </div>
  );
}
