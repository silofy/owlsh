import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SetupMenu } from "../src/components/SetupMenu";

describe("SetupMenu (closed state)", () => {
  const html = renderToStaticMarkup(<SetupMenu />);
  it("renders the Setup trigger with a chevron", () => {
    expect(html).toContain("Setup");
    expect(html).toContain("<svg");
  });
  it("never renders inline config panels (they live in the wizard)", () => {
    expect(html).not.toContain("Auto-pull over SSH");
    expect(html).not.toContain("Use your Claude plan");
    expect(html).not.toMatch(/Claude plan/);
    expect(html).not.toMatch(/Ollama/);
    expect(html).not.toMatch(/Pwnbox|AttackBox/);
    expect(html).not.toContain("Setup guide");
  });
});
