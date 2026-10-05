import { useEffect, useState } from "react";
import type { HintPull, WatcherReport } from "../types/report";
import { deriveWidgetState } from "../lib/widget/state";
import { hintFor, nextTier, independencePenalty } from "../lib/widget/hints";
import { isDesktop } from "../lib/net";
import demo from "../../fixtures/session-demo-full.json";

/**
 * The floating live widget (desktop window, routed by `?widget=1`). Same derivation as the terminal
 * widget: it mirrors the run and coaches process, never the answer. On desktop it follows the newest
 * session file and records hint pulls to its sidecar (so they reach the grade); in a plain browser it
 * shows the demo run so the view can be previewed.
 */
export function WidgetWindow() {
  const desktop = isDesktop();
  const [report, setReport] = useState<WatcherReport | null>(desktop ? null : (demo as unknown as WatcherReport));
  const [path, setPath] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [localPulls, setLocalPulls] = useState<HintPull[]>([]);
  const [now, setNow] = useState(() => Date.now());

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
          setReport(JSON.parse(r.json) as WatcherReport);
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

  async function pullHint() {
    if (!report) return;
    const tier = nextTier(pulls);
    const pull: HintPull = { tier, atMs: Date.now(), phase: deriveWidgetState(report, now).phase };
    setHint(hintFor(tier));
    if (desktop && path) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("record_hint", { path, tier: pull.tier, atMs: pull.atMs, phase: pull.phase });
    }
    setLocalPulls((p) => [...p, pull]);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "h" && !e.metaKey && !e.ctrlKey && !e.altKey) void pullHint();
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
          The Watcher{s ? ` · ${s.target}` : ""}
        </span>
        {desktop && (
          <button type="button" onClick={close} aria-label="Close widget" className="ml-auto px-1 text-faint hover:text-fg">
            ✕
          </button>
        )}
      </div>

      {!s ? (
        <div className="flex flex-1 flex-col justify-center gap-2 px-4 text-muted">
          <span>Waiting for a capture…</span>
          <span className="text-faint">Start one with watcher-capture --attach</span>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2.5 px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <b className="text-[13px] font-semibold uppercase tracking-wide">{s.phase}</b>
            <span className="tabular-nums text-muted">{clock}</span>
          </div>
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
            {hint && <p className="text-signal">hint: {hint}</p>}
          </div>
          <button
            type="button"
            onClick={pullHint}
            className="mt-auto rounded border border-edge px-2 py-1.5 text-left text-faint transition-colors hover:border-loud hover:text-fg"
          >
            [h] hint · {penalty ? `−${penalty} independence so far` : "costs independence"}
          </button>
        </div>
      )}
    </div>
  );
}
