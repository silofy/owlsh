import { describe, it, expect } from "vitest";
import demo from "../../../fixtures/session-demo-full.json";
import type { WatcherReport } from "../../types/report";
import { deriveWidgetState } from "./state";
import { hintFor, nextTier, independencePenalty, type HintPull } from "./hints";
import { renderWidget } from "./render";

const report = demo as unknown as WatcherReport;

describe("deriveWidgetState", () => {
  const s = deriveWidgetState(report, Date.parse(report.session.ended_at));

  it("mirrors the run: target, phase from the latest episode, counts", () => {
    expect(s.target).toBe("Abducted");
    expect(report.phases.map((p) => p.label)).toContain(s.phase);
    expect(s.findings).toBe((report.findings ?? []).length);
    expect(s.coverage.engaged).toBeLessThanOrEqual(s.coverage.found);
  });

  it("is deterministic", () => {
    expect(deriveWidgetState(report, Date.parse(report.session.ended_at))).toEqual(s);
  });

  it("raises an open thread for an unused credential, and clears it once used", () => {
    const base = structuredClone(report);
    base.findings = [{ id: "c1", kind: "cred", value: "••••", source_seq: 1 }];
    expect(deriveWidgetState(base).threads.join(" ")).toMatch(/unused credential/);
    base.findings[0].used_by_seq = [2];
    expect(deriveWidgetState(base).threads).toEqual([]);
  });

  it("threads never name a value or a next command", () => {
    for (const t of s.threads) expect(t).not.toMatch(/\$|ssh |sudo|--/);
  });
});

describe("hints", () => {
  it("cost nothing when never pulled", () => {
    expect(independencePenalty([])).toBe(0);
  });
  it("escalate one tier at a time and add up the penalty", () => {
    const pulls: HintPull[] = [];
    pulls.push({ tier: nextTier(pulls), atMs: 1, phase: "Discovery" });
    pulls.push({ tier: nextTier(pulls), atMs: 2, phase: "Discovery" });
    expect(pulls.map((p) => p.tier)).toEqual([1, 2]);
    expect(independencePenalty(pulls)).toBe(9);
    expect(nextTier([...pulls, { tier: 3, atMs: 3, phase: "x" }])).toBe(3);
  });
  it("are generic process prompts", () => {
    for (const t of [1, 2, 3] as const) expect(hintFor(t).length).toBeGreaterThan(20);
  });
});

describe("renderWidget", () => {
  it("draws a fixed-width box with the phase, stats and footer", () => {
    const lines = renderWidget(deriveWidgetState(report, Date.parse(report.session.ended_at)), { width: 44 });
    expect(new Set(lines.map((l) => l.length))).toEqual(new Set([44]));
    expect(lines[0]).toContain("THE WATCHER · Abducted");
    expect(lines.join("\n")).toContain("[h] hint");
  });
  it("shows a pulled hint and the running penalty", () => {
    const out = renderWidget(deriveWidgetState(report), { hint: hintFor(1), penalty: 3 }).join("\n");
    expect(out).toContain("hint:");
    expect(out).toContain("−3 independence");
  });
});
