# Route setup through the activation wizard

**Status:** design approved in conversation, 2026-10-13
**Supersedes the UX of:** `2026-10-10-setup-menu-vm-connector-design.md` (the Setup-dropdown-as-config-host). The connector model, platform metadata, and Connect-a-model content from that work are kept and relocated.

## Why

The Setup ▾ dropdown became a cramped host for full config panels (Connect-a-model paths, the VM connector, the coach-model picker) — too much surface for a popover, and it bypasses the guided activation flow owlsh already has. owlsh's `Onboarding` wizard ("Activation": Meet owlsh → Capture your first run → Sharpen your coaching → You're set) is the right home for setup. Move users through it; make the Setup nav a light jump-in, not a config surface.

## Goals

- The Setup nav is a **tiny jump menu** whose items deep-link into the relevant wizard step (or open the widget) — never an inline config accordion.
- **Model connection lives in the wizard's "Sharpen your coaching" step** (`StepAI`), rebuilt around the MCP-first → Local paths (no credits path).
- **The VM connector lives in "Capture your first run" → "All setup options"** (`StepCapture`), next to the capture commands it relates to.
- A visible **polish pass** on the wizard and the two relocated panels.

## Non-goals

- Changing the capture mechanism, the connector model/labels, the MCP connector, or the coach-model logic — only where they're surfaced.
- Re-adding the API-key path (stays hidden until MCP matures).
- New wizard steps; the four stay.

## The Setup jump menu

`SetupMenu` stops hosting config panels. It becomes a small dropdown of jump links, each of which opens the wizard at a step (via `setOnboardingStep(n)` + `openOnboarding()`) or performs a utility action:

```
Setup ▾
 ├─ Setup guide        → wizard step 0 (Meet owlsh)
 ├─ Connect a model    → wizard step 2 (Sharpen your coaching)   ● dot if no model
 ├─ VM connector       → wizard step 1, "All setup options" open → connector
 └─ Open widget        → open_widget (desktop only)
```

- A single status dot on the Setup trigger stays (red when setup incomplete / no model), as today.
- `VmConnector` and `ConnectModelPaths` are **removed from the menu** and rendered inside the wizard steps instead.
- "VM connector" deep-link: open step 1 with the "All setup options" `<details>` expanded and scrolled to the connector (a step param or a store flag the step reads to auto-open the section).

## StepAI — "Sharpen your coaching" becomes Connect-a-model

Rebuild `StepAI`'s body around the Connect-a-model paths, MCP-first:

- **Use your Claude plan (owlsh MCP server)** — recommended; the config snippet + `claude mcp add` one-liner (the Task-6 flow), explaining coaching happens in the user's Claude client.
- **Local (Ollama)** — the existing guided local setup (probe / download / use), kept, restyled to sit beside the MCP card.
- Drop the cloud-provider-API-key UI from this step (consistent with the hidden API path).
- On choosing a path, `markOnboardingStep("ai")` as today so the step completes.

## StepCapture — the VM connector under "All setup options"

Inside the existing `<details>` "All setup options", render `<InstallReference/>` (as now) **and** the platform-aware `<VmConnector/>` beneath it, with a short heading ("Capture from a remote VM"). The connector keeps its platform selector and SSH form for Pwnbox/AttackBox, and the note for local/none platforms. Honor the Setup-menu deep-link that auto-opens this section.

## Polish pass

Apply to the wizard shell and the two panels, within owlsh's editorial-dark system (do not invent a new identity):

- Consistent vertical rhythm and max line length in step bodies; align the connect-a-model cards and the connector panel to the wizard's existing card/spacing tokens.
- The Connect-a-model cards: clear primary (MCP) vs secondary (Local) weight; a copy affordance with "Copied" feedback; the code blocks use the wizard's existing `CommandRow`/mono styling rather than ad-hoc `<pre>`.
- The connector panel: tighten the SSH form and the platform selector to match the wizard's field styling; the local/none note reads as guidance, not a disabled form.
- The Setup jump menu: compact rows with the step they jump to, matching the nav's type scale; the status dot legible in both themes.
- Respect reduced motion; visible keyboard focus on every new control; 16px min side gutters.

## Files

- Modify: `src/components/SetupMenu.tsx` (jump menu, deep-links; stop rendering config panels), `src/lib/setup-menu.ts` (item → target step mapping)
- Modify: `src/components/Onboarding.tsx` (`StepAI` rebuilt around Connect-a-model; `StepCapture` hosts `VmConnector`; a store flag or step param to auto-open the connector section)
- Reuse: `src/components/ConnectModelPaths.tsx`, `src/components/VmConnector.tsx` (relocated into the steps; polished)
- Modify: `src/store/report.ts` if a deep-link target (e.g. `setupJump: "connector" | null`) is needed for the connector auto-open
- Tests: update `tests/setup-menu.test.tsx` (jump items, not panels), `src/lib/setup-menu.test.ts` (item→step map), onboarding step tests if present; keep `tests/connect-model.test.tsx` green (ConnectModelPaths unchanged in content)

## Testing

- `setupItems` maps each item to its target step / action (pure, tested).
- The Setup menu renders jump rows and no inline config panels (the connector/model panels are absent from the menu's static render).
- Selecting "Connect a model" sets onboarding step 2 and opens the wizard; "VM connector" opens step 1 and the connector auto-open flag; "Setup guide" step 0; "Open widget" desktop-only.
- `StepAI` renders the MCP + Local paths and no API-key card.
- `StepCapture`'s "All setup options" contains the connector.

## Risks

- `StepAI` currently persists the coach choice via `markOnboardingStep("ai")` and `setCoachMode`; the rebuild must keep that so the step still completes and the model actually gets set.
- Deep-linking to the connector section inside a `<details>` needs the step to open it programmatically (don't rely on the user expanding it).
