import { useEffect, useRef, useState } from "react";
import { useReport } from "../store/report";
import { isDesktop } from "../lib/net";
import { setupItems, setupIncomplete, type SetupItemId } from "../lib/setup-menu";
import { ChevronDown } from "./icons";
import { ConnectModelPaths } from "./ConnectModelPaths";
import { VmConnector } from "./VmConnector";

/** Nav dropdown hosting the setup sections (guide / AI / VM connector / widget). One section open at a time. */
export function SetupMenu() {
  const { sessionCards, openOnboarding, setOnboardingStep } = useReport();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SetupItemId | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const desktop = isDesktop();
  const hasRealCapture = sessionCards.some((c) => !c.demo);
  const incomplete = setupIncomplete({ onboarded: true, hasRealCapture });
  const items = setupItems({ desktop });

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
    if (id === "guide") {
      if (incomplete) setOnboardingStep(1);
      openOnboarding();
      setOpen(false);
    } else if (id === "widget") {
      void import("@tauri-apps/api/core").then(({ invoke }) => invoke("open_widget"));
      setOpen(false);
    } else {
      setSection((s) => (s === id ? null : id));
    }
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
        <div className="absolute left-0 top-full z-20 mt-1 w-[22rem] max-w-[90vw] rounded-[3px] border border-edge bg-ink p-1.5 shadow-lg">
          {items.map((it) => {
            const expanded = section === it.id;
            const urgent = it.id === "guide" && incomplete;
            return (
              <div key={it.id}>
                <button
                  type="button"
                  onClick={() => select(it.id)}
                  aria-expanded={it.id === "ai" || it.id === "connector" ? expanded : undefined}
                  className={`flex w-full items-center justify-between rounded-[3px] px-2.5 py-2 text-left text-xs transition-colors hover:bg-edge/40 ${
                    urgent ? "font-semibold text-signal" : "text-fg"
                  }`}
                >
                  <span>{urgent ? "Finish setup" : it.label}</span>
                  {(it.id === "ai" || it.id === "connector") && <ChevronDown size={12} className={expanded ? "rotate-180" : ""} />}
                </button>
                {expanded && it.id === "ai" && <div className="px-2.5 pb-2"><ConnectModelPaths /></div>}
                {expanded && it.id === "connector" && <div className="px-2.5 pb-2"><VmConnector /></div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
