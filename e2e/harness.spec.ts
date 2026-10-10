import { test, expect, makeCapture, asLatest, clean } from "./fixtures";

test("unmocked commands are recorded and allowUnmocked clears them", async ({ page, tauri }) => {
  await tauri.install();
  await page.goto("/?widget=1");
  await page.evaluate(() =>
    (window as unknown as { __TAURI_INTERNALS__: { invoke(c: string): Promise<unknown> } }).__TAURI_INTERNALS__
      .invoke("definitely_not_a_command")
      .catch(() => {}),
  );
  expect(tauri.strayUnmocked()).toEqual(["definitely_not_a_command"]);
  tauri.allowUnmocked("definitely_not_a_command");
});

test("model.useCloud seeds anthropic coach mode without explicit storage", async ({ page, tauri, model }) => {
  model.useCloud(clean("Re-check your scan."));
  await tauri.install();
  await page.goto("/?widget=1");
  expect(await page.evaluate(() => localStorage.getItem("owlsh.coachMode"))).toBe("anthropic");
});

test("model.useCloud after install throws", async ({ tauri, model }) => {
  await tauri.install();
  expect(() => model.useCloud(clean("x"))).toThrow(/before tauri.install/);
});

test("desktop fake: app starts with defaults and polls latest_session", async ({ page, tauri }) => {
  await tauri.install();
  await page.goto("/?widget=1");
  await expect.poll(() => tauri.calls("latest_session").length).toBeGreaterThan(0);
  await expect(page.getByText("Waiting for a capture")).toBeVisible();
});

test("desktop fake: handler replies reach the app", async ({ page, tauri }) => {
  tauri.on("latest_session", asLatest(makeCapture({ uuid: "u-1", recording: true, platform: "htb", name: "Demo" })));
  await tauri.install();
  await page.goto("/?widget=1");
  await expect(page.getByText("owlsh · Demo")).toBeVisible();
});

test("a slow handler still pending at test end does not hang teardown", async ({ page, tauri }) => {
  tauri.on("latest_session", () => new Promise(() => {}));
  await tauri.install();
  await page.goto("/?widget=1");
  await expect.poll(() => tauri.calls("latest_session").length).toBeGreaterThan(0);
});

test("an unmocked command fails the test at teardown", async ({ page, tauri }) => {
  test.fail(); // expected to fail via the tauri fixture's teardown check
  await tauri.install();
  await page.goto("/?widget=1");
  await page.evaluate(() =>
    (window as unknown as { __TAURI_INTERNALS__: { invoke(c: string): Promise<unknown> } }).__TAURI_INTERNALS__
      .invoke("definitely_not_a_command")
      .catch(() => {}),
  );
});
