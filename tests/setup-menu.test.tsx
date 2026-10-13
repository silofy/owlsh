import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SetupMenu } from "../src/components/SetupMenu";

describe("SetupMenu (closed state)", () => {
  const html = renderToStaticMarkup(<SetupMenu />);
  it("renders the Setup trigger and never inlines the wizard's config panels", () => {
    // positive anchor: the menu actually rendered
    expect(html).toContain("<button");
    expect(html).toContain("Setup");
    expect(html).toContain("<svg");
    // landmark strings confirmed in VmConnector.tsx / ConnectModelPaths.tsx
    expect(html).not.toContain("Auto-pull over SSH");
    expect(html).not.toContain("Use your Claude plan");
  });
});
