import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../src/App";

/**
 * Smoke test: render the whole report to static markup. Executes every section's
 * render path against the real fixture, catching crashes without a browser. This
 * is also the seam the portable HTML export (brief §6.3) builds on — pre-rendered
 * static markup that is readable with JS disabled.
 */
describe("report renders end-to-end", () => {
  const html = renderToStaticMarkup(<App />);

  it("produces markup", () => {
    expect(html.length).toBeGreaterThan(2000);
  });

  it("includes the core report sections", () => {
    for (const title of [
      "owlsh",
      "How the run unfolded",
      "Stealth &amp; Noise",
      "Command Log",
      "do differently",
      "Phase audit",
      "explainable rubric",
    ]) {
      expect(html).toContain(title);
    }
  });

  it("renders the new layout's hero, Findings, and Session window sections", () => {
    // The hero — the single evidence-backed takeaway, led big above the fold (see HeroLesson).
    expect(html).toContain("The one lesson");
    // The detail views are docked inline under the beat each explains (no tab drawer), so their
    // section titles are always in the static markup.
    expect(html).toContain("Findings");
    expect(html).toContain("How the run unfolded");
    // The Session window accordion (SessionFacts + TrimControl), collapsed by default.
    expect(html).toContain("Session window");
  });

  // Note (follow-up, not covered here): the bundled htb-easy fixture predates schema v1.4's
  // `ghost` field, so GhostCard's own render path (report.ghost present, human_wins/time_lost_ms
  // copy, the per-objective verdict list) never executes in the App render above. Injecting a
  // ghost via `useReport.setState(...)` before an SSR render doesn't exercise it either: zustand
  // v5's `useStore` passes `getServerSnapshot: () => selector(api.getInitialState())` to
  // `useSyncExternalStore`, and `renderToStaticMarkup` is treated as a server render — so it
  // always reads the store's snapshot frozen at module load, never a runtime `setState`. Testing
  // GhostCard's populated path needs either a bundled ghost-bearing fixture or a jsdom render
  // (client snapshot path) rather than `renderToStaticMarkup` against the raw store.

  it("renders the machine identity, platform, verdict, and command log", () => {
    expect(html).toContain("Saltmarsh"); // the default demo's identity in the verdict band
    expect(html).toContain("Breachyard"); // correctly identified platform (not mislabeled)
    expect(html).toContain("System flag");
    expect(html).toContain("rpcclient"); // a real command from the run's command log
  });

  it("renders the skipped objective from the golden DAG", () => {
    expect(html).toContain("Never attempted");
  });
});
