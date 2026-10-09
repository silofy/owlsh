import { setLookupPref } from "../lib/hints/golden-source";

/** One-time consent to look up a box's public write-up. Saves the choice, then calls onDone. */
export function LookupOptIn({ box, onDone }: { box: string; onDone(): void }) {
  const choose = (p: "on" | "off") => {
    setLookupPref(p);
    onDone();
  };
  return (
    <div className="flex flex-col gap-1 rounded border border-edge p-2 font-sans text-[12px]">
      <span>Look up a write-up for {box}? Sends the box name to HTB / 0xdf. Used only to steer hints.</span>
      <div className="flex gap-2">
        <button type="button" className="text-signal" onClick={() => choose("on")}>Yes</button>
        <button type="button" className="text-muted" onClick={() => choose("off")}>No, model only</button>
      </div>
    </div>
  );
}
