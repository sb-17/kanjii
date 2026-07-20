// One-file backup of everything the learner has built: kanji statuses, their
// vocab (with per-direction SRS), and handwriting skill. Local-first with no
// accounts, so this file *is* the backup — and the way to move to a new device.
//
// Events (the analytics trend log) are intentionally left out: they're derived,
// device-local, and can grow large. This backs up state you can't recompute.

import type { KanjiProgress } from "../types/kanjiProgress";
import type { Vocab } from "../types/vocabType";
import type { KanjiSkillMap } from "../types/kanjiSkill";
import { parseProgress } from "../storage/kanjiProgress";
import { mergeVocab } from "./vocab";

export const BACKUP_KIND = "kanjii-backup";
export const BACKUP_VERSION = 1;

export type Backup = {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: number;
  progress: KanjiProgress;
  vocab: Vocab[];
  skill: KanjiSkillMap;
};

export function buildBackup(
  progress: KanjiProgress,
  vocab: Vocab[],
  skill: KanjiSkillMap,
): Backup {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    progress,
    vocab,
    skill,
  };
}

// Skip malformed entries rather than throwing — writing skill is non-critical, so
// a partially-corrupt map shouldn't block restoring progress and vocab.
function parseSkill(raw: unknown): KanjiSkillMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: KanjiSkillMap = {};
  for (const [char, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      const s = v as Record<string, unknown>;
      if (
        typeof s.box === "number" &&
        typeof s.due === "number" &&
        typeof s.reviewed === "number"
      ) {
        out[char] = { box: s.box, due: s.due, reviewed: s.reviewed };
      }
    }
  }
  return out;
}

// Validate a parsed JSON blob as a full backup, throwing a user-readable reason if
// it isn't one. The `kind` guard is what stops a bare progress/vocab export (or an
// unrelated file) from being restored as if it were a backup.
export function parseBackup(raw: unknown): {
  progress: KanjiProgress;
  vocab: Vocab[];
  skill: KanjiSkillMap;
} {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("This doesn't look like a Kanjii backup file.");
  }
  const r = raw as Record<string, unknown>;
  if (r.kind !== BACKUP_KIND) {
    throw new Error(
      "This isn't a full backup file. Use the progress/vocabulary import for those.",
    );
  }
  // parseProgress throws on a bad shape; mergeVocab onto an empty list reuses the
  // same item validation + srs normalisation the vocab import already trusts.
  const progress = parseProgress(r.progress);
  const { merged } = mergeVocab([], r.vocab);
  return { progress, vocab: merged, skill: parseSkill(r.skill) };
}
