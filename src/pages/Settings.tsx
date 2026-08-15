import { useEffect, useState } from "react";
import "../styles/Settings.css";
import { useProgress } from "../context/ProgressContext";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { loadKanjiSkill, saveKanjiSkill } from "../storage/kanjiSkill";
import { loadEvents, replaceEvents } from "../storage/events";
import { loadDeckProgress, saveDeckProgress } from "../storage/deckProgress";
import { loadDeckStats, saveDeckStats } from "../storage/deckStats";
import { loadSettings, saveSettings } from "../storage/settings";
import { mergeVocab } from "../lib/vocab";
import { buildBackup, parseBackup, type ParsedBackup } from "../lib/backup";
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
  reconnectSilently,
} from "../lib/googleDrive";

const THEMES: { id: ThemePref; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  // Revoking synchronously cancels the download in some browsers — let the click
  // be handled first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
  const [romajiInput, setRomajiInput] = useState(
    () => loadSettings().romajiInput,
  );
  const [partialAvailability, setPartialAvailability] = useState(
    () => loadSettings().partialAvailability,
  );
  // Held as text so the field can be emptied while retyping; an unparseable value
  // just isn't saved, leaving the stored setting alone.
  const [newPerDay, setNewPerDay] = useState(() =>
    String(loadSettings().newPerDay),
  );

  const [driveReady, setDriveReady] = useState(isConnected);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("");

  // The stored token covers most reloads; this is for when it has expired. Ask
  // Google for a new one rather than making the user click Connect again. Silent
  // by design: it shows nothing and fails to `false` when there's no session.
  useEffect(() => {
    if (!loadCloudConfig().connected || isConnected()) return;
    let cancelled = false;
    void reconnectSilently().then((ok) => {
      if (!cancelled) setDriveReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeTheme = (next: ThemePref) => {
    setTheme(next);
    setThemePref(next);
  };

  const changeRomajiInput = (next: boolean) => {
    setRomajiInput(next);
    saveSettings({ ...loadSettings(), romajiInput: next });
  };

  const changePartialAvailability = (next: boolean) => {
    setPartialAvailability(next);
    saveSettings({ ...loadSettings(), partialAvailability: next });
  };

  const changeNewPerDay = (raw: string) => {
    setNewPerDay(raw);
    const n = Math.floor(Number(raw));
    if (raw.trim() === "" || !Number.isFinite(n) || n < 0) return;
    saveSettings({ ...loadSettings(), newPerDay: Math.min(n, 200) });
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
      const mergedSettings = { ...loadSettings(), ...data.settings };
      saveSettings(mergedSettings);
      // keep the on-screen toggles in sync with what was just restored
      setRomajiInput(mergedSettings.romajiInput);
      setPartialAvailability(mergedSettings.partialAvailability);
      setNewPerDay(String(mergedSettings.newPerDay));
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

  const handleBackupExport = () =>
    downloadJson(currentBackup(), "kanjii-backup.json");

  const handleBackupImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    readFile(e.target, (text) => {
      let data;
      try {
        data = parseBackup(JSON.parse(text));
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
    });
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
      saveCloudConfig({ ...loadCloudConfig(), lastSyncedAt: backup.exportedAt });
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

      <div className="settings-card surface-card">
        <strong>Appearance</strong>

        <p className="settings-description">
          Choose a light or dark look, or follow your device's system setting.
        </p>

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

      <div className="settings-card surface-card">
        <strong>Practice</strong>

        <p className="settings-description">
          Converts as you type (nihon → にほん), so your keyboard can stay on
          English. Off = use your device's IME.
        </p>

        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={romajiInput}
            onChange={(e) => changeRomajiInput(e.target.checked)}
          />
          <span>Romaji input in Practice</span>
        </label>
      </div>

      <div className="settings-card surface-card">
        <strong>New words per day</strong>

        <p className="settings-description">
          How many never-practised words the Due scope adds after your reviews.
          Reviews are never capped. 0 = reviews only.
        </p>

        <label className="settings-number">
          <input
            type="number"
            min={0}
            max={200}
            step={1}
            value={newPerDay}
            onChange={(e) => changeNewPerDay(e.target.value)}
          />
          <span>new words per day</span>
        </label>
      </div>

      <div className="settings-card surface-card">
        <strong>Word availability</strong>

        <p className="settings-description">
          Words normally unlock only when every kanji in them is Learning or
          Known, so one unfamiliar kanji can hide a word.
        </p>

        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={partialAvailability}
            onChange={(e) => changePartialAvailability(e.target.checked)}
          />
          <span>Unlock words when ≥50% of their kanji are started</span>
        </label>
      </div>

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
            <input
              type="file"
              accept="application/json"
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
