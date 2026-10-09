/**
 * The golden path behind live AI hints, resolved by box name once the operator has opted in (the box
 * name leaves the machine). HTB only: official write-up with a token, else 0xdf. Any miss → NONE, which
 * the caller caches in `<report>.golden` so a run never refetches.
 */
import type { LlmProvider } from "../llm/provider";
import type { HintGolden } from "../../types/report";
import { fetchWriteupFrom0xdf, fetchHtbWriteup, hasHtbToken } from "../net";
import { goldenFromText } from "../writeup";

export const NONE: HintGolden = { source: "none", confidence: 0, golden: [] };

export type LookupPref = "on" | "off" | "unset";
const KEY = "owlsh.hintLookup";

export function getLookupPref(): LookupPref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "on" || v === "off") return v;
  } catch {
    /* no localStorage (terminal widget / tests) */
  }
  return "unset";
}

export function setLookupPref(p: "on" | "off"): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* ignore */
  }
}

export interface GoldenDeps {
  fetch0xdf(box: string): Promise<string>;
  fetchHtb(box: string): Promise<string>;
  hasHtbToken(): Promise<boolean>;
  extract(text: string, box: string, source: string): Promise<HintGolden | null>;
}

export function defaultGoldenDeps(provider: LlmProvider, os: string | null): GoldenDeps {
  return {
    fetch0xdf: fetchWriteupFrom0xdf,
    fetchHtb: fetchHtbWriteup,
    hasHtbToken,
    async extract(text, box, source) {
      const r = await goldenFromText(text, { name: box, os }, provider, source);
      return r.golden.length ? { source: r.source, confidence: r.confidence, golden: r.golden } : null;
    },
  };
}

async function lookup(target: { platform: string; name: string }, d: GoldenDeps): Promise<HintGolden> {
  if (target.platform !== "htb") return NONE;
  const tries: [string, () => Promise<string>][] = [];
  if (await d.hasHtbToken().catch(() => false)) tries.push(["htb-official", () => d.fetchHtb(target.name)]);
  tries.push(["0xdf", () => d.fetch0xdf(target.name)]);
  for (const [source, get] of tries) {
    try {
      const g = await d.extract(await get(), target.name, source);
      if (g && g.golden.length) return g;
    } catch {
      /* next source */
    }
  }
  return NONE;
}

export async function resolveGolden(target: { platform: string; name: string }, deps: GoldenDeps, budgetMs = 30000): Promise<HintGolden> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<HintGolden>((r) => {
    timer = setTimeout(() => r(NONE), budgetMs);
  });
  try {
    return await Promise.race([lookup(target, deps).catch(() => NONE), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
