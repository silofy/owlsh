# owlsh MCP Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `owlsh mcp`, a stdio MCP server the user adds to their own Claude Desktop/Code, so their existing plan coaches their live owlsh run — exposing only sanitized session data (never the write-up/answer) and recording each coaching pull for honest scoring.

**Architecture:** A synchronous, newline-delimited JSON-RPC 2.0 server in the existing `owlsh` capture binary (`crates/capture`), reached by `owlsh mcp`. It reads `~/.owlsh/sessions/*.json` as untyped `serde_json::Value`, strips the golden path / write-up / hint_golden before anything leaves, and exposes two tools: `active_session` (sanitized run so far) and `coach` (returns a coaching instruction block for the client's model and records a `source:"mcp"` pull to the `<session>.hints` sidecar). The app's Setup → AI → "Use your Claude plan" flow detects the client and shows a one-click add / config snippet.

**Tech Stack:** Rust (serde_json, already a dep — no new crates), the existing capture-binary CLI conventions; TypeScript/React for the onboarding UI; Vitest + `cargo test`.

**Spec:** `docs/superpowers/specs/2026-10-10-owlsh-mcp-connector-design.md`

## Global Constraints

- No model runs in owlsh here — the user's Claude client does. owlsh exposes data + instructions only.
- **The sanitized session NEVER contains `golden_dag`, `hint_golden`, or any write-up text.** This is the security boundary and is enforced by what the server emits.
- Only the `coach` tool records a pull (`{ tier, atMs, phase, source: "mcp" }`) to `<session>.hints`; raw `active_session` reads do not (honor-system — spec decision).
- Tools are exactly `active_session` and `coach` (minimal first cut).
- stdio transport only; no network listener; reads only the local sessions dir; never exposes the HTB token or API keys.
- Transport framing: newline-delimited JSON-RPC 2.0 over stdin/stdout (MCP stdio).
- Coaching rules are a single shared text, pinned to the TS widget's rules by a parity test.
- No new Rust dependencies (serde_json only).
- Commits carry no `Co-Authored-By` trailer.

## Review Focus

1. **A session file containing `golden_dag`/`hint_golden`/write-up** → the sanitizer output must omit all of them (Task 1 test — the security boundary).
2. **A malformed/non-JSON session file** → the server skips it and never panics; `active_session` returns "no active session", not a crash (Task 1 + Task 4 tests).
3. **A JSON-RPC request for an unknown method or a malformed frame** → a proper JSON-RPC error response, not a panic or a dropped connection (Task 3 test).
4. **`coach` called with no active recording session** → a clear tool error and NO `.hints` write (Task 4 test).
5. **The coaching rules drift between the TS widget and the Rust server** → the parity test fails (Task 2 test).

---

### Task 1: Session sanitizer

**Files:**
- Create: `crates/capture/src/mcp/sanitize.rs`
- Create: `crates/capture/src/mcp/mod.rs` (module root; `pub mod sanitize;` for now)
- Modify: `crates/capture/src/main.rs` (add `mod mcp;`)
- Test: inline `#[cfg(test)]` in `sanitize.rs`

**Interfaces:**
- Produces:
  - `pub struct ActiveSession { pub path: PathBuf, pub value: serde_json::Value }`
  - `pub fn sanitize(report: &serde_json::Value) -> serde_json::Value` — returns an object with `uuid`, `platform`, `machine` (name/os/difficulty), `recording`, `phase`, `tier`, `flags`, and `steps` (array of `{ seq, cmd, output }` with `output` truncated to 180 chars); **omits** `golden_dag`, `hint_golden`, and any key whose name contains "writeup"/"write_up".
  - `pub fn find_active(dir: &Path) -> Option<ActiveSession>` — newest `*.json` in `dir` that parses and whose `recording == true`; else the newest that parses; else None. Skips unparseable files.

- [ ] **Step 1: Write the failing test**

```rust
// in sanitize.rs #[cfg(test)]
use super::*;
use serde_json::json;

fn full() -> serde_json::Value {
    json!({
        "session": { "uuid": "u1", "target": { "platform": "htb", "name": "Demo", "os": "Linux", "difficulty": "Easy" } },
        "recording": true,
        "episodes": [{ "seq": 1, "cmd": "nmap -sV 10.0.0.1", "output_digest": "x".repeat(400) }],
        "golden_dag": [{ "objective": "access_root", "satisfied_by": ["secrettool"] }],
        "hint_golden": { "source": "0xdf", "golden": [{ "objective": "access_root" }] },
        "writeup_text": "the full answer",
        "flags": {}
    })
}

#[test]
fn sanitize_strips_the_answer() {
    let s = sanitize(&full());
    let dump = serde_json::to_string(&s).unwrap();
    assert!(!dump.contains("golden_dag"));
    assert!(!dump.contains("hint_golden"));
    assert!(!dump.contains("secrettool"));     // golden satisfied_by tool never leaks
    assert!(!dump.contains("the full answer")); // writeup text never leaks
    assert!(!dump.contains("access_root"));     // golden objective never leaks
}

#[test]
fn sanitize_keeps_the_session_and_truncates_output() {
    let s = sanitize(&full());
    assert_eq!(s["uuid"], "u1");
    assert_eq!(s["platform"], "htb");
    assert_eq!(s["steps"][0]["cmd"], "nmap -sV 10.0.0.1");
    assert!(s["steps"][0]["output"].as_str().unwrap().len() <= 180);
}
```

- [ ] **Step 2: Run** `cd crates/capture && cargo test sanitize` — FAIL (module missing).

- [ ] **Step 3: Implement.** `sanitize` builds a fresh object field by field from the input `Value` (allow-list, not deny-list, so an unknown future key can't leak): read `session.uuid`, `session.target.platform/name/os/difficulty`, `recording`, derive `phase`/`tier` if present else null, copy `flags`, and map `episodes[]` → `steps[]` taking only `seq`, `cmd`, and `output_digest` truncated to 180 chars (char-safe). Never copy `golden_dag`/`hint_golden`/writeup. `find_active` reads the dir, filters `*.json`, parses each with `serde_json::from_str` (skip Err), sorts by modified time desc, prefers `recording==true`.

- [ ] **Step 4: Run** `cargo test sanitize` — PASS.
- [ ] **Step 5: Commit** `git add crates/capture && git commit -m "MCP: session sanitizer (never emits the golden path or write-up)"`

---

### Task 2: Shared coaching rules + parity

**Files:**
- Create: `src/lib/hints/coaching-rules.ts` (the canonical rule lines, exported as `COACHING_RULES: string`)
- Create: `crates/capture/src/mcp/rules.rs` (`pub const COACHING_RULES: &str = "…"` — same text)
- Modify: `src/lib/hints/ai-hint.ts` (`buildHintPrompt` uses `COACHING_RULES`)
- Test: `src/lib/hints/coaching-rules.test.ts` (parity)

**Interfaces:**
- Produces: `COACHING_RULES` (TS string) and `mcp::rules::COACHING_RULES` (Rust &str) — identical text.

- [ ] **Step 1: Failing parity test**

```ts
// src/lib/hints/coaching-rules.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { COACHING_RULES } from "./coaching-rules";

describe("coaching rules parity", () => {
  it("the Rust server embeds the exact same rule text", () => {
    const rust = readFileSync("crates/capture/src/mcp/rules.rs", "utf8");
    // extract the string literal body between the first pair of r#"…"#
    const m = rust.match(/r#"([\s\S]*?)"#/);
    expect(m, "rules.rs must hold an r#\"...\"# literal").not.toBeNull();
    expect(m![1].trim()).toBe(COACHING_RULES.trim());
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/hints/coaching-rules.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement.** `coaching-rules.ts`:

```ts
/** The coaching rules shared by the in-app widget and the owlsh MCP server. Pinned to the Rust copy
 *  (crates/capture/src/mcp/rules.rs) by coaching-rules.test.ts — edit both together. */
export const COACHING_RULES = [
  "You are a coach, not a solver.",
  "Give ONE hint of at most 30 words.",
  "Never state a command, file path, credential, URL, CVE, hostname, username or flag.",
  "Point at the kind of thing to re-check or try; describe the category, not the answer.",
].join("\n");
```

`rules.rs`:
```rust
/// Shared with the TS widget (src/lib/hints/coaching-rules.ts); pinned by coaching-rules.test.ts.
pub const COACHING_RULES: &str = r#"You are a coach, not a solver.
Give ONE hint of at most 30 words.
Never state a command, file path, credential, URL, CVE, hostname, username or flag.
Point at the kind of thing to re-check or try; describe the category, not the answer."#;
```

Refactor `buildHintPrompt` in `ai-hint.ts` to compose from `COACHING_RULES` (replace the inline duplicate rule lines; keep the tier-rule and session-step interpolation). Add `mod rules;` to `crates/capture/src/mcp/mod.rs`. Run the existing `ai-hint.test.ts` to confirm the prompt still contains the rule text and the 30-word instruction.

- [ ] **Step 4: Run** the parity test, `src/lib/hints/ai-hint.test.ts`, `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `git add src/lib/hints crates/capture/src/mcp && git commit -m "MCP: shared coaching rules pinned across TS widget and Rust server"`

---

### Task 3: JSON-RPC stdio core

**Files:**
- Create: `crates/capture/src/mcp/server.rs` (framing + method dispatch for `initialize`, `tools/list`, `ping`)
- Modify: `crates/capture/src/mcp/mod.rs`
- Test: inline `#[cfg(test)]` in `server.rs`

**Interfaces:**
- Produces: `pub fn handle_message(line: &str, dir: &Path) -> Option<String>` — takes one JSON-RPC request line, returns the JSON-RPC response line (None for notifications like `notifications/initialized`). `pub fn serve(dir: &Path)` — the stdin→stdout loop.

- [ ] **Step 1: Failing test**

```rust
// server.rs #[cfg(test)]
use super::*;
use std::path::Path;

fn call(body: &str) -> serde_json::Value {
    let out = handle_message(body, Path::new("/nonexistent")).unwrap();
    serde_json::from_str(&out).unwrap()
}

#[test]
fn initialize_returns_protocol_and_tools_capability() {
    let r = call(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);
    assert_eq!(r["jsonrpc"], "2.0");
    assert_eq!(r["id"], 1);
    assert!(r["result"]["capabilities"]["tools"].is_object());
    assert_eq!(r["result"]["serverInfo"]["name"], "owlsh");
}

#[test]
fn tools_list_has_active_session_and_coach() {
    let r = call(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#);
    let names: Vec<_> = r["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"active_session"));
    assert!(names.contains(&"coach"));
}

#[test]
fn unknown_method_is_a_jsonrpc_error_not_a_panic() {
    let r = call(r#"{"jsonrpc":"2.0","id":3,"method":"no_such","params":{}}"#);
    assert_eq!(r["error"]["code"], -32601);
}

#[test]
fn a_notification_yields_no_response() {
    assert!(handle_message(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, Path::new("/x")).is_none());
    assert!(handle_message("not json at all", Path::new("/x")).is_some()); // parse error → error response
}
```

- [ ] **Step 2: Run** `cargo test server` — FAIL.

- [ ] **Step 3: Implement.** `handle_message`: parse the line as `serde_json::Value`; on parse error return a `-32700` error with `id: null`. Read `method`; if there's no `id` it's a notification → return None (handle `notifications/initialized` as a no-op). Dispatch:
  - `initialize` → `result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "owlsh", version: <CARGO_PKG_VERSION> } }`.
  - `tools/list` → the two tool schemas (name, description, `inputSchema`): `active_session` (no args), `coach` (`{ tier?: integer 1-3 }`). (The actual dispatch of `tools/call` lands in Task 4; here `tools/call` may return a `-32601` until Task 4 — note that in the report.)
  - `ping` → `result: {}`.
  - unknown → `-32601` method-not-found.
  Build responses with `serde_json::json!`. `serve(dir)`: read stdin line by line (`BufRead::lines`), for each call `handle_message`, write any `Some` response + `\n` to stdout and flush.

- [ ] **Step 4: Run** `cargo test server` — PASS.
- [ ] **Step 5: Commit** `git add crates/capture/src/mcp && git commit -m "MCP: JSON-RPC stdio core (initialize, tools/list, errors)"`

---

### Task 4: The tools — active_session + coach

**Files:**
- Modify: `crates/capture/src/mcp/server.rs` (add `tools/call` dispatch)
- Create: `crates/capture/src/mcp/coach.rs` (coach instruction builder + pull recording)
- Test: inline tests in `coach.rs` and `server.rs`

**Interfaces:**
- Consumes: Task 1 (`sanitize`, `find_active`), Task 2 (`rules::COACHING_RULES`).
- Produces:
  - `pub fn coach_payload(active: &ActiveSession, tier: u8) -> serde_json::Value` — `{ instructions: <rules + tier directness line>, session: <sanitized> }`.
  - `pub fn record_pull(path: &Path, tier: u8, phase: &str) -> std::io::Result<()>` — appends `{ tier, atMs, phase, source: "mcp" }` to `<path>.hints` (re-read existing array, push, write — mirror the app's sidecar JSON).
  - `tools/call` in `handle_message`: `active_session` → `{ content: [{ type: "text", text: <sanitized JSON> }] }`; `coach` → build payload, record a pull, return the payload as text content. With no active session, return a tool error (`result.isError = true`, a human message) and DO NOT record a pull.

- [ ] **Step 1: Failing tests**

```rust
// coach.rs #[cfg(test)]
#[test]
fn coach_payload_carries_rules_and_the_sanitized_session_only() {
    let active = ActiveSession { path: "/x/s.json".into(), value: full() }; // full() from Task 1 shape
    let p = coach_payload(&active, 2);
    let dump = serde_json::to_string(&p).unwrap();
    assert!(dump.contains("coach, not a solver"));
    assert!(!dump.contains("golden_dag"));
    assert!(!dump.contains("the full answer"));
}

#[test]
fn record_pull_appends_one_mcp_pull() {
    let dir = std::env::temp_dir().join(format!("owlsh-mcp-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let rep = dir.join("s.json");
    std::fs::write(&rep, "{}").unwrap();
    record_pull(&rep, 1, "Discovery").unwrap();
    record_pull(&rep, 2, "Discovery").unwrap();
    let pulls: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dir.join("s.json.hints")).unwrap()).unwrap();
    assert_eq!(pulls.as_array().unwrap().len(), 2);
    assert_eq!(pulls[0]["source"], "mcp");
    assert_eq!(pulls[1]["tier"], 2);
}
```

And in `server.rs`:
```rust
#[test]
fn coach_with_no_active_session_errors_and_records_nothing() {
    // dir with no sessions → tools/call coach returns isError and writes no .hints
    let r = call_in(r#"{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"coach","arguments":{}}}"#, Path::new("/nonexistent"));
    assert_eq!(r["result"]["isError"], true);
}
```
(Add a `call_in(body, dir)` helper alongside the existing `call`.)

- [ ] **Step 2: Run** `cargo test coach` and `cargo test server` — FAIL.

- [ ] **Step 3: Implement** `coach.rs` (payload = `{ instructions: COACHING_RULES + "\nThis hint is tier N — " + <directness for N>, session: sanitize(&active.value) }`; tier directness mirrors the TS `TIER_RULE` 1/2/3). `record_pull` re-reads `<path>.hints` (tolerate missing/!array → `[]`), pushes `{tier, atMs: epoch_millis, phase, source:"mcp"}`, writes pretty JSON. Wire `tools/call` in `handle_message`: look up `find_active(dir)`; `active_session` returns sanitized text; `coach` reads `tier` arg (default = next tier from existing `.hints`, or 1), builds payload, calls `record_pull`, returns text; no active session → `{ result: { isError: true, content: [{type:"text", text:"No active owlsh session is recording."}] } }` and no write.

- [ ] **Step 4: Run** both test files — PASS. Then `cargo test` (whole crate).
- [ ] **Step 5: Commit** `git add crates/capture/src/mcp && git commit -m "MCP: active_session + coach tools (coach records an mcp pull)"`

---

### Task 5: `owlsh mcp` CLI arm

**Files:**
- Modify: `crates/capture/src/main.rs` (dispatch `owlsh mcp` → `mcp::server::serve`)
- Test: inline test for the arg detection helper (no stdio loop in CI)

**Interfaces:** Consumes Task 3/4 (`mcp::server::serve`).

- [ ] **Step 1: Failing test** for a small `fn is_mcp(args: &[String]) -> bool` (first non-program arg == "mcp"):

```rust
#[test]
fn detects_the_mcp_subcommand() {
    assert!(is_mcp(&["owlsh".into(), "mcp".into()]));
    assert!(!is_mcp(&["owlsh".into(), "--attach".into()]));
    assert!(!is_mcp(&["owlsh".into()]));
}
```

- [ ] **Step 2: Run** `cargo test detects_the_mcp` — FAIL.

- [ ] **Step 3: Implement** `is_mcp`, and near the top of `main()` (after `migrate_legacy_home()` and building `args`): `if is_mcp(&args) { let dir = owlsh_sessions_dir().ok_or("cannot resolve ~/.owlsh/sessions")?; mcp::server::serve(&dir); return Ok(()); }`. The server loop runs until stdin closes.

- [ ] **Step 4: Run** `cargo test`, and a manual smoke: `printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | cargo run -- mcp` prints an initialize response and waits (Ctrl-D ends it).
- [ ] **Step 5: Commit** `git add crates/capture/src/main.rs && git commit -m "MCP: owlsh mcp subcommand starts the stdio server"`

---

### Task 6: App onboarding — "Use your Claude plan"

**Files:**
- Modify: `src/components/ConnectModelPaths.tsx` (MCP "Set up" opens a real flow, not "coming soon")
- Create: `src/lib/hints/mcp-connect.ts` (pure: the config snippet + detection result shape)
- Create: `src-tauri/src/mcp_setup.rs` + register in `lib.rs` (native: detect `claude` CLI, run `claude mcp add`, reveal the Claude Desktop config path)
- Test: `src/lib/hints/mcp-connect.test.ts`, extend `tests/connect-model.test.tsx`

**Interfaces:**
- Produces: `mcpDesktopConfigSnippet(): string` (the `claude_desktop_config.json` JSON with `{ "mcpServers": { "owlsh": { "command": "owlsh", "args": ["mcp"] } } }`), `mcpClaudeCodeCommand(): string` (`claude mcp add owlsh -- owlsh mcp`).

- [ ] **Step 1: Failing test**

```ts
// src/lib/hints/mcp-connect.test.ts
import { describe, it, expect } from "vitest";
import { mcpDesktopConfigSnippet, mcpClaudeCodeCommand } from "./mcp-connect";

describe("mcp connect", () => {
  it("emits a valid claude_desktop_config snippet for owlsh", () => {
    const cfg = JSON.parse(mcpDesktopConfigSnippet());
    expect(cfg.mcpServers.owlsh.command).toBe("owlsh");
    expect(cfg.mcpServers.owlsh.args).toEqual(["mcp"]);
  });
  it("emits the claude code add command", () => {
    expect(mcpClaudeCodeCommand()).toBe("claude mcp add owlsh -- owlsh mcp");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/hints/mcp-connect.test.ts` — FAIL.

- [ ] **Step 3: Implement** `mcp-connect.ts` (the two pure builders; `mcpDesktopConfigSnippet` returns `JSON.stringify({ mcpServers: { owlsh: { command: "owlsh", args: ["mcp"] } } }, null, 2)`). In `ConnectModelPaths.tsx`, replace the MCP "coming soon" note (added when the API path was hidden) with the real panel: a copyable Claude Desktop snippet (`mcpDesktopConfigSnippet()`), the Claude Code one-liner (`mcpClaudeCodeCommand()`) with a "Run in Claude Code" button that calls the native `mcp_add` command when `isDesktop()`, and a one-line note that coaching then happens inside the Claude client. `mcp_setup.rs`: `mcp_add()` runs `claude mcp add owlsh -- owlsh mcp` via `std::process::Command` (best-effort, returns stdout/err); `reveal_claude_config()` opens the config dir. Register both in `lib.rs` invoke_handler.

- [ ] **Step 4: Update** `tests/connect-model.test.tsx` — the MCP card now shows the config snippet (`"mcpServers"`), not "coming soon"; assert it. Run all touched tests + `npm run typecheck` + `cargo check` (src-tauri).
- [ ] **Step 5: Commit** `git add -A src src-tauri && git commit -m "MCP: Use-your-Claude-plan setup flow (config snippet + claude mcp add)"`
