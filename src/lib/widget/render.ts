import type { WidgetState } from "./state";

/** Render the medium widget as plain text lines (no ANSI) so it's testable; the CLI adds colour. */
export function renderWidget(s: WidgetState, opts: { width?: number; hint?: string | null; penalty?: number } = {}): string[] {
  const W = Math.max(34, opts.width ?? 44);
  const inner = W - 4;
  const fit = (t: string) => (t.length > inner ? t.slice(0, inner - 1) + "…" : t.padEnd(inner));
  const row = (t: string) => `│ ${fit(t)} │`;
  const wrap = (t: string) => {
    const out: string[] = [];
    let line = "";
    for (const w of t.split(" ")) {
      if ((line + " " + w).trim().length > inner) { out.push(line.trim()); line = w; } else line += " " + w;
    }
    if (line.trim()) out.push(line.trim());
    return out;
  };
  const mins = Math.floor(s.elapsedMs / 60_000);
  const clock = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
  const title = ` THE WATCHER · ${s.target} `;
  const top = `┌${title}${"─".repeat(Math.max(0, W - 2 - title.length))}┐`;

  const lines = [top];
  lines.push(row(`${s.phase.toUpperCase()}`.padEnd(inner - 8) + clock.padStart(8)));
  const stealth = s.stealth == null ? "—" : String(s.stealth);
  const ports = s.coverage.found ? `   ports ${s.coverage.engaged}/${s.coverage.found} engaged` : "";
  lines.push(row(`stealth ${stealth}${ports}   finds ${s.findings}`));
  lines.push(`├${"─".repeat(W - 2)}┤`);
  const body: string[] = [];
  if (s.nudge) body.push(...wrap(`◆ ${s.nudge}`));
  for (const t of s.threads) body.push(...wrap(`· ${t}`));
  if (!body.length) body.push("On track. Keep going.");
  for (const b of body) lines.push(row(b));
  if (opts.hint) {
    lines.push(`├${"─".repeat(W - 2)}┤`);
    for (const b of wrap(`hint: ${opts.hint}`)) lines.push(row(b));
  }
  const footer = opts.penalty ? `[h] hint (−${opts.penalty} independence so far)  [q] quit` : "[h] hint (costs independence)  [q] quit";
  lines.push(row(footer));
  lines.push(`└${"─".repeat(W - 2)}┘`);
  return lines;
}
