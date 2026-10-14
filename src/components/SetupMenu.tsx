import { useEffect, useRef, useState } from "react";
import { useReport } from "../store/report";
import { isDesktop } from "../lib/net";
import { setupItems, setupIncomplete, setupItemTarget, type SetupItemId } from "../lib/setup-menu";
import { useCoachStatus } from "./CoachStatus";
import { ChevronDown, Check } from "./icons";

/** Nav dropdown that deep-links into the activation wizard (or opens the widget on desktop). */
export function SetupMenu() {
  const { sessionCards, onboardingOpen, openOnboarding, setOnboardingStep, setSetupJump } = useReport();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const desktop = isDesktop();
  const hasRealCapture = sessionCards.some((c) => !c.demo);
  const incomplete = setupIncomplete({ onboarded: !onboardingOpen, hasRealCapture });
  const items = setupItems({ desktop });
  // Re-probe the model connection each time the menu opens, so the "Connect a model" row is current.
  const coach = useCoachStatus(open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function select(id: SetupItemId) {
    const t = setupItemTarget(id);
    if (t.widget) {
      void import("@tauri-apps/api/core").then(({ invoke }) => invoke("open_widget"));
    } else {
      if (t.jump) setSetupJump(t.jump);
      if (t.step !== undefined) setOnboardingStep(t.step);
      openOnboarding();
    }
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative flex items-stretch">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className={`label -mb-px flex items-center gap-1.5 border-b-2 px-0.5 text-xs tracking-[0.12em] transition-colors ${
          open ? "border-signal font-semibold text-fg" : "border-transparent text-muted hover:text-fg"
        }`}
      >
        Setup
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: incomplete ? "var(--color-detour)" : "var(--color-faint)" }} />
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[16rem] max-w-[90vw] rounded-lg border border-edge bg-panel p-2 shadow-xl">
          {items.map((it) => {
            const urgent = it.id === "guide" && incomplete;
            const aiConnected = it.id === "ai" && coach.connected;
            const desc = it.id === "ai" && coach.connected ? `Connected · ${coach.label}` : it.desc;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => select(it.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2.5 text-left text-sm transition-colors hover:border-edge-bright hover:bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/70 motion-reduce:transition-none ${
                  urgent ? "font-semibold text-signal" : "text-fg"
                }`}
              >
                <span className="flex flex-col gap-0.5">
                  <span>{urgent ? "Finish setup" : it.label}</span>
                  <span className={`text-xs font-normal ${aiConnected ? "text-match" : "text-faint"}`}>{desc}</span>
                </span>
                {aiConnected && <Check size={13} className="shrink-0 text-match" aria-label="connected" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
