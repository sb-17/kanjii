// Ordered. "mastered" is a finer grade of "known" (can write and read it ~99% of
// the time) and is purely a label: everywhere the app asks "is this known?" it
// counts as known — see `isAtLeastKnown`. Only the places that show the tags
// themselves tell the two apart.
export type KanjiStatus = "new" | "learning" | "known" | "mastered";

export type KanjiProgress = Record<string, KanjiStatus>;
