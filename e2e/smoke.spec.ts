import { test, expect } from "./fixtures";

// Browser tests must not request the `tauri` fixture (its unmocked-command check only runs when used),
// so each mode gets its own describe and only desktop installs the fake.
type Mode = "browser" | "desktop";

// A fresh profile opens the first-run wizard overlay, which covers the nav; the smoke checks target the
// main views, so mark the profile as onboarded (key/value from src/lib/onboarding.ts).
const markOnboarded = (page: import("@playwright/test").Page) =>
  page.addInitScript(() => {
    try { localStorage.setItem("owlsh.onboarded", "1"); } catch { /* storage unavailable */ }
  });

function suite(mode: Mode) {
  const setup = async (tauri?: { install(): Promise<void> }) => {
    if (mode === "desktop") await tauri!.install();
  };

  // Each test is declared per mode so the browser variant never touches the `tauri` fixture.
  const define = (name: string, body: (p: { page: import("@playwright/test").Page }) => Promise<void>) => {
    if (mode === "desktop") {
      test(name, async ({ page, tauri }) => {
        await setup(tauri);
        await markOnboarded(page);
        await body({ page });
      });
    } else {
      test(name, async ({ page }) => {
        await markOnboarded(page);
        await body({ page });
      });
    }
  };

  test.describe(`smoke (${mode})`, () => {
    define("debrief", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "History", exact: true })).toBeVisible();
      // IdentityBar renders the target/machine name as the page's h1.
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
    define("history", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "History", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Engagement history" })).toBeVisible();
    });
    define("progress", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Progress", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Progress", exact: true })).toBeVisible();
    });
    define("live demo", async ({ page }) => {
      await page.goto("/?demo=live");
      // LiveDashboard's header reads "Live ops" while recording; the demo self-drives into it.
      await expect(page.getByText("Live ops")).toBeVisible({ timeout: 30_000 });
    });
    define("widget", async ({ page }) => {
      await page.goto("/?widget=1");
      await expect(page.getByText(mode === "browser" ? "owlsh · Saltmarsh" : "Waiting for a capture")).toBeVisible();
    });
  });
}

suite("browser");
suite("desktop");
