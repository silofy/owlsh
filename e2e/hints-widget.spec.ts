import { test, expect, makeCapture, asLatest, GOLDEN, clean, leaky, slow, error, COACH_CLOUD, pathOf, FAST_TIMEOUTS, LOOKUP_OFF } from "./fixtures";
import type { Page } from "@playwright/test";
import type { TauriFake, ModelFake, ModelReply } from "./fixtures";
import type { OwlshReport } from "../src/types/report";

const STATIC_T1 = "Re-read your own output: is there anything you found but haven't followed up?";
const demo = () => makeCapture({ uuid: "u-1", recording: true, platform: "htb", name: "Demo" });

interface OpenOpts {
  capture?: OwlshReport;
  storage?: Record<string, string>;
  /** Cloud model replies; useCloud must run before install, so open() does both. */
  replies?: ModelReply[];
  /** Skip the default latest_session handler (the test installed its own). */
  customLatest?: boolean;
}

async function open(page: Page, tauri: TauriFake, model: ModelFake, o: OpenOpts = {}) {
  const capture = o.capture ?? demo();
  if (o.replies) model.useCloud(...o.replies);
  if (!o.customLatest) tauri.on("latest_session", asLatest(capture));
  await tauri.install({ storage: o.storage ?? COACH_CLOUD, test: FAST_TIMEOUTS });
  await page.goto("/?widget=1");
  await expect(page.getByText(`owlsh · ${capture.session.target?.name ?? "Demo"}`)).toBeVisible();
}
const hintButton = (page: Page) => page.getByRole("button", { name: /\[h\] hint/ });
const hintLine = (page: Page) => page.getByText(/^hint: (?!thinking)/);
const optIn = (page: Page) => page.getByText(/Look up a write-up for/);
const OFF = { ...COACH_CLOUD, ...LOOKUP_OFF };

test("opt-in asked once; Yes stores 'on'", async ({ page, tauri, model }) => {
  tauri.on("fetch_htb_writeup", () => { throw new Error("no write-up"); });
  tauri.on("fetch_writeup", () => { throw new Error("no write-up"); });
  await open(page, tauri, model, { replies: [clean("List what you know so far and pick the thinnest lead.")] });
  expect(await page.evaluate(() => localStorage.getItem("owlsh.hintLookup"))).toBeNull();
  await page.keyboard.press("h");
  await expect(page.getByText("Look up a write-up for Demo?", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Yes" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("owlsh.hintLookup"))).toBe("on");
  await expect(hintLine(page)).toBeVisible();
  await expect.poll(() => tauri.calls("record_hint").length).toBe(1);
  await page.keyboard.press("h");
  await expect.poll(() => tauri.calls("record_hint").length).toBe(2);
  await expect(optIn(page)).toHaveCount(0);
});

test("'No, model only' skips the lookup", async ({ page, tauri, model }) => {
  await open(page, tauri, model, { replies: [clean("List what you know so far and pick the thinnest lead.")] });
  await page.keyboard.press("h");
  await page.getByRole("button", { name: "No, model only" }).click();
  await expect(page.getByText("List what you know so far and pick the thinnest lead.")).toBeVisible();
  await expect(page.getByText("ai · model")).toBeVisible();
  await expect.poll(() => tauri.calls("record_hint").length).toBe(1);
  expect(tauri.calls("fetch_writeup")).toEqual([]);
  expect(tauri.calls("fetch_htb_writeup")).toEqual([]);
  expect(tauri.calls("record_hint")[0]).toMatchObject({ source: "ai:knowledge", tier: 1, path: pathOf(demo()), phase: expect.any(String), atMs: expect.any(Number) });
});

test("non-HTB capture never asks to look up", async ({ page, tauri, model }) => {
  const capture = makeCapture({ uuid: "u-1", recording: true, platform: "thm", name: "Demo" });
  await open(page, tauri, model, { capture, replies: [clean("Re-check the scan output.")] });
  await page.keyboard.press("h");
  await expect(hintLine(page)).toBeVisible();
  await expect(optIn(page)).toHaveCount(0);
});

test("cached golden steers the model", async ({ page, tauri, model }) => {
  const capture = makeCapture({ uuid: "u-1", recording: true, platform: "htb", name: "Demo", hintGolden: GOLDEN });
  await open(page, tauri, model, { capture, storage: OFF, replies: [clean("Look again at what the service exposes.")] });
  await page.keyboard.press("h");
  await expect(page.getByText("ai · write-up")).toBeVisible();
  await expect.poll(() => tauri.calls("record_hint").length).toBe(1);
  expect(tauri.calls("record_hint")[0]).toMatchObject({ source: "ai:golden" });
  expect(tauri.calls("cloud_generate").some((c) => String(c.prompt).includes("access_widgetsvc"))).toBe(true);
});

for (const [name, reply] of [["leaky", leaky()], ["slow", slow(1000)], ["error", error()]] as const) {
  test(`${name} model reply falls back to static`, async ({ page, tauri, model }) => {
    await open(page, tauri, model, { storage: OFF, replies: [reply] });
    await page.keyboard.press("h");
    await expect(page.getByText(`hint: ${STATIC_T1}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/ai · /)).toHaveCount(0);
    await expect.poll(() => tauri.calls("record_hint").length).toBe(1);
    expect(tauri.calls("record_hint")[0]).toMatchObject({ source: "static" });
  });
}

test("a second press while pending is ignored", async ({ page, tauri, model }) => {
  await open(page, tauri, model, { storage: OFF, replies: [slow(250, "Re-read your last output.")] });
  await page.keyboard.press("h");
  await page.keyboard.press("h");
  await expect(page.getByText("Re-read your last output.")).toBeVisible();
  await expect.poll(() => tauri.calls("record_hint").length).toBe(1);
  const n = tauri.calls("latest_session").length;
  await expect.poll(() => tauri.calls("latest_session").length, { timeout: 6000 }).toBeGreaterThan(n + 1);
  expect(tauri.calls("record_hint").length).toBe(1);
});

test("tiers escalate and the penalty sums", async ({ page, tauri, model }) => {
  const capture = demo();
  // Mirror the sidecar merge: saved pulls come back on the next poll.
  tauri.on("latest_session", () =>
    asLatest({
      ...capture,
      hints: tauri.calls("record_hint").map((c) => ({ tier: c.tier, atMs: c.atMs, phase: c.phase, source: c.source })),
    } as OwlshReport),
  );
  await open(page, tauri, model, { capture, storage: OFF, customLatest: true, replies: [clean("One."), clean("Two."), clean("Three.")] });
  const penalties = [/−3/, /−9/, /−19/];
  for (let i = 1; i <= 3; i++) {
    await page.keyboard.press("h");
    await expect.poll(() => tauri.calls("record_hint").length).toBe(i);
    await expect(page.getByText("hint: thinking…")).toHaveCount(0);
    await expect(hintButton(page)).toHaveText(penalties[i - 1]);
  }
  expect(tauri.calls("record_hint").map((c) => c.tier)).toEqual([1, 2, 3]);
});

test("session switch clears the hint and the golden", async ({ page, tauri, model }) => {
  const a = makeCapture({ uuid: "u-1", recording: true, platform: "htb", name: "Demo", hintGolden: GOLDEN });
  const b = makeCapture({ uuid: "u-2", recording: true, platform: "htb", name: "Other" });
  await open(page, tauri, model, { capture: a, storage: OFF, replies: [clean("Look at the service again.")] });
  await page.keyboard.press("h");
  await expect(page.getByText("ai · write-up")).toBeVisible();
  await expect.poll(() => tauri.calls("record_hint").length).toBe(1);
  const before = tauri.calls("cloud_generate").length;
  tauri.on("latest_session", asLatest(b));
  await expect(page.getByText("owlsh · Other")).toBeVisible();
  await expect(hintLine(page)).toHaveCount(0);
  await page.keyboard.press("h");
  await expect.poll(() => tauri.calls("record_hint").length).toBe(2);
  expect(tauri.calls("record_hint")[1]).toMatchObject({ source: "ai:knowledge", path: pathOf(b) });
  const prompts = tauri.calls("cloud_generate").slice(before).map((c) => String(c.prompt));
  expect(prompts.length).toBeGreaterThan(0);
  expect(prompts.some((p) => p.includes("access_widgetsvc"))).toBe(false);
});

test("waits for a capture; hint button is enabled when it appears", async ({ page, tauri, model }) => {
  let capture: ReturnType<typeof asLatest> | null = null;
  tauri.on("latest_session", () => capture);
  model.useCloud(clean("x"));
  await tauri.install({ storage: OFF, test: FAST_TIMEOUTS });
  await page.goto("/?widget=1");
  await expect(page.getByText("Waiting for a capture")).toBeVisible();
  await expect(hintButton(page)).toHaveCount(0);
  capture = asLatest(demo());
  await expect(hintButton(page)).toBeVisible();
  expect(await hintButton(page).isEnabled()).toBe(true);
  await expect(hintButton(page)).not.toHaveText(/connecting/);
});
