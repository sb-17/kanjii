import { useState } from "react";
import "../styles/Settings.css";
import { useProgress } from "../context/ProgressContext";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { loadKanjiSkill, saveKanjiSkill } from "../storage/kanjiSkill";
import { loadEvents, replaceEvents } from "../storage/events";
import { loadDeckProgress, saveDeckProgress } from "../storage/deckProgress";
import { loadDeckStats, saveDeckStats } from "../storage/deckStats";
import { loadSettings, saveSettings } from "../storage/settings";
import type { Settings } from "../types/settingsType";
import { setDayCutoffHour } from "../lib/srs";
import { PACES, rescheduleAll } from "../lib/schedule";
import { mergeVocab } from "../lib/vocab";
import {
  buildBackup,
  parseBackup,
  serializeBackup,
  readBackupBlob,
  type ParsedBackup,
} from "../lib/backup";
import { getThemePref, setThemePref, type ThemePref } from "../storage/theme";
import { loadCloudConfig, saveCloudConfig } from "../storage/cloudSync";
import {
  connect,
  disconnect,
  fetchRemoteMeta,
  isConnected,
  isDriveConfigured,
  pullBackup,
  pushBackup,
} from "../lib/googleDrive";

const THEMES: { id: ThemePref; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

// The three ladders that carry their own pace. Kept as data so the card is one
// loop rather than three near-identical blocks.
const PACE_ROWS: {
  key: "practicePace" | "writePace" | "deckPace";
  label: string;
}[] = [
  { key: "practicePace", label: "Words" },
  { key: "writePace", label: "Writing" },
  { key: "deckPace", label: "Decks" },
];

const MISSES: { id: Settings["missBehaviour"]; label: string }[] = [
  { id: "reset", label: "Back to start" },
  { id: "step", label: "Back one box" },
];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  // Revoking synchronously cancels the download in some browsers — let the click
  // be handled first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// The single-section exports stay plain, readable JSON: they're small, and being
// openable in a text editor is half their point. Only the full backup is gzipped.
function downloadJson(data: unknown, filename: string) {
  download(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    filename,
  );
}

// Rough age of a backup, for "is this the one I want to restore?". Deliberately
// coarse — the decision is "today's work or last week's", never minutes.
function describeAge(at: number | undefined): string {
  if (!at) return "at an unknown time";
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// What a restore is about to replace. Shared by the file import and the cloud
// restore so the two can't drift into describing the same act differently.
function backupSummary(data: ParsedBackup, localWords: number): string {
  return (
    `• ${Object.keys(data.progress).length} kanji statuses — replaces your current progress\n` +
    `• ${data.vocab.length} words — replaces your current ${localWords} word${localWords === 1 ? "" : "s"}\n` +
    `• ${Object.keys(data.skill).length} handwriting-skill entries — replaces current\n` +
    `• ${data.events.length} analytics events — replaces your trend history\n` +
    (Object.keys(data.deckProgress).length > 0
      ? `• deck review progress for ${Object.keys(data.deckProgress).length} deck(s) — the decks themselves aren't in backups, so re-import their files\n`
      : "") +
    (data.settings || data.theme ? "• settings & theme\n" : "")
  );
}

// Read a picked file as text, clearing the input first so re-picking the same
// file still fires a change event.
function readFile(
  input: HTMLInputElement,
  onText: (text: string) => void,
): void {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => onText(reader.result as string);
  reader.readAsText(file);
}

export default function Settings() {
  const { progress, replaceProgress } = useProgress();
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  // The number fields are held as text so they can be emptied while retyping; an
  // unparseable value just isn't saved, leaving the stored setting alone.
  const [newPerDay, setNewPerDay] = useState(() =>
    String(loadSettings().newPerDay),
  );
  const [writeNewPerDay, setWriteNewPerDay] = useState(() =>
    String(loadSettings().writeNewPerDay),
  );

  const [driveReady, setDriveReady] = useState(isConnected);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("");

  // Deliberately no automatic re-auth on mount. A "silent" token request is only
  // silent while Google can reuse an existing session; when it can't — an expired
  // session, partitioned third-party cookies — it falls back to a popup, so
  // merely opening Settings threw a login window at you. Nothing may reach for a
  // token except a button press. The stored token still covers reloads within its
  // hour, and `accessToken()` retries silently inside Back up / Restore, which are
  // user-initiated by definition.
  const sessionExpired = loadCloudConfig().connected && !driveReady;

  const changeTheme = (next: ThemePref) => {
    setTheme(next);
    setThemePref(next);
  };

  const patch = (next: Partial<Settings>) => {
    const updated = { ...loadSettings(), ...next };
    setSettings(updated);
    saveSettings(updated);
    return updated;
  };

  // Pace and the day cutoff both change what "due" means for items already
  // scheduled, so every stored due date is re-derived on the spot. Without it the
  // change would only show up as each item next came round — up to a month of
  // apparently nothing happening. See lib/schedule `rescheduleAll`.
  const changeSchedule = (next: Partial<Settings>) => {
    const updated = patch(next);
    if (next.dayCutoffHour !== undefined) setDayCutoffHour(updated.dayCutoffHour);
    rescheduleAll();
  };

  // Shared by both daily caps: keep the text, save only a sane number.
  const changeCap = (
    raw: string,
    setText: (s: string) => void,
    key: "newPerDay" | "writeNewPerDay",
  ) => {
    setText(raw);
    const n = Math.floor(Number(raw));
    if (raw.trim() === "" || !Number.isFinite(n) || n < 0) return;
    patch({ [key]: Math.min(n, 200) });
  };

  const handleVocabExport = () =>
    downloadJson(loadUserVocab(), "kanjii-vocab.json");

  const handleVocabImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    readFile(e.target, (text) => {
      try {
        const { merged, added } = mergeVocab(loadUserVocab(), JSON.parse(text));
        saveUserVocab(merged);
        alert(
          `Imported — ${added} new word${added === 1 ? "" : "s"}. You now have ${merged.length}.`,
        );
      } catch {
        alert("Invalid file. Expected a vocab JSON array.");
      }
    });
  };

  // Put this device into the state the backup describes. Replace, don't merge.
  // Merging kept the *local* srs for any word the backup also had (`mergeVocab`
  // prefers existing), so restoring onto a device that already had your words
  // silently threw away the backup's review progress — and words deleted since
  // the backup came back. The vocab-file import above is the one that merges.
  // (parseBackup already normalised/validated these entries.)
  const applyBackup = (data: ParsedBackup) => {
    replaceProgress(data.progress);
    saveUserVocab(data.vocab);
    saveKanjiSkill(data.skill);
    replaceEvents(data.events);
    saveDeckProgress(data.deckProgress);
    saveDeckStats(data.deckStats);

    if (data.settings) {
      const merged = patch(data.settings);
      // keep the on-screen controls in sync with what was just restored
      setNewPerDay(String(merged.newPerDay));
      setWriteNewPerDay(String(merged.writeNewPerDay));
      setDayCutoffHour(merged.dayCutoffHour);
      // The restored ladders may differ from the ones the boxes were scheduled
      // on, and the backup carries `reviewed` — so re-derive rather than leave
      // every due date on the old device's pace.
      rescheduleAll();
    }
    if (data.theme) {
      setThemePref(data.theme);
      setTheme(data.theme);
    }
  };

  const currentBackup = () =>
    buildBackup(
      progress,
      loadUserVocab(),
      loadKanjiSkill(),
      loadEvents(),
      loadDeckProgress(),
      loadDeckStats(),
      loadSettings(),
      getThemePref(),
    );

  const handleBackupExport = async () => {
    download(await serializeBackup(currentBackup()), "kanjii-backup.json.gz");
    // A downloaded file counts as a backup, same as a Drive push — both are what
    // the Home reminder is asking for.
    saveCloudConfig({ ...loadCloudConfig(), lastBackupAt: Date.now() });
  };

  // Reads the file itself rather than its text: a backup is gzipped now, and
  // `readBackupBlob` decides by the magic bytes, so a plain-JSON backup from an
  // older build still restores.
  const handleBackupImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    let data;
    try {
      data = parseBackup(await readBackupBlob(file));
    } catch (err) {
      alert(
        "Couldn't read that backup.\n\n" +
          `${(err as Error).message}\n\n` +
          "Nothing was changed.",
      );
      return;
    }

    const ok = confirm(
      "Restore this backup?\n\n" +
        backupSummary(data, loadUserVocab().length) +
        "\nEverything on this device is replaced by the backup. This cannot be undone.",
    );
    if (!ok) return;

    applyBackup(data);
    alert("Backup restored.");
  };

  // Both cloud buttons are the same shape: block re-entry, show progress, and
  // turn any thrown message into the status line.
  const runCloud = (pending: string, action: () => Promise<string>) => {
    setCloudBusy(true);
    setCloudStatus(pending);
    void action()
      .then(setCloudStatus)
      .catch((err: Error) => setCloudStatus(`⚠️ ${err.message}`))
      .finally(() => {
        setCloudBusy(false);
        // A call can fail because the token died mid-flight; keep the button
        // state honest rather than leaving Back up enabled against no session.
        setDriveReady(isConnected());
      });
  };

  const handleConnect = () =>
    runCloud("Waiting for Google…", async () => {
      await connect();
      saveCloudConfig({ ...loadCloudConfig(), connected: true });
      setDriveReady(true);
      return "✅ Connected to Google Drive.";
    });

  const handleDisconnect = () => {
    disconnect();
    saveCloudConfig({ ...loadCloudConfig(), connected: false });
    setDriveReady(false);
    setCloudStatus("Disconnected. Your backup is still in your Google Drive.");
  };

  const handleCloudPush = () =>
    runCloud("Backing up…", async () => {
      const remote = await fetchRemoteMeta();
      // The one destructive mistake this flow allows: pushing from a device that
      // never restored the other one's work. Nothing merges, so the reviews done
      // elsewhere would just be gone.
      if (remote && remote.exportedAt > loadCloudConfig().lastSyncedAt) {
        const ok = confirm(
          `The backup in Drive was made ${describeAge(remote.exportedAt)}, and this device has never restored it.\n\n` +
            "Backing up now replaces it with this device's data. If you've been practising on your other device since, restore here first instead.\n\n" +
            "Overwrite the backup in Drive?",
        );
        if (!ok) return "Cancelled — nothing was uploaded.";
      }

      const backup = currentBackup();
      await pushBackup(backup);
      saveCloudConfig({
        ...loadCloudConfig(),
        lastSyncedAt: backup.exportedAt,
        lastBackupAt: Date.now(),
      });
      return `✅ Backed up ${backup.vocab.length} words and ${Object.keys(backup.progress).length} kanji statuses to Drive.`;
    });

  const handleCloudPull = () =>
    runCloud("Fetching…", async () => {
      // Same parseBackup the file import uses, so a blob from Drive gets exactly
      // the same validation as one off the disk.
      const data = parseBackup(await pullBackup());
      const ok = confirm(
        `Restore the backup from ${describeAge(data.exportedAt)}?\n\n` +
          backupSummary(data, loadUserVocab().length) +
          "\nEverything on this device is replaced by the backup. This cannot be undone.",
      );
      if (!ok) return "Cancelled — nothing was changed.";

      applyBackup(data);
      saveCloudConfig({
        ...loadCloudConfig(),
        lastSyncedAt: data.exportedAt ?? Date.now(),
      });
      return `✅ Restored ${data.vocab.length} words from the backup made ${describeAge(data.exportedAt)}.`;
    });

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

      <h2 className="settings-section-title">Appearance</h2>

      <div className="settings-card surface-card">
        <strong>Theme</strong>

        <div className="scope-tabs">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`scope-tab${theme === t.id ? " active" : ""}`}
              onClick={() => changeTheme(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <h2 className="settings-section-title">Study</h2>

      <div className="settings-card surface-card">
        <strong>Practice</strong>

        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.romajiInput}
            onChange={(e) => patch({ romajiInput: e.target.checked })}
          />
          <span>Romaji input</span>
        </label>
        <p className="settings-hint">nihon → にほん. Off = your device's IME.</p>

        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.practiceSentences}
            onChange={(e) => patch({ practiceSentences: e.target.checked })}
          />
          <span>Practise example sentences</span>
        </label>
        <p className="settings-hint">
          Self-graded. Needs a sentence and a translation on the word.
        </p>
      </div>

      <div className="settings-card surface-card">
        <strong>Word availability</strong>

        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.partialAvailability}
            onChange={(e) => patch({ partialAvailability: e.target.checked })}
          />
          <span>Unlock at ≥50% of kanji started</span>
        </label>
        <p className="settings-hint">Off = every kanji must be Learning or Known.</p>
      </div>

      <h2 className="settings-section-title">Scheduling</h2>

      <div className="settings-card surface-card">
        <strong>Review pace</strong>

        <p className="settings-description">
          Lower = shorter gaps = more due each day.
        </p>

        {PACE_ROWS.map((row) => (
          <div className="settings-row" key={row.key}>
            <span className="settings-row-label">{row.label}</span>
            <div className="scope-tabs">
              {PACES.map((p) => (
                <button
                  key={p}
                  className={`scope-tab${settings[row.key] === p ? " active" : ""}`}
                  onClick={() => changeSchedule({ [row.key]: p })}
                >
                  {p}×
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="settings-card surface-card">
        <strong>New per day</strong>

        <p className="settings-description">
          Caps new material only — reviews are never capped. 0 = reviews only.
        </p>

        <label className="settings-number">
          <input
            type="number"
            min={0}
            max={200}
            step={1}
            value={newPerDay}
            onChange={(e) => changeCap(e.target.value, setNewPerDay, "newPerDay")}
          />
          <span>words</span>
        </label>

        <label className="settings-number">
          <input
            type="number"
            min={0}
            max={200}
            step={1}
            value={writeNewPerDay}
            onChange={(e) =>
              changeCap(e.target.value, setWriteNewPerDay, "writeNewPerDay")
            }
          />
          <span>kanji to write</span>
        </label>
      </div>

      <div className="settings-card surface-card">
        <strong>Missed answers</strong>

        <p className="settings-description">Where a wrong answer sends an item.</p>

        <div className="scope-tabs">
          {MISSES.map((m) => (
            <button
              key={m.id}
              className={`scope-tab${settings.missBehaviour === m.id ? " active" : ""}`}
              onClick={() => patch({ missBehaviour: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-card surface-card">
        <strong>Day starts at</strong>

        <p className="settings-description">
          Sessions before this count as the previous day.
        </p>

        <label className="settings-number">
          <input
            type="number"
            min={0}
            max={12}
            step={1}
            value={settings.dayCutoffHour}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              if (!Number.isFinite(n) || n < 0 || n > 12) return;
              changeSchedule({ dayCutoffHour: n });
            }}
          />
          <span>:00</span>
        </label>
      </div>

      <h2 className="settings-section-title">Data</h2>

      <div className="settings-card surface-card">
        <strong>Vocabulary</strong>

        <p className="settings-description">
          Import merges a vocab.json file, skipping words you already have.
        </p>

        <div className="settings-actions">
          <button className="settings-button" onClick={handleVocabExport}>
            <strong>📤 Export vocabulary</strong>
          </button>

          <label className="settings-import">
            <strong>📥 Import vocabulary</strong>
            <input
              type="file"
              accept="application/json"
              onChange={handleVocabImport}
              hidden
            />
          </label>
        </div>
      </div>

      <div className="settings-card surface-card">
        <strong>Full backup</strong>

        <p className="settings-description">
          Kanji progress, words, handwriting skill, history and settings in one
          file. Restoring replaces <em>everything</em> on this device.
        </p>

        <div className="settings-actions">
          <button className="settings-button" onClick={handleBackupExport}>
            <strong>📦 Export everything</strong>
          </button>

          <label className="settings-import">
            <strong>📥 Import backup</strong>
            {/* Both, because backups written before compression are plain JSON
                and must still be selectable. */}
            <input
              type="file"
              accept=".gz,application/gzip,.json,application/json"
              onChange={handleBackupImport}
              hidden
            />
          </label>
        </div>
      </div>

      <div className="settings-card surface-card">
        <strong>Google Drive backup</strong>

        {isDriveConfigured() ? (
          <>
            <p className="settings-description">
              The same full backup, kept in your Google Drive. Sign in with the
              same account on both devices — nothing syncs on its own.
            </p>

            <p className="settings-description settings-cloud-note">
              Kanjii only sees the one file it creates,{" "}
              <code>kanjii-backup.json</code>.
            </p>

            {/* Said plainly instead of silently re-authenticating: the sign-in
                lasts an hour, and a page opening a Google popup by itself is
                worse than a sentence explaining why the button is back. */}
            {sessionExpired && (
              <p className="settings-description settings-cloud-note">
                Your Google sign-in has expired — connect again to back up or
                restore.
              </p>
            )}

            <div className="settings-actions">
              {driveReady ? (
                <button
                  className="settings-button"
                  onClick={handleDisconnect}
                  disabled={cloudBusy}
                >
                  <strong>🔓 Disconnect</strong>
                </button>
              ) : (
                <button
                  className="settings-button"
                  onClick={handleConnect}
                  disabled={cloudBusy}
                >
                  <strong>🔗 Connect Google Drive</strong>
                </button>
              )}

              <button
                className="settings-button"
                onClick={handleCloudPush}
                disabled={!driveReady || cloudBusy}
              >
                <strong>☁️ Back up to Drive</strong>
              </button>

              <button
                className="settings-button"
                onClick={handleCloudPull}
                disabled={!driveReady || cloudBusy}
              >
                <strong>📥 Restore from Drive</strong>
              </button>
            </div>

            {cloudStatus && (
              <p className="settings-cloud-status">{cloudStatus}</p>
            )}
          </>
        ) : (
          <p className="settings-description">
            Not set up in this build — needs a Google OAuth client ID in{" "}
            <code>src/lib/googleDrive.ts</code>. Use the full backup above
            instead.
          </p>
        )}
      </div>
    </div>
  );
}
