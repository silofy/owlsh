import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadPwnboxConfig, savePwnboxConfig, pullPwnbox, parseSshTarget, formatSshTarget, setConnectorPlatform, type PwnboxConfig } from "../lib/pwnbox";
import { activePlatform } from "../lib/platform";
import { connectorView } from "../lib/connector-view";
import { useReport } from "../store/report";
import type { PlatformId } from "../types/report";

type Sync = { kind: "idle" | "ok" | "error"; msg?: string; at?: number };

// Only HTB (Pwnbox) and THM (AttackBox) are remote VMs with a shell to connect to; OffSec/Immersive/
// Local are local or browser-only and belong in the "on your own machine" path, not here.
const SSH_PLATFORMS: PlatformId[] = ["htb", "thm"];
const VM_PLATFORMS: { id: PlatformId; title: string; tag: string; desc: string }[] = [
  { id: "htb", title: "Hack The Box", tag: "Pwnbox", desc: "Browser VM with a full shell — run the agent over SSH." },
  { id: "thm", title: "TryHackMe", tag: "AttackBox", desc: "In-browser AttackBox — run the agent over SSH." },
];

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mono rounded border border-edge bg-ink/60 px-2 py-1 text-xs text-fg placeholder:text-faint focus:border-signal focus:outline-none"
      />
    </label>
  );
}

// A real on/off switch (role=switch) — replaces the bare status dot the connector used before.
function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/70 ${
        on ? "bg-signal" : "bg-panel-2 ring-1 ring-inset ring-edge"
      }`}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-full transition-transform motion-reduce:transition-none"
        style={{ background: on ? "var(--color-ink)" : "var(--color-faint)", transform: on ? "translateX(19px)" : "translateX(3px)" }}
      />
    </button>
  );
}

// Local copy-command block (mirrors Onboarding's CommandRow; defined here to avoid an import cycle).
function CmdRow({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(cmd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — the command stays selectable by hand */
    }
  };
  return (
    <div className="flex items-start justify-between gap-3 overflow-x-auto rounded-md border border-edge bg-ink/70 px-3 py-2 ring-1 ring-inset ring-white/[0.02]">
      <code className="mono whitespace-pre text-[13px] text-fg">
        <span className="select-none text-faint">$ </span>
        {cmd}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy command"
        className="shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors hover:bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/70"
      >
        <span aria-live="polite">{copied ? <span className="text-match">{"✓"} Copied</span> : <span className="text-muted hover:text-fg">Copy</span>}</span>
      </button>
    </div>
  );
}

const codeCls = "mono rounded bg-panel-2 px-1 py-0.5 text-fg";

function Step({ n, last, title, children }: { n: number; last?: boolean; title: ReactNode; children: ReactNode }) {
  return (
    <li className={`flex gap-3.5 ${last ? "" : "pb-5"}`}>
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal/15 text-[13px] font-semibold text-signal">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <h4 className="font-display text-sm font-semibold text-fg">{title}</h4>
        {children}
      </div>
    </li>
  );
}

/**
 * Platform-aware VM connector panel (body only; the Setup menu owns the row/toggle). SSH platforms
 * (HTB Pwnbox, THM AttackBox) get a one-line capture hint plus the optional live auto-pull; local/none
 * platforms get a one-line note and never start a pull.
 */
export function VmConnector() {
  const { report, sessionCards } = useReport();
  const initial = activePlatform(report, sessionCards);
  const [platform, setPlatform] = useState<PlatformId>(SSH_PLATFORMS.includes(initial) ? initial : "htb");
  const [cfg, setCfg] = useState<PwnboxConfig>(loadPwnboxConfig);
  const [target, setTarget] = useState(() => formatSshTarget(loadPwnboxConfig()));
  const [sync, setSync] = useState<Sync>({ kind: "idle" });
  const busy = useRef(false);

  const view = connectorView(platform);
  const cmdPlatform = platform;

  const pick = (p: PlatformId) => {
    setPlatform(p);
    setConnectorPlatform(p);
  };

  const set = (patch: Partial<PwnboxConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    savePwnboxConfig(next);
  };

  // the single connection field parses "user@host:port" into the three stored parts
  const onTarget = (v: string) => {
    setTarget(v);
    const { user, host, port } = parseSshTarget(v);
    set({ user, host, port });
  };

  // Gated on showSshForm so a local/none platform never starts a pull.
  useEffect(() => {
    if (!view.showSshForm) return;
    if (!cfg.enabled || !cfg.host || !cfg.user) return;
    let active = true;
    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const pulled = await pullPwnbox(cfg);
        if (active) setSync({ kind: "ok", at: Date.now(), msg: pulled.length ? `pulled ${pulled.length} new` : "up to date" });
      } catch (e) {
        if (active) setSync({ kind: "error", at: Date.now(), msg: String(e).slice(0, 140) });
      } finally {
        busy.current = false;
      }
    };
    tick();
    const h = setInterval(tick, 15_000);
    return () => {
      active = false;
      clearInterval(h);
    };
  }, [view.showSshForm, cfg.enabled, cfg.host, cfg.user, cfg.port, cfg.identity, cfg.remoteDir]);

  const statusColor = sync.kind === "error" ? "var(--color-detour)" : sync.kind === "ok" ? "var(--color-match)" : "var(--color-muted)";

  return (
    <div className="space-y-5 text-left">
      {/* platform chooser — a sibling of the steps panel, like the "Where do you hack?" cards */}
      <div className="space-y-3">
        <h3 className="font-display text-base font-semibold text-fg">Which remote VM?</h3>
        <div role="radiogroup" aria-label="Which remote VM?" className="grid gap-2.5 sm:grid-cols-2">
          {VM_PLATFORMS.map((p) => {
            const on = platform === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(p.id)}
                className={`group flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/70 ${
                  on ? "border-signal bg-signal/[0.06]" : "border-edge bg-panel hover:border-muted/50 hover:bg-panel-2"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold text-fg">{p.title}</span>
                  <span aria-hidden className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-colors ${on ? "border-signal" : "border-edge group-hover:border-muted"}`}>
                    {on && <span className="h-2 w-2 rounded-full bg-signal" />}
                  </span>
                </div>
                <div className="text-xs text-muted">{p.tag}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{p.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* steps panel */}
      <div className="rounded-xl border border-edge bg-panel p-5">
        <ol className="m-0 list-none p-0">
          <Step n={1} title={<>Install in {view.label}</>}>
            <CmdRow cmd="curl -fsSL https://raw.githubusercontent.com/silofy/owlsh/main/install.sh | sh" />
          </Step>
          <Step n={2} title={<>Run it <span className="font-normal text-muted">then hack and <code className={codeCls}>exit</code></span></>}>
            <CmdRow cmd={`owlsh --export ~/.owlsh-exports/box.json --platform ${cmdPlatform} --target <box>`} />
          </Step>
          <Step n={3} last title="Bring it back">
            <p className="text-xs leading-relaxed text-muted">
              Download <code className={codeCls}>~/.owlsh-exports/box.json</code> and drag it onto the <span className="text-fg">History</span> tab — it opens as a debrief. No keys, no config.
            </p>
          </Step>
        </ol>

        {/* optional live auto-pull — a real toggle; connection fields reveal only when it's on */}
        <div className="mt-5 border-t border-edge pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg">
                Auto-pull over SSH <span className="font-normal text-muted">optional</span>
              </div>
              <div className="mt-0.5 text-xs" style={{ color: cfg.enabled ? statusColor : "var(--color-muted)" }}>
                {cfg.enabled ? (sync.msg ? `Live · ${sync.msg}` : "Live · starting…") : "Pull new exports in the background, no dragging."}
              </div>
            </div>
            <Switch on={cfg.enabled} onChange={() => set({ enabled: !cfg.enabled })} label="Auto-pull over SSH" />
          </div>

          {cfg.enabled && (
            <div className="mt-3 space-y-2.5">
              <Field label={`${view.label} SSH`} value={target} onChange={onTarget} placeholder={view.hint ?? "username@hostname"} />
              <Field label="SSH key (optional)" value={cfg.identity ?? ""} onChange={(v) => set({ identity: v })} placeholder="~/.ssh/key — blank = default key" />
              <p className="text-xs text-muted">Needs key login (uses your {view.label} password once).</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
