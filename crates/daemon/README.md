# owlsh-daemon — the single SQLCipher owner

Wires the proven pieces into one process. Capture agents and plugins feed it the §3.3
telemetry envelope (over a TCP/unix socket); the daemon:

1. **re-redacts on receipt** (`owlsh_core::redact`) — never trusts an upstream's own scrubbing,
   the privacy guarantee lives in the core;
2. **owns session boundaries** (`owlsh_core::SessionController`) — honors upstream
   `session_start`/`session_end` from capture, auto-starts/closes
   otherwise, and surfaces flag nudges;
3. **stamps + persists** command/output to the encrypted SQLCipher store under the active session.

`process()` is a pure transform (no DB) so it's fully unit-tested; `main` does the persistence.

## Run

```bash
# pipe a capture straight through the daemon into an encrypted per-engagement DB
owlsh --label "Breachyard :: Saltmarsh" -- whoami "cat root.txt" \
  | owlsh-daemon --db optimum.db --key <passphrase>

cargo test --manifest-path crates/daemon/Cargo.toml   # process: re-redact + stamp + nudge; auto-start
```

## Architecture

```
capture (local PTY) ─┐
plugins (socket)   ──┼─▶ owlsh-daemon ──▶ SQLCipher store
in-VM daemon       ─┘     re-redact
                          SessionController (boundaries)
                          stamp session_uuid
```

Shares `owlsh-core` (session controller + redaction) with the capture agent, so the session
lifecycle is identical whether a boundary comes from a session start/stop, idle, or a flag.

## Build prerequisites

Depends on `owlsh-store`, so the same SQLCipher build prerequisites apply (Strawberry Perl + NASM
+ MSVC on Windows). See `crates/store/README.md`.
