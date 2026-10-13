import { useState } from "react";
import { CoachModelPanel } from "./LlmStatusChip";
import { isDesktop } from "../lib/net";
import { mcpClaudeCodeCommand, mcpDesktopConfigSnippet } from "../lib/hints/mcp-connect";

type PathId = "mcp" | "local";

/**
 * "Connect a model" — the credit-free ways to power the coach. Consumer Claude/ChatGPT subscriptions
 * can't authorize third-party API calls, so the compliant subscription route is MCP (headline), with a
 * local model (Ollama) as the free offline fallback. The API-key path is hidden until the MCP connector
 * ships — reintroduce it as an "advanced" card once there's a working credit-free option.
 */
export function ConnectModelPaths() {
  // MCP is the recommended path, so its setup steps are open by default.
  const [open, setOpen] = useState<PathId | null>("mcp");
  const [result, setResult] = useState<string | null>(null);
  const desktop = isDesktop();

  const copy = (text: string) => {
    try { void navigator.clipboard?.writeText(text); } catch { /* clipboard unavailable */ }
  };
  const native = async (cmd: "mcp_add" | "reveal_claude_config") => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      setResult(String(await invoke(cmd)));
    } catch (e) {
      setResult(String(e));
    }
  };
  const toggle = (id: PathId) => setOpen((o) => (o === id ? null : id));

  const card = "rounded-lg border border-edge bg-panel p-3 text-left";
  const btn = "label rounded bg-signal/20 px-2.5 py-1 text-signal transition-colors hover:bg-signal/30";

  return (
    <div className="space-y-2" aria-label="Connect a model">
      <section className={`${card} border-signal/50`}>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-fg">Use your Claude plan (owlsh MCP server)</h3>
          <span className="label rounded bg-signal/20 px-1.5 py-0.5 text-signal">Recommended</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Coach with the Claude plan you already have — owlsh connects as an MCP server. Billed to your plan, not API credits.
        </p>
        <button type="button" onClick={() => toggle("mcp")} aria-expanded={open === "mcp"} className={`${btn} mt-2`}>{open === "mcp" ? "Hide" : "Set up"}</button>
        {open === "mcp" && (
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted">
            <p>Claude Desktop: add this to <code>claude_desktop_config.json</code>, then restart it.</p>
            <pre className="overflow-x-auto rounded border border-edge bg-bg p-2 text-fg">{mcpDesktopConfigSnippet()}</pre>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => copy(mcpDesktopConfigSnippet())} className={btn}>Copy config</button>
              {desktop && <button type="button" onClick={() => void native("reveal_claude_config")} className={btn}>Open config folder</button>}
            </div>
            <p>Claude Code: run this once.</p>
            <pre className="overflow-x-auto rounded border border-edge bg-bg p-2 text-fg">{mcpClaudeCodeCommand()}</pre>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => copy(mcpClaudeCodeCommand())} className={btn}>Copy command</button>
              {desktop && <button type="button" onClick={() => void native("mcp_add")} className={btn}>Run in Claude Code</button>}
            </div>
            {result && <p role="status" className="text-faint">{result}</p>}
            <p className="text-faint">Coaching then happens inside the Claude client, on your plan.</p>
          </div>
        )}
      </section>

      <section className={card}>
        <h3 className="text-sm font-medium text-fg">Local (Ollama)</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">Free and offline — runs on your machine; commands never leave the device.</p>
        <button type="button" onClick={() => toggle("local")} aria-expanded={open === "local"} className={`${btn} mt-2`}>{open === "local" ? "Hide" : "Configure"}</button>
        {open === "local" && <div className="mt-2"><CoachModelPanel /></div>}
      </section>
    </div>
  );
}
