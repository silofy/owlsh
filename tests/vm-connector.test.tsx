import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VmConnector } from "../src/components/VmConnector";

// Default active platform with no report/cards is htb → ssh form shown.
describe("VmConnector", () => {
  it("shows the SSH form for an ssh platform (htb default)", () => {
    const html = renderToStaticMarkup(<VmConnector />);
    expect(html).toMatch(/Pwnbox/);
    expect(html).toContain("Auto-pull over SSH");
  });
  it("offers the real platforms, not the demo one", () => {
    const html = renderToStaticMarkup(<VmConnector />);
    expect(html).not.toContain("breachyard");
  });
});
