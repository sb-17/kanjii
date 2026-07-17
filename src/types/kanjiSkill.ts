import type { Srs } from "../lib/srs";

// How well the learner can *write* a kanji from memory, tracked separately from
// their manual status tag (see [[kanjiProgress]]). Two orthogonal axes: status is
// intent ("I'm studying this"), skill is earned evidence ("I've written it from
// memory, spaced out, N times"). The Leitner box is the level.
//
// Reuses the vocab SRS shape — same boxes, same intervals (lib/srs.ts).
export type KanjiSkill = Srs;

export type KanjiSkillMap = Record<string, KanjiSkill>;
