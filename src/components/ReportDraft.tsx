import { useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useReport } from "../store/report";
import { draftReport } from "../lib/report/draft";
import { computeGrade, gradeColor } from "../lib/bridge/grade";
import { Section } from "./ui";
import { Check } from "./icons";

/** Light "paper" stylesheet for the printed/PDF document — a client-ready look, independent of the
 *  app's dark theme. The severity badges keep their colours (their inline styles reference the
 *  --color-* vars redefined here for light paper). */
const PRINT_CSS = `
:root{--line:#e4e4e7;--signal:#0f9f76;--color-loud:#d23b3b;--color-flag:#b67a00;--color-match:#0f9f76;--color-muted:#555;}
*{box-sizing:border-box}
html,body{margin:0;background:#fff}
body{font-family:"Hanken Grotesk",system-ui,-apple-system,sans-serif;color:#17171a;font-size:12px;line-height:1.6;padding:16mm 14mm;}
.cover{margin-bottom:24px;border-bottom:2px solid #17171a;padding-bottom:18px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
.cover .ek{font-family:ui-monospace,SFMono-Regular,monospace;text-transform:uppercase;letter-spacing:.14em;font-size:10px;color:#888}
.cover h1{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:.25em 0 .4em;color:#0b0b0c}
.cover .meta{font-family:ui-monospace,monospace;font-size:11px;color:#666}
.cover .grade{flex:none;text-align:center;border:1px solid var(--line);border-radius:10px;padding:10px 16px}
.cover .grade .gk{font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em;font-size:9px;color:#888}
.cover .grade .gl{font-size:30px;font-weight:800;line-height:1;margin-top:2px}
.cover .grade .gs{font-family:ui-monospace,monospace;font-size:10px;color:#888;margin-top:3px}
h2{font-size:18px;font-weight:800;letter-spacing:-.01em;color:#0b0b0c;border-bottom:1px solid var(--line);padding-bottom:.3em;margin:1.8em 0 .6em;break-after:avoid}
h3{font-size:14px;font-weight:700;color:#0b0b0c;border-left:3px solid var(--signal);padding-left:.6em;margin:1.6em 0 .5em;break-after:avoid;break-inside:avoid}
h4{font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em;font-size:9px;color:#888;margin:1.1em 0 .3em;break-after:avoid}
p{margin:.5em 0}
strong{color:#0b0b0c;font-weight:700}
a{color:var(--signal)}
ul,ol{margin:.5em 0;padding-left:1.3em}
li{margin:.2em 0}
code{font-family:ui-monospace,monospace;font-size:11px;background:#f1f1f3;padding:.1em .4em;border-radius:4px;color:#0b0b0c}
pre{background:#f6f6f7;border:1px solid var(--line);border-radius:6px;padding:.8em 1em;overflow:auto;break-inside:avoid}
pre code{background:none;padding:0}
table{width:100%;border-collapse:collapse;font-size:11px;margin:.8em 0}
th{text-align:left;font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;font-size:9px;color:#888;border-bottom:1px solid #ccc;padding:.5em .6em}
td{padding:.5em .6em;border-bottom:1px solid var(--line);vertical-align:top}
.rpt-sev{display:inline-block;font-family:ui-monospace,monospace;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:.1em .5em;border:1px solid;border-radius:5px}
tr,li{break-inside:avoid}
@page{margin:16mm 14mm}
`;

/** Severity → colour, for the inline badges in the findings. */
const SEV: Record<string, string> = {
  critical: "var(--color-loud)",
  high: "#ff8a4a",
  medium: "var(--color-flag)",
  low: "#4d9bff",
  info: "var(--color-muted)",
  unset: "var(--color-muted)",
};

// Wrap each finding's severity value in backticks so the inline-code renderer below turns it into a
// coloured badge, without changing the generated Markdown (that restyle is step B).
const badgeSeverities = (md: string) => md.replace(/\*\*Severity\*\*:\s*([A-Za-z]+)/g, "**Severity**: `$1`");

/**
 * The deliverable: the OSCP/CPTS-style report (draftReport — pure, deterministic) rendered in-browser
 * as a designed document, not raw Markdown. A cover (title · target · grade · redaction state) stands
 * in for the Markdown's plain header, findings severities render as coloured badges, and `.md-report`
 * carries the document typography. Offense debrief only.
 */
export function ReportDraft() {
  const report = useReport((s) => s.report);
  const md = useMemo(() => draftReport(report), [report]);
  const [copied, setCopied] = useState(false);
  const mdRef = useRef<HTMLDivElement>(null);

  // Strip the Markdown's own header block (title + target + redaction note) — the cover renders it —
  // and keep everything from the first "## " section onward. Severities become badges.
  const body = useMemo(() => {
    const i = md.indexOf("\n## ");
    return badgeSeverities(i >= 0 ? md.slice(i + 1) : md);
  }, [md]);

  const { session } = report;
  const target = session.target ?? session.machine;
  const name = (target && "name" in target ? target.name : undefined) ?? session.target_scope ?? "Engagement";
  const platform = target && "platform" in target ? target.platform : undefined;
  const difficulty = target?.difficulty && typeof target.difficulty === "object" ? target.difficulty.label : (target?.difficulty as string | undefined);
  const os = target?.os;
  const publicSafe = report.redaction_profile === "public_safe";

  const grade = useMemo(() => {
    try {
      const g = computeGrade(report);
      return { letter: g.letter, score: g.score, color: gradeColor(g.letter) };
    } catch {
      return null;
    }
  }, [report]);

  const chips = [platform?.toUpperCase(), difficulty, os].filter(Boolean) as string[];

  async function copy() {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked (insecure context) — the viewer is still readable */
    }
  }

  // Build the light-paper document from the live rendered report (reusing the exact markup) and send
  // it to the browser's print-to-PDF via a hidden iframe (works in the browser and the Tauri webview;
  // no popup to be blocked). The raw HTML is also what a future pdfcn pipeline would consume.
  function buildPrintHtml(): string {
    const bodyHtml = mdRef.current?.innerHTML ?? "";
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const cover = `<div class="cover"><div><div class="ek">Penetration Test Report</div><h1>${esc(name)}</h1><div class="meta">${chips.map(esc).join(" · ")}${chips.length ? " · " : ""}${publicSafe ? "redacted · shareable" : "full · do not share"}</div></div>${
      grade ? `<div class="grade"><div class="gk">Grade</div><div class="gl">${esc(grade.letter)}</div><div class="gs">${grade.score}/100</div></div>` : ""
    }</div>`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)} — Penetration Test Report</title><style>${PRINT_CSS}</style></head><body>${cover}${bodyHtml}</body></html>`;
  }

  function downloadPdf() {
    const html = buildPrintHtml();
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) { iframe.remove(); return; }
    doc.open();
    doc.write(html);
    doc.close();
    const go = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1000);
    };
    // give the webview a tick to lay out before printing
    setTimeout(go, 250);
  }

  const mdComponents = {
    code({ className, children, ...props }: { className?: string; children?: ReactNode }) {
      const txt = String(children ?? "").trim();
      const key = txt.toLowerCase();
      if (!className && SEV[key]) {
        return (
          <span className="rpt-sev" style={{ color: SEV[key], borderColor: `color-mix(in oklch, ${SEV[key]} 45%, transparent)`, background: `color-mix(in oklch, ${SEV[key]} 14%, transparent)` }}>
            {txt}
          </span>
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };

  return (
    <Section title="The report" subtitle="an OSCP/CPTS-style draft, written from the run — deterministic and offline" dataShot="report">
      <div className="overflow-hidden rounded-lg border border-edge bg-panel">
        {/* chrome bar */}
        <div className="flex items-center gap-2.5 border-b border-edge px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden="true">
            <i className="h-2.5 w-2.5 rounded-full bg-edge-bright" />
            <i className="h-2.5 w-2.5 rounded-full bg-edge-bright" />
            <i className="h-2.5 w-2.5 rounded-full bg-edge-bright" />
          </span>
          <span className="mono text-xs text-faint">report.md</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={downloadPdf}
              className="label inline-flex items-center gap-1.5 rounded border border-signal/50 bg-signal/10 px-2 py-1 text-signal transition-colors hover:bg-signal/20"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download PDF
            </button>
            <button
              type="button"
              onClick={copy}
              className="label inline-flex items-center gap-1.5 rounded border border-edge px-2 py-1 text-muted transition-colors hover:border-signal hover:text-fg"
            >
              {copied ? (
                <>
                  <Check size={12} /> Copied
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy Markdown
                </>
              )}
            </button>
          </div>
        </div>

        {/* cover */}
        <div className="flex items-start justify-between gap-4 border-b border-edge px-6 pb-5 pt-6">
          <div className="min-w-0">
            <div className="label text-faint">Penetration Test Report</div>
            <h3 className="mt-1.5 font-display text-2xl font-bold tracking-[-0.02em] text-fg">{name}</h3>
            {chips.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {chips.map((c) => (
                  <span key={c} className="label rounded border border-edge px-1.5 py-0.5 text-faint">
                    {c}
                  </span>
                ))}
                <span className={`label rounded px-1.5 py-0.5 ${publicSafe ? "text-match" : "text-flag"}`} style={{ background: `color-mix(in oklch, ${publicSafe ? "var(--color-match)" : "var(--color-flag)"} 14%, transparent)` }}>
                  {publicSafe ? "redacted · shareable" : "full · do not share"}
                </span>
              </div>
            )}
          </div>
          {grade && (
            <div className="shrink-0 rounded-lg border border-edge bg-ink/40 px-4 py-2.5 text-center">
              <div className="label text-faint">Grade</div>
              <div className="font-display text-3xl font-bold leading-none" style={{ color: grade.color }}>
                {grade.letter}
              </div>
              <div className="mono mt-1 text-[11px] text-faint">{grade.score}/100</div>
            </div>
          )}
        </div>

        {/* body */}
        <div ref={mdRef} className="md-report max-h-[560px] overflow-y-auto px-6 py-5">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {body}
          </ReactMarkdown>
        </div>
      </div>
    </Section>
  );
}
