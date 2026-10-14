import { useEffect, useState } from "react";
import { useReport } from "../store/report";
import { MachineAvatar } from "./MachineAvatar";
import { DIFFICULTY_COLOR } from "../lib/machine";
import { loadPwnboxConfig } from "../lib/pwnbox";
import { connectorFor } from "../lib/platform";
import type { OwlshReport } from "../types/report";
import type { SshLogFile } from "../lib/ssh/ingest";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Poll the daemon's live-session files (written when you spawn a box). Tauri-only; no-op in dev browser. */
async function fetchLiveSessions(): Promise<OwlshReport[]> {
  if (!isTauri()) return [];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = (await invoke("list_sessions")) as string[];
    return raw
      .map((s) => {
        try {
          return JSON.parse(s.replace(/^﻿/, "")) as OwlshReport;
        } catch {
          return null;
        }
      })
      .filter((r): r is OwlshReport => r != null);
  } catch {
    return [];
  }
}

/** The tap's captured SSH-session files (~/.owlsh/ssh). Tauri-only; empty in dev browser. */
async function fetchSshLogs(): Promise<SshLogFile[]> {
  if (!isTauri()) return [];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return ((await invoke("list_ssh_logs")) as SshLogFile[]) ?? [];
  } catch {
    return [];
  }
}

/** "up" clock: how long the box has been live. */
function upFor(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

/**
 * The live-machine strip: a box spawned in the browser → the daemon writes it → this poll merges it
 * in and surfaces it here as an active, recording machine (identity + an "up" timer) above the report.
 */
export function LiveBridge() {
  const { liveBanner, ingestLiveReport, switchSession, dismissLiveBanner, sessionCards } = useReport();
  const [now, setNow] = useState(() => 0);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      const [reports, sshLogs] = await Promise.all([fetchLiveSessions(), fetchSshLogs()]);
      if (active) reports.forEach((r) => ingestLiveReport(r, sshLogs));
    };
    tick();
    const h = setInterval(tick, 4000);
    return () => {
      active = false;
      clearInterval(h);
    };
  }, [ingestLiveReport]);

  // tick the "up" clock every second while a live machine is shown
  useEffect(() => {
    if (!liveBanner) return;
    setNow(Date.now());
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [liveBanner]);

  if (!liveBanner) return null;
  const card = sessionCards.find((c) => c.id === liveBanner.id);
  const t = card?.target;
  const startedMs = card ? Date.parse(card.started_at) : NaN;
  const elapsed = Number.isNaN(startedMs) || now === 0 ? null : now - startedMs;

  const connectorLabel = connectorFor(t?.platform ?? "htb").label;
  const diffColor = t?.difficulty?.label ? DIFFICULTY_COLOR[t.difficulty.label] : undefined;

  return (
    <div className="border-b-2 border-detour bg-detour/12">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
        {/* identity: the box this run is on — avatar anchors it, name is the hero, meta sits beneath */}
        <div className="flex min-w-0 items-center gap-3">
          {t && <MachineAvatar target={t} size={40} />}
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-display text-lg font-semibold leading-none text-fg">{t?.name ?? liveBanner.name}</span>
            <div className="flex items-center gap-2 text-xs leading-none">
              {t?.difficulty?.label && (
                <span className="label font-medium" style={{ color: diffColor }}>
                  {t.difficulty.label}
                </span>
              )}
              {t?.difficulty?.label && t?.os && <span className="h-2.5 w-px bg-edge" aria-hidden />}
              {t?.os && <span className="label text-muted">{t.os}</span>}
              {loadPwnboxConfig().enabled && (
                <>
                  <span className="h-2.5 w-px bg-edge" aria-hidden />
                  <span className="label flex items-center gap-1 text-match" title={`${connectorLabel} SSH auto-pull is active — sessions are scp-pulled every 15s`}>
                    <span aria-hidden>⟳</span> {connectorLabel}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* live status + the single action — the run is recording, and here's where to open it */}
        <div className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-2 rounded-full border border-detour/40 bg-detour/10 px-2.5 py-1" title="This machine is live and recording">
            <span className="caret text-detour" aria-hidden>
              ●
            </span>
            <span className="label text-detour">Rec</span>
            {elapsed != null && <span className="mono tabular-nums text-xs text-signal" title="Time the machine has been up">{upFor(elapsed)}</span>}
          </span>
          <button
            type="button"
            onClick={() => switchSession(liveBanner.id)}
            className="label rounded border border-signal/50 px-2.5 py-1.5 text-signal transition-colors hover:bg-signal/15"
          >
            Open debrief
          </button>
          <button type="button" onClick={dismissLiveBanner} className="text-faint transition-colors hover:text-fg" aria-label="Dismiss recording banner">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
