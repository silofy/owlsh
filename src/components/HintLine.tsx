import type { HintSource } from "../types/report";

const TAG: Partial<Record<HintSource, string>> = { "ai:golden": "ai · write-up", "ai:knowledge": "ai · model" };

/** The widget's hint line: pending state, the text, and where it came from. */
export function HintLine({ text, source, pending }: { text: string | null; source: HintSource | null; pending: boolean }) {
  if (pending) return <p className="font-sans text-[12.5px] leading-snug text-faint">hint: thinking…</p>;
  if (!text) return null;
  const tag = source ? TAG[source] : undefined;
  return (
    <p className="font-sans text-[12.5px] leading-snug text-signal">
      hint: {text}
      {tag && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-faint">{tag}</span>}
    </p>
  );
}
