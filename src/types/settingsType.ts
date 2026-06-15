export type WriteMode = "screen" | "paper";

export type WritePool = "both" | "learning" | "known";

export type Settings = {
  writeMode: WriteMode;
  guide: boolean;
  writePool: WritePool;
};
