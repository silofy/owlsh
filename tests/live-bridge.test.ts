import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LiveBridge } from "../src/components/LiveBridge";
import { useReport } from "../src/store/report";
import fixture from "../fixtures/session-htb-easy.json";
import type { OwlshReport } from "../src/types/report";

/**
 * The live bridge: a box spawned in the browser is written by the daemon and merged into the store
 * at runtime (no rebuild). These exercise the read side end-to-end — ingest → banner → open.
 */
function liveReport(uuid: string, name: string): OwlshReport {
  const r = JSON.parse(JSON.stringify(fixture)) as OwlshReport;
  r.session.uuid = uuid;
  r.session.target_scope = `HTB :: ${name}`;
  r.session.machine = { name, os: "Linux", difficulty: "Easy", avatar: null, points: 20, retired: true };
  r.recording = true;
  // a just-spawned capture has a fresh heartbeat — the UI's staleness guard reads session.ended_at
  r.session.started_at = new Date().toISOString();
  r.session.ended_at = new Date().toISOString();
  return r;
}

describe("live bridge", () => {
  it("ingests a spawned session, raises a recording banner, and lists it", () => {
    useReport.getState().ingestLiveReport(liveReport("live-1", "Codify"));
    const s = useReport.getState();
    expect(s.liveBanner).toEqual({ id: "htb:live-1", name: "Codify" });
    const card = s.sessionCards.find((c) => c.id === "htb:live-1");
    expect(card?.recording).toBe(true);
    expect(card?.machine.name).toBe("Codify");
  });

  it("opening the banner switches to that session and clears the banner", () => {
    useReport.getState().ingestLiveReport(liveReport("live-2", "Devvortex"));
    useReport.getState().switchSession("htb:live-2");
    const s = useReport.getState();
    expect(s.activeId).toBe("htb:live-2");
    expect(s.view).toBe("debrief");
    expect(s.liveBanner).toBeNull();
  });

  it("an identity enrich (same uuid) updates the card without re-raising a dismissed banner", () => {
    useReport.getState().ingestLiveReport(liveReport("live-3", "Box"));
    useReport.getState().dismissLiveBanner();
    const enriched = liveReport("live-3", "Box");
    enriched.session.machine!.avatar = "https://labs.hackthebox.com/storage/avatars/x.png";
    useReport.getState().ingestLiveReport(enriched);
    const s = useReport.getState();
    expect(s.liveBanner).toBeNull();
    expect(s.sessionCards.find((c) => c.id === "htb:live-3")?.machine.avatar).toContain("labs.hackthebox.com");
  });

  it("ending a recording (recording=false) drops it as a finished run, not live", () => {
    const ended = liveReport("live-4", "Manager");
    ended.recording = false;
    useReport.getState().ingestLiveReport(ended);
    const card = useReport.getState().sessionCards.find((c) => c.id === "htb:live-4");
    expect(card?.recording).toBe(false);
  });
});

describe("live banner connector label", () => {
  afterEach(() => vi.unstubAllGlobals());

  function bannerFor(platform: "htb" | "thm"): string {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ enabled: true }) });
    useReport.setState({
      liveBanner: { id: `${platform}:x`, name: "Box" },
      sessionCards: [{ id: `${platform}:x`, started_at: new Date().toISOString(), target: { name: "Box", platform } }],
    } as never);
    // server render reads zustand's frozen initial snapshot, so patch it for this render and restore after
    const snap = useReport.getInitialState() as unknown as Record<string, unknown>;
    const keep = { liveBanner: snap.liveBanner, sessionCards: snap.sessionCards };
    Object.assign(snap, { liveBanner: useReport.getState().liveBanner, sessionCards: useReport.getState().sessionCards });
    try {
      return renderToStaticMarkup(createElement(LiveBridge));
    } finally {
      Object.assign(snap, keep);
    }
  }

  it("shows AttackBox for a THM target with sync enabled", () => {
    const html = bannerFor("thm");
    expect(html).toContain("AttackBox");
    expect(html).not.toContain(">Pwnbox<");
    expect(html).not.toMatch(/ Pwnbox/);
  });

  it("still shows Pwnbox for HTB", () => {
    expect(bannerFor("htb")).toMatch(/ Pwnbox/);
  });
});
