/** Opt-in, graded hints. The widget never volunteers these: the operator pulls one when stuck, and
 *  each pull is recorded and costs independence. Prompts are generic methodology — they point at
 *  *process* (what kind of thing to re-check), never at a box-specific answer. */
export type HintTier = 1 | 2 | 3;

export interface HintPull { tier: HintTier; atMs: number; phase: string }

/** Independence points deducted per pull, by tier. */
export const HINT_PENALTY: Record<HintTier, number> = { 1: 3, 2: 6, 3: 10 };

const PROMPTS: Record<HintTier, string> = {
  1: "Re-read your own output: is there anything you found but haven't followed up?",
  2: "List every service and finding so far. Which one have you spent the least time on?",
  3: "Write down your current theory in one sentence, then test the assumption it rests on.",
};

export function hintFor(tier: HintTier): string {
  return PROMPTS[tier];
}

/** Next tier to offer given what's already been pulled this run (escalates, caps at 3). */
export function nextTier(pulls: HintPull[]): HintTier {
  const top = pulls.reduce((m, p) => Math.max(m, p.tier), 0);
  return (Math.min(3, top + 1) as HintTier);
}

/** Total independence penalty for a run's hint pulls (0 when none — black-boxing costs nothing). */
export function independencePenalty(pulls: HintPull[]): number {
  return pulls.reduce((s, p) => s + HINT_PENALTY[p.tier], 0);
}
