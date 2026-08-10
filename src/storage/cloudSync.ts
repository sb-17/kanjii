// What this device remembers about cloud backup, between sessions.
//
// Deliberately *not* part of `kanjii:settings`: settings are inside the backup
// blob and get replaced wholesale on restore. Restoring the phone's backup onto
// the PC must not overwrite the PC's own last-synced marker with the phone's, or
// the stale-push warning would be reading the wrong device's clock. Same
// reasoning that keeps `kanjii:theme` in its own key.
//
// This *does* hold Google's access token. Keeping it in memory only meant a page
// refresh dropped the connection and made the user click Connect again, which is
// unusable — silent re-auth needs a hidden Google iframe and third-party-cookie
// partitioning increasingly blocks it. The token is short-lived (1 hour) and
// scoped to `drive.file`, so the worst it can reach is the one backup file this
// app created. That's the trade being made; don't widen the scope without
// revisiting it.

import { readWithMigration, writeValue } from "./db";

export type CloudConfig = {
  // Whether the user has connected Google Drive on this device. Only a hint that
  // it's worth trying a silent re-auth on load; the real authority is whether
  // Google still hands us a token.
  connected: boolean;
  // Google access token and its expiry (epoch ms), "" / 0 when there is none.
  token: string;
  tokenExpiry: number;
  // `exportedAt` of the last blob this device pushed or pulled, 0 if never.
  // Compared against the remote's to catch "you're about to overwrite a backup
  // this device has never seen".
  lastSyncedAt: number;
};

const STORAGE_KEY = "kanjii:cloud";

const DEFAULTS: CloudConfig = {
  connected: false,
  token: "",
  tokenExpiry: 0,
  lastSyncedAt: 0,
};

// In-memory source of truth, hydrated once at startup (see hydrateCloudConfig).
let cache: CloudConfig = { ...DEFAULTS };

export async function hydrateCloudConfig(): Promise<void> {
  const stored = await readWithMigration<Partial<CloudConfig>>(STORAGE_KEY);
  cache = { ...DEFAULTS, ...stored };
}

export function loadCloudConfig(): CloudConfig {
  return cache;
}

export function saveCloudConfig(config: CloudConfig): void {
  cache = config;
  void writeValue(STORAGE_KEY, config);
}
