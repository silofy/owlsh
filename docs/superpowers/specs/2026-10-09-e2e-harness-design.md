# Browser e2e harness, AI hints and smoke tests

**Status:** design approved in conversation, 2026-10-09
**Part of:** whole-app automated testing, sub-project 1 of 4

| # | Sub-project | Covers |
|---|---|---|
| **1** | **Harness + AI hints + smoke (this spec)** | Playwright setup, desktop/model fakes, CI job, AI-hint flows, view smoke |
| 2 | Debrief (offense) | Write-up gate, path comparison, findings, timelines, trim, replay, report draft/export |
| 3 | Live flow | `?demo=live`, LiveBridge session merge, live banner, dashboard tiles, widget sizes/keys |
| 4 | The rest | History/Progress, onboarding/Install, settings (coach mode, API keys, HTB token), defense mode |

## Why

Unit tests (vitest, 762) cover the logic, but nothing exercises the React wiring, the real browser
(storage, keyboard, layout), or the app's calls into the native side. The AI-hint reviews repeatedly
flagged behavior only an end-to-end run can prove (opt-in, pending, "connecting…", session switches).

## Goals

- `npm run e2e` runs real-browser tests against the production bundle.
- Tests can simulate the desktop app and a model without Tauri, API keys or network.
- Every AI-hint flow on the floating widget and the live dashboard is covered.
- Every main view loads without console errors, in browser mode and simulated-desktop mode.
- Runs in CI on every push.

## Non-goals

- Driving the real Tauri app (`tauri-driver`); a later option for the release pipeline.
- Real model quality evaluation (separate, keyed, not in CI).
- Sub-projects 2–4.
- Visual regression / screenshot diffing.

## Approach

`@playwright/test` with `webServer` running `npm run build && vite preview` (production bundle).
Before app scripts load, each test injects a fake `window.__TAURI_INTERNALS__` via `addInitScript`.
The app's real code, including `CloudProvider` and every `invoke` caller, runs unchanged; only the
native side is replaced. Rejected: Tauri's `mockIPC` (needs a test-only app entry) and a vitest DOM
environment (not a real browser).

## Components

### `e2e/fixtures/tauri.ts` (desktop fake)
- An `addInitScript` payload defining `__TAURI_INTERNALS__.invoke(cmd, args)` (plus the minimal
  members `@tauri-apps/api` touches on load), which routes to per-command handlers and logs every call.
- Test-side API (Playwright fixture `tauri`):
  - `tauri.on(cmd, reply | (args) => reply)` sets a handler; a handler may throw to reject.
  - `tauri.calls(cmd)` returns the recorded `args` of every call to `cmd`.
  - `tauri.set(key, value)` changes fake desktop state mid-test (e.g. the current `latest_session`).
- Defaults: unknown commands reject with `"unmocked: <cmd>"`, which fails the test via the console
  guard below, so a new native call can't pass silently.
- Handlers must be serializable into the page: replies are data; dynamic replies run test-side via
  `page.exposeFunction`.

### `e2e/fixtures/model.ts` (model fakes)
- Cloud: sets `localStorage["owlsh.coachMode"] = "anthropic"`, `has_api_key` → true, and a
  `cloud_generate` handler returning a scripted reply.
- Ollama: `page.route("**/api/tags")` and `**/api/generate`/`**/api/chat` with scripted JSON.
- Reply helpers: `clean(text, kind)`, `leaky()` (a URL-shaped hint the guard must block),
  `slow(ms)`, `error()`.
- Replies use synthetic placeholder content only.

### `e2e/fixtures/session.ts` (capture builder)
- Builds a capture JSON from `fixtures/session-htb-easy.json`: HTB target, chosen uuid, recording
  on/off (with a fresh heartbeat when on), optional `hint_golden`, optional `hints`, optional extra
  episodes. Returns `{ path, json }` in the shape `latest_session` returns.

### Test-only timeout override (one app change)
- `generateHint`'s timeout and `resolveGolden`'s budget read an optional override from
  `window.__OWLSH_TEST__?.hintTimeoutMs` / `goldenBudgetMs`. Production never sets it. Defaults
  unchanged (8000 / 30000). Covered by a unit test that the defaults hold when the global is absent.

### Console guard
- A shared fixture fails any test whose page logs a `console.error` or an uncaught page error,
  except an explicit per-test allow-list.

## Test suites

### `e2e/hints-widget.spec.ts` (`/?widget=1`, simulated desktop)
1. HTB, pref unset: pressing `h` shows the opt-in once; "Yes" stores `owlsh.hintLookup=on`.
2. "No, model only" → hint shown with `ai · model`; no write-up fetch commands called.
3. Non-HTB target never shows the opt-in.
4. Clean reply → AI text + tag; `record_hint` called once with `{ path, tier: 1, source: "ai:knowledge" | "ai:golden", phase, atMs }`.
5. Cached `hint_golden` → `source: "ai:golden"`, tag `ai · write-up`.
6. Leaky reply, slow reply past the overridden timeout, and error reply → static tier text; `record_hint` with `source: "static"`.
7. Second press while pending is ignored (one `record_hint`).
8. Three pulls escalate tiers 1→2→3; label shows −3, −9, −19.
9. Session switch (`latest_session` returns another uuid) clears the shown hint; the next pull does
   not use the previous box's golden.
10. Before the first `latest_session` resolves the button is disabled with "connecting…".

### `e2e/hints-dashboard.spec.ts` (main app, live session)
1. "connecting…" until `latest_session` returns the matching uuid; then enabled.
2. Clean pull records to the resolved path with the right source; penalty label updates.
3. Opt-in shown for HTB, reusing the same stored pref as the widget.
4. A cached `hint_golden` is not applied to the debrief while recording; after recording stops the
   path comparison appears without a paste.

### `e2e/smoke.spec.ts`
For each of: debrief (default), history, progress, `?demo=live`, `?widget=1` — in plain browser and
simulated desktop — the view renders its landmark element and the console guard stays clean.

## CI

New `e2e` job in `.github/workflows/ci.yml`: ubuntu-latest, Node as in the `web` job,
`npm ci`, `npx playwright install --with-deps chromium`, `npm run e2e`. Uploads `playwright-report/`
as an artifact on failure. Chromium only. Retries: 1 in CI, 0 locally. Expected added time ~1–2 min.

## Files

- Add: `playwright.config.ts`, `e2e/fixtures/{tauri,model,session,index}.ts`,
  `e2e/{hints-widget,hints-dashboard,smoke}.spec.ts`
- Modify: `package.json` (`@playwright/test` dev dep, `e2e` script), `.github/workflows/ci.yml`,
  `.gitignore` (`playwright-report/`, `test-results/`), `src/lib/hints/ai-hint.ts` and
  `src/lib/hints/golden-source.ts` (timeout override), `vitest` config so `e2e/` is excluded.

## Risks

- `@tauri-apps/api` may read more of `__TAURI_INTERNALS__` than `invoke` on import; the fake adds
  members as found and documents them.
- The app polls (`latest_session` every 2s, LiveBridge); tests wait on observable UI or recorded
  calls, never fixed sleeps.
- Version of `@playwright/test` must match the existing `playwright` dependency.
