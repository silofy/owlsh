import type { WidgetState } from "./state";

export type WidgetSize = "small" | "medium" | "large";
export const WIDGET_SIZES: WidgetSize[] = ["small", "medium", "large"];
/** Default box width per size, in columns. */
export const SIZE_WIDTH: Record<WidgetSize, number> = { small: 34, medium: 46, large: 54 };

const dur = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

/** The single most useful line for the small size: a process nudge, else your first open thread. */
export function headline(s: WidgetState): string {
  return s.nudge ?? s.threads[0] ?? "On track. Keep going.";
}

/**
 * Render the widget as plain text lines (no ANSI) so it's testable; the CLI adds colour.
 *   small  — phase + clock, one coaching line
 *   medium — + stats, every nudge/thread, hint footer
 *   large  — + latest finds and pace
 */
export function renderWidget(
  s: WidgetState,
  opts: { width?: number; hint?: string | null; penalty?: number; size?: WidgetSize } = {},
): string[] {
  const size = opts.size ?? "medium";
  const W = Math.max(30, opts.width ?? SIZE_WIDTH[size]);
  const inner = W - 4;
  const fit = (t: string) => (t.length > inner ? t.slice(0, inner - 1) + "…" : t.padEnd(inner));
  const row = (t: string) => `│ ${fit(t)} │`;
  const rule = (label?: string) => (label ? `├─ ${label} ${"─".repeat(Math.max(0, W - 5 - label.length))}┤` : `├${"─".repeat(W - 2)}┤`);
  const wrap = (t: string) => {
    const out: string[] = [];
    let line = "";
    for (const w of t.split(" ")) {
      if ((line + " " + w).trim().length > inner) {
        out.push(line.trim());
        line = w;
      } else line += " " + w;
    }
    if (line.trim()) out.push(line.trim());
    return out;
  };
  const title = size === "small" ? ` WATCHER · ${s.target} ` : ` THE WATCHER · ${s.target} `;
  const lines = [`┌${title}${"─".repeat(Math.max(0, W - 2 - title.length))}┐`];
  const clock = dur(s.elapsedMs);
  lines.push(row(s.phase.toUpperCase().slice(0, Math.max(1, inner - clock.length - 1)).padEnd(inner - clock.length) + clock));

  if (size === "small") {
    for (const b of wrap(s.nudge ? `◆ ${headline(s)}` : headline(s)).slice(0, 2)) lines.push(row(b));
    if (opts.hint) lines.push(row(`hint: ${opts.hint}`));
    lines.push(row(opts.penalty ? `[h] hint −${opts.penalty}` : "[h] hint"));
    lines.push(`└${"─".repeat(W - 2)}┘`);
    return lines;
  }

  const stealth = s.stealth == null ? "—" : String(s.stealth);
  const ports = s.coverage.found ? `   ports ${s.coverage.engaged}/${s.coverage.found} engaged` : "";
  lines.push(row(`stealth ${stealth}${ports}   finds ${s.findings}`));
  lines.push(rule());
  const body: string[] = [];
  if (s.nudge) body.push(...wrap(`◆ ${s.nudge}`));
  for (const t of s.threads) body.push(...wrap(`· ${t}`));
  if (!body.length) body.push("On track. Keep going.");
  for (const b of body) lines.push(row(b));

  if (size === "large") {
    lines.push(rule("latest finds"));
    if (s.recent.length) for (const f of s.recent) lines.push(row(`${f.kind.padEnd(8)}${f.value}`));
    else lines.push(row("nothing yet"));
    lines.push(rule("pace"));
    const since = s.sinceLastFindMs == null ? "—" : `${Math.round(s.sinceLastFindMs / 60_000)}m ago`;
    lines.push(row(`${s.commands} commands · last new find ${since}`));
  }

  if (opts.hint) {
    lines.push(rule());
    for (const b of wrap(`hint: ${opts.hint}`)) lines.push(row(b));
  }
  const footer = opts.penalty ? `[h] hint (−${opts.penalty} independence)  [s] [q]` : "[h] hint (costs independence)  [s] [q]";
  lines.push(row(footer));
  lines.push(`└${"─".repeat(W - 2)}┘`);
  return lines;
}
