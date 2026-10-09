/** PullDeps for the desktop app: provider from settings, sidecars via Tauri, no-op outside Tauri. */
import { resolveProvider } from "../llm";
import { isDesktop } from "../net";
import type { HintGolden } from "../../types/report";
import type { PullDeps } from "./pull";
import { defaultGoldenDeps, getLookupPref, resolveGolden } from "./golden-source";

async function invokeSafe(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  if (!isDesktop()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd, args);
}

/** `onGolden` fires after a resolved golden is saved, so a caller can bridge the gap until the next sidecar poll. */
export function desktopPullDeps(path: string | null, os: string | null, onGolden?: (g: HintGolden) => void): PullDeps {
  return {
    provider: () => resolveProvider(),
    lookupPref: getLookupPref,
    resolveGolden: async (t) => resolveGolden(t, defaultGoldenDeps(await resolveProvider(), os)),
    saveGolden: async (g) => {
      onGolden?.(g);
      if (path) await invokeSafe("record_golden", { path, body: JSON.stringify(g) });
    },
    record: async (p) => {
      if (path) await invokeSafe("record_hint", { path, tier: p.tier, atMs: p.atMs, phase: p.phase, source: p.source });
    },
  };
}

export async function liveSessionPath(uuid: string): Promise<string | null> {
  try {
    const r = (await invokeSafe("latest_session", {})) as { path: string; json: string } | null;
    return r && JSON.parse(r.json)?.session?.uuid === uuid ? r.path : null;
  } catch {
    return null;
  }
}
