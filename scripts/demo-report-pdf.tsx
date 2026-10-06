/**
 * Builds the public sample report PDF for the landing page from the Abducted demo run — the same
 * draftReport + light "paper" stylesheet the app's Download PDF uses, printed by Chromium.
 *   npx vite-node scripts/demo-report-pdf.tsx -- <out.pdf>
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chromium } from "playwright";
import demo from "../fixtures/session-demo-full.json";
import type { WatcherReport } from "../src/types/report";
import { draftReport } from "../src/lib/report/draft";
import { computeGrade } from "../src/lib/bridge/grade";

const out = process.argv[process.argv.length - 1];
if (!out.endsWith(".pdf")) throw new Error("usage: demo-report-pdf.tsx -- <out.pdf>");

// A public download is always the redacted, shareable profile.
const report = { ...(demo as unknown as WatcherReport), redaction_profile: "public_safe" } as WatcherReport;
const md = draftReport(report);
const i = md.indexOf("\n## ");
const body = (i >= 0 ? md.slice(i + 1) : md).replace(/\*\*Severity\*\*:\s*([A-Za-z]+)/g, "**Severity**: `$1`");

// Reuse the app's print stylesheet verbatim so the sample matches what users get.
const src = readFileSync(new URL("../src/components/ReportDraft.tsx", import.meta.url), "utf8");
const PRINT_CSS = src.match(/const PRINT_CSS = `([\s\S]*?)`;/)![1];
const SEV: Record<string, string> = { critical: "#d23b3b", high: "#ff8a4a", medium: "#b67a00", low: "#4d9bff", info: "#555" };

const html = renderToStaticMarkup(
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      code({ className, children }) {
        const t = String(children ?? "").trim();
        const c = SEV[t.toLowerCase()];
        return !className && c ? <span className="rpt-sev" style={{ color: c, borderColor: c }}>{t}</span> : <code className={className}>{children}</code>;
      },
    }}
  >
    {body}
  </ReactMarkdown>,
);

const t = report.session.target as { name: string; platform?: string; os?: string; difficulty?: { label?: string } };
const g = computeGrade(report);
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const chips = [t.platform?.toUpperCase(), t.difficulty?.label, t.os].filter(Boolean) as string[];
const cover = `<div class="cover"><div><div class="ek">Penetration Test Report · sample</div><h1>${esc(t.name)}</h1><div class="meta">${chips.map(esc).join(" · ")} · redacted · shareable</div></div><div class="grade"><div class="gk">Grade</div><div class="gl">${esc(g.letter)}</div><div class="gs">${g.score}/100</div></div></div>`;
const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.name)} — Penetration Test Report</title><style>${PRINT_CSS}</style></head><body>${cover}${html}</body></html>`;

const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(doc, { waitUntil: "load" });
await p.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
await b.close();
console.log("wrote", out, `· ${t.name} · grade ${g.letter} ${g.score}`);
