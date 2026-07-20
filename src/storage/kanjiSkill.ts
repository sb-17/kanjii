import type { KanjiSkill, KanjiSkillMap } from "../types/kanjiSkill";
import { readWithMigration, writeValue } from "./db";

// Handwriting-skill SRS state, keyed by character. Separate store from kanji
// status tags on purpose — automation writes here, never to the tags. Same
// in-memory-cache-hydrated-once pattern as kanjiProgress, so reads are sync.
const STORAGE_KEY = "kanjii:kanjiSkill";

let cache: KanjiSkillMap = {};

export async function hydrateKanjiSkill(): Promise<void> {
  cache = (await readWithMigration<KanjiSkillMap>(STORAGE_KEY)) ?? {};
}

export function loadKanjiSkill(): KanjiSkillMap {
  return cache;
}

// Replace the whole skill map (used by full-backup restore). Per-kanji edits go
// through updateKanjiSkill instead.
export function saveKanjiSkill(map: KanjiSkillMap): void {
  cache = map;
  void writeValue(STORAGE_KEY, map);
}

// Set (or clear, with undefined) one kanji's skill and persist. Returns the new
// map so callers can drive local state from it.
export function updateKanjiSkill(
  character: string,
  skill: KanjiSkill | undefined,
): KanjiSkillMap {
  const next = { ...cache };
  if (skill) next[character] = skill;
  else delete next[character];

  cache = next;
  void writeValue(STORAGE_KEY, next);
  return next;
}
