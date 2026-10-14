# Route Setup Through the Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Setup ▾ dropdown from a config host into a tiny jump menu into the activation wizard, move model-connection into the wizard's "Sharpen your coaching" step and the VM connector into "Capture → All setup options", and polish both.

**Architecture:** `SetupMenu` stops rendering config panels; its items deep-link into `Onboarding` steps (via `setOnboardingStep` + `openOnboarding`, plus a store `setupJump` flag so the connector section auto-opens). `StepAI` is rebuilt around the MCP-first + Local connect-a-model content; `StepCapture`'s existing "All setup options" `<details>` gains the platform-aware `VmConnector`. Polish is folded into each relocation with concrete criteria.

**Tech Stack:** React 18, TypeScript, Zustand store, Vitest (node env; components via `renderToStaticMarkup` + extracted pure helpers).

**Spec:** `docs/superpowers/specs/2026-10-13-setup-into-wizard-design.md`

## Global Constraints

- The Setup nav is a jump menu only — it renders NO inline config panels (VmConnector/ConnectModelPaths are rendered inside wizard steps, not the menu).
- Item → target step: guide→0 (Meet owlsh), ai→2 (Sharpen your coaching), connector→1 (Capture), widget→`open_widget` (desktop only).
- `StepAI` keeps completing the step: it still calls `markOnboardingStep("ai")` and sets the coach mode when a path is chosen.
- The API-key/credits path stays hidden (do not reintroduce it).
- The connector keeps the existing SSH mechanism (`owlsh.pwnbox`, `pull_pwnbox`) and platform labels (Pwnbox/AttackBox) untouched.
- Polish stays within owlsh's editorial-dark system — no new visual identity. Keyboard focus visible on every new control; reduced motion respected.
- Commits carry no `Co-Authored-By` trailer.

## Review Focus

1. **Selecting a jump item while the wizard is already open** → it switches to the target step (and opens the connector section for "connector"), not a no-op (Task 3 test).
2. **`setupJump` left set after the connector step mounts** → the step consumes and clears it so it doesn't re-open every visit (Task 2 + Task 5 tests).
3. **`StepAI` rebuilt but the coach mode never gets set** → choosing MCP or Local still marks the step done and (for Local) sets `coachMode` (Task 4 test).
4. **Non-desktop (browser) render of the menu** → no "Open widget" row; the wizard deep-links still work (Task 3 test).
5. **The connector's SSH pull starts from inside the wizard for a local/none platform** → it must not (the Task-2 gating still holds; Task 5 asserts the note shows, no form) (Task 5 test).

---

### Task 1: Setup item → wizard-target mapping

**Files:**
- Modify: `src/lib/setup-menu.ts`
- Test: `src/lib/setup-menu.test.ts`

**Interfaces:**
- Produces: `setupItems` unchanged shape but labels `{guide:"Setup guide", ai:"Connect a model", connector:"VM connector", widget:"Open widget"}`; new `setupItemTarget(id: SetupItemId): { step?: number; jump?: "connector"; widget?: boolean }`.

- [ ] **Step 1: Failing test**

```ts
// append to src/lib/setup-menu.test.ts
import { setupItemTarget } from "./setup-menu";

describe("setupItemTarget", () => {
  it("maps each item to its wizard step / action", () => {
    expect(setupItemTarget("guide")).toEqual({ step: 0 });
    expect(setupItemTarget("ai")).toEqual({ step: 2 });
    expect(setupItemTarget("connector")).toEqual({ step: 1, jump: "connector" });
    expect(setupItemTarget("widget")).toEqual({ widget: true });
  });
});
```

Also update the existing `setupItems` label test if it asserts "AI · coach model" → now "Connect a model".

- [ ] **Step 2: Run** `npx vitest run src/lib/setup-menu.test.ts` — FAIL.

- [ ] **Step 3: Implement.** Update the labels in `setupItems` (ai → "Connect a model"). Add:

```ts
export function setupItemTarget(id: SetupItemId): { step?: number; jump?: "connector"; widget?: boolean } {
  switch (id) {
    case "guide": return { step: 0 };
    case "ai": return { step: 2 };
    case "connector": return { step: 1, jump: "connector" };
    case "widget": return { widget: true };
  }
}
```

- [ ] **Step 4: Run** the test + `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `git add src/lib/setup-menu.ts src/lib/setup-menu.test.ts && git commit -m "Setup: map menu items to wizard steps"`

---

### Task 2: `setupJump` store flag

**Files:**
- Modify: `src/store/report.ts`
- Test: `src/store/report.test.ts` if present, else a focused new test `tests/setup-jump.test.ts`

**Interfaces:**
- Produces: store field `setupJump: "connector" | null` (initial null); actions `setSetupJump(j: "connector" | null)`; the existing `setOnboardingStep`/`openOnboarding` unchanged.

- [ ] **Step 1: Failing test**

```ts
// tests/setup-jump.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useReport } from "../src/store/report";

describe("setupJump", () => {
  beforeEach(() => useReport.getState().setSetupJump(null));
  it("defaults to null and round-trips", () => {
    expect(useReport.getState().setupJump).toBeNull();
    useReport.getState().setSetupJump("connector");
    expect(useReport.getState().setupJump).toBe("connector");
    useReport.getState().setSetupJump(null);
    expect(useReport.getState().setupJump).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/setup-jump.test.ts` — FAIL.

- [ ] **Step 3: Implement.** Add `setupJump: "connector" | null` to the store state interface and initial state (`setupJump: null`), and the action `setSetupJump: (j) => set({ setupJump: j })`. Follow the file's existing field/action patterns.

- [ ] **Step 4: Run** the test + `npm run typecheck` + `npm test` — PASS.
- [ ] **Step 5: Commit** `git add src/store/report.ts tests/setup-jump.test.ts && git commit -m "Store: setupJump flag for deep-linking the connector section"`

---

### Task 3: SetupMenu becomes a jump menu

**Files:**
- Modify: `src/components/SetupMenu.tsx`
- Test: `tests/setup-menu.test.tsx`

**Interfaces:** Consumes Task 1 (`setupItemTarget`), Task 2 (`setSetupJump`); `openOnboarding`, `setOnboardingStep` from the store.

- [ ] **Step 1:** Rewrite `select(id)` to deep-link instead of toggling inline sections:

```ts
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
```

Remove the `section` state, the `ConnectModelPaths`/`VmConnector` imports, and any inline-panel rendering. The dropdown now lists the `setupItems` rows as buttons calling `select(id)`; keep the trigger (label "Setup", chevron, status dot) and the click-away + Escape handlers. The status dot keeps using `setupIncomplete`.

- [ ] **Step 2:** Update `tests/setup-menu.test.tsx`: the menu no longer renders config panels. Since the dropdown opens on click (not in static render), assert the closed-state trigger exists AND (sanity) that the module no longer imports VmConnector/ConnectModelPaths — e.g. a test that `renderToStaticMarkup(<SetupMenu/>)` does NOT contain connector/model-panel landmark text (e.g. not "Auto-pull over SSH", not "Use your Claude plan") in any state reachable from static render. Rely on Task 1's pure `setupItemTarget` test for the routing logic.

- [ ] **Step 3: Run** `npx vitest run tests/setup-menu.test.tsx src/lib/setup-menu.test.ts` + `npm run typecheck` + full `npm test` — PASS.
- [ ] **Step 4: Commit** `git add src/components/SetupMenu.tsx tests/setup-menu.test.tsx && git commit -m "SetupMenu: jump menu into the wizard, no inline config panels"`

---

### Task 4: StepAI → Connect a model (MCP + Local), polished

**Files:**
- Modify: `src/components/Onboarding.tsx` (`StepAI`)
- Test: `tests/onboarding-stepai.test.tsx` (new, static render of `StepAI`)

**Interfaces:** Consumes `mcpDesktopConfigSnippet`/`mcpClaudeCodeCommand` (`src/lib/hints/mcp-connect`), the existing local-Ollama flow in `StepAI` (`llmStatus`/`pullModel`/`setCoachMode`/`markOnboardingStep`), and the wizard's `CommandRow`/`Primary`/`Readout` building blocks.

- [ ] **Step 1:** Read `StepAI` fully. Rebuild its body as two cards, MCP-first:
  - **Use your Claude plan (owlsh MCP server)** — recommended. Reuse the Task-6 content: the `claude_desktop_config.json` snippet via `mcpDesktopConfigSnippet()` rendered with the wizard's `CommandRow` (so copy + styling match), the `mcpClaudeCodeCommand()` one-liner likewise, and one line "Coaching then happens inside your Claude client, on your plan." On the primary action, `setCoachMode` is NOT changed (MCP coaching is external); mark the step satisfied with `markOnboardingStep("ai")` and show a done readout.
  - **Local (Ollama)** — keep the EXISTING `StepAI` local flow (probe → download → use) exactly (it's already the right UX for onboarding); `useLocal()` sets `coachMode="local"` and `finish("Local AI")`.
  - REMOVE the cloud-provider + API-key UI from this step (consistent with the hidden API path).
  Polish criteria: the two cards use the wizard's card tokens and spacing; MCP is visually primary (border-signal) and Local secondary; code blocks are `CommandRow`, not ad-hoc `<pre>`; copy buttons show a transient "Copied"; focus rings visible; the "done" readout matches `StepCapture`'s `Readout tone="match"`.

- [ ] **Step 2: Test** `tests/onboarding-stepai.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StepAI } from "../src/components/Onboarding"; // export StepAI if not already
describe("StepAI", () => {
  const html = renderToStaticMarkup(<StepAI />);
  it("offers MCP (your Claude plan) and Local, not an API-key field", () => {
    expect(html).toContain("Claude plan");
    expect(html).toContain("Ollama");
    expect(html).not.toMatch(/API key/i);
  });
  it("shows the MCP add command", () => {
    expect(html).toContain("claude mcp add owlsh -- owlsh mcp");
  });
});
```
(Export `StepAI` from Onboarding.tsx if it isn't already — `StepCapture` is already exported, follow that.)

- [ ] **Step 3: Run** the new test, the existing onboarding tests, `npm run typecheck`, full `npm test` — PASS.
- [ ] **Step 4: Commit** `git add src/components/Onboarding.tsx tests/onboarding-stepai.test.tsx && git commit -m "Wizard: Sharpen-your-coaching step is now Connect-a-model (MCP + Local)"`

---

### Task 5: VM connector under "All setup options", with deep-link auto-open

**Files:**
- Modify: `src/components/Onboarding.tsx` (`StepCapture`)
- Test: `tests/onboarding-stepcapture.test.tsx` (new)

**Interfaces:** Consumes `VmConnector` (`src/components/VmConnector`), Task 2 (`setupJump`, `setSetupJump`), `setOnboardingStep`.

- [ ] **Step 1:** In `StepCapture`, inside the existing `<details>` "All setup options", render a short heading "Capture from a remote VM" and `<VmConnector/>` beneath `<InstallReference/>`. For the deep-link: read `setupJump` from the store; when it's `"connector"`, force the `<details>` open (control its `open` prop from state seeded by `setupJump === "connector"`) and clear it with `setSetupJump(null)` in an effect so it doesn't re-open on later visits. (Scroll-into-view is optional; opening the section is the requirement.)

- [ ] **Step 2: Test** `tests/onboarding-stepcapture.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StepCapture } from "../src/components/Onboarding";
describe("StepCapture", () => {
  it("includes the VM connector under All setup options", () => {
    const html = renderToStaticMarkup(<StepCapture />);
    expect(html).toContain("All setup options");
    expect(html).toContain("remote VM"); // the connector heading
  });
});
```
(The connector's own platform/no-form behavior is already covered by `tests/vm-connector.test.tsx`; this test only confirms it's mounted here.)

- [ ] **Step 3: Run** the new test, existing onboarding tests, `npm run typecheck`, full `npm test` — PASS. Manual check in `npm run tauri dev`: Setup ▾ → "VM connector" opens the wizard at the capture step with "All setup options" expanded showing the connector.
- [ ] **Step 4: Commit** `git add src/components/Onboarding.tsx tests/onboarding-stepcapture.test.tsx && git commit -m "Wizard: VM connector lives under Capture → All setup options, deep-linkable"`
