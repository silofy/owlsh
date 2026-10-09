# AI hints that don't leak the write-up

**Status:** design approved in conversation, 2026-10-09
**Replaces:** the static-only text of the live widget's `[h] hint` (`src/lib/widget/hints.ts`)

## Why

A user asked whether hints work by "submitting to AI what you have done so far, without giving access
to the writeup". Today they don't: a hint is one of three fixed, box-agnostic process prompts. owlsh
already has the pieces to do better (LLM connectors, write-up extraction, a golden path), so hints
should become session-aware and steer toward the intended path without ever handing over the answer.

## Goals

- A hint pull produces a short, session-specific nudge from the configured model.
- The model may see the intended path; the operator never sees an answer from it.
- Zero setup: the golden path is resolved automatically where possible.
- Available outside the terminal: floating widget and live dashboard.
- Grading is unchanged: same tiers, same 3/6/10 independence penalty, same `.hints` sidecar.

## Non-goals

- Cloud models in the terminal widget (`scripts/widget.tsx`). Keys stay native (Tauri); the terminal
  widget gets Ollama when reachable, otherwise static hints.
- Write-ups for active (unretired) HTB boxes. None exist publicly, and using one would break platform rules.
- Changing how the grade weighs hints, or the integrity gate (hints still never route to the queue).

## Decisions

| Question | Decision |
|---|---|
| Leak model | Model sees the golden path; its output passes a **fail-closed** guard before display. |
| Providers | Whatever `resolveProvider()` returns: Claude / OpenAI / Gemini / OpenRouter / Ollama; `NullProvider` → static hint. |
| Golden source | Layered: native/fetched golden path when available, else the model's own knowledge of the box. |
| Fetching | Automatic by box name behind a **one-time opt-in** (the box name leaves the machine). |
| Surfaces | Floating widget + new hint button on the live dashboard, one shared hook and sidecar. |
| Scoring | Tiers unchanged; AI only replaces the text. Tier caps how direct the AI may be. |

## Tiers

The tier still escalates per run (`nextTier`) and still costs `HINT_PENALTY[tier]`. It now also bounds
directness, enforced in both the prompt and the guard:

- **Tier 1 (process):** a nudge grounded in the operator's own output. May only name tools/services
  the operator has already touched.
- **Tier 2 (area):** which service or phase deserves attention. May name areas seen in the session, no technique.
- **Tier 3 (technique class):** the *kind* of technique to try ("look for a misconfigured scheduled
  task"). Never a command, path, credential or exact exploit.

## Architecture

```
pullHint()                                   // useHint() hook, shared by widget + dashboard
  ├─ tier = nextTier(pulls)
  ├─ golden = loadGolden(capture)            // <capture>.golden sidecar
  │    └─ miss & opted-in → resolveGolden(box)
  │         THM → adapter.intendedPath (task list)
  │         HTB retired → 0xdf URL from slug → fetchWriteupUrl → goldenFromText
  │         else → null
  ├─ provider = resolveProvider()
  │    └─ NullProvider → static hintFor(tier)
  ├─ prompt = buildHintPrompt(tier, recentSteps, golden ?? { knowledgeOf: box })
  ├─ raw = provider.generateJson(prompt, { schema: HINT_SCHEMA })   // 8s timeout
  ├─ verdict = guard(raw, { tier, golden, seen })
  └─ display AI hint, or static hintFor(tier) on block / timeout / error / bad JSON
  record HintPull { tier, atMs, phase, source } to <capture>.hints
```

### Modules

- **`src/lib/hints/golden-source.ts`**: `loadGolden`, `saveGolden`, `resolveGolden(box)`. Reuses
  `fetchWriteupUrl`, `goldenFromText` and `adapterFor(platform).intendedPath`. The sidecar is
  `.golden`, not `.json`, for the same reason `.hints` isn't (the app reads every `.json` as a report).
  `WriteupGate` checks this sidecar first, so a fetched write-up flows into the debrief with no paste.
- **`src/lib/hints/ai-hint.ts`**: `buildHintPrompt`, `HINT_SCHEMA`, `generateHint(...)`, which returns
  `{ text, source }` and never throws.
- **`src/lib/hints/guard.ts`**: pure `guard(raw, ctx): { ok: true, text } | { ok: false, reason }`.
- **`src/lib/hints/use-hint.ts`**: React hook wrapping tier, pull, pending state, persistence.
- **`src/lib/widget/hints.ts`**: keeps static prompts, penalties, `nextTier`; becomes the fallback.

### Data changes

- `HintPull.source?: "static" | "ai:golden" | "ai:knowledge"`. Optional, so old sidecars still load.
  Update `src/types/report.ts` and `schema/owlsh-report.schema.json`.
- Opt-in flag for box-name lookup, stored with the other coach settings (`lib/llm/mode.ts` pattern).
- The grade rationale names AI hints by source, e.g. "Used 2 hints (1 AI from write-up) (−9 independence)".

## Prompt

Inputs: tier, box name/platform, the last ~20 captured steps (command + truncated output, same shape
and truncation as `coach.ts`), satisfied vs unsatisfied objectives when a golden path exists.

Instructions (abridged): "You are a coach, not a solver. Give ONE hint of at most 30 words at
directness level <tier rule>. Never state a command, file path, credential, URL, CVE, username or flag.
Never name anything from UNSATISFIED objectives verbatim; describe the category of thing instead."

With no golden path: "Use your own knowledge of <box> on <platform> if you have it; if you don't, coach
from the session alone." The prompt never contains raw write-up text, only the extracted golden objectives.
Cloud prompts additionally pass through the existing `redactText` in `CloudProvider`.

Schema: `{ hint: string, kind: "process" | "area" | "technique" }`.

## Guard (security boundary)

Fails closed: any rule hit, wrong `kind` for the tier, over 30 words, or unparsable → static hint.

1. **Always blocked (pattern):** password/secret-like tokens, hashes, flag formats (`HTB{…}`,
   `THM{…}`, 32-hex), CVE IDs, URLs, IPs and hostnames, file paths deeper than a bare directory
   name, and command-shaped text (a known binary followed by flags/arguments, pipes, redirects).
2. **Golden specifics (when golden exists):** any term of 4 characters or more from **unsatisfied**
   objectives (`objective` words, `satisfied_by`, `techniques`), case-insensitive, word-boundary matched.
   Terms from satisfied objectives are allowed.
3. **Tier caps:** tier 1 may only name tools/services in `seen`. Tier 2 must not be `kind: technique`.
4. **Allow-list:** terms in `seen` (tokens from the operator's own commands and output) are exempt
   from rule 2, but never from rule 1.

Known limit: with `ai:knowledge` there is no golden path, so rules 2–4 can't catch a technique that's
too direct in plain words. Such hints are tagged `ai:knowledge` in the report so this is visible.

## Surfaces

- **Floating widget (`WidgetWindow.tsx`):** primary non-terminal surface. Same `hint:` line plus
  a "thinking…" state and a small source tag (`ai · write-up`, `ai · model`, or none for static).
- **Live dashboard (`LiveDashboard.tsx`):** new hint button beside "→ Next move", using the same hook.
- **Terminal widget (`scripts/widget.tsx`):** `generateHint` with Ollama when reachable, else static.
- All three append to the same `<capture>.hints`, so a pull counts once wherever it happens.

## Error handling

Every failure degrades to the static tier hint, and the pull is still recorded and penalized (the
operator asked for help and got help). Examples: no provider, timeout, bad JSON, guard block, fetch
fails, extraction is empty, opt-in not given. Fetch/extract failures are cached as a "none" sentinel
in `.golden` for the run so we don't refetch on every pull.

## Testing

- `guard.test.ts`: table of must-block hints (built from fixture write-ups and synthetic secrets) and
  must-pass hints; a property test that any 4+ char term from an unsatisfied objective, embedded in
  random text, is blocked; `seen` exemption never overrides rule 1.
- `ai-hint.test.ts`: with a stub provider: success, timeout, bad JSON, block → fallback; source tagging;
  the prompt never contains write-up text, only objectives.
- `golden-source.test.ts`: THM path, 0xdf slug building, cache hit, "none" sentinel, no fetch without opt-in.
- `grade.test.ts`: penalty unchanged with `source` present; rationale wording.
- `widget-window.test.tsx`: pending state, fallback display, source tag.
