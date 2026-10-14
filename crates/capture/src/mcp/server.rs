//! JSON-RPC 2.0 over newline-delimited stdio (MCP).

use std::io::{BufRead, Write};
use std::path::Path;

use serde_json::{json, Value};

use super::coach::{coach_payload, next_tier, record_pull};
use super::sanitize::{find_active, sanitize};

const PROTOCOL_VERSION: &str = "2024-11-05";

fn ok(id: Value, result: Value) -> String {
    json!({"jsonrpc": "2.0", "id": id, "result": result}).to_string()
}

fn err(id: Value, code: i64, message: &str) -> String {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}}).to_string()
}

fn tool_schemas() -> Value {
    json!([
        {
            "name": "active_session",
            "description": "Summary of the current owlsh practice session.",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "coach",
            "description": "Coaching feedback on the current session, at an optional tier.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tier": {"type": "integer", "minimum": 1, "maximum": 3}
                }
            }
        }
    ])
}

fn text_result(text: String, is_error: bool) -> Value {
    json!({"content": [{"type": "text", "text": text}], "isError": is_error})
}

fn call_tool(id: Value, params: Option<&Value>, dir: &Path) -> String {
    let name = params.and_then(|p| p.get("name")).and_then(Value::as_str).unwrap_or("");
    let args = params.and_then(|p| p.get("arguments"));
    if name != "active_session" && name != "coach" {
        return err(id, -32602, "Unknown tool");
    }
    let Some(active) = find_active(dir) else {
        return ok(id, text_result("No active owlsh session is recording.".into(), true));
    };
    let session = sanitize(&active.value);
    if name == "active_session" {
        return ok(id, text_result(session.to_string(), false));
    }
    let tier = args
        .and_then(|a| a.get("tier"))
        .and_then(Value::as_u64)
        .map(|t| t.clamp(1, 3) as u8)
        .unwrap_or_else(|| next_tier(&active.path));
    let phase = session.get("phase").and_then(Value::as_str).unwrap_or("unknown");
    if let Err(e) = record_pull(&active.path, tier, phase) {
        return ok(id, text_result(format!("Could not record the hint pull: {e}"), true));
    }
    ok(id, text_result(coach_payload(&active, tier).to_string(), false))
}

/// Handle one JSON-RPC request line. Returns the response line, or None for notifications.
pub fn handle_message(line: &str, dir: &Path) -> Option<String> {
    let msg: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return Some(err(Value::Null, -32700, "Parse error")),
    };
    // No id means a notification (e.g. notifications/initialized): never answered.
    let id = msg.get("id")?.clone();
    let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
    Some(match method {
        "initialize" => ok(
            id,
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "owlsh", "version": env!("CARGO_PKG_VERSION")}
            }),
        ),
        "tools/list" => ok(id, json!({"tools": tool_schemas()})),
        "ping" => ok(id, json!({})),
        "tools/call" => call_tool(id, msg.get("params"), dir),
        _ => err(id, -32601, "Method not found"),
    })
}

/// stdin -> stdout loop, one JSON-RPC message per line.
pub fn serve(dir: &Path) {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        if let Some(resp) = handle_message(&line, dir) {
            if writeln!(out, "{resp}").and_then(|_| out.flush()).is_err() {
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn call(body: &str) -> serde_json::Value {
        call_in(body, Path::new("/nonexistent"))
    }

    fn call_in(body: &str, dir: &Path) -> serde_json::Value {
        let out = handle_message(body, dir).unwrap();
        serde_json::from_str(&out).unwrap()
    }

    #[test]
    fn initialize_returns_protocol_and_tools_capability() {
        let r = call(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);
        assert_eq!(r["jsonrpc"], "2.0");
        assert_eq!(r["id"], 1);
        assert_eq!(r["result"]["protocolVersion"], "2024-11-05");
        assert!(r["result"]["capabilities"]["tools"].is_object());
        assert_eq!(r["result"]["serverInfo"]["name"], "owlsh");
    }

    #[test]
    fn tools_list_has_active_session_and_coach() {
        let r = call(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#);
        let names: Vec<_> = r["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"active_session"));
        assert!(names.contains(&"coach"));
        for t in r["result"]["tools"].as_array().unwrap() {
            assert_eq!(t["inputSchema"]["type"], "object");
        }
    }

    #[test]
    fn unknown_method_is_a_jsonrpc_error_not_a_panic() {
        let r = call(r#"{"jsonrpc":"2.0","id":3,"method":"no_such","params":{}}"#);
        assert_eq!(r["error"]["code"], -32601);
        assert_eq!(r["id"], 3);
    }

    #[test]
    fn ping_returns_empty_result() {
        let r = call(r#"{"jsonrpc":"2.0","id":"p","method":"ping"}"#);
        assert_eq!(r["id"], "p");
        assert!(r["result"].as_object().unwrap().is_empty());
    }

    #[test]
    fn a_notification_yields_no_response() {
        assert!(handle_message(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, Path::new("/x")).is_none());
        let r = call("not json at all");
        assert_eq!(r["error"]["code"], -32700);
        assert!(r["id"].is_null());
    }

    #[test]
    fn coach_with_no_active_session_errors_and_records_nothing() {
        let dir = std::env::temp_dir().join(format!("owlsh-srv-empty-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let r = call_in(r#"{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"coach","arguments":{}}}"#, &dir);
        assert_eq!(r["result"]["isError"], true);
        assert!(std::fs::read_dir(&dir).unwrap().next().is_none());
        let r = call_in(r#"{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"coach","arguments":{}}}"#, Path::new("/nonexistent"));
        assert_eq!(r["result"]["isError"], true);
    }

    fn live_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("owlsh-srv-live-{}-{:?}", std::process::id(), std::thread::current().id()).replace(['(', ')'], ""));
        std::fs::create_dir_all(&dir).unwrap();
        let rep = serde_json::json!({
            "session": {"uuid": "u1"}, "recording": true, "phase": "Discovery",
            "episodes": [], "golden_dag": [{"objective": "x"}], "writeup_text": "the full answer"
        });
        std::fs::write(dir.join("s.json"), rep.to_string()).unwrap();
        dir
    }

    #[test]
    fn active_session_and_coach_never_leak_and_coach_escalates_tiers() {
        let dir = live_dir();
        let a = call_in(r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"active_session"}}"#, &dir);
        let text = a["result"]["content"][0]["text"].as_str().unwrap();
        assert!(!text.contains("golden_dag") && !text.contains("the full answer"));
        assert!(!dir.join("s.json.hints").exists());
        let body = r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"coach"}}"#;
        let c = call_in(body, &dir);
        let text = c["result"]["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("coach, not a solver") && text.contains("tier 1"));
        assert!(!text.contains("golden_dag") && !text.contains("the full answer"));
        call_in(body, &dir);
        call_in(body, &dir);
        call_in(body, &dir);
        let pulls: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(dir.join("s.json.hints")).unwrap()).unwrap();
        let tiers: Vec<_> = pulls.as_array().unwrap().iter().map(|p| p["tier"].as_u64().unwrap()).collect();
        assert_eq!(tiers, vec![1, 2, 3, 3]);
        assert_eq!(pulls[0]["phase"], "Discovery");
        let e = call_in(r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"coach","arguments":{"tier":1}}}"#, &dir);
        assert!(e["result"]["content"][0]["text"].as_str().unwrap().contains("tier 1"));
    }
}
