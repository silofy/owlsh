import { describe, it, expect } from "vitest";
import { connectorView } from "./connector-view";

describe("connectorView", () => {
  it("ssh platforms show the form with the platform's label", () => {
    expect(connectorView("htb")).toMatchObject({ kind: "ssh", label: "Pwnbox", showSshForm: true });
    expect(connectorView("thm")).toMatchObject({ kind: "ssh", label: "AttackBox", showSshForm: true });
  });
  it("local/none platforms show a note, never the form", () => {
    expect(connectorView("offsec")).toMatchObject({ kind: "local", showSshForm: false });
    expect(connectorView("immersive")).toMatchObject({ kind: "none", showSshForm: false });
    expect(connectorView("offsec").note).toBeTruthy();
  });
});
