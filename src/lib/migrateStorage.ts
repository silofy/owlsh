/** Pre-rename settings lived under `watcher.*` keys; copy each to its `owlsh.*` name once, so a
 *  returning user keeps their onboarding state, coach mode and widget size. Never overwrites. */
export function migrateLegacyKeys(store: Storage | undefined = globalThis.localStorage): number {
  if (!store) return 0;
  let moved = 0;
  try {
    for (let i = store.length - 1; i >= 0; i--) {
      const k = store.key(i);
      if (!k?.startsWith("watcher.")) continue;
      const next = "owlsh." + k.slice("watcher.".length);
      if (store.getItem(next) === null) {
        store.setItem(next, store.getItem(k) ?? "");
        moved++;
      }
      store.removeItem(k);
    }
  } catch {
    /* storage blocked (private mode) — nothing to migrate */
  }
  return moved;
}

migrateLegacyKeys();
