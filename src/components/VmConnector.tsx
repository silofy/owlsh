import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadPwnboxConfig, savePwnboxConfig, pullPwnbox, parseSshTarget, formatSshTarget, setConnectorPlatform, type PwnboxConfig } from "../lib/pwnbox";
import { activePlatform, platformLabel } from "../lib/platform";
import { connectorView } from "../lib/connector-view";
import { useReport } from "../store/report";
import type { PlatformId } from "../types/report";
import { ChevronDown } from "./icons";

type Sync = { kind: "idle" | "ok" | "error"; msg?: string; at?: number };

// the five real platforms; "breachyard" is a demo platform and is not offered
const PLATFORMS: PlatformId[] = ["htb", "thm", "offsec", "immersive", "local"];

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
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
  const [platform, setPlatform] = useState<PlatformId>(() => activePlatform(report, sessionCards));
  const [cfg, setCfg] = useState<PwnboxConfig>(loadPwnboxConfig);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [target, setTarget] = useState(() => formatSshTarget(loadPwnboxConfig()));
  const [sync, setSync] = useState<Sync>({ kind: "idle" });
  const busy = useRef(false);

  const view = connectorView(platform);
  // the demo platform is not a real capture target; fall back to htb in the copied command
  const cmdPlatform = PLATFORMS.includes(platform) ? platform : "htb";

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

  const statusColor = sync.kind === "error" ? "var(--color-detour)" : sync.kind === "ok" ? "var(--color-match)" : "var(--color-faint)";
  const dot = cfg.enabled ? statusColor : "var(--color-faint)";

  return (
    <div className="text-left">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-display text-sm font-semibold text-fg">Capture in {view.label}</h4>
        <select
          aria-label="Platform"
          value={platform}
          onChange={(e) => pick(e.target.value as PlatformId)}
          className="mono rounded border border-edge bg-ink/60 px-2 py-1 text-xs text-fg focus:border-signal focus:outline-none"
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {platformLabel(p)}
            </option>
          ))}
        </select>
      </div>

      {view.showSshForm ? (
        <>
          <ol className="m-0 list-none p-0">
            <Step n={1} title={<>Install in {view.label}</>}>
              <CmdRow cmd="curl -fsSL https://raw.githubusercontent.com/silofy/owlsh/main/install.sh | sh" />
            </Step>
            <Step n={2} title={<>Run it <span className="font-normal text-muted">then hack and <code className={codeCls}>exit</code></span></>}>
              <CmdRow cmd={`owlsh --export ~/.owlsh-exports/box.json --platform ${cmdPlatform} --target <box>`} />
            </Step>
            <Step n={3} last title="Bring it back">
              <p className="text-xs text-muted">
                Download <code className={codeCls}>~/.owlsh-exports/box.json</code> and drag it onto the <span className="text-fg">History</span> tab {"—"} it opens as a debrief. No keys, no config.
              </p>
            </Step>
          </ol>

          {/* optional live auto-pull — collapsed by default; a previously enabled pull keeps running (effect above) */}
          <div className="mt-3 border-t border-edge pt-2.5">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              aria-controls="vm-autopull"
              className="flex w-full items-center gap-1.5 rounded text-xs font-medium text-muted transition-colors hover:text-fg focus:outline-none focus-visible:text-signal motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-signal/70"
            >
              <ChevronDown className={`transition-transform motion-reduce:transition-none ${advancedOpen ? "rotate-180" : ""}`} />
              <span>Auto-pull over SSH</span>
              {cfg.enabled && <span className="ml-auto inline-block h-2 w-2 rounded-full" style={{ background: dot }} aria-label="auto-pull on" />}
            </button>

            <div id="vm-autopull" hidden={!advancedOpen} className="mt-2.5">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => set({ enabled: !cfg.enabled })} className="flex items-center gap-2" title="Auto-pull exports over SSH">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
                <span className="label text-muted">Enable</span>
              </button>
              <span className="text-xs" style={{ color: cfg.enabled ? statusColor : "var(--color-faint)" }}>
                {cfg.enabled ? sync.msg ?? "starting…" : "off"}
              </span>
            </div>

            {cfg.enabled && (
              <button type="button" onClick={() => setShowConfig((v) => !v)} className="mt-2 label flex items-center gap-1.5 text-faint transition-colors hover:text-muted">
                <ChevronDown className={`transition-transform ${showConfig ? "rotate-180" : ""}`} /> Connection
              </button>
            )}
            {cfg.enabled && showConfig && (
              <div className="mt-2 space-y-2.5">
                <Field label={`${view.label} SSH`} value={target} onChange={onTarget} placeholder={view.hint ?? "username@hostname"} />
                <Field label="SSH key (optional)" value={cfg.identity ?? ""} onChange={(v) => set({ identity: v })} placeholder="~/.ssh/key — blank = default key" />
                <p className="text-xs text-faint">
                  Needs key login (uses your {view.label} password once).
                </p>
              </div>
            )}
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{view.note}</p>
        </>
      )}
    </div>
  );
}
