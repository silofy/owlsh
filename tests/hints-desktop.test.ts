import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("../src/lib/net", () => ({ isDesktop: () => true }));
vi.mock("../src/lib/llm", () => ({ resolveProvider: async () => ({}) }));

import { desktopPullDeps, liveSessionPath } from "../src/lib/hints/desktop";

beforeEach(() => invoke.mockReset());

describe("desktopPullDeps", () => {
  it("records a pull via record_hint with the camelCase args", async () => {
    invoke.mockResolvedValue(null);
    await desktopPullDeps("/s.json", null).record({ tier: 2, atMs: 5, phase: "enum", source: "ai:golden" });
    expect(invoke).toHaveBeenCalledWith("record_hint", { path: "/s.json", tier: 2, atMs: 5, phase: "enum", source: "ai:golden" });
  });
  it("saves a golden via record_golden and notifies onGolden", async () => {
    invoke.mockResolvedValue(null);
    const g = { source: "none", confidence: 0, golden: [] } as never;
    const onGolden = vi.fn();
    await desktopPullDeps("/s.json", null, onGolden).saveGolden(g);
    expect(invoke).toHaveBeenCalledWith("record_golden", { path: "/s.json", body: JSON.stringify(g) });
    expect(onGolden).toHaveBeenCalledWith(g);
  });
  it("does not invoke anything without a path", async () => {
    const d = desktopPullDeps(null, null);
    await d.record({ tier: 1, atMs: 1, phase: "p", source: "static" });
    await d.saveGolden({ source: "none", confidence: 0, golden: [] } as never);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("liveSessionPath", () => {
  it("returns the path only when the uuid matches", async () => {
    invoke.mockResolvedValue({ path: "/s.json", json: JSON.stringify({ session: { uuid: "u1" } }) });
    expect(await liveSessionPath("u1")).toBe("/s.json");
    expect(await liveSessionPath("u2")).toBeNull();
  });
  it("is null when there is no session or invoke throws", async () => {
    invoke.mockResolvedValueOnce(null);
    expect(await liveSessionPath("u1")).toBeNull();
    invoke.mockRejectedValueOnce(new Error("x"));
    expect(await liveSessionPath("u1")).toBeNull();
  });
});
