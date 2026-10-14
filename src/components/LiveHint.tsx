import { useEffect, useState } from "react";
import type { OwlshReport } from "../types/report";
import { liveSessionPath } from "../lib/hints/desktop";
import { useHint } from "../lib/hints/use-hint";
import { targetOf } from "../lib/platform";
import { getCoachMode } from "../lib/llm";
import { connectCta } from "../lib/hints/connect-cta";
import { mcpPlanStatus, coachInClientPrompt } from "../lib/hints/mcp-connect";
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

  // `plan` mode coaches in the user's Claude client, so offer the paste-prompt instead of a dead button.
  const mode = getCoachMode();
  const [planConnected, setPlanConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (mode !== "plan") return;
    let alive = true;
    mcpPlanStatus().then((s) => alive && setPlanConnected(s.connected), () => {});
    return () => { alive = false; };
  }, [mode]);
  const coachElsewhere = connectCta(mode, { ollamaReachable: true, hasKey: true, planConnected }) === "coach-elsewhere";
  async function copyCoachPrompt() {
    try {
      await navigator.clipboard.writeText(coachInClientPrompt(1));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the prompt is short enough to retype */
    }
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      {askLookup && <LookupOptIn box={targetOf(report).name} onDone={lookupDone} />}
      <HintLine text={hint?.text ?? null} source={hint?.source ?? null} pending={pending} />
      {coachElsewhere && (
        <button type="button" onClick={() => void copyCoachPrompt()} className="self-start text-signal hover:underline">
          {copied ? "Copied — paste into your Claude client" : "Coach this run in Claude →"}
        </button>
      )}
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
