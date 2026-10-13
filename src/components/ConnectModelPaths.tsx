import { useState } from "react";
import { CoachModelPanel } from "./LlmStatusChip";

type PathId = "mcp" | "local";

/**
 * "Connect a model" — the credit-free ways to power the coach. Consumer Claude/ChatGPT subscriptions
 * can't authorize third-party API calls, so the compliant subscription route is MCP (headline), with a
 * local model (Ollama) as the free offline fallback. The API-key path is hidden until the MCP connector
 * ships — reintroduce it as an "advanced" card once there's a working credit-free option.
 */
export function ConnectModelPaths() {
  const [open, setOpen] = useState<PathId | null>(null);
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
        <button type="button" onClick={() => toggle("mcp")} aria-expanded={open === "mcp"} className={`${btn} mt-2`}>Set up</button>
        {open === "mcp" && (
          <p className="mt-2 text-xs leading-relaxed text-faint">
            The owlsh MCP connector is coming soon. Until it ships, use a local model (Ollama) for free offline coaching.
          </p>
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
