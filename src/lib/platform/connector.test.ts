import { describe, it, expect } from "vitest";
import { connectorFor, activePlatform } from "./index";
import type { OwlshReport } from "../../types/report";

describe("connectorFor", () => {
  it("gives each platform the spec'd kind + label", () => {
    expect(connectorFor("htb")).toMatchObject({ kind: "ssh", label: "Pwnbox" });
    expect(connectorFor("thm")).toMatchObject({ kind: "ssh", label: "AttackBox" });
    expect(connectorFor("offsec")).toMatchObject({ kind: "local", label: "Kali (local)" });
    expect(connectorFor("immersive")).toMatchObject({ kind: "none", label: "Immersive" });
    expect(connectorFor("local")).toMatchObject({ kind: "local", label: "Local capture" });
  });
  it("ssh connectors carry a hint; local/none carry a note", () => {
    expect(connectorFor("htb").hint).toBeTruthy();
    expect(connectorFor("thm").hint).toMatch(/i.?.?button|booted|AttackBox/i);
    expect(connectorFor("offsec").note).toBeTruthy();
    expect(connectorFor("immersive").note).toMatch(/browser|shell/i);
  });
  it("defaults unknown ids to HTB's connector", () => {
    expect(connectorFor("breachyard")).toEqual(connectorFor("htb"));
  });
});

describe("activePlatform", () => {
  const rpt = (platform: string) => ({ session: { target: { platform } } } as unknown as OwlshReport);
  it("prefers the active report's platform", () => {
    expect(activePlatform(rpt("thm"), [{ target: { platform: "htb" } }])).toBe("thm");
  });
  it("falls back to the newest session card", () => {
    expect(activePlatform(null, [{ target: { platform: "offsec" } }])).toBe("offsec");
  });
  it("defaults to htb with nothing to go on", () => {
    expect(activePlatform(null, [])).toBe("htb");
  });
});
