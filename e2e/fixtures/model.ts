import type { TauriFake } from "./tauri";

export type ModelReply =
  | { kind: "json"; body: { hint: string; kind: string } }
  | { kind: "slow"; ms: number; body: { hint: string; kind: string } }
  | { kind: "error" };

export const clean = (hint: string, kind: "process" | "area" | "technique" = "process"): ModelReply => ({ kind: "json", body: { hint, kind } });
/** A URL-shaped hint; the guard's artifacts rule must block it. */
export const leaky = (): ModelReply => ({ kind: "json", body: { hint: "Look at http://example.test/admin next.", kind: "process" } });
export const slow = (ms: number, hint = "Re-read your last output."): ModelReply => ({ kind: "slow", ms, body: { hint, kind: "process" } });
export const error = (): ModelReply => ({ kind: "error" });

export class ModelFake {
  constructor(private tauri: TauriFake) {}
  /**
   * One reply per cloud_generate call; the last repeats. Coach mode must already be "anthropic" in
   * storage: pass COACH_CLOUD to tauri.install({ storage }) (seeded by its init script before load).
   */
  useCloud(...replies: ModelReply[]): void {
    if (replies.length === 0) throw new Error("useCloud needs at least one reply");
    let i = 0;
    this.tauri.on("has_api_key", true);
    this.tauri.on("cloud_generate", async () => {
      const r = replies[Math.min(i++, replies.length - 1)];
      if (r.kind === "error") throw new Error("model error");
      if (r.kind === "slow") await new Promise((res) => setTimeout(res, r.ms));
      return JSON.stringify(r.body);
    });
  }
}

export const COACH_CLOUD = { "owlsh.coachMode": "anthropic" };
