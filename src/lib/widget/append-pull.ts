import { readFileSync, writeFileSync } from "node:fs";
import type { HintPull } from "./hints";

/** Pulls recorded in the shared `<report>.hints` sidecar; a missing or malformed file reads as none. */
export function readPulls(file: string): HintPull[] {
  try {
    const v = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Re-reads the sidecar, appends one pull, writes it back: keeps pulls other surfaces recorded meanwhile. */
export function appendPull(file: string, pull: HintPull): HintPull[] {
  const next = [...readPulls(file), pull];
  writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}
