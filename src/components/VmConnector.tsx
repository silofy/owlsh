import { useEffect, useRef, useState } from "react";
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

/**
 * Platform-aware VM connector panel (body only; the Setup menu owns the row/toggle). SSH platforms
 * (HTB Pwnbox, THM AttackBox) get the capture steps plus the optional live auto-pull; local/none
 * platforms get a one-line note and never start a pull.
 */
export function VmConnector() {
  const { report, sessionCards, openOnboarding, setOnboardingStep } = useReport();
  const [platform, setPlatform] = useState<PlatformId>(() => activePlatform(report, sessionCards));
  const [cfg, setCfg] = useState<PwnboxConfig>(loadPwnboxConfig);
  const [showConfig, setShowConfig] = useState(false);
  const [target, setTarget] = useState(() => formatSshTarget(loadPwnboxConfig()));
  const [sync, setSync] = useState<Sync>({ kind: "idle" });
  const busy = useRef(false);

  const view = connectorView(platform);

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

  const openSetup = () => {
    setOnboardingStep(1);
    openOnboarding();
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
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="label text-fg">Capture in {view.label}</span>
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
          <ol className="space-y-2 text-sm text-muted">
            <li className="flex gap-2">
              <span className="text-faint">1.</span>
              <span>Run the <span className="text-fg">owlsh agent</span> in your {view.label} terminal.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-faint">2.</span>
              <span>Download the export file it writes.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-faint">3.</span>
              <span>Drag it onto the <span className="text-fg">History</span> tab — it opens as a debrief.</span>
            </li>
          </ol>

          <button type="button" onClick={openSetup} className="mt-3 w-full rounded-md bg-signal/15 px-3 py-1.5 text-xs font-medium text-signal transition-colors hover:bg-signal/25">
            Full setup &amp; commands →
          </button>

          {/* optional live auto-pull — one compact toggle, config hidden until wanted */}
          <div className="mt-3 border-t border-edge pt-2.5">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => set({ enabled: !cfg.enabled })} className="flex items-center gap-2" title="Auto-pull exports over SSH">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
                <span className="label text-muted">Auto-pull over SSH</span>
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
                  Needs key login (uses your {view.label} password once) — see <button type="button" onClick={openSetup} className="text-signal hover:underline">Setup</button>.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{view.note}</p>
          <button type="button" onClick={openSetup} className="mt-3 w-full rounded-md bg-signal/15 px-3 py-1.5 text-xs font-medium text-signal transition-colors hover:bg-signal/25">
            Full setup &amp; commands →
          </button>
        </>
      )}
    </div>
  );
}
