/**
 * Draft an OSCP/CPTS-style Markdown pentest report from a graded run.
 *
 *   vite-node scripts/export-report.tsx [--report <path>] [--out <path>]
 *
 * Defaults: reads fixtures/session-demo-full.json, writes dist/report.md. Deterministic; no model.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { attachHints, HINTS_SUFFIX } from "../src/lib/widget/hints";
import { resolve, dirname } from "node:path";
import { draftReport } from "../src/lib/report/draft";
import type { OwlshReport } from "../src/types/report";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const argOf = (flag: string, def: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const reportPath = resolve(root, argOf("--report", "fixtures/session-demo-full.json"));
const outPath = resolve(root, argOf("--out", "dist/report.md"));

// merge any live-widget hint pulls from the sidecar so the drafted report reflects the same grade
const hintsPath = reportPath + HINTS_SUFFIX;
const report = attachHints(JSON.parse(readFileSync(reportPath, "utf8")) as OwlshReport, existsSync(hintsPath) ? JSON.parse(readFileSync(hintsPath, "utf8")) : null);
const md = draftReport(report);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, md, "utf8");

/* eslint-disable no-console */
console.log(`wrote ${outPath} (${md.length} bytes)`);
console.log("Paste it into your OSCP/CPTS template, or run it through any Markdown→PDF tool.");
