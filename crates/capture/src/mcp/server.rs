//! JSON-RPC 2.0 over newline-delimited stdio (MCP).

use std::io::{BufRead, Write};
use std::path::Path;

use serde_json::{json, Value};

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

/// Handle one JSON-RPC request line. Returns the response line, or None for notifications.
pub fn handle_message(line: &str, _dir: &Path) -> Option<String> {
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
        // tools/call dispatch lands in Task 4.
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
        let out = handle_message(body, Path::new("/nonexistent")).unwrap();
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
}
