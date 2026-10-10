import { test as base, expect } from "@playwright/test";
import { TauriFake } from "./tauri";
import { ModelFake } from "./model";

type Guard = { allow(re: RegExp): void };

export const test = base.extend<{ tauri: TauriFake; model: ModelFake; guard: Guard }>({
  guard: [
    async ({ page }, use) => {
      const allowed: RegExp[] = [];
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(String(e)));
      await use({ allow: (re) => allowed.push(re) });
      expect(errors.filter((e) => !allowed.some((re) => re.test(e))), "console errors").toEqual([]);
    },
    { auto: true },
  ],
  tauri: async ({ page }, use) => {
    const fake = new TauriFake(page);
    await use(fake);
    expect(fake.strayUnmocked(), "unmocked native commands").toEqual([]);
  },
  model: async ({ tauri }, use) => {
    await use(new ModelFake(tauri));
  },
});
export { expect };
export * from "./model";
export * from "./session";
export type { TauriFake, InstallOpts } from "./tauri";
