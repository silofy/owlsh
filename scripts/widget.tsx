/**
 * The live widget, in the terminal — run it in a pane beside your shell (e.g. tmux split).
 *
 *   npm run widget -- --report <session.json>      # a live capture or a finished report
 *
 * Redraws whenever the file changes. Mirrors your run and coaches process only; [h] pulls an
 * opt-in hint that costs independence (recorded in <report>.hints, merged into the grade), [q] quits.
 */
import { readFileSync, writeFileSync, existsSync, watchFile } from "node:fs";
import { resolve } from "node:path";
import type { WatcherReport } from "../src/types/report";
import { deriveWidgetState } from "../src/lib/widget/state";
import { renderWidget } from "../src/lib/widget/render";
import { hintFor, nextTier, independencePenalty, HINTS_SUFFIX, type HintPull } from "../src/lib/widget/hints";

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const path = resolve(arg("--report") ?? "fixtures/session-demo-full.json");
const width = Number(arg("--width") ?? 46);
const hintsPath = path + HINTS_SUFFIX; // not .json — the app reads every .json in sessions/ as a report

let pulls: HintPull[] = existsSync(hintsPath) ? JSON.parse(readFileSync(hintsPath, "utf8")) : [];
let lastHint: string | null = null;
let report: WatcherReport | null = null;

const C = { dim: "\x1b[2m", mint: "\x1b[38;2;47;230;176m", coral: "\x1b[38;2;239;106;85m", reset: "\x1b[0m" };
function colour(line: string): string {
  if (/^[┌├└]/.test(line)) return C.dim + line + C.reset;
  return line.replace(/◆ .*/, (m) => C.coral + m + C.reset).replace(/hint: .*/, (m) => C.mint + m + C.reset);
}

function load() {
  try { report = JSON.parse(readFileSync(path, "utf8")); } catch { /* mid-write; keep the last good frame */ }
}

function draw() {
  if (!report) return;
  const state = deriveWidgetState(report);
  const lines = renderWidget(state, { width, hint: lastHint, penalty: independencePenalty(pulls) });
  process.stdout.write("\x1b[2J\x1b[H" + lines.map(colour).join("\n") + "\n");
}

function pullHint() {
  if (!report) return;
  const tier = nextTier(pulls);
  pulls.push({ tier, atMs: Date.now(), phase: deriveWidgetState(report).phase });
  writeFileSync(hintsPath, JSON.stringify(pulls, null, 2));
  lastHint = hintFor(tier);
  draw();
}

load();
draw();
watchFile(path, { interval: 1000 }, () => { load(); draw(); });
setInterval(draw, 15_000); // keep the clock moving between captures

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (b) => {
    const k = b.toString();
    if (k === "q" || k === "\u0003") { process.stdout.write("\x1b[2J\x1b[H"); process.exit(0); }
    if (k === "h") pullHint();
  });
}
