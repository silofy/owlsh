import { test, expect, makeCapture, asLatest, GOLDEN, clean, COACH_CLOUD, pathOf, FAST_TIMEOUTS, LOOKUP_OFF, ONBOARDED as ONBOARDED_KEY } from "./fixtures";
import type { Page } from "@playwright/test";
import type { TauriFake } from "./fixtures";
import type { OwlshReport } from "../src/types/report";

const ONBOARDED = { ...COACH_CLOUD, ...ONBOARDED_KEY };
const OFF = { ...ONBOARDED, ...LOOKUP_OFF };
const demo = (extra: Partial<Parameters<typeof makeCapture>[0]> = {}) =>
  makeCapture({ uuid: "u-1", recording: true, platform: "htb", name: "Demo", ...extra });
const hintButton = (page: Page) => page.getByRole("button", { name: /^hint · / });
// LiveBridge polls list_sessions every 4s; allow a couple of ticks.
const POLL = { timeout: 10_000 };

async function openLive(page: Page, tauri: TauriFake, capture: OwlshReport, storage = ONBOARDED) {
  tauri.on("list_sessions", [JSON.stringify(capture)]);
  await tauri.install({ storage, test: FAST_TIMEOUTS });
  await page.goto("/");
  await page.getByRole("button", { name: "Open debrief" }).click();
}

test("'connecting…' until the path resolves", async ({ page, tauri }) => {
  const capture = demo();
  tauri.on("latest_session", null);
  await openLive(page, tauri, capture);
  const connecting = page.getByRole("button", { name: /connecting/ });
  await expect(connecting).toBeVisible();
  await expect(connecting).toBeDisabled();
  tauri.on("latest_session", asLatest(capture));
  await expect(hintButton(page)).toHaveText(/costs independence/, POLL);
  await expect(hintButton(page)).toBeEnabled();
});

test("clean pull records to the resolved path", async ({ page, tauri, model }) => {
  const capture = demo();
  model.useCloud(clean("List what you know so far and pick the thinnest lead."));
  tauri.on("latest_session", asLatest(capture));
  await openLive(page, tauri, capture, OFF);
  await expect(hintButton(page)).toHaveText(/costs independence/, POLL);
  await hintButton(page).click();
  await expect(page.getByText("List what you know so far and pick the thinnest lead.")).toBeVisible();
  await expect(page.getByText("ai · model")).toBeVisible();
  await expect.poll(() => tauri.calls("record_hint").length).toBe(1);
  expect(tauri.calls("record_hint")[0]).toMatchObject({ path: pathOf(capture), tier: 1, source: "ai:knowledge" });
  await expect(hintButton(page)).toHaveText(/−3/, POLL);
});

test("opt-in is shared with the widget's pref", async ({ page, tauri, model }) => {
  const capture = demo();
  model.useCloud(clean("Re-check the scan output."));
  tauri.on("latest_session", asLatest(capture));
  await openLive(page, tauri, capture);
  await expect(hintButton(page)).toHaveText(/costs independence/, POLL);
  await hintButton(page).click();
  await expect(page.getByText("Look up a write-up for Demo?", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "No, model only" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("owlsh.hintLookup"))).toBe("off");
});

test("golden is not applied while recording; applied after", async ({ page, tauri }) => {
  const capture = demo({ hintGolden: GOLDEN });
  tauri.on("latest_session", asLatest(capture));
  tauri.on("golden_dag", null);
  await openLive(page, tauri, capture);
  await expect(hintButton(page)).toBeVisible();
  // While recording App.tsx renders the live dashboard instead of WriteupGate, so "gate still showing"
  // is read from the debrief itself: no write-up reference applied, and PathComparison's
  // recording placeholder instead of its "Change next time" block.
  await expect(page.getByText("None yet — grading your run only")).toBeVisible();
  await expect(page.getByText(/comparison unlocks when the run finishes/)).toBeVisible();
  await expect(page.getByText("Change next time")).toHaveCount(0);
  tauri.on("list_sessions", [JSON.stringify(demo({ hintGolden: GOLDEN, recording: false }))]);
  await expect(page.getByText("Change next time")).toBeVisible(POLL);
  await expect(page.getByText("of the write-up's path followed")).toBeVisible();
  await expect(page.getByText("One step before your debrief")).toHaveCount(0);
});
