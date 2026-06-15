import "../styles/Settings.css";
import type { KanjiProgress } from "../types/kanjiProgress";
import { useProgress } from "../context/ProgressContext";
import { loadUserVocab, saveUserVocab } from "../storage/userVocab";
import { mergeVocab } from "../lib/vocab";

export default function Settings() {
  const { progress, replaceProgress } = useProgress();

  const handleExport = () => {
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
        replaceProgress(data);
        alert("Progress imported successfully!");
      } catch {
        alert("Invalid file. Please select a valid progress export.");
      }
    };

    reader.readAsText(file);
  };

  const handleVocabExport = () => {
    const blob = new Blob([JSON.stringify(loadUserVocab(), null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kanjii-vocab.json";
    a.click();

    URL.revokeObjectURL(url);
  };

  const handleVocabImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        const { merged, added } = mergeVocab(loadUserVocab(), data);
        saveUserVocab(merged);
        alert(
          `Imported — ${added} new word${added === 1 ? "" : "s"}. You now have ${merged.length}.`,
        );
      } catch {
        alert("Invalid file. Expected a vocab JSON array.");
      }
    };

    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

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
