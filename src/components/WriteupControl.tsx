import { useState, useEffect } from "react";
import { useReport } from "../store/report";
import { machineOf } from "../lib/machine";
import { targetOf, adapterFor } from "../lib/platform";
import { resolveProvider } from "../lib/llm";
import { goldenFromText } from "../lib/writeup";
import { fetchWriteupUrl, fetchWriteupFrom0xdf, writeupSearchUrl, isDesktop, hasHtbToken, setHtbToken, fetchHtbWriteup, openExternal } from "../lib/net";
import { useReuseHintGolden } from "./useReuseHintGolden";
import { Check, ChevronDown, ExternalLink } from "./icons";

type Status = { kind: "idle" | "working" | "error"; msg?: string };

type GlyphName = "zap" | "play" | "shield" | "link" | "type" | "lock" | "book" | "search";

/** Small stroke glyph for the source cards / row labels — matches the editorial-dark icon language. */
function Glyph({ name, size = 15, className = "" }: { name: GlyphName; size?: number; className?: string }) {
  const paths: Record<GlyphName, JSX.Element> = {
    zap: <path d="M13 2 3 14h7l-1 8 10-12h-7z" />,
    play: <><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    link: <><path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.07 0l-2 2a5 5 0 0 0 7.07 7.07l1.1-1.1" /></>,
    type: <><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    book: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
    search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {paths[name]}
    </svg>
  );
}

export type WriteupSourceKind = "0xdf" | "ippsec" | "htb-fetch" | "htb-search" | "open-room" | "yt-search" | "web-search";
export interface WriteupSource {
  key: string;
  icon: GlyphName;
  title: string;
  desc: string;
  kind: WriteupSourceKind;
  external?: boolean;
  rec?: boolean;
  lock?: boolean;
}

/**
 * The quick-source cards for a platform. THM's intended path is the room's own guided tasks (open
 * the room, copy them, paste below) plus community walkthroughs. local/immersive captures have no
 * canonical write-up, so they fall back to the URL / paste rows alone. Everything else — HTB, the
 * fictional "breachyard" demo, OffSec, unknown — gets the HTB-style set (0xdf / IppSec / official).
 */
export function writeupSourcesFor(platform: string, opts: { htbReady: boolean; desktop: boolean }): WriteupSource[] {
  if (platform === "thm")
    return [
      { key: "room", icon: "book", title: "Open room", desc: "Copy the guided tasks", kind: "open-room", external: true, rec: true },
      { key: "yt", icon: "play", title: "Walkthroughs", desc: "Search YouTube", kind: "yt-search", external: true },
      { key: "web", icon: "search", title: "Write-ups", desc: "Search the web", kind: "web-search", external: true },
    ];
  if (platform === "local" || platform === "immersive") return [];
  return [
    { key: "0xdf", icon: "zap", title: "0xdf", desc: "Auto-fetch · one click", kind: "0xdf", rec: true },
    { key: "ippsec", icon: "play", title: "IppSec", desc: "Video walkthrough", kind: "ippsec", external: true },
    opts.desktop
      ? { key: "htb", icon: "shield", title: "HTB", desc: opts.htbReady ? "Official write-up" : "Needs app token", kind: "htb-fetch", lock: !opts.htbReady }
      : { key: "htb", icon: "shield", title: "HTB", desc: "Search (auth-gated)", kind: "htb-search", external: true },
  ];
}

/** What we're pulling in, per platform — THM's intended path is a room's tasks, not a write-up. */
export function writeupNoun(platform: string): { noun: string; artifact: string } {
  return platform === "thm" ? { noun: "room", artifact: "tasks" } : { noun: "box", artifact: "write-up" };
}

const SRC: Record<string, string> = { "htb-official": "HTB official", "0xdf": "0xdf", "ippsec-notes": "IppSec notes", "htb-auto": "HTB", pasted: "pasted write-up" };

/** Tauri rejects a command with the raw `Err(String)`, not an Error — surface either form. */
function errMsg(e: unknown, fallback: string): string {
  if (typeof e === "string" && e.trim()) return e;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/**
 * Reference-path control — a minimal accordion docked just under the identity band. Collapsed it's a
 * one-line status; expanded it offers the load actions (0xdf auto-fetches via its sitemap; IppSec/HTB
 * open a search or fetch with a token; plus URL and paste). Read by the local model only.
 */
export function WriteupControl() {
  const { report, applyGoldenDag, writeup } = useReport();
  const box = machineOf(report);
  const target = targetOf(report);
  const isThm = target.platform === "thm";
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [htbReady, setHtbReady] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const working = status.kind === "working";

  useReuseHintGolden();

  useEffect(() => {
    hasHtbToken().then(setHtbReady);
  }, []);

  async function extract(content: string, sourceLabel: string) {
    if (!content.trim()) return;
    // Try the target's native intended-path first (any adapter that has one — currently just THM's
    // task list) before falling back to write-up extraction below.
    const adapter = adapterFor(target.platform);
    if (adapter?.intendedPath && sourceLabel === "pasted") {
      const tree = await adapter.intendedPath({ target, raw: content });
      if (tree) {
        applyGoldenDag(tree, { source: adapter.id === "thm" ? "thm-tasks" : `${adapter.id}-native`, confidence: 0.7 });
        setStatus({ kind: "idle" });
        setText("");
        setUrl("");
        return;
      }
    }
    setStatus({ kind: "working", msg: "Reading the write-up with the local model…" });
    try {
      const provider = await resolveProvider();
      const res = await goldenFromText(content, { name: box.name, os: report.session.machine?.os ?? null }, provider, sourceLabel);
      if (res.golden.length === 0) {
        setStatus({ kind: "error", msg: res.note ?? "Couldn't extract an intended path from that — try a fuller write-up." });
        return;
      }
      applyGoldenDag(res.golden, { source: res.source, confidence: res.confidence });
      setStatus({ kind: "idle" });
      setText("");
      setUrl("");
    } catch {
      setStatus({ kind: "error", msg: "Extraction failed — is the local model reachable?" });
    }
  }

  async function fromUrl(u: string) {
    if (!u.trim()) return;
    setStatus({ kind: "working", msg: "Fetching the write-up…" });
    try {
      await extract(await fetchWriteupUrl(u.trim()), "pasted");
    } catch {
      setStatus({ kind: "error", msg: "Couldn't fetch that URL — check the link, or paste the write-up text instead." });
    }
  }

  async function from0xdf() {
    setStatus({ kind: "working", msg: `Finding 0xdf's write-up for ${box.name}…` });
    try {
      await extract(await fetchWriteupFrom0xdf(box.name), "0xdf");
    } catch (e) {
      setStatus({ kind: "error", msg: errMsg(e, "0xdf lookup failed — paste the URL instead.") });
    }
  }

  async function fromHtb() {
    if (!(await hasHtbToken())) {
      setShowToken(true);
      return;
    }
    setStatus({ kind: "working", msg: `Fetching HTB's official write-up for ${box.name}…` });
    try {
      await extract(await fetchHtbWriteup(box.name), "htb-official");
    } catch (e) {
      setStatus({ kind: "error", msg: `${errMsg(e, "HTB fetch failed")} — or use URL / paste.` });
    }
  }

  async function saveToken() {
    const t = tokenInput.trim();
    if (!t) return;
    try {
      await setHtbToken(t);
      setTokenInput("");
      setShowToken(false);
      setHtbReady(true);
      await fromHtb();
    } catch (e) {
      setStatus({ kind: "error", msg: errMsg(e, "Couldn't save the token.") });
    }
  }

  // sources are method cards; the URL / paste submits share one quiet mint action style.
  const btnAction =
    "label inline-flex shrink-0 items-center justify-center rounded-md border border-signal/35 bg-signal/15 px-3 py-1.5 text-signal transition-colors hover:border-signal/70 hover:bg-signal/25 disabled:opacity-40 disabled:hover:border-signal/35 disabled:hover:bg-signal/15";
  const cardBase =
    "group/card flex flex-col gap-1 rounded-lg border bg-panel-2/30 p-3 text-left transition-colors hover:bg-panel-2 disabled:opacity-40 disabled:hover:bg-panel-2/30";

  const sources = writeupSourcesFor(target.platform, { htbReady, desktop: isDesktop() });
  const { noun, artifact } = writeupNoun(target.platform);
  function runSource(kind: WriteupSourceKind) {
    const q = encodeURIComponent;
    switch (kind) {
      case "0xdf": return from0xdf();
      case "ippsec": return openExternal(writeupSearchUrl("ippsec", box.name));
      case "htb-fetch": return fromHtb();
      case "htb-search": return openExternal(writeupSearchUrl("htb", box.name));
      case "open-room": return openExternal(target.url ?? `https://tryhackme.com/search?q=${q(box.name)}`);
      case "yt-search": return openExternal(`https://www.youtube.com/results?search_query=${q(`tryhackme ${box.name} walkthrough`)}`);
      case "web-search": return openExternal(`https://duckduckgo.com/?q=${q(`tryhackme ${box.name} writeup`)}`);
    }
  }

  return (
    <details className="group border-b border-edge">
      <summary className="-mx-2 flex cursor-pointer list-none items-center gap-2 rounded-md border border-transparent px-2 py-2.5 transition-colors hover:border-edge-bright hover:bg-panel-2 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-muted transition-colors group-hover:text-fg">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
            <span className="section-title">Writeup reference</span>
          </span>
          {writeup ? (
            <span className="flex items-center gap-1.5 text-sm">
              <Check size={14} className="text-match" />
              <span className="font-medium text-fg">{SRC[writeup.source] ?? writeup.source}</span>
              <span className="text-xs text-faint">· {Math.round(writeup.confidence * 100)}%</span>
            </span>
          ) : (
            <span className="text-sm text-muted">
              None yet — <span className="text-fg">grading your run only</span>
            </span>
          )}
        </div>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-edge-bright px-2.5 py-1 text-xs font-medium text-muted transition-colors group-hover:border-signal group-hover:text-fg">
          {writeup ? "Replace" : "Add to compare"}
          <ChevronDown className="transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="space-y-3.5 pb-4">
        {!writeup && (
          <p className="max-w-[62ch] text-[13px] leading-relaxed text-muted">
            We grade <span className="text-fg">how</span> you worked, not <span className="text-fg">what</span> you did. Pull this {noun}'s {artifact} and we'll line your route up against the intended solution — detours, skipped steps, and missed objectives.
          </p>
        )}

        {/* sources as method cards — platform-specific; the recommended one carries the mint accent */}
        {sources.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {sources.map((src) => (
              <button
                key={src.key}
                type="button"
                onClick={() => runSource(src.kind)}
                disabled={working}
                className={`${cardBase} ${src.rec ? "border-signal/40 hover:border-signal" : "border-edge hover:border-edge-bright"}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <Glyph name={src.icon} className={src.rec ? "text-signal" : "text-muted group-hover/card:text-fg"} /> {src.title}
                  {src.rec ? (
                    <span className="label ml-auto rounded bg-signal/15 px-1 py-0.5 text-[9px] text-signal">rec</span>
                  ) : src.lock ? (
                    <Glyph name="lock" size={11} className="ml-auto text-faint" />
                  ) : src.external ? (
                    <ExternalLink size={12} className="ml-auto text-faint" />
                  ) : null}
                </span>
                <span className="text-xs text-muted">{src.desc}</span>
              </button>
            ))}
          </div>
        )}

        {showToken && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-edge-bright bg-panel-2/40 p-2">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveToken()}
              placeholder="Paste your HTB App Token (profile → settings) — stored locally, needs VIP"
              className="mono min-w-0 flex-1 rounded-md border border-edge bg-ink/60 px-2.5 py-1.5 text-xs text-fg placeholder:text-faint focus:border-signal focus:outline-none"
            />
            <button type="button" onClick={saveToken} disabled={working || !tokenInput.trim()} className="label shrink-0 rounded-md bg-fg px-3 py-1.5 text-ink transition-colors hover:bg-fg/90 disabled:opacity-40">
              Save &amp; fetch
            </button>
          </div>
        )}

        {sources.length > 0 && <div className="h-px bg-edge" />}

        {/* bring your own — a URL, or the raw text — each a labeled row */}
        <div className="flex items-center gap-2.5">
          <span className="flex w-14 shrink-0 items-center gap-1.5 text-xs text-faint">
            <Glyph name="link" size={13} /> URL
          </span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fromUrl(url)}
            placeholder="paste a write-up URL…"
            className="mono min-w-0 flex-1 rounded-md border border-edge bg-ink/60 px-2.5 py-1.5 text-xs text-fg placeholder:text-faint focus:border-signal focus:outline-none"
          />
          <button type="button" onClick={() => fromUrl(url)} disabled={working || !url.trim()} className={btnAction}>
            Fetch
          </button>
        </div>

        <div className="flex items-start gap-2.5">
          <span className="flex w-14 shrink-0 items-center gap-1.5 pt-1.5 text-xs text-faint">
            <Glyph name="type" size={13} /> {isThm ? "Tasks" : "Text"}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={
                isThm
                  ? "Paste the room's tasks (Task 1 — Title, …). Read locally — nothing is uploaded."
                  : "Paste the write-up text. Read locally to extract the intended path — nothing is uploaded."
              }
              className="mono w-full resize-y rounded-md border border-edge bg-ink/60 px-2.5 py-2 text-xs leading-relaxed text-fg placeholder:text-faint focus:border-signal focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3">
              {status.kind === "error" && status.msg ? (
                <span className="text-xs text-detour">{status.msg}</span>
              ) : working ? (
                <span className="text-xs text-faint">{status.msg}</span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-faint">
                  <Glyph name="lock" size={11} /> Stays on this machine — nothing is uploaded.
                </span>
              )}
              <button type="button" onClick={() => extract(text, "pasted")} disabled={working || !text.trim()} className={btnAction}>
                {working ? "Working…" : "Analyze"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
