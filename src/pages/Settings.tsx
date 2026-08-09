import { useState } from "react";
import "../styles/Settings.css";
import { useProgress } from "../context/ProgressContext";
import { parseProgress } from "../storage/kanjiProgress";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { loadKanjiSkill, saveKanjiSkill } from "../storage/kanjiSkill";
import { loadEvents, replaceEvents } from "../storage/events";
import { loadSettings, saveSettings } from "../storage/settings";
import { mergeVocab } from "../lib/vocab";
import { vocabGrowth } from "../lib/analytics";
import { buildBackup, parseBackup } from "../lib/backup";
import { getThemePref, setThemePref, type ThemePref } from "../storage/theme";

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

  // TEMPORARY — see the matching Settings card. Deliberately a button rather than
  // anything automatic: it rewrites real dates, so it happens when you say so.
  //
  // A bulk import carries no dates of its own, so mergeVocab stamps the whole file
  // with a single timestamp. Every word from one import therefore shares an
  // *identical* addedAt, and that's what tells an import apart from words added by
  // hand — which is why hundreds of them pile into one column of the growth chart
  // and flatten the weeks you actually built up.
  const handleBackfillDates = () => {
    const vocab = loadUserVocab();
    const now = Date.now();
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    const BULK_MIN = 20; // below this it's a real week's work, not an import

    const byStamp = new Map<number, number>();
    let undated = 0;
    for (const v of vocab) {
      if (typeof v.addedAt !== "number") undated++;
      else byStamp.set(v.addedAt, (byStamp.get(v.addedAt) ?? 0) + 1);
    }

    // Only groups inside the chart's window matter — one already older than that
    // is counted as history and isn't distorting anything.
    const bulk = [...byStamp.entries()].filter(
      ([t, n]) => n >= BULK_MIN && now - t < 8 * WEEK,
    );
    const bulkCount = bulk.reduce((sum, [, n]) => sum + n, 0);

    if (bulkCount === 0 && undated === 0) {
      const g = vocabGrowth(vocab, 8, now);
      const buckets = g.buckets
        .map((b) => `  ${b.label.padStart(3)}: ${b.count}`)
        .join("\n");
      alert(
        "Nothing to change — no undated words, and no group of words sharing " +
          "an import timestamp inside the chart's 8-week window.\n\n" +
          `Growth chart buckets:\n${buckets}\n  older: ${g.older}\n` +
          `  undated: ${g.untracked}`,
      );
      return;
    }

    // Nine weeks back: past the chart's window, so these are reported as "added
    // earlier" rather than drawn as a bar.
    const stamp = now - 9 * WEEK;
    const targets = new Set(bulk.map(([t]) => t));

    const lines = [
      ...bulk.map(
        ([t, n]) =>
          `  • ${n} words sharing ${new Date(t).toLocaleDateString()}`,
      ),
      ...(undated ? [`  • ${undated} undated words`] : []),
    ].join("\n");

    const ok = confirm(
      `Move these words into your history?\n\n${lines}\n\n` +
        `They'll be dated ${new Date(stamp).toLocaleDateString()}, before the ` +
        "growth chart's window, so it shows the words you added yourself instead " +
        "of one import.\n\n" +
        'Also affects: they leave Practice\'s "Recent" scope, and hand-added ' +
        "words get introduced before them. Words added individually are untouched.",
    );
    if (!ok) return;

    saveUserVocab(
      vocab.map((v) =>
        typeof v.addedAt !== "number" || targets.has(v.addedAt)
          ? { ...v, addedAt: stamp }
          : v,
      ),
    );
    alert(`Moved ${bulkCount + undated} words into your history.`);
  };

  const handleExport = () => downloadJson(progress, "kanjii-progress.json");

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    readFile(e.target, (text) => {
      let data;
      try {
        data = parseProgress(JSON.parse(text));
      } catch (err) {
        alert(
          "This doesn't look like a kanji progress export.\n\n" +
            `${(err as Error).message}\n\n` +
            "Your progress has not been changed.",
        );
        return;
      }

      const tracked = Object.keys(progress).length;
      const ok = confirm(
        `Import ${Object.keys(data).length} kanji statuses?\n\n` +
          `This replaces your current progress (${tracked} kanji tracked) and cannot be undone.`,
      );
      if (!ok) return;

      replaceProgress(data);
      alert("Progress imported successfully!");
    });
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

  const handleBackupExport = () =>
    downloadJson(
      buildBackup(
        progress,
        loadUserVocab(),
        loadKanjiSkill(),
        loadEvents(),
        loadSettings(),
        getThemePref(),
      ),
      "kanjii-backup.json",
    );

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

      const localWords = loadUserVocab().length;
      const ok = confirm(
        "Restore this backup?\n\n" +
          `• ${Object.keys(data.progress).length} kanji statuses — replaces your current progress\n` +
          `• ${data.vocab.length} words — replaces your current ${localWords} word${localWords === 1 ? "" : "s"}\n` +
          `• ${Object.keys(data.skill).length} handwriting-skill entries — replaces current\n` +
          `• ${data.events.length} analytics events — replaces your trend history\n` +
          (data.settings || data.theme ? "• settings & theme\n" : "") +
          "\nEverything on this device is replaced by the backup. This cannot be undone.",
      );
      if (!ok) return;

      replaceProgress(data.progress);
      // Replace, don't merge. Merging kept the *local* srs for any word the backup
      // also had (`mergeVocab` prefers existing), so restoring onto a device that
      // already had your words silently threw away the backup's review progress —
      // and words deleted since the backup came back. A restore puts the device
      // back in the state the file describes; the vocab-file import above is the
      // one that merges. (parseBackup already normalised/validated these entries.)
      saveUserVocab(data.vocab);
      saveKanjiSkill(data.skill);
      replaceEvents(data.events);

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

      alert("Backup restored.");
    });
  };

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
          With romaji input on, English → Japanese answers convert as you type
          (nihon → にほん), so your keyboard can stay on English for both
          directions. The reading counts as a correct answer. Turn it off to type
          Japanese with your device's own IME.
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
          The Due scope always shows every review that's come round, then tops up
          with this many words you've never practised. Reviews are never capped —
          this only paces how fast a backlog gets fed in, so a large imported list
          can't bury the words you're actually reviewing. Set it to 0 to work
          through reviews only.
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
          A word normally unlocks for Cards and Practice only once every kanji in
          it is marked Learning or Known. Turn this on to unlock a word as soon as
          most (at least half) of its kanji are started — so one unfamiliar kanji
          doesn't hide a word you deliberately added.
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

      {/* TEMPORARY — remove this card and handleBackfillDates above once run. */}
      <div className="settings-card surface-card">
        <strong>Move older words into history</strong>

        <p className="settings-description">
          An imported word list carries no dates of its own, so every word in it
          shares the moment it was imported — which is why one import fills a single
          column of the growth chart and flattens the weeks you actually built up.
          This finds groups of words sharing one timestamp (and any undated words)
          and dates them before the chart's window, so it shows the words you added
          yourself. Words you added one at a time are left alone. Nothing happens
          until you confirm, and it tells you exactly what it found first.
        </p>

        <div className="settings-actions">
          <button className="settings-button" onClick={handleBackfillDates}>
            <strong>📅 Move older words into history</strong>
          </button>
        </div>
      </div>

      <div className="settings-card surface-card">
        <strong>Kanji progress</strong>

        <p className="settings-description">
          Your kanji statuses (New / Learning / Known) are stored locally on this
          device. Export to back them up or move them to another device; importing
          replaces your current progress.
        </p>

        <div className="settings-actions">
          <button className="settings-button" onClick={handleExport}>
            <strong>📤 Export progress</strong>
          </button>

          <label className="settings-import">
            <strong>📥 Import progress</strong>
            <input
              type="file"
              accept="application/json"
              onChange={handleImport}
              hidden
            />
          </label>
        </div>
      </div>

      <div className="settings-card surface-card">
        <strong>Vocabulary</strong>

        <p className="settings-description">
          Your words are stored locally on this device. Export to back them up or
          move them to another device; import merges a vocab.json file (duplicate
          word + reading entries are skipped).
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
          Everything in one file — kanji progress, your words (with review
          progress), handwriting skill, your analytics history, and your
          settings/theme. Use it to back up or move to another device. Restoring
          replaces <em>everything</em> on this device with the backup's contents,
          including your word list — to merge a word list instead, use the
          vocabulary import above.
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
    </div>
  );
}
