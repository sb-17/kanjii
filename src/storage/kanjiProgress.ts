import type { KanjiProgress, KanjiStatus } from "../types/kanjiProgress";

const STORAGE_KEY = "kanjii:progress";

export function loadKanjiProgress(): KanjiProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveKanjiProgress(progress: KanjiProgress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function updateKanjiStatus(
  progress: KanjiProgress,
  kanji: string,
  status: KanjiStatus
): KanjiProgress {
  const next = {
    ...progress,
    [kanji]: status,
  };

  saveKanjiProgress(next);
  return next;
}

export function isKnownOrLearning(status: KanjiStatus | undefined) {
  return status === "known" || status === "learning";
}

export function getStatusCounts(progress: KanjiProgress): Record<KanjiStatus, number> {
  const counts: Record<KanjiStatus, number> = {
    new: 0,
    learning: 0,
    known: 0,
  };

  Object.values(progress).forEach((status) => {
    if (counts[status] !== undefined) {
      counts[status]++;
    }
  });

  return counts;
}