import { describe, it, expect } from "vitest";
import { writeupSourcesFor, writeupNoun } from "../src/components/WriteupControl";

const keys = (platform: string, opts = { htbReady: false, desktop: false }) =>
  writeupSourcesFor(platform, opts).map((s) => s.kind);

describe("writeupSourcesFor — platform-aware quick sources", () => {
  it("HTB offers 0xdf / IppSec / official, with 0xdf as the recommended card", () => {
    const srcs = writeupSourcesFor("htb", { htbReady: false, desktop: false });
    expect(srcs.map((s) => s.title)).toEqual(["0xdf", "IppSec", "HTB"]);
    expect(srcs.find((s) => s.kind === "0xdf")?.rec).toBe(true);
    expect(writeupNoun("htb")).toEqual({ noun: "box", artifact: "write-up" });
  });

  it("the fictional 'breachyard' demo still gets the HTB-style cards (default)", () => {
    expect(keys("breachyard")).toEqual(["0xdf", "ippsec", "htb-search"]);
  });

  it("HTB on desktop fetches officially; token state drives the lock + copy", () => {
    expect(keys("htb", { htbReady: true, desktop: true })).toContain("htb-fetch");
    const needsToken = writeupSourcesFor("htb", { htbReady: false, desktop: true }).find((s) => s.kind === "htb-fetch");
    expect(needsToken?.lock).toBe(true);
    expect(needsToken?.desc).toMatch(/token/i);
  });

  it("THM swaps to room / walkthrough / write-up sources — no HTB-only ones", () => {
    const srcs = writeupSourcesFor("thm", { htbReady: false, desktop: false });
    expect(srcs.map((s) => s.title)).toEqual(["Open room", "Walkthroughs", "Write-ups"]);
    expect(srcs.find((s) => s.kind === "open-room")?.rec).toBe(true);
    expect(keys("thm")).not.toContain("0xdf");
    expect(keys("thm")).not.toContain("ippsec");
    // a THM room's intended path is its tasks, not a write-up
    expect(writeupNoun("thm")).toEqual({ noun: "room", artifact: "tasks" });
  });

  it("platforms with no canonical source (local, immersive) offer no cards", () => {
    expect(writeupSourcesFor("local", { htbReady: false, desktop: false })).toHaveLength(0);
    expect(writeupSourcesFor("immersive", { htbReady: false, desktop: false })).toHaveLength(0);
  });
});
