export type WriteMode = "screen" | "paper";

export type WritePool = "both" | "learning" | "known";

export type PracticeScope = "smart" | "recent" | "all" | "new";

export type Settings = {
  writeMode: WriteMode;
  guide: boolean;
  writePool: WritePool;
  practiceScope: PracticeScope;
};
