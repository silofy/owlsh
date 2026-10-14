import { useState, type ReactNode } from "react";
import { CommandRow } from "./Onboarding";
import { VmConnector } from "./VmConnector";
import { Terminal, Crosshair } from "./icons";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/70";
const codeCls = "mono rounded bg-panel-2 px-1 py-0.5 text-fg";

// A numbered step — soft index chip, no connecting rail (mirrors the onboarding capture step).
function Step({ n, title, aside, body, children }: { n: number; title: string; aside?: string; body?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal/15 text-[13px] font-semibold text-signal">{n}</span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-sm font-semibold text-fg">
          {title}
          {aside && <span className="ml-2 font-normal text-muted">{aside}</span>}
        </h3>
        {body && <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>}
        <div className="mt-2.5">{children}</div>
      </div>
    </li>
  );
}

/**
 * The "Start a session" empty state. owlsh sessions are created by the capture daemon (`owlsh
 * --attach` writing to `~/.owlsh/sessions`); the app only reads them. So there is nothing to
 * "create" here — this view explains how to begin a capture, and runs appear in History on their own.
 */
export function StartCapture() {
  const [where, setWhere] = useState<"own" | "vm">("own");
  const options: { id: "own" | "vm"; icon: ReactNode; title: string; tag: string; desc: string }[] = [
    { id: "own", icon: <Terminal size={18} />, title: "On your own machine", tag: "Desktop, any OS", desc: "Kali, Parrot or WSL over OpenVPN. One watched shell, streaming live." },
    { id: "vm", icon: <Crosshair size={18} />, title: "In a remote VM", tag: "Pwnbox or AttackBox", desc: "Run the agent on HTB Pwnbox or THM AttackBox, then bring the run back." },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-7 py-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Start a session</h1>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-muted">
          owlsh records a shell while you hack, then grades the run. Sessions begin from your terminal —
          choose where you{"’"}re working and copy the commands. Your runs show up in <span className="text-fg">History</span> automatically.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-base font-semibold text-fg">Where do you hack?</h2>
        <div role="radiogroup" aria-label="Where do you hack?" className="grid gap-2.5 sm:grid-cols-2">
          {options.map((o) => {
            const on = where === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setWhere(o.id)}
                className={`group flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors motion-reduce:transition-none ${FOCUS} ${
                  on ? "border-signal bg-signal/[0.06]" : "border-edge bg-panel hover:border-muted/50 hover:bg-panel-2"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${on ? "bg-signal/15 text-signal" : "bg-panel-2 text-muted group-hover:text-fg"}`}>
                    {o.icon}
                  </span>
                  <span aria-hidden className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-colors ${on ? "border-signal" : "border-edge group-hover:border-muted"}`}>
                    {on && <span className="h-2 w-2 rounded-full bg-signal" />}
                  </span>
                </div>
                <div>
                  <div className="font-display text-sm font-semibold text-fg">{o.title}</div>
                  <div className="mt-0.5 text-xs text-muted">{o.tag}</div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{o.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {where === "own" ? (
        <div className="rounded-xl border border-edge bg-panel p-5">
          <ol className="m-0 list-none space-y-5 p-0">
            <Step n={1} title="Install the agent" aside="one time" body="Downloads the prebuilt binary and verifies its checksum.">
              <CommandRow cmd="curl -fsSL https://raw.githubusercontent.com/silofy/owlsh/main/install.sh | sh" />
              <p className="mt-2 text-xs text-muted">
                On Windows, run <code className={codeCls}>irm https://raw.githubusercontent.com/silofy/owlsh/main/install.ps1 | iex</code> instead.
              </p>
            </Step>
            <Step n={2} title="Run a watched shell" body={<>Every command streams in live as you run it. Type <code className={codeCls}>exit</code> to stop.</>}>
              <CommandRow cmd="owlsh --attach --platform htb --target <box>" />
              <p className="mt-2 text-xs text-muted">
                Other platforms: <code className={codeCls}>--platform thm</code>, plus offsec, immersive and local. Add <code className={codeCls}>--new</code> to force a fresh session.
              </p>
            </Step>
          </ol>
        </div>
      ) : (
        <VmConnector />
      )}

      <p className="text-xs text-muted">
        Once a run finishes it lands in <span className="text-fg">History</span> — open it for the graded debrief, coverage, and what you{"’"}d do differently.
      </p>
    </div>
  );
}
