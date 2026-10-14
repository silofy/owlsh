import { test as base, expect } from "@playwright/test";
import { TauriFake } from "./tauri";
import { ModelFake } from "./model";

type Guard = { allow(re: RegExp): void };

export const test = base.extend<{ tauri: TauriFake; model: ModelFake; guard: Guard }>({
  guard: [
    async ({ page }, use) => {
      const allowed: RegExp[] = [
        // The target avatar (MachineAvatar.resolveAvatar: HTB CDN / THM og:image) is fetched
        // at runtime and is expected to be unreachable offline and in CI; the component already
        // degrades to a generated emblem via onError. Ignore genuine network-connectivity
        // failures to unreachable hosts, but still catch our own HTTP (e.g. 404) and JS errors.
        /net::ERR_(CONNECTION_REFUSED|NAME_NOT_RESOLVED|FAILED|CONNECTION_RESET|CONNECTION_TIMED_OUT|ADDRESS_UNREACHABLE|INTERNET_DISCONNECTED)/,
      ];
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
