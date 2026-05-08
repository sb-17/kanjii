import "../styles/Settings.css";
import { useState } from "react";
import { loadKanjiProgress, saveKanjiProgress } from "../storage/kanjiProgress";
import { loadSettings, saveSettings } from "../storage/settings";
import type { KanjiProgress } from "../types/kanjiProgress";
import type { Settings } from "../types/settingsType";

export default function Settings() {
  const [practiceSettings, setPracticeSettings] = useState<Settings>(loadSettings());

  const handleExport = () => {
    const progress = loadKanjiProgress();
    const blob = new Blob([JSON.stringify(progress, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kanjii-progress.json";
    a.click();

    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as KanjiProgress;
        console.log(data);
        saveKanjiProgress(data);
        alert("Progress imported successfully! Reloading…");
        window.location.reload();
      } catch {
        alert("Invalid file. Please select a valid progress export.");
      }
    };

    reader.readAsText(file);
  };

  const handlePracticeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, checked } = e.target;

    const settings = loadSettings();

    const updatedSettings: Settings = {
        ...settings,
        [id]: checked,
    };

    setPracticeSettings(updatedSettings);
    saveSettings(updatedSettings);
  };

  return (
    <div className="settings-page">
      <h1 className="settings-title">Settings</h1>

      <div className="settings-card">
        <strong>Progress & Data</strong>

        <p className="settings-description">
          Your learning progress is stored locally on this device. If you remove
          the app or clear data, it will be lost. Use export/import to back it
          up.
        </p>

        <div className="settings-actions">
          <button className="settings-button" onClick={handleExport}>
            <strong>📥 Export progress</strong>
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
      <div className="settings-card">
        <strong>Practice</strong>

        <p className="settings-description">
          Select what you want to practice.
        </p>

        <div className="settings-actions">
          <input type="checkbox" id="kanji" name="settings-checkbox-kanji" checked={practiceSettings.kanji} onChange={handlePracticeChange} />
          <label>Kanji</label>
          <input type="checkbox" id="vocab" name="settings-checkbox-vocab" checked={practiceSettings.vocab} onChange={handlePracticeChange} />
          <label>Vocabulary</label>
        </div>
      </div>
    </div>
  );
}
