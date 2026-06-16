export type Vocab = {
  word: string;
  reading: string;
  meanings: string[];
  kanji: string[];
  // Optional, user-added: freeform context / notes / example sentence.
  context?: string;
  // Optional: epoch ms when the word was first added (used for "recently added").
  addedAt?: number;
};
