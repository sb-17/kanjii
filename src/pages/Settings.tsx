import "../styles/Settings.css";
import type { KanjiProgress } from "../types/kanjiProgress";
import { useProgress } from "../context/ProgressContext";

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

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

      <div className="settings-card surface-card">
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
    </div>
  );
}
