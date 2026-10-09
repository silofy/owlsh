/**
 * Leak guard for AI hints — the feature's security boundary.
 *
 * It fails closed: anything it cannot positively accept (wrong shape, a concrete
 * artifact, an unrevealed objective term, an unseen tool at tier 1) is rejected,
 * and the caller substitutes a fixed generic hint. A hint may nudge the learner's
 * process; it must never hand them a concrete answer.
 */
import type { Episode, GoldenObjective } from "../../types/report";

export type HintKind = "process" | "area" | "technique";

export interface GuardCtx {
  tier: 1 | 2 | 3;
  golden: GoldenObjective[] | null;
  seen: Set<string>;
}

export type GuardResult = { ok: true; text: string; kind: HintKind } | { ok: false; reason: string };

const MAX_WORDS = 30;
const MAX_CHARS = 300;
const KINDS: readonly HintKind[] = ["process", "area", "technique"];

export const KNOWN_TOOLS: string[] = [
  "nmap", "masscan", "rustscan", "gobuster", "feroxbuster", "ffuf", "dirb", "dirbuster", "wfuzz", "nikto",
  "sqlmap", "hydra", "medusa", "john", "hashcat", "metasploit", "msfconsole", "msfvenom", "searchsploit", "burpsuite",
  "netcat", "ncat", "socat", "smbclient", "smbmap", "enum4linux", "crackmapexec", "netexec", "impacket", "evil-winrm",
  "responder", "mimikatz", "bloodhound", "kerbrute", "rubeus", "linpeas", "winpeas", "pspy", "chisel", "wpscan",
  "whatweb", "ldapsearch", "rpcclient", "snmpwalk",
];

const GOLDEN_STOPWORDS = new Set([
  "enumerate", "access", "service", "escalate", "privilege", "initial", "foothold", "user", "root", "flag",
  "capture", "shell", "recon", "discover", "exploit", "credential", "credentials", "files", "file", "check", "web",
]);

const ARTIFACT_PATTERNS: [string, RegExp][] = [
  ["url", /\b[a-z][a-z0-9+.-]*:\/\/|\bwww\./i],
  ["ipv4", /\b\d{1,3}(?:\.\d{1,3}){3}\b/],
  ["hostname", /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/i],
  ["cve", /\bcve-\d{4}-\d{3,}\b/i],
  ["path", /(?:^|[^\w])(?:~|\.{1,2})?\/[\w.-]+\/|\b[\w.-]+\/[\w.-]+\/[\w.-]+|[a-z]:\\|\\[\w.-]+\\/i],
  ["flag", /\b\w{2,16}\{[^}]*\}/],
  ["hex", /\b(?:0x)?[0-9a-f]{16,}\b/i],
  ["credential", /\b(?:password|passwd|passphrase|pwd|secret|token|api[ _-]?key)\s*(?:is|was|=|:)/i],
  ["command", /(?:^|\s)--?[a-z][\w-]*|\||(?:^|\s)\d?[<>]{1,2}|\$\(|\$\{|`|&&/i],
];

// Format characters (\p{Cf}: zero-width space/joiners, word joiner, BOM, soft hyphen,
// bidi controls, tag characters) plus invisible fillers and variation selectors that
// are not Cf. Stripped so they cannot split a forbidden term.
const INVISIBLE =
  /[\p{Cf}͏ᅟᅠ឴឵᠋-᠏ㅤ︀-️ﾠ\u{E0100}-\u{E01EF}]/gu;

/** NFKC-fold compatibility forms (full-width etc.), then drop invisible characters. */
function normalizeHint(text: string): string {
  return text.normalize("NFKC").replace(INVISIBLE, "");
}

// Hints are English-only: any letter outside ASCII A-Z/a-z (look-alikes from other
// scripts, accented or Latin-extended letters) could smuggle a term past [a-z] matching.
// Combining marks (\p{M}) are rejected too: a letter + mark with no precomposed form
// survives NFKC and would split a term the same way.
function hasNonAsciiLetter(text: string): boolean {
  return /(?![A-Za-z])\p{L}|\p{M}/u.test(text);
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function hasMixedClassToken(text: string): boolean {
  return words(text).some((w) => {
    const t = w.replace(/^[^\w]+|[^\w]+$/g, "");
    if (t.length < 8) return false;
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(t)).length;
    return classes >= 3;
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The optional "s"/"es" suffix also widens seen/satisfied matching: a term in `seen`
// is skipped, so its plural passes too. Intended.
function containsWord(haystackLower: string, term: string): boolean {
  return new RegExp(`(?<![a-z0-9])${escapeRe(term)}(?:e?s)?(?![a-z0-9])`).test(haystackLower);
}

function isSatisfied(o: GoldenObjective): boolean {
  return o.user_satisfied_by_seq !== null && o.user_satisfied_by_seq !== undefined;
}

/** Validates shape and yields the normalized, trimmed text — the single source for later checks. */
function shape(raw: unknown, ctx: GuardCtx): GuardResult {
  const fail = (reason: string): GuardResult => ({ ok: false, reason });
  if (typeof raw !== "object" || raw === null) return fail("shape: not an object");
  const { hint, kind } = raw as Record<string, unknown>;
  if (typeof hint !== "string") return fail("shape: missing or empty hint");
  const text = normalizeHint(hint).trim();
  if (text === "") return fail("shape: missing or empty hint");
  if (typeof kind !== "string" || !KINDS.includes(kind as HintKind)) return fail("shape: bad kind");
  if (text.length > MAX_CHARS) return fail("shape: too long");
  if (words(text).length > MAX_WORDS) return fail("shape: too many words");
  if (hasNonAsciiLetter(text)) return fail("shape: non-ascii letter");
  if (ctx.tier === 1 && kind !== "process") return fail("shape: tier 1 requires process");
  if (ctx.tier === 2 && kind === "technique") return fail("shape: tier 2 forbids technique");
  return { ok: true, text, kind: kind as HintKind };
}

function artifacts(text: string): string | null {
  for (const [name, re] of ARTIFACT_PATTERNS) if (re.test(text)) return `artifacts: ${name}`;
  if (hasMixedClassToken(text)) return "artifacts: secret-like token";
  return null;
}

function golden(text: string, ctx: GuardCtx): string | null {
  if (!ctx.golden) return null;
  const lower = text.toLowerCase();
  for (const o of ctx.golden) {
    if (isSatisfied(o)) continue;
    const terms = [...o.objective.split("_"), ...o.satisfied_by, ...(o.techniques ?? [])]
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 4 && !GOLDEN_STOPWORDS.has(t));
    for (const t of terms) {
      if (!ctx.seen.has(t) && containsWord(lower, t)) return `golden: ${t}`;
    }
  }
  return null;
}

function tierOneTools(text: string, ctx: GuardCtx): string | null {
  if (ctx.tier !== 1) return null;
  const lower = text.toLowerCase();
  const tools = [...KNOWN_TOOLS, ...(ctx.golden ?? []).flatMap((o) => o.satisfied_by)].map((t) => t.toLowerCase());
  for (const t of tools) {
    if (!ctx.seen.has(t) && containsWord(lower, t)) return `tierOneTools: ${t}`;
  }
  return null;
}

export function guard(raw: unknown, ctx: GuardCtx): GuardResult {
  let shaped: GuardResult;
  try {
    shaped = shape(raw, ctx);
  } catch {
    return { ok: false, reason: "guard: exception" };
  }
  if (!shaped.ok) return shaped;
  const { text, kind } = shaped;
  let reason: string | null;
  try {
    reason = artifacts(text) ?? golden(text, ctx) ?? tierOneTools(text, ctx);
  } catch {
    return { ok: false, reason: "guard: exception" };
  }
  return reason ? { ok: false, reason } : { ok: true, text, kind };
}

export function seenTerms(episodes: Episode[]): Set<string> {
  const out = new Set<string>();
  for (const e of episodes) {
    for (const src of [e.cmd, e.output_digest ?? ""]) {
      for (const tok of src.toLowerCase().split(/[^\w.-]+/)) {
        const t = tok.replace(/^[.-]+|[.-]+$/g, "");
        if (t.length >= 3) out.add(t);
      }
    }
  }
  return out;
}
