import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useReport } from "../store/report";
import { STEP_COUNT, deriveChecklist } from "../lib/onboarding";
import { llmStatus, pullModel, DEFAULT_MODEL } from "../lib/llm/runtime";
import { setCoachMode } from "../lib/llm/mode";
import { Check, ScanEye, OwlMark, ArrowUpRight, Terminal, Crosshair, ChevronDown, ClaudeMark, GeminiMark, ChatGptMark, OllamaMark } from "./icons";

const MARKS = { claude: ClaudeMark, gemini: GeminiMark, chatgpt: ChatGptMark } as const;
import { VmConnector } from "./VmConnector";
import {
  MCP_CLIENTS,
  mcpClaudeCodeCommand,
  mcpDesktopConfigSnippet,
  mcpGeminiCommand,
  mcpGeminiConfigSnippet,
} from "../lib/hints/mcp-connect";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/70";

/** Tauri-only: never read `window` at module load — only inside handlers/effects. */
const isDesktop = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const NUMERALS = ["①", "②", "③", "④", "⑤", "⑥"]; // ①②③④…

const STEPS = [
  { kicker: "The instrument", title: "Meet owlsh" },
  { kicker: "Your own box", title: "Capture your first run" },
  { kicker: "Coach model", title: "Connect a model" },
  { kicker: "Preflight complete", title: "You're set" },
] as const;

// ── shared primitives ──────────────────────────────────────────────────────

function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-edge border-t-signal" aria-hidden />;
}

/** A stenciled telemetry line — the readout style the rest of the app uses under live actions. */
function Readout({ tone, children }: { tone: "signal" | "match" | "stuck" | "muted"; children: ReactNode }) {
  const color = tone === "muted" ? "var(--color-muted)" : `var(--color-${tone})`;
  return (
    <div
      className="mono fade-in flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]"
      style={{ color, borderColor: `color-mix(in oklch, ${color} 30%, transparent)`, background: `color-mix(in oklch, ${color} 9%, transparent)` }}
    >
      {children}
    </div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    try {
      void navigator.clipboard?.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — the command stays selectable by hand */
    }
  };
  return { copied, copy };
}

export function CommandRow({ cmd, prompt = true, label = "Copy command" }: { cmd: string; prompt?: boolean; label?: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="flex items-stretch gap-2 rounded-md border border-edge bg-ink/70 ring-1 ring-inset ring-white/[0.02]">
      <div className="min-w-0 flex-1 overflow-x-auto px-3 py-2">
        <code className="mono whitespace-pre text-[13px] text-fg">
          {prompt && <span className="select-none text-faint">$ </span>}
          {cmd}
        </code>
      </div>
      <button
        type="button"
        onClick={() => copy(cmd)}
        className={`m-1 shrink-0 self-start rounded px-2 py-1 text-xs font-medium transition-colors hover:bg-panel-2 ${FOCUS}`}
        aria-label={label}
      >
        <span aria-live="polite">
          {copied ? <span className="text-match">{"\u2713"} Copied</span> : <span className="text-muted hover:text-fg">Copy</span>}
        </span>
      </button>
    </div>
  );
}

/** The pill primary + ghost secondary the app uses for chrome. */
function Primary({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`label inline-flex items-center gap-1.5 rounded-md bg-signal px-4 py-2 transition-[filter,transform] hover:brightness-110 active:scale-[0.98] ${FOCUS}`}
      style={{ color: "var(--color-ink)" }}
    >
      {children}
    </button>
  );
}

function Ghost({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`label rounded-md px-2 py-1 text-faint transition-colors hover:text-muted ${FOCUS}`}>
      {children}
    </button>
  );
}

// ── the progress rail (left spine) ─────────────────────────────────────────

function ProgressRail({ step, stepDone }: { step: number; stepDone: boolean[] }) {
  const setOnboardingStep = useReport((s) => s.setOnboardingStep);
  return (
    <nav aria-label="Onboarding steps" className="flex flex-col gap-0">
      {Array.from({ length: STEP_COUNT }).map((_, i) => {
        const meta = STEPS[i] ?? STEPS[0];
        const filled = i < step || stepDone[i];
        const active = i === step;
        return (
          <button
            key={i}
            type="button"
            onClick={() => setOnboardingStep(i)}
            className="group flex gap-3 text-left"
            aria-current={active ? "step" : undefined}
          >
            <div className="flex flex-col items-center">
              <span
                className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs transition-all duration-300 ${
                  filled
                    ? "bg-signal text-ink"
                    : active
                      ? "bg-ink text-signal ring-2 ring-signal"
                      : "bg-panel-2 text-faint ring-1 ring-edge group-hover:ring-muted"
                }`}
              >
                {active && !filled && <span className="absolute inset-0 animate-ping rounded-full ring-1 ring-signal/40" aria-hidden />}
                {filled ? <Check size={14} /> : NUMERALS[i]}
              </span>
              {i < STEP_COUNT - 1 && (
                <span className={`my-1 w-px flex-1 transition-colors duration-500 ${i < step ? "bg-signal/70" : "bg-edge"}`} style={{ minHeight: 26 }} />
              )}
            </div>
            <div className="pb-4 pt-1">
              <div className={`font-display text-sm font-semibold transition-colors ${active ? "text-fg" : filled ? "text-muted" : "text-faint group-hover:text-muted"}`}>
                {meta.title}
              </div>
              <div className="label mt-0.5 text-[10px] text-faint">{filled ? "done" : active ? "in progress" : meta.kicker}</div>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

// ── step ① Meet owlsh ────────────────────────────────────────────────

export function StepMeet() {
  const { markOnboardingStep } = useReport();
  const marked = useRef(false);

  // The intro is the whole step: seeing it completes step 0 (key stays "demo").
  useEffect(() => {
    if (!marked.current) {
      marked.current = true;
      markOnboardingStep("demo");
    }
  }, [markOnboardingStep]);

  const pipeline: { icon: ReactNode; head: string; body: string; tone: string }[] = [
    { icon: <span className="animate-pulse">{"●"}</span>, head: "Record", body: "a watched shell streams every command as you hack", tone: "var(--color-signal)" },
    { icon: <Crosshair size={13} />, head: "Grade", body: "read at once through ATT&CK · Kill Chain · CWE", tone: "var(--color-match)" },
    { icon: <ScanEye size={13} />, head: "Local", body: "nothing leaves your machine — no account, no upload", tone: "var(--color-muted)" },
  ];

  return (
    <div className="space-y-6">
      <p className="max-w-prose text-[15px] leading-relaxed text-muted">
        A flight-data-recorder for your hacking practice. Record a run against any box, then read a{" "}
        <span className="text-fg">graded debrief</span> of what you did, how efficiently, and what you missed.
      </p>

      <ul className="space-y-px overflow-hidden rounded-lg border border-edge">
        {pipeline.map((p, i) => (
          <li key={p.head} className="rise flex items-start gap-3 bg-panel px-4 py-3" style={{ "--i": i } as CSSProperties}>
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[13px]" style={{ color: p.tone }}>
              {p.icon}
            </span>
            <div className="text-sm leading-relaxed">
              <span className="font-display font-semibold text-fg">{p.head}</span>
              <span className="text-muted"> — {p.body}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── step ② Capture your first run ──────────────────────────────────────────

/** A numbered step inside the capture panel — soft index chip, no connecting rail (that
    bordered-circle-timeline look is the generic onboarding tell we're avoiding here). */
function CaptureStep({ n, title, aside, body, children }: { n: number; title: string; aside?: string; body?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal/15 text-[13px] font-semibold text-signal">{n}</span>
      <div className="min-w-0 flex-1">
        <h4 className="font-display text-sm font-semibold text-fg">
          {title}
          {aside && <span className="ml-2 font-normal text-muted">{aside}</span>}
        </h4>
        {body && <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>}
        <div className="mt-2.5">{children}</div>
      </div>
    </li>
  );
}

export function StepCapture() {
  const { sessionCards, switchSession, closeOnboarding, setOnboardingStep, onboardingStep, setupJump, setSetupJump } = useReport();
  // Setup menu → "VM connector" deep-links here and lands on the remote-VM choice.
  const [where, setWhere] = useState<"own" | "vm">(setupJump === "connector" ? "vm" : "own");
  useEffect(() => {
    if (setupJump === "connector") {
      setWhere("vm");
      setSetupJump(null);
    }
  }, [setupJump, setSetupJump]);

  const realCards = sessionCards.filter((c) => !c.demo);
  const newest = realCards.slice().sort((a, b) => Date.parse(b.ended_at) - Date.parse(a.ended_at))[0];
  const name = newest?.target?.name || newest?.machine?.name || "your run";
  const count = newest?.episodes ?? 0;

  const options: { id: "own" | "vm"; icon: ReactNode; title: string; tag: string; desc: string }[] = [
    { id: "own", icon: <Terminal size={18} />, title: "On your own machine", tag: "Desktop, any OS", desc: "Kali, Parrot or WSL over OpenVPN. One watched shell, streaming live." },
    { id: "vm", icon: <Crosshair size={18} />, title: "In a remote VM", tag: "Pwnbox or AttackBox", desc: "Run the agent on HTB Pwnbox or THM AttackBox, then bring the run back." },
  ];
  const codeCls = "mono rounded bg-panel-2 px-1 py-0.5 text-fg";

  return (
    <div className="space-y-7">
      <p className="max-w-prose text-[15px] leading-relaxed text-fg/90">
        owlsh records a shell while you hack, then grades the run: a debrief of what you did, your coverage, and what you{"’"}d do differently. Choose where you{"’"}re working and copy the commands.
      </p>

      <div className="space-y-3">
        <h3 className="font-display text-base font-semibold text-fg">Where do you hack?</h3>
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
          <ol className="space-y-5">
            <CaptureStep n={1} title="Install the agent" aside="one time" body="Downloads the prebuilt binary and verifies its checksum.">
              <CommandRow cmd="curl -fsSL https://raw.githubusercontent.com/silofy/owlsh/main/install.sh | sh" />
              <p className="mt-2 text-xs text-muted">
                On Windows, run <code className={codeCls}>irm https://raw.githubusercontent.com/silofy/owlsh/main/install.ps1 | iex</code> instead.
              </p>
            </CaptureStep>
            <CaptureStep n={2} title="Run a watched shell" body={<>Every command streams in live as you run it. Type <code className={codeCls}>exit</code> to stop.</>}>
              <CommandRow cmd="owlsh --attach --platform htb --target <box>" />
              <p className="mt-2 text-xs text-muted">
                Other platforms: <code className={codeCls}>--platform thm</code>, plus offsec, immersive and local. Add <code className={codeCls}>--new</code> to force a fresh session.
              </p>
            </CaptureStep>
          </ol>
        </div>
      ) : (
        <VmConnector />
      )}

      <section className="space-y-3 rounded-xl border border-signal/25 bg-signal/[0.04] p-5">
        <h3 className="font-display text-sm font-semibold text-fg">Then your run lands here</h3>
        {newest ? (
          <div className="space-y-3">
            <Readout tone="match">
              <Check size={15} />
              <span>
                Captured <span className="text-fg">{"“"}{name}{"”"}</span>
                {count > 0 && <>, {count} commands</>}
              </span>
            </Readout>
            <Primary
              onClick={() => {
                switchSession(newest.id);
                closeOnboarding();
              }}
            >
              Open my debrief <ArrowUpRight size={13} />
            </Primary>
          </div>
        ) : (
          <div className="space-y-3">
            <Readout tone="muted">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-signal/80" />
              </span>
              <span className="text-muted">Waiting for a session. Run the attach command and it lands here live.</span>
            </Readout>
            {!isDesktop() && (
              <p className="flex items-start gap-1.5 text-xs text-muted">
                <Terminal size={13} className="mt-px shrink-0" />
                Live detection runs in the desktop app. You can skip ahead and capture later.
              </p>
            )}
            <button
              type="button"
              onClick={() => setOnboardingStep(onboardingStep + 1)}
              className={`rounded-md text-sm text-muted underline decoration-edge underline-offset-4 transition-colors hover:text-fg hover:decoration-muted ${FOCUS}`}
            >
              Skip for now, capture later
            </button>
          </div>
        )}
      </section>

      <p className="text-xs text-muted">After a run, load a write-up on the debrief to unlock the path comparison.</p>
    </div>
  );
}

// ── step ③ Connect a model ─────────────────────────────────────────────────

type McpClientId = (typeof MCP_CLIENTS)[number]["id"];
type LocalPhase = "probing" | "ready" | "missing" | "downloading" | "error";

export function StepAI() {
  const { setOnboardingStep, onboardingStep, markOnboardingStep } = useReport();
  const desktop = isDesktop();
  const [local, setLocal] = useState<LocalPhase>("probing");
  const [done, setDone] = useState<string | null>(null);
  // Claude is the recommended path, so it starts expanded; the others show label + note only.
  const [open, setOpen] = useState<McpClientId | null>("claude");

  // Guards post-await setState: the content column is keyed by step, so leaving mid-request
  // unmounts this. The coaching choice still persists; only the visual state is gated.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!desktop) {
      setLocal("missing");
      return;
    }
    let alive = true;
    llmStatus()
      .then((s) => {
        if (!alive) return;
        const want = DEFAULT_MODEL.split(":")[0];
        const has = (s.models ?? []).some((m) => m.split(":")[0] === want);
        setLocal(s.available && has ? "ready" : "missing");
      })
      .catch(() => {
        if (alive) setLocal("missing");
      });
    return () => {
      alive = false;
    };
  }, [desktop]);

  const finish = (message: string) => {
    markOnboardingStep("ai");
    if (mounted.current) setDone(message);
  };
  // MCP coaching happens inside the user's Claude client, so coachMode is left untouched.
  const useMcp = (label: string) => finish(`${label} connected — coaching now happens on your ${label} plan.`);
  const useLocal = () => {
    setCoachMode("local");
    finish("Local AI coaching is on — your notes will be command-aware.");
  };
  const download = async () => {
    setLocal("downloading");
    try {
      const ok = await pullModel(DEFAULT_MODEL);
      if (ok) useLocal();
      else if (mounted.current) setLocal("error");
    } catch {
      if (mounted.current) setLocal("error");
    }
  };
  const skip = () => {
    setCoachMode("rules");
    setOnboardingStep(onboardingStep + 1);
  };

  if (done) {
    return (
      <Readout tone="match">
        <Check size={15} /> {done}
      </Readout>
    );
  }

  return (
    <div className="space-y-5">
      <p className="max-w-prose text-[15px] leading-relaxed text-muted">
        Coaching works out of the box on deterministic rules. Connect a model and it rewrites each note into{" "}
        <span className="text-fg">command-aware advice</span>. Set one up now, or keep rules {"—"} your call.
      </p>

      {/* Plan group: recommended (the only coloured card) */}
      <section aria-labelledby="connect-plan" className="space-y-3 rounded-lg border border-edge bg-panel p-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="connect-plan" className="font-display text-sm font-semibold text-fg">Use a plan you already have</h2>
            <span className="label rounded bg-signal/15 px-1.5 py-0.5 text-[10px] text-signal">Recommended</span>
          </div>
          <p className="text-xs text-muted">Billed to the plan you already have, not API credits. owlsh connects as a local MCP server.</p>
        </div>
        <ul className="space-y-3">
          {MCP_CLIENTS.map((c) => {
            const expanded = open === c.id;
            const panelId = `connect-${c.id}-panel`;
            const Mark = MARKS[c.id];
            return (
              <li key={c.id} className="rounded-md border border-edge bg-panel-2 p-3">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : c.id)}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  className={`flex w-full items-center justify-between gap-3 rounded text-left ${FOCUS}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Mark size={16} className="shrink-0 text-fg" aria-hidden />
                    <span className="font-display text-sm font-semibold text-fg">{c.label}</span>
                    <span className="label text-[10px] text-faint">{c.tier === "advanced" ? "advanced" : "first-class"}</span>
                  </span>
                  <ChevronDown size={12} className={`shrink-0 text-faint transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} />
                </button>
                {c.note && <p className="mt-2 text-xs text-muted">{c.note}</p>}
                {expanded && (
                  <div id={panelId} className="mt-3 space-y-3">
                    {c.id === "claude" && (
                      <>
                        <p className="text-xs text-muted">Your Claude plan: run this once in Claude Code.</p>
                        <CommandRow cmd={mcpClaudeCodeCommand()} label="Copy Claude Code command" />
                        <p className="text-xs text-muted">
                          Claude Desktop: add this to <code className="mono text-fg">claude_desktop_config.json</code>, then restart it.
                        </p>
                        <CommandRow cmd={mcpDesktopConfigSnippet()} prompt={false} label="Copy Claude Desktop config" />
                      </>
                    )}
                    {c.id === "gemini" && (
                      <>
                        <p className="text-xs text-muted">Gemini CLI: run this once.</p>
                        <CommandRow cmd={mcpGeminiCommand()} label="Copy Gemini command" />
                        <p className="text-xs text-muted">
                          Or add this to <code className="mono text-fg">~/.gemini/settings.json</code>.
                        </p>
                        <CommandRow cmd={mcpGeminiConfigSnippet()} prompt={false} label="Copy Gemini config" />
                      </>
                    )}
                    {c.id === "chatgpt" && c.href && (
                      <a
                        href={c.href}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-1 rounded text-xs text-signal underline decoration-signal/40 underline-offset-2 hover:decoration-signal ${FOCUS}`}
                      >
                        Set up the tunnel <ArrowUpRight size={12} />
                      </a>
                    )}
                    <p className="text-xs text-faint">Coaching then happens inside {c.label}, on your plan.</p>
                    <Primary onClick={() => useMcp(c.label)}>
                      {"✓"} {c.id === "chatgpt" ? "Done" : `I’ve added it`}
                    </Primary>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Local model: neutral */}
      <section aria-labelledby="connect-local" className="space-y-3 rounded-lg border border-edge bg-panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="connect-local" className="flex items-center gap-2 font-display text-sm font-semibold text-fg">
              <OllamaMark size={16} className="text-fg" />
              Run a model locally
              <span className="font-normal text-muted">fully offline</span>
            </h2>
            <p className="text-xs text-muted">
              Ollama runs {DEFAULT_MODEL} on your machine, free, and commands never leave the device.
            </p>
          </div>
          {local === "ready" && <span className="label shrink-0 text-[10px] text-match">installed</span>}
        </div>
        {local === "probing" && (
          <Readout tone="muted">
            <Spinner /> Checking for a local model{"…"}
          </Readout>
        )}
        {local === "ready" && <Primary onClick={useLocal}>{"⚡"} Use local AI</Primary>}
        {local === "missing" && desktop && (
          <button
            type="button"
            onClick={download}
            className={`label inline-flex items-center gap-2 rounded-md border border-signal/40 bg-signal/10 px-4 py-2 text-signal transition-colors hover:bg-signal/15 ${FOCUS}`}
          >
            {"⬇"} Download {DEFAULT_MODEL} (~2 GB)
          </button>
        )}
        {local === "missing" && !desktop && (
          <p className="text-xs text-faint">Installs from the desktop app {"—"} not available in the browser preview.</p>
        )}
        {local === "downloading" && (
          <Readout tone="signal">
            <Spinner /> Downloading {DEFAULT_MODEL}{"…"} runs once, then stays on your machine.
          </Readout>
        )}
        {local === "error" && (
          <div className="space-y-2">
            <Readout tone="stuck">{"⚠"} Download failed {"—"} check that Ollama is running.</Readout>
            <button
              type="button"
              onClick={download}
              className={`label inline-flex items-center gap-2 rounded-md border border-edge px-4 py-2 text-fg transition-colors hover:bg-panel-2 ${FOCUS}`}
            >
              Retry
            </button>
          </div>
        )}
      </section>

      <div className="border-t border-edge pt-4">
        <button
          type="button"
          onClick={skip}
          className={`inline-flex items-center gap-1.5 rounded-md border border-edge px-3 py-2 text-sm text-muted transition-colors motion-reduce:transition-none hover:bg-panel-2 hover:text-fg ${FOCUS}`}
        >
          Keep rule-based coaching for now <span aria-hidden>{"→"}</span>
        </button>
      </div>
    </div>
  );
}

// ── step ④ You're set ──────────────────────────────────────────────────────

function StepRecap() {
  const { onboardingDone, sessionCards, closeOnboarding } = useReport();
  const hasRealCapture = sessionCards.some((c) => !c.demo);
  const items = deriveChecklist({ demoDone: onboardingDone.demo, hasRealCapture, aiDone: onboardingDone.ai });

  return (
    <div className="space-y-6">
      <p className="max-w-prose text-[15px] leading-relaxed text-muted">
        That{"’"}s the loop. Everything below is live in the app now {"—"} anything unchecked, you can finish anytime.
      </p>

      <ul className="overflow-hidden rounded-lg border border-edge">
        {items.map((it, i) => (
          <li
            key={it.key}
            className="rise flex items-center gap-3 border-b border-edge bg-panel px-4 py-3 last:border-b-0"
            style={{ "--i": i } as CSSProperties}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                it.done ? "bg-match/15 text-match" : "bg-panel-2 text-faint ring-1 ring-edge"
              }`}
            >
              {it.done ? <Check size={14} /> : <span className="text-xs">{"○"}</span>}
            </span>
            <span className={`flex-1 text-sm ${it.done ? "text-fg" : "text-muted"}`}>{it.label}</span>
            <span className="label text-[10px] text-faint">{it.done ? "done" : "later"}</span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-faint">
        Next: load a write-up on any run to unlock the{" "}
        <button type="button" onClick={closeOnboarding} className="text-signal underline decoration-signal/40 underline-offset-2 hover:decoration-signal">
          comparison
        </button>{" "}
        {"—"} coverage and {"“"}what you{"’"}d do differently{"”"}.
      </p>
    </div>
  );
}

// ── shell ──────────────────────────────────────────────────────────────────

export function Onboarding() {
  const { onboardingStep, setOnboardingStep, closeOnboarding, onboardingDone, sessionCards } = useReport();

  const step = Math.min(Math.max(onboardingStep, 0), STEP_COUNT - 1);
  const meta = STEPS[step] ?? STEPS[0];
  const isLast = step === STEP_COUNT - 1;
  const hasRealCapture = sessionCards.some((c) => !c.demo);
  const stepDone = [onboardingDone.demo, hasRealCapture, onboardingDone.ai, false];

  const body = step === 0 ? <StepMeet /> : step === 1 ? <StepCapture /> : step === 2 ? <StepAI /> : <StepRecap />;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink text-fg">
      {/* atmosphere — a single low, cool wash so the panel reads lit, not flat */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{ background: "radial-gradient(120% 80% at 78% -10%, color-mix(in oklch, var(--color-signal) 12%, transparent), transparent 60%)" }}
      />

      <div className="relative mx-auto grid min-h-full w-full max-w-5xl grid-cols-1 lg:grid-cols-[300px_1fr]">
        {/* rail spine */}
        <aside className="flex flex-col justify-between gap-8 border-b border-edge px-7 py-8 lg:border-b-0 lg:border-r lg:py-11">
          <div className="space-y-8">
            <div className="flex items-center gap-2.5">
              <OwlMark size={36} />
              <div>
                <div className="font-display text-[15px] font-semibold leading-tight text-fg">owlsh</div>
                <div className="label text-[10px] text-faint">activation</div>
              </div>
            </div>
            <ProgressRail step={step} stepDone={stepDone} />
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEP_COUNT}>
              {Array.from({ length: STEP_COUNT }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? "w-6 bg-signal" : i < step ? "w-1.5 bg-signal/60" : "w-1.5 bg-edge"
                  }`}
                />
              ))}
            </div>
            <div className="label text-[11px] text-faint">
              Step {step + 1} of {STEP_COUNT}
            </div>
          </div>
        </aside>

        {/* content */}
        <main className="flex min-h-full min-w-0 flex-col px-7 py-8 lg:px-12 lg:py-11">
          <div key={step} className="flex-1">
            <div className="fade-in">
              <div className="mb-2 text-[13px] font-semibold text-signal">{meta.kicker}</div>
              <h1 className="font-display text-[26px] font-semibold leading-tight text-fg lg:text-3xl">{meta.title}</h1>
            </div>
            <div className="mt-6">{body}</div>
          </div>

          {/* chrome */}
          <footer className="mt-10 flex items-center justify-between gap-4 border-t border-edge pt-5">
            <div>
              {step > 0 && <Ghost onClick={() => setOnboardingStep(step - 1)}>Back</Ghost>}
            </div>
            <div className="flex items-center gap-2">
              <Ghost onClick={closeOnboarding}>Skip</Ghost>
              {isLast ? (
                <Primary onClick={closeOnboarding}>
                  Enter owlsh <ArrowUpRight size={13} />
                </Primary>
              ) : (
                <Primary onClick={() => setOnboardingStep(step + 1)}>Next</Primary>
              )}
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
