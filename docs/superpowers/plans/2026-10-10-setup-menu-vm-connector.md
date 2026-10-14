# Setup Menu + VM Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the header's four scattered controls into one `Setup ▾` nav dropdown, generalize the HTB-only "Pwnbox" into a platform-aware VM connector, and surface a "Connect a model" CTA when no coach model is set.

**Architecture:** Add a `connector` descriptor to each platform adapter and a pure `connectorFor`/`activePlatform` resolver (testable in isolation). Build a `SetupMenu` dropdown that hosts the existing AI and connector config UIs as accordion sections plus a Setup-guide and Widget action. Relocate `LlmStatusChip`/`PwnboxSync` logic into those sections, keeping their live status. App header nav gains the Setup control and drops the loose buttons.

**Tech Stack:** TypeScript, React 18, Vitest (node env; components tested via `renderToStaticMarkup` + extracted pure helpers — no testing-library in repo).

**Spec:** `docs/superpowers/specs/2026-10-10-setup-menu-vm-connector-design.md`

## Global Constraints

- The SSH capture mechanism is unchanged: `owlsh.pwnbox` storage shape, `parseSshTarget`/`formatSshTarget`, and the `pull_pwnbox` Rust command stay as-is.
- Connector kinds are exactly `"ssh" | "local" | "none"`; labels exactly: HTB "Pwnbox", THM "AttackBox", OffSec "Kali (local)", Immersive "Immersive", local "Local capture".
- `connectorFor(unknownId)` defaults to HTB's connector.
- Active platform resolves: active report's platform → newest session card → stored `owlsh.connectorPlatform` → "htb".
- No testing-library or new test deps; extract pure functions for component logic and unit-test those.
- The Setup dropdown does not change `view`; click-away and Escape close it.
- Model-connection paths order: MCP ("Use your Claude plan") → Local (Ollama) → API key (advanced). MCP opens a placeholder "coming soon / see setup" until its own spec ships.
- Commits carry no `Co-Authored-By` trailer.

## Review Focus

1. **No active report and no session cards** (fresh launch) → `activePlatform` returns the stored value or "htb", never throws (Task 1 test).
2. **A `none`/`local` platform selected** → the connector panel shows the note, never SSH fields, and never starts an SSH pull (Task 2 test).
3. **Setup opened, then the viewer tabs/clicks away or presses Escape** → menu closes and does not swallow the next click (Task 4 test).
4. **Widget/Open-widget row on web (non-desktop)** → the row is absent (Task 4 test; `isDesktop()` false).
5. **A run on THM** → the connector label and the live banner read "AttackBox", not "Pwnbox" (Task 2 + Task 5 tests).

---

### Task 1: Connector descriptor + resolution

**Files:**
- Modify: `src/lib/platform/types.ts` (add `connector` to `PlatformAdapter`)
- Modify: `src/lib/platform/{htb,thm,offsec,immersive,local}.ts` (declare each `connector`)
- Modify: `src/lib/platform/index.ts` (add `connectorFor`, `activePlatform`)
- Modify: `src/lib/pwnbox.ts` (add `getConnectorPlatform`/`setConnectorPlatform`)
- Test: `src/lib/platform/connector.test.ts`

**Interfaces:**
- Produces:
  - `interface Connector { kind: "ssh" | "local" | "none"; label: string; hint?: string; note?: string }`
  - `PlatformAdapter.connector: Connector` (required on every adapter)
  - `connectorFor(id: PlatformId): Connector` (unknown → htb's)
  - `activePlatform(report: OwlshReport | null, cards: { target: { platform: PlatformId } }[]): PlatformId`
  - `getConnectorPlatform(): PlatformId | null` / `setConnectorPlatform(p: PlatformId): void` (localStorage `owlsh.connectorPlatform`)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/platform/connector.test.ts
import { describe, it, expect } from "vitest";
import { connectorFor, activePlatform } from "./index";
import type { OwlshReport } from "../../types/report";

describe("connectorFor", () => {
  it("gives each platform the spec'd kind + label", () => {
    expect(connectorFor("htb")).toMatchObject({ kind: "ssh", label: "Pwnbox" });
    expect(connectorFor("thm")).toMatchObject({ kind: "ssh", label: "AttackBox" });
    expect(connectorFor("offsec")).toMatchObject({ kind: "local", label: "Kali (local)" });
    expect(connectorFor("immersive")).toMatchObject({ kind: "none", label: "Immersive" });
    expect(connectorFor("local")).toMatchObject({ kind: "local", label: "Local capture" });
  });
  it("ssh connectors carry a hint; local/none carry a note", () => {
    expect(connectorFor("htb").hint).toBeTruthy();
    expect(connectorFor("thm").hint).toMatch(/i.?.?button|booted|AttackBox/i);
    expect(connectorFor("offsec").note).toBeTruthy();
    expect(connectorFor("immersive").note).toMatch(/browser|shell/i);
  });
  it("defaults unknown ids to HTB's connector", () => {
    expect(connectorFor("breachyard")).toEqual(connectorFor("htb"));
  });
});

describe("activePlatform", () => {
  const rpt = (platform: string) => ({ session: { target: { platform } } } as unknown as OwlshReport);
  it("prefers the active report's platform", () => {
    expect(activePlatform(rpt("thm"), [{ target: { platform: "htb" } }])).toBe("thm");
  });
  it("falls back to the newest session card", () => {
    expect(activePlatform(null, [{ target: { platform: "offsec" } }])).toBe("offsec");
  });
  it("defaults to htb with nothing to go on", () => {
    expect(activePlatform(null, [])).toBe("htb");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/platform/connector.test.ts` — FAIL (no `connector`/`connectorFor`/`activePlatform`).

- [ ] **Step 3: Implement.** In `types.ts` add to `PlatformAdapter`:

```ts
  /** How captures reach owlsh for this platform's attack VM. */
  connector: Connector;
```
and above it:
```ts
export interface Connector {
  kind: "ssh" | "local" | "none";
  label: string;
  hint?: string; // ssh: connection-string placeholder / where to find it
  note?: string; // local/none: one-line explanation shown instead of a form
}
```

Add `connector` to each adapter object (exact values):
- `htb.ts`: `connector: { kind: "ssh", label: "Pwnbox", hint: "username@hostname — from the Pwnbox panel" }`
- `thm.ts`: `connector: { kind: "ssh", label: "AttackBox", hint: "user@IP — click the ‘i’ on the booted AttackBox" }`
- `offsec.ts`: `connector: { kind: "local", label: "Kali (local)", note: "owlsh runs on your own Kali — capture is local, nothing to connect." }`
- `immersive.ts`: `connector: { kind: "none", label: "Immersive", note: "Browser-only labs — no shell to connect. Run owlsh locally while VPN'd, or use a platform with a shell." }`
- `local.ts`: `connector: { kind: "local", label: "Local capture", note: "Capture runs on this machine — nothing to connect." }`

In `index.ts`:
```ts
export function connectorFor(id: PlatformId): Connector {
  return (adapterFor(id) ?? htbAdapter).connector;
}

export function activePlatform(
  report: OwlshReport | null,
  cards: { target: { platform: PlatformId } }[],
): PlatformId {
  const fromReport = report ? (report.session.target?.platform ?? report.session.machine && undefined) : undefined;
  if (fromReport) return fromReport;
  if (cards[0]?.target?.platform) return cards[0].target.platform;
  return getConnectorPlatform() ?? "htb";
}
```
Note: `report.session.target?.platform` — verify the live report path exposes `target`; if a report instead needs `targetOf(report).platform`, use that (import `targetOf`) and update the test's `rpt` helper to match. Pick the one that matches the real type and say which.

Export `Connector` from `index.ts` (it re-exports `./types`). Add storage helpers in `pwnbox.ts` mirroring the existing try/catch pattern:
```ts
const PLATFORM_KEY = "owlsh.connectorPlatform";
export function getConnectorPlatform(): PlatformId | null {
  try { return (localStorage.getItem(PLATFORM_KEY) as PlatformId) || null; } catch { return null; }
}
export function setConnectorPlatform(p: PlatformId): void {
  try { localStorage.setItem(PLATFORM_KEY, p); } catch { /* ignore */ }
}
```
Import `getConnectorPlatform` into `index.ts`.

- [ ] **Step 4: Run** the test + `npm run typecheck` + `npm test` — PASS.
- [ ] **Step 5: Commit** `git add src/lib/platform src/lib/pwnbox.ts && git commit -m "Platform: connector descriptor + active-platform resolution"`

---

### Task 2: VM connector component (platform-aware)

**Files:**
- Create: `src/components/VmConnector.tsx` (generalized from `PwnboxSync.tsx`)
- Create: `src/lib/connector-view.ts` (pure view logic)
- Delete: `src/components/PwnboxSync.tsx` (its SSH logic moves into VmConnector)
- Test: `src/lib/connector-view.test.ts`, `tests/vm-connector.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`connectorFor`, `activePlatform`, `getConnectorPlatform`/`setConnectorPlatform`); existing `loadPwnboxConfig`/`savePwnboxConfig`/`pullPwnbox`/`parseSshTarget`/`formatSshTarget`.
- Produces: `connectorView(platform: PlatformId): { kind; label; hint?; note?; showSshForm: boolean }`; `<VmConnector />` (embeddable panel, no outer chip).

- [ ] **Step 1: Failing test** for the pure view:

```ts
// src/lib/connector-view.test.ts
import { describe, it, expect } from "vitest";
import { connectorView } from "./connector-view";

describe("connectorView", () => {
  it("ssh platforms show the form with the platform's label", () => {
    expect(connectorView("htb")).toMatchObject({ kind: "ssh", label: "Pwnbox", showSshForm: true });
    expect(connectorView("thm")).toMatchObject({ kind: "ssh", label: "AttackBox", showSshForm: true });
  });
  it("local/none platforms show a note, never the form", () => {
    expect(connectorView("offsec")).toMatchObject({ kind: "local", showSshForm: false });
    expect(connectorView("immersive")).toMatchObject({ kind: "none", showSshForm: false });
    expect(connectorView("offsec").note).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/connector-view.test.ts` — FAIL.

- [ ] **Step 3: Implement** `connector-view.ts`:

```ts
import { connectorFor } from "./platform";
import type { PlatformId } from "../types/report";

export function connectorView(platform: PlatformId) {
  const c = connectorFor(platform);
  return { ...c, showSshForm: c.kind === "ssh" };
}
```

- [ ] **Step 4: Build `VmConnector.tsx`** from `PwnboxSync.tsx`'s body (read it first). Changes:
  - Drop the outer chip `<button>` — this renders as a panel body (the SetupMenu owns the row/toggle).
  - A platform selector at the top: `activePlatform(report, sessionCards)` initial, overridable, persisted via `setConnectorPlatform`. Options = the five real `PlatformId`s (exclude `breachyard`).
  - Use `connectorView(platform)`:
    - `showSshForm` → render today's capture steps + "Auto-pull over SSH" toggle + connection fields, with the field label and placeholder from `.label`/`.hint` (e.g. `` `${label} SSH` ``, placeholder `hint`).
    - else → render `.note` as a muted line + a "Full setup & commands →" link to onboarding. No SSH fields, no pull effect.
  - Keep the SSH auto-pull `useEffect` exactly as in PwnboxSync, but gate it on `connectorView(platform).showSshForm` so a `local`/`none` platform never pulls.
  - Keep reading `report`/`sessionCards`/`openOnboarding` from `useReport()`.

- [ ] **Step 5: UI test** `tests/vm-connector.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VmConnector } from "../src/components/VmConnector";

// Default active platform with no report/cards is htb → ssh form shown.
describe("VmConnector", () => {
  it("shows the SSH form for an ssh platform (htb default)", () => {
    const html = renderToStaticMarkup(<VmConnector />);
    expect(html).toMatch(/Pwnbox/);
  });
});
```
(If `VmConnector` needs the store provider to render, wrap it or mock `useReport` the way existing component tests do — check `tests/widget-window.test.tsx` for the pattern; if the store reads safely with defaults, no wrapper is needed.)

- [ ] **Step 6: Run** both tests, `npm run typecheck`, `npm test` — PASS.
- [ ] **Step 7: Commit** `git add -A src/components/VmConnector.tsx src/lib/connector-view.ts tests/vm-connector.test.tsx && git rm src/components/PwnboxSync.tsx && git commit -m "Connector: platform-aware VM connector (Pwnbox/AttackBox/local/none)"`

---

### Task 3: Coach-model panel + Connect-a-model paths

**Files:**
- Modify: `src/components/LlmStatusChip.tsx` → export an embeddable `CoachModelPanel` (keep `LlmStatusChip` as a thin wrapper if still referenced, else remove its header-chip shell)
- Create: `src/components/ConnectModelPaths.tsx` (the three paths)
- Test: `tests/connect-model.test.tsx`

**Interfaces:**
- Produces: `<CoachModelPanel />` (the existing model picker/config, no outer header chip); `<ConnectModelPaths />` rendering the three paths in order.

- [ ] **Step 1: Failing test**

```tsx
// tests/connect-model.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectModelPaths } from "../src/components/ConnectModelPaths";

describe("ConnectModelPaths", () => {
  const html = renderToStaticMarkup(<ConnectModelPaths />);
  it("lists MCP first, then Local, then API key", () => {
    const iMcp = html.indexOf("Claude plan");
    const iLocal = html.indexOf("Ollama");
    const iApi = html.search(/API key/i);
    expect(iMcp).toBeGreaterThanOrEqual(0);
    expect(iMcp).toBeLessThan(iLocal);
    expect(iLocal).toBeLessThan(iApi);
  });
  it("labels the API path as needing credits, not a subscription", () => {
    expect(html).toMatch(/credits/i);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/connect-model.test.tsx` — FAIL.

- [ ] **Step 3: Implement.** Refactor `LlmStatusChip.tsx`: extract the dropdown body (the `OPTIONS` list, Ollama guided setup, cloud key fields) into an exported `CoachModelPanel` that renders without the outer trigger button. Create `ConnectModelPaths.tsx`:
  - **Use your Claude plan (owlsh MCP server)** — headline. Short copy: "Coach with the Claude plan you already have — owlsh connects as an MCP server. Billed to your plan, not API credits." A "Set up" button that, until the MCP connector ships, opens a short info note / the onboarding (no dead click). Mark it as the recommended path.
  - **Local (Ollama)** — renders/links to `CoachModelPanel`'s local option.
  - **API key (advanced)** — renders/links to `CoachModelPanel`'s cloud options; copy notes "needs separate API credits".
  - Exact strings to satisfy the test: contains "Claude plan", "Ollama", "API key", and "credits".

- [ ] **Step 4: Run** test + typecheck + `npm test` (existing `llm` tests must still pass) — PASS.
- [ ] **Step 5: Commit** `git add -A src/components && git commit -m "Setup: embeddable coach-model panel + connect-a-model paths"`

---

### Task 4: SetupMenu dropdown

**Files:**
- Create: `src/components/SetupMenu.tsx`
- Create: `src/lib/setup-menu.ts` (pure item/status logic)
- Test: `src/lib/setup-menu.test.ts`, `tests/setup-menu.test.tsx`

**Interfaces:**
- Consumes: `VmConnector` (Task 2), `CoachModelPanel`/`ConnectModelPaths` (Task 3), `isDesktop`, `useReport` (`openOnboarding`, `setOnboardingStep`), `shouldShowNudge`.
- Produces: `setupItems(opts: { desktop: boolean }): SetupItem[]`; `setupIncomplete(opts: { onboarded: boolean; hasRealCapture: boolean }): boolean`; `<SetupMenu />`.

- [ ] **Step 1: Failing pure-logic test**

```ts
// src/lib/setup-menu.test.ts
import { describe, it, expect } from "vitest";
import { setupItems } from "./setup-menu";

describe("setupItems", () => {
  it("includes guide, ai, connector always; widget only on desktop", () => {
    const web = setupItems({ desktop: false }).map((i) => i.id);
    expect(web).toEqual(["guide", "ai", "connector"]);
    const desk = setupItems({ desktop: true }).map((i) => i.id);
    expect(desk).toEqual(["guide", "ai", "connector", "widget"]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/setup-menu.test.ts` — FAIL.

- [ ] **Step 3: Implement** `setup-menu.ts`:

```ts
export type SetupItemId = "guide" | "ai" | "connector" | "widget";
export interface SetupItem { id: SetupItemId; label: string }

export function setupItems(opts: { desktop: boolean }): SetupItem[] {
  const base: SetupItem[] = [
    { id: "guide", label: "Setup guide" },
    { id: "ai", label: "AI · coach model" },
    { id: "connector", label: "VM connector" },
  ];
  return opts.desktop ? [...base, { id: "widget", label: "Open widget" }] : base;
}

export function setupIncomplete(opts: { onboarded: boolean; hasRealCapture: boolean }): boolean {
  return !opts.onboarded || !opts.hasRealCapture;
}
```

- [ ] **Step 4: Build `SetupMenu.tsx`:** a button styled like the nav `Tab` (same classes) with the label "Setup", a trailing `<ChevronDown/>`, and a status dot (red `--color-detour` when `setupIncomplete`, else neutral `--color-faint`). Clicking toggles a dropdown (mirror `LlmStatusChip`'s click-away + add an Escape handler). The dropdown lists `setupItems`; selecting one expands its section inline (accordion; one open at a time):
  - `guide` → calls `openOnboarding` (closes menu).
  - `ai` → renders `<ConnectModelPaths />` (which hosts `<CoachModelPanel/>`).
  - `connector` → renders `<VmConnector />`.
  - `widget` → desktop only; invokes `open_widget` (same code as App.tsx uses).
  The "Finish setup" urgency: when `setupIncomplete`, show the `guide` row styled prominently at the top with text "Finish setup".

- [ ] **Step 5: UI test** `tests/setup-menu.test.tsx`: `renderToStaticMarkup(<SetupMenu/>)` contains "Setup" and a chevron; does not render the panels until opened (static render shows the closed state — assert the trigger exists and the AI/connector panel text is absent in the closed state). If the component needs interaction to open (can't in static render), assert the closed-state contract only, and rely on the pure `setupItems`/`setupIncomplete` tests for the item logic.

- [ ] **Step 6: Run** both tests + typecheck + `npm test` — PASS.
- [ ] **Step 7: Commit** `git add -A src/components/SetupMenu.tsx src/lib/setup-menu.ts tests/setup-menu.test.tsx && git commit -m "Setup: nav dropdown hosting guide/AI/connector/widget"`

---

### Task 5: Wire into the header; connector label in the live banner

**Files:**
- Modify: `src/App.tsx:214-249` (nav + remove the four scattered controls, add `<SetupMenu/>`)
- Modify: `src/components/LiveBridge.tsx` (use `connectorFor(platform).label` for the Pwnbox indicator)
- Test: `tests/live-bridge.test.ts` (extend), reuse `tests/setup-menu.test.tsx`

**Interfaces:** Consumes `SetupMenu` (Task 4), `connectorFor` (Task 1).

- [ ] **Step 1:** In `App.tsx`, replace the `<nav>` tab list to add `<SetupMenu />` after the Progress `Tab`, and delete the whole right-side `<div className="flex items-center gap-2.5 text-xs">…</div>` block (the Finish-setup/Setup-guide button, the Widget button, `<PwnboxSync/>`, `<LlmStatusChip/>`). Remove now-unused imports (`PwnboxSync`, and `LlmStatusChip` if no longer referenced; keep `AiBanner`). The `showNudge`/onboarding logic moves into SetupMenu (Task 4), so remove it here if unused.

- [ ] **Step 2:** In `LiveBridge.tsx`, the Pwnbox-sync indicator in the banner subline currently reads "Pwnbox". Replace its label with `connectorFor(t?.platform ?? "htb").label` so a THM run shows "AttackBox". Keep the `loadPwnboxConfig().enabled` gate.

- [ ] **Step 3: Failing test** in `tests/live-bridge.test.ts`: render the banner (as the existing tests do) for a THM target with pwnbox enabled and assert it shows "AttackBox", not "Pwnbox". (Follow the file's existing render/setup helper.)

- [ ] **Step 4: Run** `npx vitest run tests/live-bridge.test.ts`, then `npm run typecheck` and the full `npm test` — PASS. Manually confirm in `npm run tauri dev`: the header shows `Debrief · History · Progress · Setup ▾` with no loose buttons, and the dropdown opens each section.

- [ ] **Step 5: Commit** `git add -A src/App.tsx src/components/LiveBridge.tsx tests/live-bridge.test.ts && git commit -m "Header: Setup dropdown replaces scattered controls; banner uses connector label"`

---

### Task 6: "Connect a model" CTA in the widget

**Files:**
- Modify: `src/components/WidgetWindow.tsx` (pre-first-pull CTA line when no model)
- Create: `src/lib/hints/connect-cta.ts` (pure: should the CTA show?)
- Test: `src/lib/hints/connect-cta.test.ts`

**Interfaces:**
- Consumes: `getCoachMode` (`src/lib/llm`), `hasApiKey`.
- Produces: `shouldPromptConnect(mode: CoachMode, ollamaReachable: boolean, hasKey: boolean): boolean` — true when the active mode can't actually produce an AI hint (rules; or local with Ollama unreachable; or a cloud mode with no key).

- [ ] **Step 1: Failing test**

```ts
// src/lib/hints/connect-cta.test.ts
import { describe, it, expect } from "vitest";
import { shouldPromptConnect } from "./connect-cta";

describe("shouldPromptConnect", () => {
  it("prompts for rules mode", () => { expect(shouldPromptConnect("rules", false, false)).toBe(true); });
  it("prompts for local when Ollama is unreachable", () => { expect(shouldPromptConnect("local", false, false)).toBe(true); });
  it("does not prompt for local when Ollama is reachable", () => { expect(shouldPromptConnect("local", true, false)).toBe(false); });
  it("prompts for a cloud mode with no key", () => { expect(shouldPromptConnect("anthropic", false, false)).toBe(true); });
  it("does not prompt for a cloud mode with a key", () => { expect(shouldPromptConnect("anthropic", false, true)).toBe(false); });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/hints/connect-cta.test.ts` — FAIL.

- [ ] **Step 3: Implement**

```ts
import type { CoachMode } from "../llm";

export function shouldPromptConnect(mode: CoachMode, ollamaReachable: boolean, hasKey: boolean): boolean {
  if (mode === "rules") return true;
  if (mode === "local") return !ollamaReachable;
  return !hasKey; // a cloud mode needs a key
}
```

- [ ] **Step 4: Wire the widget.** In `WidgetWindow.tsx`, before any hint has been pulled this session (`!hint`), when `desktop` and `shouldPromptConnect(...)` is true, render a one-line muted CTA in the hint area: "Connect a model for AI hints →" that, on the desktop app, focuses the main window and is a no-op otherwise (or opens the main window; keep it minimal — a visible hint, not a dead link). Compute `ollamaReachable`/`hasKey` from the existing llm status the widget can access; if the widget doesn't already know, derive `mode = getCoachMode()` and treat `ollamaReachable`/`hasKey` as false (so the CTA shows whenever not clearly configured) — document the simplification. The static hint fallback still works when pressed.

- [ ] **Step 5: Run** the test, `tests/widget-window.test.tsx`, typecheck, full `npm test` — PASS.
- [ ] **Step 6: Commit** `git add -A src/components/WidgetWindow.tsx src/lib/hints/connect-cta.ts src/lib/hints/connect-cta.test.ts && git commit -m "Widget: Connect-a-model CTA before the first pull when no model is active"`
