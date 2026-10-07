import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { SALTMARSH } from "./saltmarsh";

describe("Breachyard Saltmarsh demo", () => {
  it("grades to a real multi-phase report", () => {
    expect(SALTMARSH.platform).toBe("breachyard");
    expect(SALTMARSH.report.episodes.length).toBeGreaterThan(10);
    // the chain reaches privilege escalation
    expect(SALTMARSH.report.phases.some((p) => p.mitre_tactic === "TA0004")).toBe(true);
  });
  it("is redacted: no flag hash, no known credential, no live IP in any step", () => {
    const blob = SALTMARSH.raw.map((r) => `${r.cmd} ${r.output_digest ?? ""}`).join("\n");
    expect(blob).not.toMatch(/\b[0-9a-f]{32}\b/i);        // 32-hex flag
    expect(blob).not.toContain("iXzvcib3SrpZ");           // the rclone-revealed password
    expect(blob).not.toMatch(/\b10\.129\.\d+\.\d+\b/);     // live lab IP
  });
  it("is redacted in the source file itself, not just the streamed raw (header comments included)", () => {
    // Strip asset URLs first: an avatar URL can legitimately contain a 32-hex object hash, not a flag.
    const src = readFileSync(new URL("./saltmarsh.ts", import.meta.url), "utf8").replace(/https?:\/\/\S+/g, "");
    expect(src).not.toMatch(/\b[0-9a-f]{32}\b/i);   // no flag hash anywhere
    expect(src).not.toContain("iXzvcib3SrpZ");       // no real cred anywhere
    expect(src).not.toMatch(/\b10\.129\.\d+\.\d+\b/); // no live lab IP anywhere
  });
  it("renders as a Breachyard target with an inline emblem (no external asset)", () => {
    const t = SALTMARSH.report.session.target;
    expect(t?.platform).toBe("breachyard");
    expect(t?.emblem?.avatar).toMatch(/^data:image\/svg\+xml,/);
  });
});
