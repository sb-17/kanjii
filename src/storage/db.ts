import { get, set } from "idb-keyval";

// Low-level local persistence, backed by IndexedDB (via idb-keyval) so user data
// can grow well past the ~5 MB localStorage cap. Falls back to localStorage if
// IndexedDB is unavailable (e.g. some private-browsing modes).

// Read a value from IndexedDB. On first run, migrate a legacy localStorage value
// into IndexedDB (and drop the old copy) so existing users keep their data.
export async function readWithMigration<T>(key: string): Promise<T | undefined> {
  try {
    const existing = await get<T>(key);
    if (existing !== undefined) return existing;

    const legacy = localStorage.getItem(key);
    if (legacy != null) {
      const parsed = JSON.parse(legacy) as T;
      await set(key, parsed);
      localStorage.removeItem(key);
      return parsed;
    }
    return undefined;
  } catch {
    // IndexedDB blocked — read from localStorage instead.
    try {
      const legacy = localStorage.getItem(key);
      return legacy != null ? (JSON.parse(legacy) as T) : undefined;
    } catch {
      return undefined;
    }
  }
}

// Persist a value to IndexedDB, falling back to localStorage on failure.
export async function writeValue(key: string, value: unknown): Promise<void> {
  try {
    await set(key, value);
  } catch {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* out of options — keep the in-memory copy only */
    }
  }
}

// Best-effort request to make storage durable (resist browser eviction).
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}
