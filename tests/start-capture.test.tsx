import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StartCapture } from "../src/components/StartCapture";

describe("StartCapture", () => {
  it("renders the empty-state start view with the where-do-you-hack chooser and attach command", () => {
    const html = renderToStaticMarkup(<StartCapture />);
    expect(html).toContain("Start a session");
    expect(html).toContain("On your own machine");
    expect(html).toContain("In a remote VM");
    // static markup HTML-escapes the <box> placeholder
    expect(html).toContain("owlsh --attach --platform htb --target &lt;box&gt;");
    // explains that runs appear in History on their own (no "create" action exists)
    expect(html).toContain("History");
  });
});
