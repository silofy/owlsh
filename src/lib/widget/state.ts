import type { OwlshReport } from "../../types/report";
import { computeFocus } from "../analysis/focus";

/** What the live widget shows. Derived purely from the run so far — it mirrors the operator's own
 *  activity and never contains box-specific guidance (see docs/superpowers/specs/2026-10-03-live-widget-design.md). */
export interface WidgetState {
  target: string;
  phase: string;
  elapsedMs: number;
  stealth: number | null;
  coverage: { found: number; engaged: number };
  findings: number;
  threads: string[];
  nudge: string | null;
  /** Newest findings first (large size) — your own loot; secret kinds are masked. */
  recent: { kind: string; value: string }[];
  /** Pace (large size): commands so far, and time since the last new finding (null when none yet). */
  commands: number;
  sinceLastFindMs: number | null;
}

const SECRET_KINDS = new Set(["cred", "hash"]);

const STALE_MS = 10 * 60_000; // no new finding for this long → "widen the search?"

export function deriveWidgetState(report: OwlshReport, nowMs: number = Date.now()): WidgetState {
  const eps = [...report.episodes].sort((a, b) => a.seq - b.seq);
  const last = eps[eps.length - 1];
  const labelByTactic = new Map((report.phases ?? []).map((p) => [p.mitre_tactic, p.label]));
  const phase = last ? labelByTactic.get(last.tactic) ?? last.tactic : "Not started";

  const start = Date.parse(report.session.started_at);
  const end = report.recording === true ? nowMs : Date.parse(report.session.ended_at); // live only while recording
  const elapsedMs = Number.isFinite(start) ? Math.max(0, end - start) : 0;

  const findings = report.findings ?? [];
  const ports = findings.filter((f) => f.kind === "port");
  const used = (f: { used_by_seq?: number[] }) => (f.used_by_seq?.length ?? 0) > 0;

  // open threads: the operator's OWN findings they haven't followed up — reminders, never instructions
  const threads: string[] = [];
  const unusedCreds = findings.filter((f) => f.kind === "cred" && !used(f)).length;
  if (unusedCreds) threads.push(unusedCreds === 1 ? "An unused credential is sitting in your loot." : `${unusedCreds} unused credentials are sitting in your loot.`);
  const unvisited = findings.filter((f) => (f.kind === "url" || f.kind === "path") && !used(f)).length;
  if (unvisited) threads.push(unvisited === 1 ? "A path you found was never revisited." : `${unvisited} paths you found were never revisited.`);

  // process nudges: rabbit hole on the latest work, or a long stretch with nothing new
  const seqAt = (seq: number) => eps.find((e) => e.seq === seq)?.started_at_ms ?? 0;
  const recent = [...findings]
    .sort((a, b) => b.source_seq - a.source_seq)
    .slice(0, 3)
    .map((f) => ({ kind: f.kind, value: SECRET_KINDS.has(f.kind) ? "••••" : f.value }));
  const lastFindAt = findings.length ? Math.max(...findings.map((f) => seqAt(f.source_seq))) : 0;
  const lastAt = last?.started_at_ms ?? 0;
  const sinceLastFindMs = lastFindAt && lastAt ? Math.max(0, lastAt - lastFindAt) : null;

  let nudge: string | null = null;
  const holes = computeFocus(report).rabbit_holes;
  const lastHole = holes[holes.length - 1];
  if (last && lastHole && lastHole.end_seq === last.seq) {
    nudge = `Long run on ${lastHole.binary} with little to show. Step back and re-enumerate?`;
  } else if (sinceLastFindMs != null && sinceLastFindMs > STALE_MS) {
    nudge = `Nothing new in ${Math.round(sinceLastFindMs / 60_000)}m. Widen the search?`;
  }

  return {
    target: report.session.target?.name ?? report.session.machine?.name ?? report.session.target_scope,
    phase,
    elapsedMs,
    stealth: Number.isFinite(report.metrics?.stealth_score) ? Math.round(report.metrics.stealth_score) : null,
    coverage: { found: ports.length, engaged: ports.filter(used).length },
    findings: findings.length,
    threads,
    nudge,
    recent,
    commands: eps.length,
    sinceLastFindMs,
  };
}
