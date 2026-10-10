# owlsh MCP server — coach from your own Claude plan

**Status:** draft for review, 2026-10-10
**Relates to:** the "Connect a model" CTA in `2026-10-10-setup-menu-vm-connector-design.md`

## Why

Consumer Claude/ChatGPT subscriptions cannot authorize third-party API calls — Anthropic banned
subscription-OAuth for third-party apps (enforced ~April 2026, [coverage](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/)).
owlsh calling a model therefore means either a local model (Ollama) or paid API credits. The only
compliant way to use a plan a user *already pays for* is to invert the direction: **owlsh becomes an
MCP server** that the user adds to their own Claude client (Claude Desktop / Claude Code). Their client
reads owlsh's session context through a tool and produces the coaching, billed to their plan.

## The core consequence (design it around this)

owlsh does not run the model in this mode — the user's Claude client does. So:

1. **The hint appears in the user's Claude client, not owlsh's widget.** The in-app `[h]` button keeps
   working only for Local/API users. The widget, when MCP is the connected path, shows a short "Coach
   this run in Claude →" affordance instead of generating in-place.
2. **The leak boundary moves from output to input.** The widget's guard filtered the *model's output*.
   Here owlsh can't post-filter the client's output, so protection is enforced by **what owlsh exposes**:
   owlsh never hands the client the write-up or the golden path. The client can only coach from the
   session-so-far plus its own training knowledge of the box — exactly the `ai:knowledge` case the
   current design already accepts. The "don't print a command/path/credential" rules become prompt
   instructions owlsh includes; they are advisory on the client, documented as a known limit.
3. **Independence scoring stays honest via the tool.** The coaching tool records a hint pull (tier,
   `source: "mcp"`) to the `<session>.hints` sidecar, so the grade still counts it. Known gap: a user
   could read the raw session resource and self-coach without calling the coaching tool, dodging the
   penalty — documented; mitigations below.

## The server

A stdio MCP server launched by the user's Claude client. Home: a new `owlsh mcp` mode of the existing
`owlsh` capture binary (`crates/capture`), so there's one binary to install. It reads the same
`~/.owlsh/sessions/` files the app and daemon use. Implemented with the Rust MCP SDK (`rmcp`) or a
minimal JSON-RPC-over-stdio loop if that's lighter.

### Tools / resources (owlsh controls exactly what leaves)

- **`active_session`** (resource/tool): the current recording session, sanitized — ordered commands
  with truncated `output_digest`, current tier, platform, flags found, phase, elapsed. **Excludes**
  `golden_dag`, `hint_golden`, and any write-up text. This is the only session data that ever leaves.
- **`coach` (tier?)** (tool): returns a coaching *instruction block* + the sanitized `active_session`
  for the client to turn into one hint, carrying the same rules as `buildHintPrompt` (coach not solver,
  ≤ 30 words, tier directness, never a command/path/credential/flag). Side effect: records a pull
  (`{ tier, atMs, phase, source: "mcp" }`) to `<session>.hints`, escalating tier like the widget.
- **`list_runs`** (tool, optional): recent sessions for "coach my last run" after the fact.

Nothing writes to the target or exposes credentials. The HTB token and API keys stay out of the MCP
surface entirely.

### Transport & identity

- stdio, one server process per client launch. No network listener.
- The server only reads the local sessions dir; it performs no egress of its own.

## Onboarding — the "2-click" add

The Setup menu's AI section → "Use your Claude plan" shows, by what's detected:

1. **Claude Code CLI present** (`claude` on PATH): a one-click button that runs
   `claude mcp add owlsh -- owlsh mcp` (via a native command), then confirms.
2. **Claude Desktop present**: a copyable `claude_desktop_config.json` snippet:
   ```json
   { "mcpServers": { "owlsh": { "command": "owlsh", "args": ["mcp"] } } }
   ```
   with a "Reveal config file" button, and a deep link if Claude Desktop supports one at build time.
3. **Neither**: a short "Install Claude Desktop or Claude Code to use this path" with links, and a
   nudge toward Local (Ollama) instead.

After adding, the AI section shows "Connected via your Claude plan" and the widget switches to the
"Coach this run in Claude" affordance.

## Files (first cut)

- Create: `crates/capture/src/mcp.rs` (the server: tool/resource handlers, sanitizer, pull recording),
  wire an `owlsh mcp` arm in `crates/capture/src/main.rs`
- Reuse: the session-read + sanitization logic; mirror `buildHintPrompt`'s rules (keep one source of
  truth — consider a small shared text asset or a documented duplicate with a test pinning parity)
- App: Setup-menu AI section "Use your Claude plan" flow (detection + add actions), widget "Coach in
  Claude" affordance (behind the MCP-connected state)
- Native: a command to run `claude mcp add …` and to reveal the Claude Desktop config path
- Tests: sanitizer never emits `golden_dag`/`hint_golden`/write-up text; `coach` records exactly one
  pull with `source: "mcp"` and escalates tier; the config snippet is well-formed JSON

## Open questions for review

1. **Scoring bypass:** acceptable as an honor-system gap, or should reading `active_session` during a
   live run also count as a (tier-1) pull?
2. **Is `owlsh mcp` the right home**, or a separate `owlsh-mcp` binary / an entry from the Tauri app?
3. **Prompt parity:** duplicate `buildHintPrompt`'s rules in Rust, or ship them as a shared asset both
   the TS widget and the Rust server read?
4. **Scope of tools now:** just `active_session` + `coach`, or also expose the finished-run debrief for
   "explain my grade" style coaching?
