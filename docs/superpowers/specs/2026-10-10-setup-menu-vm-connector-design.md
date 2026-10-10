# Setup menu + platform-aware VM connector

**Status:** design approved in conversation, 2026-10-10
**Branch:** `ui/live-banner` (continues from the live-banner work)

## Why

The header's right side is a mismatched cluster of four unrelated controls — a plain-text
"Setup guide" link, a "Widget" button, the HTB-only "Pwnbox" chip, and the "AI · setup" chip — at
three different sizes. Two problems:

1. **Messy, no structure.** Setup actions are scattered and sized inconsistently.
2. **"Pwnbox" is HTB-only.** It's really one instance of a generic *remote attack VM over SSH*. The
   same scp-pull works for TryHackMe's AttackBox; OffSec and local captures run on the box itself;
   Immersive is browser-only with nothing to connect to.

## Goals

- Collapse the four controls into one **Setup** nav tab (beside Progress) with a chevron dropdown.
- A single status dot on the Setup tab preserves the at-a-glance "setup incomplete" signal.
- Generalize "Pwnbox" into a **VM connector** whose label, connection hint, and availability come
  from the active platform. The SSH pull mechanism is unchanged.
- For platforms with no SSH-reachable VM, explain and disable rather than show a dead form.

## Non-goals

- Changing the capture/scp-pull mechanism or the Rust `pull_pwnbox` command.
- Adding capture support for browser-only platforms (Immersive) — out of scope, explained in-UI.
- Touching the onboarding wizard's content (the Setup guide still opens it unchanged).

## Platform connector model (research-backed)

| Platform | Attack VM | Connector kind | Label | Notes |
|---|---|---|---|---|
| HTB | Pwnbox (cloud Parrot) | `ssh` | Pwnbox | SSH target from the Pwnbox panel |
| THM | AttackBox (cloud Ubuntu) | `ssh` | AttackBox | IP/user/pass via the "i" button once booted |
| OffSec | own local Kali + OpenVPN | `local` | Kali (local) | owlsh runs on the Kali — nothing to pull |
| Immersive | browser/WebSocket only | `none` | Immersive | no shell; run owlsh locally while VPN'd |
| local | own box | `local` | Local capture | capture is already local |

Sources: TryHackMe SSH/AttackBox/VPN docs; Immersive Labs browser/WebSocket requirements.

### Connector metadata on the platform adapter

Add an optional `connector` to `PlatformAdapter` (`src/lib/platform/types.ts`):

```ts
connector?: {
  kind: "ssh" | "local" | "none";
  label: string;        // "Pwnbox", "AttackBox", "Kali (local)", "Immersive", "Local capture"
  hint?: string;        // SSH-kind only: connection-string placeholder / where to find it
  note?: string;        // local/none: the one-line explanation shown in place of the form
};
```

Each adapter (`htb.ts`, `thm.ts`, `offsec.ts`, `immersive.ts`, `local.ts`) declares its own. A
`connectorFor(platformId)` helper in `src/lib/platform/index.ts` returns it, defaulting to HTB's
when the platform is unknown.

## Which platform is "active"

The connector needs a platform even before a capture exists. Resolution order:

1. The active report's `targetOf(report).platform`, when a report is open.
2. Else the most recent session card's platform (`sessionCards[0]`).
3. Else a small platform picker inside the connector panel (default HTB), stored in
   `localStorage` as `owlsh.connectorPlatform`, so a user setting up before their first capture can
   choose. The picker is always available in the panel to override the inference.

## UI

### Setup nav tab

`App.tsx` header nav becomes `Debrief · History · Progress · Setup ▾`. Setup is a new control
(not the existing `Tab`, which switches `view`): a button that opens a dropdown, styled to match the
tabs but carrying a trailing `ChevronDown` and a status dot.

- **Status dot:** red (`--color-detour`) when setup is incomplete (the existing `showNudge`
  condition — no capture yet / onboarding not done), else neutral. Replaces the "Finish setup"
  pill; the nudge's urgency moves to the dot + a "Finish setup" item styled prominently at the top of
  the menu when incomplete.
- Clicking toggles the dropdown; click-away and Escape close it; it does not change `view`.

### Setup dropdown items

```
Setup ▾
 ├─ Finish setup / Setup guide   → opens onboarding (step 1)
 ├─ AI · coach model        ●    → inline LLM config (moved from LlmStatusChip)
 ├─ VM connector            ●    → inline platform-aware connector (moved from PwnboxSync)
 └─ Open widget                  → open_widget (desktop only; omitted on web)
```

Each row shows a label, an optional status dot, and opens its panel. AI and VM connector keep their
existing inline config UIs, relocated into this menu as expandable sections (accordion within the
dropdown) rather than separate popovers — one open at a time.

### VM connector panel (by connector kind)

- **`ssh`** (HTB, THM): the existing capture steps + "Auto-pull over SSH" toggle + connection fields,
  with the label and the connection-field placeholder taken from `connector.label` / `connector.hint`
  ("Pwnbox SSH" → "AttackBox SSH", etc.). Config storage is unchanged (`owlsh.pwnbox`).
- **`local`** (OffSec, local): no form. A one-line note from `connector.note`
  ("owlsh runs on your own Kali — capture is local, nothing to connect.") and a link to the Setup guide.
- **`none`** (Immersive): disabled appearance, `connector.note` explaining browser-only + the
  fallback (run owlsh locally while VPN'd). No SSH fields.
- A platform selector at the top of the panel (per "active platform" above) lets the user switch
  which platform's connector they're configuring.

The live banner's existing "Pwnbox" indicator (`LiveBridge.tsx`) uses `connector.label` too, so a
THM run reads "AttackBox", not "Pwnbox".

## Files

- Modify: `src/lib/platform/types.ts` (+`connector`), `src/lib/platform/{htb,thm,offsec,immersive,local}.ts` (declare each), `src/lib/platform/index.ts` (+`connectorFor`)
- Create: `src/components/SetupMenu.tsx` (the nav dropdown + accordion host)
- Modify: `src/components/PwnboxSync.tsx` → generalized `VmConnector` (rename; platform-aware labels/kinds), `src/components/LlmStatusChip.tsx` (expose its panel for embedding, keep standalone export if still used elsewhere), `src/App.tsx` (nav + remove the four scattered controls), `src/components/LiveBridge.tsx` (connector label), `src/lib/pwnbox.ts` (+`owlsh.connectorPlatform`, no mechanism change)
- Tests: `tests/setup-menu.test.tsx` (menu items, status dot, desktop-only widget row), `src/lib/platform/connector.test.ts` (each adapter's connector; `connectorFor` default), update `pwnbox`/`platform` tests touching labels

## Testing

- `connectorFor` returns the right kind/label per platform; unknown → HTB default.
- SSH-kind panel renders the platform's label and hint; `local`/`none` render the note and no SSH fields.
- Setup menu lists the items; the widget row is desktop-only; the status dot is red when setup is
  incomplete and neutral otherwise.
- The SSH config still round-trips through `owlsh.pwnbox` (no regression in `parseSshTarget`/pull).
- Active-platform resolution: report platform wins, else latest card, else stored/default.

## Risks

- `LlmStatusChip` and `PwnboxSync` are currently standalone header chips; embedding them as accordion
  sections must not lose their live status polling. Keep the status logic; only the container changes.
- Hiding AI/connector status behind a menu loses glanceability — mitigated by the Setup tab's dot and
  per-row dots.
