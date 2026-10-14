/** Test-only knobs for the browser e2e suite. Production never defines `__OWLSH_TEST__`. */
type Key = "hintTimeoutMs" | "goldenBudgetMs";

export function testOverride(key: Key): number | undefined {
  const v = (globalThis as { __OWLSH_TEST__?: Partial<Record<Key, unknown>> }).__OWLSH_TEST__?.[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}
