# Setup & Onboarding Refinement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the Setup/onboarding surface per user review: a proper Setup dropdown (not tiny hand-rolled rows), three model providers on "Connect a model" (Claude + Gemini first-class via local MCP, ChatGPT as advanced/tunnel), real card surfaces with restrained colour, and remove the 60-second demo that's blocking activation.

**Architecture:** Pure content builders for the per-client MCP add instructions (Claude/Gemini/ChatGPT) with a parity-free unit test; a restyled `SetupMenu` dropdown with proper menu tokens; `StepMeet` loses the demo and leads straight to capture; `StepAI` becomes a three-provider chooser with proper `bg-panel` card surfaces and colour used only for the recommended path.

**Tech Stack:** React 18, TypeScript, Vitest (node env; components via `renderToStaticMarkup` + pure helpers).

**Design intent (decided with the user — treat as spec):**
- The MCP server is client-agnostic; the three options are three *clients*, each with its own add-instructions, all running inference on that user's own plan:
  - **Claude** — Claude Desktop (`claude_desktop_config.json`) / Claude Code (`claude mcp add owlsh -- owlsh mcp`). Local stdio. First-class.
  - **Gemini** — Gemini CLI (`gemini mcp add owlsh owlsh mcp`, or `~/.gemini/settings.json` `mcpServers`). Local stdio. First-class.
  - **ChatGPT** — Developer Mode supports **remote HTTPS only**, not local stdio, so owlsh needs OpenAI's Secure MCP Tunnel wrapping `owlsh mcp`. Shown as **"Advanced — needs a tunnel"** with a link; no clean local add today.
- Local (Ollama) stays as the free, model-agnostic, offline path.
- The API-key path stays hidden.
- Colour is used for hierarchy (the recommended path), not as a blanket; cards get a real surface (`bg-panel`/`bg-panel-2`) so they stack with separation.

## Global Constraints

- Keep the step-completion contract: choosing any Connect-a-model path calls `markOnboardingStep("ai")`; Local sets `coachMode="local"`; the MCP paths leave `coachMode` alone.
- Removing the demo must not break the progress rail: step 0 ("Meet owlsh") still completes (mark it done on advance, not on demo).
- The Setup dropdown stays a jump menu (Task behavior from the prior plan) — this only restyles it and enlarges text.
- Within owlsh's editorial-dark system; visible keyboard focus; reduced motion respected; 16px min gutters.
- Commits carry no `Co-Authored-By` trailer.

## Review Focus

1. **Removing the demo leaves step 0 uncompletable** → "Meet owlsh" must still mark done so the rail/`You're set` works (Task 3 test).
2. **A client whose add-command is wrong** → Gemini `gemini mcp add owlsh owlsh mcp` and Claude `claude mcp add owlsh -- owlsh mcp` are exact (Task 1 test).
3. **ChatGPT shown as if it supports local stdio** → it must read "advanced / needs a tunnel", not a plain local add (Task 1 + Task 4 tests).
4. **StepAI no longer completes the step for a path** → each provider's confirm still marks "ai" (Task 4 test).
5. **Dropdown text still tiny / no surface** → the restyle uses `text-sm`+ and a panel surface; assert the classes aren't the old `text-xs`/`bg-ink` (Task 2 test, loose).

---

### Task 1: Per-client MCP add content

**Files:**
- Modify: `src/lib/hints/mcp-connect.ts`
- Test: `src/lib/hints/mcp-connect.test.ts`

**Interfaces:**
- Keep `mcpDesktopConfigSnippet()` (Claude Desktop JSON) and `mcpClaudeCodeCommand()` → "claude mcp add owlsh -- owlsh mcp".
- Add:
  - `mcpGeminiCommand(): string` → "gemini mcp add owlsh owlsh mcp"
  - `mcpGeminiConfigSnippet(): string` → `~/.gemini/settings.json` shape: `{"mcpServers":{"owlsh":{"command":"owlsh","args":["mcp"]}}}` (JSON.stringify, 2-space)
  - `MCP_CLIENTS: { id: "claude"|"gemini"|"chatgpt"; label: string; tier: "first-class"|"advanced"; note?: string }[]` — claude & gemini first-class; chatgpt advanced with note "ChatGPT only connects to remote MCP servers — wrap `owlsh mcp` with OpenAI's Secure MCP Tunnel." and a link field `href` to the tunnel docs.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { mcpGeminiCommand, mcpGeminiConfigSnippet, mcpClaudeCodeCommand, MCP_CLIENTS } from "./mcp-connect";

describe("mcp clients", () => {
  it("gemini + claude add-commands are exact", () => {
    expect(mcpClaudeCodeCommand()).toBe("claude mcp add owlsh -- owlsh mcp");
    expect(mcpGeminiCommand()).toBe("gemini mcp add owlsh owlsh mcp");
  });
  it("gemini config snippet is valid and points owlsh at mcp", () => {
    const c = JSON.parse(mcpGeminiConfigSnippet());
    expect(c.mcpServers.owlsh).toEqual({ command: "owlsh", args: ["mcp"] });
  });
  it("claude+gemini are first-class, chatgpt is advanced with a note", () => {
    const by = Object.fromEntries(MCP_CLIENTS.map((c) => [c.id, c]));
    expect(by.claude.tier).toBe("first-class");
    expect(by.gemini.tier).toBe("first-class");
    expect(by.chatgpt.tier).toBe("advanced");
    expect(by.chatgpt.note).toMatch(/tunnel/i);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/hints/mcp-connect.test.ts` — FAIL.
- [ ] **Step 3: Implement** the builders + `MCP_CLIENTS` exactly as above.
- [ ] **Step 4: Run** the test + `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `git add src/lib/hints/mcp-connect.ts src/lib/hints/mcp-connect.test.ts && git commit -m "MCP connect: Gemini + ChatGPT client content (Claude/Gemini local, ChatGPT advanced)"`

---

### Task 2: Proper Setup dropdown

**Files:**
- Modify: `src/components/SetupMenu.tsx`
- Test: `tests/setup-menu.test.tsx` (extend, loose)

The dropdown (the `{open && …}` panel and its rows) is restyled to read as a real menu, keeping the existing jump behavior (`select(id)`) and the trigger/dot/click-away/Escape unchanged:
- Panel: `bg-panel` (not `bg-ink`), `rounded-lg`, `border-edge`, `shadow-xl`, a touch more padding (`p-2`), `min-w-[16rem]`.
- Rows: `text-sm` (not `text-xs`), `px-3 py-2.5`, `rounded-md`, `hover:bg-panel-2`, visible `focus-visible` ring; each row shows the label and a one-line muted description (e.g. guide→"Walk through activation", ai→"Claude, Gemini or a local model", connector→"Pull captures from your attack VM", widget→"Floating live window"). The urgent "Finish setup" state keeps its signal emphasis.
- Keep the status dot on the trigger.

- [ ] **Step 1:** Implement the restyle. Add the per-item descriptions as a small map in the component (or extend `setupItems` with a `desc` — your call; if you extend `setupItems`, update `src/lib/setup-menu.ts` + its test).
- [ ] **Step 2:** Extend `tests/setup-menu.test.tsx`: assert the trigger still renders; (loose) the menu markup no longer uses the old tiny styling — since the panel only renders when open (not in static render), instead add/keep the existing closed-state assertions and, if descriptions live in `setupItems`, unit-test them in `src/lib/setup-menu.test.ts`.
- [ ] **Step 3: Run** the touched tests + `npm run typecheck` + full `npm test` — PASS. Manual check in `tauri dev`: the dropdown reads as a proper menu, legible text.
- [ ] **Step 4: Commit** `git add -A src/components/SetupMenu.tsx src/lib/setup-menu.ts tests && git commit -m "SetupMenu: proper menu surface, larger text, per-item descriptions"`

---

### Task 3: Remove the demo from activation

**Files:**
- Modify: `src/components/Onboarding.tsx` (`StepMeet`, the `STEPS`/`stepDone` wiring)
- Test: `tests/onboarding-stepmeet.test.tsx` (new)

- [ ] **Step 1:** Rebuild `StepMeet` as a concise intro (what owlsh is + what the wizard will do) with NO demo: remove `startLiveDemo`/`demo`/streaming UI and the "Play a 60-second demo" button. Keep a single forward affordance. Step 0 completion: mark it done when the user advances (e.g. call `markOnboardingStep("demo")` — or rename the done key if trivial — on Next, OR change `stepDone[0]` to always-satisfied for step 0). Pick the smallest change that keeps the progress rail and `StepRecap` correct; state it in the report. If `startLiveDemo`/the demo is now unused elsewhere, leave the store action (it may power `?demo=live`), just stop calling it here.
- [ ] **Step 2: Test** `tests/onboarding-stepmeet.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StepMeet } from "../src/components/Onboarding"; // export StepMeet
describe("StepMeet", () => {
  const html = renderToStaticMarkup(<StepMeet />);
  it("no longer offers the 60-second demo", () => {
    expect(html).not.toMatch(/60-second demo/i);
    expect(html).not.toMatch(/streaming/i);
  });
});
```
(Export `StepMeet` like `StepCapture`/`StepAI`.)

- [ ] **Step 3: Run** the new test + existing onboarding tests + `npm run typecheck` + full `npm test` — PASS. Manual: the first activation step is a quick intro, Next goes to Capture.
- [ ] **Step 4: Commit** `git add -A src/components/Onboarding.tsx tests/onboarding-stepmeet.test.tsx && git commit -m "Activation: remove the demo from the first step; lead straight to capture"`

---

### Task 4: StepAI three-provider chooser + surfaces

**Files:**
- Modify: `src/components/Onboarding.tsx` (`StepAI`)
- Test: `tests/onboarding-stepai.test.tsx` (extend)

**Interfaces:** Consumes Task 1 (`MCP_CLIENTS`, `mcpClaudeCodeCommand`, `mcpDesktopConfigSnippet`, `mcpGeminiCommand`, `mcpGeminiConfigSnippet`), the existing local-Ollama flow.

- [ ] **Step 1:** Rebuild `StepAI` as "Connect a model" with proper card surfaces and restrained colour:
  - A **"Use a plan you already have"** group listing the three clients from `MCP_CLIENTS`. Selecting Claude or Gemini reveals that client's add-instructions (CommandRow for `claude mcp add …` / `gemini mcp add …`, plus the config-file snippet via CommandRow with `prompt` off). ChatGPT reveals its **advanced** note + the tunnel link (no local command). Confirming any of them (an "I've added it" / "Done" affordance) calls `markOnboardingStep("ai")` and shows the done readout; coachMode untouched.
  - A **"Run a model locally (Ollama)"** card — the existing probe/download/use flow; `useLocal()` sets `coachMode="local"` + marks the step.
  - Surfaces & colour: every card has a `bg-panel` (or `bg-panel-2`) surface with `border-edge`, real padding, and spacing between cards so they stack with separation. Colour (signal/mint border + a single "Recommended" chip) is used ONLY on the recommended path (the plan group's default/Claude), not on every card. Local is neutral. Focus rings visible; copy buttons show "Copied".

- [ ] **Step 2: Extend** `tests/onboarding-stepai.test.tsx`:

```tsx
it("offers Claude, Gemini and ChatGPT, plus Local; no API-key field", () => {
  const html = renderToStaticMarkup(<StepAI />);
  expect(html).toMatch(/Claude/);
  expect(html).toMatch(/Gemini/);
  expect(html).toMatch(/ChatGPT/);
  expect(html).toMatch(/Ollama/);
  expect(html).not.toMatch(/API key/i);
});
it("marks ChatGPT as advanced (needs a tunnel)", () => {
  const html = renderToStaticMarkup(<StepAI />);
  expect(html).toMatch(/advanced/i);
  expect(html).toMatch(/tunnel/i);
});
```

- [ ] **Step 3: Run** the test + existing onboarding tests + `npm run typecheck` + full `npm test` — PASS. Manual: cards have clear surfaces, colour only on the recommended path, three providers + local, step still completes.
- [ ] **Step 4: Commit** `git add -A src/components/Onboarding.tsx tests/onboarding-stepai.test.tsx && git commit -m "Connect a model: three providers (Claude/Gemini first-class, ChatGPT advanced) with proper card surfaces"`
