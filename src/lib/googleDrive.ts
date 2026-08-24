// Cloud backup via the user's own Google Drive.
//
// The point of Drive over a server of ours: every user's backup sits in *their*
// account, so the app stays local-first and account-free from our side — there is
// nothing to host, nothing to pay for, and no one else's data to be responsible
// for. Signing into the same Google account on a second device is the entire
// pairing step; there's no code to copy across.
//
// Scope is `drive.file`, which grants access only to files this app itself
// created. It cannot see the rest of the user's Drive. That also keeps us out of
// Google's verification process, which the broader `drive`/`drive.appdata` scopes
// would require. Don't widen it without understanding that cost.
//
// The blob is byte-identical to the file the Settings export writes (gzipped JSON
// via `serializeBackup`), so a Drive backup and a downloaded one are
// interchangeable in both directions.

import type { Backup } from "./backup";
import { serializeBackup, readBackupBlob } from "./backup";
import { loadCloudConfig, saveCloudConfig } from "../storage/cloudSync";

// OAuth client ID from Google Cloud Console (Credentials → OAuth client ID →
// Web application), with this app's origin as an authorized JavaScript origin.
// Public by design — it identifies the app, it doesn't authorise anything on its
// own — so committing it is fine. Empty = cloud backup is switched off, which is
// what anyone building this repo without their own Google project gets.
export const CLIENT_ID: string = "816088953054-bqtpadf28189524igd9jmivlh6cog2bk.apps.googleusercontent.com";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
// The name is also the lookup key — `findFile` queries Drive by it — so it must
// not change even though the contents are gzip now. Renaming it to .json.gz would
// make every existing backup invisible to `findFile`, and an invisible backup is
// worse than a misnamed one: the app would report "no backup in this account",
// which invites a push that lands in a *new* file and orphans the real one.
const FILE_NAME = "kanjii-backup.json";
const GSI_SRC = "https://accounts.google.com/gsi/client";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export type RemoteMeta = { exportedAt: number };

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken: (opts?: { prompt?: string }) => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

export function isDriveConfigured(): boolean {
  return CLIENT_ID !== "";
}

// --- Auth ------------------------------------------------------------------
//
// Google Identity Services hands out 1-hour access tokens and, in a browser, no
// refresh token at all. The token is persisted (see storage/cloudSync.ts) so a
// page refresh doesn't drop the connection — keeping it in memory only meant
// reconnecting after every reload, because silent re-auth needs a hidden Google
// iframe that third-party-cookie partitioning often blocks.
//
// `kanjii:cloud`'s in-memory cache *is* the token state — there's no second copy
// here to drift out of sync with it.
//
// A silent renewal that fails needs a popup, and a popup needs a user gesture:
// fine when the user just clicked "Back up", impossible from a timer. That's a
// standing reason backup is a button and not a background sync.

const CANCELLED = "Google sign-in was cancelled.";

let client: TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null =
  null;
// One shared token request. Without this, React's StrictMode double-invoked the
// reconnect effect, the second call bounced off the "already in progress" guard,
// and its `false` result marked the app disconnected while a perfectly good token
// was arriving on the first call.
let inflight: Promise<string> | null = null;
let scriptPromise: Promise<void> | null = null;

function storeToken(value: string, expiry: number): void {
  saveCloudConfig({ ...loadCloudConfig(), token: value, tokenExpiry: expiry });
}

function clearToken(): void {
  storeToken("", 0);
}

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        // Let a later attempt retry rather than caching the failure forever —
        // this is usually just being offline.
        scriptPromise = null;
        reject(new Error("Couldn't load Google sign-in. Check you're online."));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

function settle(error?: Error, value?: string): void {
  const p = pending;
  pending = null;
  if (!p) return;
  if (error) p.reject(error);
  else p.resolve(value ?? "");
}

async function ensureClient(): Promise<TokenClient> {
  await loadGsi();
  client ??= window.google!.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      if (!response.access_token) {
        settle(new Error("Google sign-in didn't complete."));
        return;
      }
      // Retire it a minute early so a call can't start with a token that expires
      // mid-flight.
      storeToken(
        response.access_token,
        Date.now() + (response.expires_in ?? 3600) * 1000 - 60_000,
      );
      settle(undefined, response.access_token);
    },
    // Fires for popup problems (blocked, closed) — cases the success callback
    // never hears about, which would otherwise hang the promise forever.
    error_callback: (error) => {
      settle(
        new Error(
          error.type === "popup_closed"
            ? CANCELLED
            : "Google sign-in couldn't open. If your browser blocked the popup, allow it and try again.",
        ),
      );
    },
  });
  return client;
}

// `prompt: ""` asks Google to reuse an existing session without showing anything;
// it fails when there's no session, which is the caller's cue to go interactive.
//
// Note there is deliberately no `"consent"` here. See connect().
function requestToken(prompt: "" | "select_account"): Promise<string> {
  // Concurrent callers share one request rather than the later ones failing.
  // Google only has one answer to give at a time anyway, and a spurious failure
  // here reads to the user as "not connected".
  if (inflight) return inflight;

  inflight = new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    void ensureClient()
      .then((c) => c.requestAccessToken({ prompt }))
      .catch((err: Error) => settle(err));
  });
  const release = () => {
    inflight = null;
  };
  inflight.then(release, release);
  return inflight;
}

export function isConnected(): boolean {
  const { token, tokenExpiry } = loadCloudConfig();
  return Boolean(token) && Date.now() < tokenExpiry;
}

// Interactive: may show Google's account chooser. Must be called from a user
// gesture or the popup will be blocked.
//
// **Never ask for `prompt: "consent"` here.** Every value of `prompt` except
// `"none"` still shows the consent screen when the app has no valid grant —
// Google decides that, not us. So `"consent"` never *enables* anything; all it
// does is force a re-grant in the case where a perfectly good grant already
// exists. A new grant is precisely what makes Google mail the user a "was
// granted access to your Google Account" security alert, so forcing it turned an
// hour-long token into several alerts a day. `"select_account"` reaches the same
// screens by the same popup and reuses the existing grant instead of replacing
// it.
//
// `prompt: ""` first, because it shows nothing at all once the grant exists. It
// can't be relied on alone: it only stays silent while Google can reuse a
// session, and third-party-cookie partitioning (an installed PWA especially)
// often means it can't. A cancellation is not a failure of that kind —
// re-prompting someone who just closed the popup is the opposite of what they
// asked for.
export async function connect(): Promise<void> {
  try {
    await requestToken("");
  } catch (err) {
    if ((err as Error).message === CANCELLED) throw err;
    await requestToken("select_account");
  }
}

// There is deliberately no "reconnect on load" helper. `prompt: ""` is only
// silent while Google can reuse an existing session; when it can't, it falls back
// to a popup — so calling it on mount meant opening Settings could throw a login
// window at the user unprompted. The silent retry still happens, but only inside
// `accessToken()`, i.e. during a Back up or Restore the user asked for.

export function disconnect(): void {
  const { token } = loadCloudConfig();
  if (token) window.google?.accounts.oauth2.revoke(token);
  clearToken();
}

async function accessToken(): Promise<string> {
  if (isConnected()) return loadCloudConfig().token;
  try {
    return await requestToken("");
  } catch {
    throw new Error("Your Google sign-in has expired. Connect again to continue.");
  }
}

// --- Drive -----------------------------------------------------------------

async function driveFetch(url: string, init?: RequestInit): Promise<Response> {
  const bearer = await accessToken();
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${bearer}` },
    });
  } catch {
    throw new Error("Couldn't reach Google Drive. Check you're online.");
  }

  if (response.status === 401) {
    // Revoked or expired early — drop it so the next attempt re-acquires.
    clearToken();
    throw new Error("Your Google sign-in has expired. Connect again to continue.");
  }
  if (!response.ok && response.status !== 404) {
    const message = await response
      .json()
      .then((body: { error?: { message?: string } }) => body.error?.message)
      .catch(() => undefined);
    throw new Error(message ?? `Google Drive returned an error (${response.status}).`);
  }
  return response;
}

type DriveFile = { id: string; modifiedTime: string; appProperties?: Record<string, string> };

// Look the file up every time rather than caching its id. One extra request on a
// manual action, in exchange for self-healing: if the user deletes the file from
// Drive, the next backup just creates a new one instead of failing against a
// stale id. With `drive.file` this listing only ever sees our own file.
async function findFile(): Promise<DriveFile | null> {
  // Built by hand rather than with URLSearchParams: that encodes spaces as `+`
  // (form encoding), and a `+` taken literally in the Drive query would match
  // nothing. The failure would be silent and ugly — every push would create a
  // *second* backup file instead of updating the first. `%20` is unambiguous.
  const query = [
    `q=${encodeURIComponent(`name='${FILE_NAME}' and trashed=false`)}`,
    "spaces=drive",
    `fields=${encodeURIComponent("files(id,modifiedTime,appProperties)")}`,
    `orderBy=${encodeURIComponent("modifiedTime desc")}`,
    "pageSize=1",
  ].join("&");
  const response = await driveFetch(`${DRIVE}/files?${query}`);
  if (response.status === 404) return null;
  const data = (await response.json()) as { files?: DriveFile[] };
  return data.files?.[0] ?? null;
}

// `exportedAt` is mirrored into Drive's appProperties on upload so the staleness
// check can read it from the file listing, without downloading the whole backup
// just to find out how old it is.
export async function fetchRemoteMeta(): Promise<RemoteMeta | null> {
  const file = await findFile();
  if (!file) return null;
  const stamp = Number(file.appProperties?.exportedAt);
  return {
    exportedAt: Number.isFinite(stamp) && stamp > 0 ? stamp : Date.parse(file.modifiedTime),
  };
}

// Returns the raw parsed object; the caller validates it with parseBackup, so the
// Drive path goes through exactly the same checks as the file path. `readBackupBlob`
// sniffs gzip vs plain JSON, so a backup pushed by an older build still restores.
export async function pullBackup(): Promise<unknown> {
  const file = await findFile();
  if (!file) {
    throw new Error(
      "There's no Kanjii backup in this Google account yet. Back up from your other device first.",
    );
  }
  const response = await driveFetch(`${DRIVE}/files/${file.id}?alt=media`);
  return readBackupBlob(await response.blob());
}

export async function pushBackup(backup: Backup): Promise<void> {
  const file = await findFile();
  const metadata = {
    name: FILE_NAME,
    mimeType: "application/gzip",
    appProperties: { exportedAt: String(backup.exportedAt) },
  };

  // Random boundary: a fixed one could in principle collide with text the user
  // typed into a word's notes, which would corrupt the upload.
  const boundary = `kanjii-${crypto.randomUUID()}`;
  // A Blob, not a string: the payload is gzip now, and concatenating binary into
  // a JS string mangles it — every byte above 0x7f would be re-encoded on the way
  // out and the upload would be a corrupt archive.
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    `${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
    await serializeBackup(backup),
    `\r\n--${boundary}--`,
  ]);

  await driveFetch(
    file
      ? `${UPLOAD}/files/${file.id}?uploadType=multipart`
      : `${UPLOAD}/files?uploadType=multipart`,
    {
      method: file ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}
