import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LiveHint } from "../src/components/LiveHint";
import fixture from "../fixtures/session-htb-easy.json";
import type { OwlshReport } from "../src/types/report";

describe("LiveHint", () => {
  it("offers the hint with its cost", () => {
    const html = renderToStaticMarkup(<LiveHint report={fixture as unknown as OwlshReport} />);
    expect(html).toContain("hint");
    expect(html).toContain("costs independence");
  });
  it("shows the running penalty from saved pulls", () => {
    const r = { ...(fixture as unknown as OwlshReport), hints: [{ tier: 1 as const, atMs: 1, phase: "x" }] };
    expect(renderToStaticMarkup(<LiveHint report={r} />)).toContain("−3");
  });
});

describe("LiveHint in the browser preview", () => {
  it("is enabled, with no connecting state (only desktop needs a sidecar path)", () => {
    const html = renderToStaticMarkup(<LiveHint report={fixture as unknown as OwlshReport} />);
    expect(html).not.toContain("connecting");
    expect(html).not.toContain('disabled=""');
  });
});
