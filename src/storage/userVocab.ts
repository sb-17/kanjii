import type { Vocab } from "../types/vocabType";
import { readWithMigration, writeValue } from "./db";

const STORAGE_KEY = "kanjii:userVocab";

// The user's own vocabulary, stored in IndexedDB. In-memory cache hydrated once
// at startup so reads stay synchronous; writes persist async.
let cache: Vocab[] = [];

export async function hydrateUserVocab(): Promise<void> {
  cache = (await readWithMigration<Vocab[]>(STORAGE_KEY)) ?? [];
}

export function loadUserVocab(): Vocab[] {
  return cache;
}

export function saveUserVocab(list: Vocab[]): void {
  cache = list;
  void writeValue(STORAGE_KEY, list);
}
