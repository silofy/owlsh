import type { Page } from "@playwright/test";

type Handler = unknown | ((args: Record<string, unknown>) => unknown | Promise<unknown>);

/**
 * Replies that let the app start in desktop mode with zero test setup. Each names its caller.
 * Commands with no sensible "nothing here" reply (set_*, clear_*, cloud_generate, fetch_*, start_ollama,
 * pull_model, pull_pwnbox, open_url, open_widget) are deliberately left unmocked: a test that reaches
 * them must say what they return, and the teardown check catches one that forgot.
 */
const DEFAULTS: Record<string, Handler> = {
  // LiveBridge listSessions: no session files on disk.
  list_sessions: [],
  // LiveBridge listSshLogs: no ssh logs.
  list_ssh_logs: [],
  // WidgetWindow poll: no capture yet ("Waiting for a capture").
  latest_session: null,
  // lib/llm/cloud.ts hasApiKey: no cloud key stored.
  has_api_key: false,
  // lib/net.ts hasHtbToken: no HTB token stored.
  has_htb_token: false,
  // lib/hints/desktop.ts sidecar writes: accept and discard.
  record_hint: null,
  record_golden: null,
  // lib/llm/runtime.ts getLlmRuntime: Ollama not running ({ available, version?, models? }).
  ollama_status: { available: false },
};

export interface InstallOpts {
  test?: { hintTimeoutMs?: number; goldenBudgetMs?: number };
  storage?: Record<string, string>;
}

export class TauriFake {
  private handlers = new Map<string, Handler>(Object.entries(DEFAULTS));
  private log: { cmd: string; args: Record<string, unknown> }[] = [];
  private unmocked = new Set<string>();
  private allowed = new Set<string>();
  private installed = false;
  /** Set by ModelFake.useCloud: install() seeds coach mode "anthropic" into storage. */
  private cloud = false;
  constructor(private page: Page) {}

  wantCloud(): void {
    if (this.installed) throw new Error("model.useCloud() must be called before tauri.install(): coach mode is seeded at install");
    this.cloud = true;
  }

  async install(opts: InstallOpts = {}): Promise<void> {
    this.installed = true;
    const storage = this.cloud ? { ...opts.storage, "owlsh.coachMode": "anthropic" } : opts.storage;
    await this.page.exposeFunction("__owlshTauri", async (cmd: string, args: Record<string, unknown>) => {
      this.log.push({ cmd, args: args ?? {} });
      if (!this.handlers.has(cmd)) {
        this.unmocked.add(cmd);
        return { err: `unmocked: ${cmd}` };
      }
      const h = this.handlers.get(cmd);
      try {
        return { ok: typeof h === "function" ? await (h as (a: Record<string, unknown>) => unknown)(args ?? {}) : h };
      } catch (e) {
        return { err: e instanceof Error ? e.message : String(e) };
      }
    });
    await this.page.addInitScript(
      ({ test, storage }) => {
        for (const [k, v] of Object.entries(storage ?? {})) localStorage.setItem(k, v);
        if (test) (window as unknown as { __OWLSH_TEST__: object }).__OWLSH_TEST__ = test;
        let id = 0;
        (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
          // @tauri-apps/api/core invoke: forwarded to the Node-side router above.
          invoke: async (cmd: string, args: Record<string, unknown>) => {
            const r = await (window as unknown as { __owlshTauri: (c: string, a: unknown) => Promise<{ ok?: unknown; err?: string }> }).__owlshTauri(cmd, args);
            if (r.err !== undefined) throw r.err;
            return r.ok;
          },
          // @tauri-apps/api/core Channel and event listeners.
          transformCallback: () => ++id,
          unregisterCallback: () => {},
          // @tauri-apps/api/core convertFileSrc.
          convertFileSrc: (p: string) => p,
          // @tauri-apps/api/window getCurrentWindow() (WidgetWindow size/close) reads the labels here.
          metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
        };
      },
      { test: opts.test, storage },
    );
  }

  on(cmd: string, h: Handler): void {
    this.handlers.set(cmd, h);
  }
  calls(cmd: string): Record<string, unknown>[] {
    return this.log.filter((c) => c.cmd === cmd).map((c) => c.args);
  }
  allowUnmocked(cmd: string): void {
    this.allowed.add(cmd);
  }
  /** Commands called without a handler and not allowed; checked at teardown. */
  strayUnmocked(): string[] {
    return [...this.unmocked].filter((c) => !this.allowed.has(c));
  }
}
