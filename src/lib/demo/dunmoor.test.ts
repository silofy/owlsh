import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { DUNMOOR } from "./dunmoor";

describe("Breachyard Dunmoor demo", () => {
  it("grades to a real report on the breachyard platform", () => {
    expect(DUNMOOR.platform).toBe("breachyard");
    expect(DUNMOOR.report.episodes.length).toBeGreaterThan(5);
    // the chain reaches privilege escalation
    expect(DUNMOOR.report.phases.some((p) => p.mitre_tactic === "TA0004")).toBe(true);
  });
  it("is redacted: no flag hash / THM{...} token", () => {
    const blob = DUNMOOR.raw.map((r) => `${r.cmd} ${r.output_digest ?? ""}`).join("\n");
    expect(blob).not.toMatch(/\b[0-9a-f]{32}\b/i);
    expect(blob).not.toMatch(/THM\{[^}]+\}/);
  });
  it("is redacted in the source file itself, not just the streamed raw (header comments included)", () => {
    // Strip asset URLs first: a room-icon / avatar URL can legitimately contain a 32-hex object hash
    // in its path, which is not a flag.
    const src = readFileSync(new URL("./dunmoor.ts", import.meta.url), "utf8").replace(/https?:\/\/\S+/g, "");
    expect(src).not.toMatch(/\b[0-9a-f]{32}\b/i);
    expect(src).not.toMatch(/THM\{[^}]+\}/);
  });
  it("renders as a Breachyard target with an inline emblem (no external asset)", () => {
    const t = DUNMOOR.report.session.target;
    expect(t?.platform).toBe("breachyard");
    expect(t?.emblem?.avatar).toMatch(/^data:image\/svg\+xml,/);
  });
});
