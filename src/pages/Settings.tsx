import { useState } from "react";
import "../styles/Settings.css";
import { useProgress } from "../context/ProgressContext";
import { parseProgress } from "../storage/kanjiProgress";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { loadSettings, saveSettings } from "../storage/settings";
import { mergeVocab } from "../lib/vocab";
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
    </div>
  );
}
