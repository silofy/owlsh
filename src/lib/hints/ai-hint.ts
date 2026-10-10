/**
 * Session-aware hint text. The model may see the golden objectives (never write-up text); whatever it
 * says passes the fail-closed guard, and any failure returns the static tier hint.
 */
import type { LlmProvider } from "../llm/provider";
import type { Episode, GoldenObjective, HintSource } from "../../types/report";
import { hintFor, type HintTier } from "../widget/hints";
import { guard, seenTerms } from "./guard";
import { testOverride } from "./test-overrides";

export const HINT_SCHEMA = {
  type: "object",
  properties: { hint: { type: "string" }, kind: { type: "string", enum: ["process", "area", "technique"] } },
  required: ["hint", "kind"],
} as const;

export interface HintInput { tier: HintTier; box: string; platform: string; episodes: Episode[]; golden: GoldenObjective[] | null }

const TIER_RULE: Record<HintTier, string> = {
  1: 'kind "process": a nudge about how they are working, grounded only in their own output. Name no tool or service they have not already used.',
  2: 'kind "area": which service or phase deserves attention. No technique.',
  3: 'kind "technique": the general class of technique to consider, described in plain words.',
};

export function buildHintPrompt(i: HintInput): string {
  const steps = i.episodes.filter((e) => e.cmd).slice(-20).map(
    (e) => `[#${e.seq}] ${JSON.stringify(e.cmd).slice(0, 200)} -> ${JSON.stringify(e.output_digest ?? "").slice(0, 180)}`,
  );
  const path = i.golden
    ? [
        "Intended path (for your steering only, never to be repeated):",
        ...i.golden.map((o) => `- ${o.user_satisfied_by_seq != null ? "SATISFIED" : "UNSATISFIED"}: ${o.objective} (${o.tactic})`),
      ]
    : [`Use your own knowledge of ${i.box} on ${i.platform} if you have it; otherwise coach from the session alone.`];
  return [
    `You are a coach, not a solver, for a practice-lab session on "${i.box}" (${i.platform}).`,
    `Give ONE hint of at most 30 words, ${TIER_RULE[i.tier]}`,
    "Never state a command, file path, credential, URL, CVE, hostname, username or flag.",
    "Never name anything from UNSATISFIED objectives verbatim; describe the category of thing instead.",
    'Return ONLY JSON: {"hint": string, "kind": "process" | "area" | "technique"}.',
    "",
    ...path,
    "",
    "Session so far:",
    ...steps,
  ].join("\n");
}

const STATIC = (tier: HintTier) => ({ text: hintFor(tier), source: "static" as HintSource });

export async function generateHint(i: HintInput, provider: LlmProvider, timeoutMs = testOverride("hintTimeoutMs") ?? 8000): Promise<{ text: string; source: HintSource }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((r) => { timer = setTimeout(() => r(null), timeoutMs); });
    const raw = await Promise.race([provider.generateJson(buildHintPrompt(i), { schema: HINT_SCHEMA, temperature: 0.2 }), timeout]);
    const v = guard(raw, { tier: i.tier, golden: i.golden, seen: seenTerms(i.episodes) });
    return v.ok ? { text: v.text, source: i.golden ? "ai:golden" : "ai:knowledge" } : STATIC(i.tier);
  } catch {
    return STATIC(i.tier);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
