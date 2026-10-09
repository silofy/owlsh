import { useEffect, useMemo, useState } from "react";
import type { HintGolden, HintPull, HintSource, OwlshReport } from "../types/report";
import { deriveWidgetState } from "../lib/widget/state";
import { independencePenalty } from "../lib/widget/hints";
import { headline, WIDGET_SIZES, type WidgetSize } from "../lib/widget/render";
import { isDesktop } from "../lib/net";
import { targetOf } from "../lib/platform";
import { createPuller } from "../lib/hints/pull";
import { desktopPullDeps } from "../lib/hints/desktop";
import { getLookupPref } from "../lib/hints/golden-source";
import { HintLine } from "./HintLine";
import { LookupOptIn } from "./LookupOptIn";
import demo from "../../fixtures/session-demo-full.json";

/**
 * The floating live widget (desktop window, routed by `?widget=1`). Same derivation as the terminal
 * widget: it mirrors the run and coaches process, never the answer. On desktop it follows the newest
 * session file and records hint pulls to its sidecar (so they reach the grade); in a plain browser it
 * shows the demo run so the view can be previewed.
 */
/** Window size per widget size (logical px). */
const WINDOW_PX: Record<WidgetSize, [number, number]> = { small: [300, 150], medium: [360, 330], large: [390, 500] };
const SIZE_KEY = "owlsh.widget.size";

function initialSize(): WidgetSize {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    if (v && (WIDGET_SIZES as string[]).includes(v)) return v as WidgetSize;
  } catch {
    /* storage blocked — default */
  }
  return "medium";
}

export function WidgetWindow() {
  const desktop = isDesktop();
  const [report, setReport] = useState<OwlshReport | null>(desktop ? null : (demo as unknown as OwlshReport));
  const [path, setPath] = useState<string | null>(null);
  const [hint, setHint] = useState<{ text: string; source: HintSource } | null>(null);
  const [pending, setPending] = useState(false);
  const [askLookup, setAskLookup] = useState(false);
  // Golden saved by this window's pull; bridges the gap until the next poll returns report.hint_golden.
  const [savedGolden, setSavedGolden] = useState<HintGolden | null>(null);
  const [localPulls, setLocalPulls] = useState<HintPull[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [size, setSize] = useState<WidgetSize>(initialSize);

  async function applySize(next: WidgetSize) {
    setSize(next);
    try {
      localStorage.setItem(SIZE_KEY, next);
    } catch {
      /* not persisted — fine */
    }
    if (!desktop) return;
    const [{ getCurrentWindow }, { LogicalSize }] = await Promise.all([import("@tauri-apps/api/window"), import("@tauri-apps/api/dpi")]);
    const [w, h] = WINDOW_PX[next];
    await getCurrentWindow().setSize(new LogicalSize(w, h));
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    async function poll() {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const r = (await invoke("latest_session")) as { path: string; json: string } | null;
        if (alive && r) {
          setReport(JSON.parse(r.json) as OwlshReport);
          setPath(r.path);
        }
      } catch {
        /* a capture mid-write — keep the last good frame */
      }
    }
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [desktop]);

  // On desktop the saved pulls arrive with the next poll; count this window's newer pulls optimistically
  // until they do, so two quick presses escalate instead of recording the same tier twice.
  const saved = report?.hints ?? [];
  const lastSaved = saved.reduce((m, p) => Math.max(m, p.atMs), 0);
  const pulls = desktop ? [...saved, ...localPulls.filter((p) => p.atMs > lastSaved)] : localPulls;
  const penalty = independencePenalty(pulls);

  const os = report ? (targetOf(report).os ?? null) : null;
  const puller = useMemo(() => createPuller(desktopPullDeps(path, os, setSavedGolden)), [path, os]);

  async function pullHint() {
    if (!report || pending) return;
    if (desktop && getLookupPref() === "unset" && targetOf(report).platform === "htb") {
      setAskLookup(true);
      return;
    }
    setPending(true);
    try {
      const r = await puller.pull({ ...report, hint_golden: report.hint_golden ?? savedGolden ?? undefined }, pulls);
      if (r) {
        setHint({ text: r.text, source: r.pull.source ?? "static" });
        setLocalPulls((p) => [...p, r.pull]);
      }
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "h") void pullHint();
      if (e.key === "s") void applySize(WIDGET_SIZES[(WIDGET_SIZES.indexOf(size) + 1) % WIDGET_SIZES.length]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function close() {
    if (!desktop) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  }

  const s = report ? deriveWidgetState(report, now) : null;
  const mins = s ? Math.floor(s.elapsedMs / 60_000) : 0;
  const clock = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;

  return (
    <div className="flex h-screen flex-col overflow-hidden border border-edge bg-ink font-mono text-[12px] text-fg">
      <div data-tauri-drag-region className="flex cursor-move select-none items-center gap-2 border-b border-edge px-3 py-2">
        <span data-tauri-drag-region className="h-2 w-2 bg-signal" aria-hidden="true" />
        <span data-tauri-drag-region className="label truncate text-muted">
          owlsh{s ? ` · ${s.target}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-0.5" role="group" aria-label="Widget size">
          {WIDGET_SIZES.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => void applySize(z)}
              aria-pressed={size === z}
              title={`${z} widget`}
              className={`w-5 rounded-[2px] text-[10px] uppercase ${size === z ? "bg-panel-2 text-fg" : "text-faint hover:text-muted"}`}
            >
              {z[0]}
            </button>
          ))}
        </div>
        {desktop && (
          <button type="button" onClick={close} aria-label="Close widget" className="px-1 text-faint hover:text-fg">
            ✕
          </button>
        )}
      </div>

      {!s ? (
        <div className="flex flex-1 flex-col justify-center gap-2 px-4 text-muted">
          <span>Waiting for a capture…</span>
          <span className="text-faint">Start one with owlsh --attach</span>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2.5 overflow-hidden px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <b className="text-[13px] font-semibold uppercase tracking-wide">{s.phase}</b>
            <span className="tabular-nums text-muted">{clock}</span>
          </div>
          {size === "small" ? (
            <p className={`font-sans text-[12.5px] leading-snug ${s.nudge ? "text-loud" : ""}`}>{s.nudge ? `◆ ${headline(s)}` : headline(s)}</p>
          ) : (
            <>
              <div className="text-muted">
                stealth <b className="font-medium text-fg">{s.stealth ?? "—"}</b>
                {s.coverage.found > 0 && (
                  <>
                    {" "}· ports <b className="font-medium text-fg">{s.coverage.engaged}/{s.coverage.found}</b>
                  </>
                )}{" "}
                · finds <b className="font-medium text-fg">{s.findings}</b>
              </div>
              <div className="h-1.5 bg-panel-2">
                <div className="h-full bg-signal transition-[width] duration-500" style={{ width: `${s.stealth ?? 0}%` }} />
              </div>
              <div className="flex flex-col gap-1.5 font-sans text-[12.5px] leading-snug">
                {s.nudge && <p className="text-loud">◆ {s.nudge}</p>}
                {s.threads.map((t) => (
                  <p key={t}>· {t}</p>
                ))}
                {!s.nudge && s.threads.length === 0 && <p className="text-muted">On track. Keep going.</p>}
              </div>
            </>
          )}
          {size === "large" && (
            <>
              <div className="label border-t border-edge pt-2 text-faint">Latest finds</div>
              <div className="flex flex-col gap-0.5">
                {s.recent.length ? (
                  s.recent.map((f, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="w-12 shrink-0 text-faint">{f.kind}</span>
                      <span className="truncate">{f.value}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-faint">nothing yet</span>
                )}
              </div>
              <div className="label border-t border-edge pt-2 text-faint">Pace</div>
              <div className="text-muted">
                <b className="font-medium text-fg">{s.commands}</b> commands · last new find{" "}
                <b className="font-medium text-fg">{s.sinceLastFindMs == null ? "—" : `${Math.round(s.sinceLastFindMs / 60_000)}m ago`}</b>
              </div>
            </>
          )}
          {askLookup && report && (
            <LookupOptIn
              box={targetOf(report).name}
              onDone={() => {
                setAskLookup(false);
                void pullHint();
              }}
            />
          )}
          <HintLine text={hint?.text ?? null} source={hint?.source ?? null} pending={pending} />
          <button
            type="button"
            onClick={pullHint}
            className="mt-auto rounded border border-edge px-2 py-1.5 text-left text-faint transition-colors hover:border-loud hover:text-fg"
          >
            {size === "small" ? (penalty ? `[h] hint · −${penalty}` : "[h] hint") : `[h] hint · ${penalty ? `−${penalty} independence so far` : "costs independence"}`}
          </button>
        </div>
      )}
    </div>
  );
}
