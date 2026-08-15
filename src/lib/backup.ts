// One-file backup of everything the learner has: kanji statuses, their vocab
// (with per-direction SRS), handwriting skill, the analytics event log (what the
// trend charts are built from), and their settings/theme. Local-first with no
// accounts, so this file *is* the backup — and the way to move to a new device.

import type { KanjiProgress } from "../types/kanjiProgress";
import type { Vocab } from "../types/vocabType";
import type { KanjiSkillMap } from "../types/kanjiSkill";
import type { Settings } from "../types/settingsType";
import type { AppEvent } from "../storage/events";
import type { ThemePref } from "../storage/theme";
import type { DeckProgress } from "../types/deckType";
import { parseProgress } from "../storage/kanjiProgress";
import { mergeVocab } from "./vocab";

export const BACKUP_KIND = "kanjii-backup";
// v2 added events + settings + theme. v3 added imported-deck review progress.
// Older files still import — the extra sections just come back empty/undefined.
export const BACKUP_VERSION = 3;

export type Backup = {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: number;
  progress: KanjiProgress;
  vocab: Vocab[];
  skill: KanjiSkillMap;
  events: AppEvent[];
  // Review boxes for imported decks. The decks' *cards* are deliberately absent —
  // an Anki deck can be megabytes and would ride along on every Drive sync. These
  // entries reattach when the same deck file is imported again, because card ids
  // are derived from card content (see lib/deckImport `cardId`).
  deckProgress: DeckProgress;
  settings?: Settings;
  theme?: ThemePref;
};

export type ParsedBackup = {
  // When the file was written, if it says. Already computed below to date the
  // restored words; exposed because the cloud restore shows the backup's age
  // before you confirm, and records it as this device's last-synced point.
  exportedAt?: number;
  progress: KanjiProgress;
  vocab: Vocab[];
  skill: KanjiSkillMap;
  events: AppEvent[];
  deckProgress: DeckProgress;
  settings?: Partial<Settings>;
  theme?: ThemePref;
};

export function buildBackup(
  progress: KanjiProgress,
  vocab: Vocab[],
  skill: KanjiSkillMap,
  events: AppEvent[],
  deckProgress: DeckProgress,
  settings: Settings,
  theme: ThemePref,
): Backup {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    progress,
    vocab,
    skill,
    events,
    deckProgress,
    settings,
    theme,
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

// Keep well-formed events (a timestamp + a known kind); drop anything else so a
// stray entry can't break the trend math.
function parseEvents(raw: unknown): AppEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is AppEvent => {
    if (!e || typeof e !== "object") return false;
    const o = e as Record<string, unknown>;
    return (
      typeof o.t === "number" &&
      (o.k === "kanji" || o.k === "review" || o.k === "write")
    );
  });
}

// Same forgiving treatment as parseSkill: drop malformed entries rather than
// failing the restore. Deck progress is the least critical section here, and a
// stray entry must not cost someone their kanji statuses.
function parseDeckProgress(raw: unknown): DeckProgress {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DeckProgress = {};
  for (const [deckId, cards] of Object.entries(raw as Record<string, unknown>)) {
    if (!cards || typeof cards !== "object" || Array.isArray(cards)) continue;
    const boxes: DeckProgress[string] = {};
    for (const [cardId, box] of Object.entries(cards as Record<string, unknown>)) {
      if (box && typeof box === "object") {
        const b = box as Record<string, unknown>;
        if (
          typeof b.box === "number" &&
          typeof b.due === "number" &&
          typeof b.reviewed === "number"
        ) {
          boxes[cardId] = { box: b.box, due: b.due, reviewed: b.reviewed };
        }
      }
    }
    if (Object.keys(boxes).length > 0) out[deckId] = boxes;
  }
  return out;
}

function parseTheme(raw: unknown): ThemePref | undefined {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : undefined;
}

function parseSettings(raw: unknown): Partial<Settings> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  // Kept partial — merged onto the current settings on import, so unknown or
  // missing fields fall back to what's already there.
  return raw as Partial<Settings>;
}

// Validate a parsed JSON blob as a full backup, throwing a user-readable reason if
// it isn't one. The `kind` guard is what stops a bare progress/vocab export (or an
// unrelated file) from being restored as if it were a backup.
export function parseBackup(raw: unknown): ParsedBackup {
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

  // Words with no date of their own fall back to when the backup was *exported*,
  // never to now. A restore isn't an addition: the words demonstrably existed by
  // the time the file was written. Dating them "now" made every phone↔PC sync
  // look like a week where hundreds of words were added, and restoring the same
  // old file twice moved them twice. exportedAt is fixed, so it can't drift.
  const exportedAt =
    typeof r.exportedAt === "number" && r.exportedAt > 0
      ? r.exportedAt
      : undefined;
  const { merged } = mergeVocab([], r.vocab, exportedAt);
  return {
    exportedAt,
    progress,
    vocab: merged,
    skill: parseSkill(r.skill),
    events: parseEvents(r.events),
    deckProgress: parseDeckProgress(r.deckProgress),
    settings: parseSettings(r.settings),
    theme: parseTheme(r.theme),
  };
}
