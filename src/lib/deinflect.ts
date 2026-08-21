// Turn an inflected Japanese word back into forms that might be in the
// dictionary. Used by the text reader: 受けやすい is not a dictionary entry, but
// 受ける is, and without this the longest-match scan settles for 受け — which is a
// real word meaning "popularity", so the reader would confidently show a wrong
// meaning rather than no meaning at all. That is the failure this exists to stop.
//
// Deliberately over-generates. Every candidate is checked against the dictionary
// by the caller, so a form that isn't a word costs nothing; a form we failed to
// generate is a word the reader misses. The only real risk is a wrong candidate
// that happens to be a real entry, which is why the rules stay conservative and
// short forms are handled last.
//
// This is not a full deinflector — no keigo, no classical forms, no な-adjective
// copula chains. It covers what shows up in ordinary written Japanese.

// Godan stem rows. A verb's stem vowel shifts by inflection, and mapping it back
// is the whole trick: 読み(ます) → 読む, 読ま(ない) → 読む.
const I_TO_U: Record<string, string> = {
  き: "く", ぎ: "ぐ", し: "す", ち: "つ", に: "ぬ",
  び: "ぶ", み: "む", り: "る", い: "う",
};
const A_TO_U: Record<string, string> = {
  か: "く", が: "ぐ", さ: "す", た: "つ", な: "ぬ",
  ば: "ぶ", ま: "む", ら: "る", わ: "う",
};

// Potential and some passive forms end in an え-row kana + る (書く → 書ける).
// JMdict lists almost none of these, so they have to be mapped back to the
// dictionary form rather than looked up directly.
const E_TO_U: Record<string, string> = {
  え: "う", け: "く", げ: "ぐ", せ: "す", て: "つ",
  ね: "ぬ", べ: "ぶ", め: "む", れ: "る",
};

// From a bare stem, the dictionary form is either stem+る (ichidan: 食べ → 食べる)
// or the stem's last kana shifted back to the う row (godan: 読み → 読む). Which
// one is right depends on the verb, so both are offered.
function fromStem(stem: string, table: Record<string, string>): string[] {
  if (!stem) return [];
  const out = [stem + "る"];
  const last = stem[stem.length - 1];
  if (table[last]) out.push(stem.slice(0, -1) + table[last]);
  return out;
}

// Endings that attach to the い-stem (連用形).
const I_STEM_ENDINGS = [
  "ましょう", "ませんでした", "ません", "ました", "まして", "ます",
  "たがる", "たかった", "たくない", "たい",
  "やすい", "にくい", "すぎる", "すぎ", "ながら", "そう", "つつ",
  "なさい", "かた",
];

// Endings that attach to the あ-stem (未然形).
const A_STEM_ENDINGS = [
  "なかった", "なくて", "なければ", "ない", "ず", "ぬ",
  "られる", "らせる", "せる", "れる", "される", "せられる",
];

// Fixed suffix swaps. Order matters only in that longer patterns are tried
// first — handled by sorting at use, not by the order written here.
const SWAPS: [string, string[]][] = [
  // い-adjectives
  ["くありません", ["い"]], ["かったです", ["い"]],
  ["くなかった", ["い"]], ["くない", ["い"]], ["ければ", ["い"]],
  ["かった", ["い"]], ["くて", ["い"]], ["さ", ["い"]], ["く", ["い"]],
  // て / た forms. The euphonic changes are irregular, so they are listed rather
  // than derived. って → く covers 行く, the one common exception.
  ["って", ["く", "う", "つ", "る"]], ["った", ["く", "う", "つ", "る"]],
  ["んで", ["ぬ", "ぶ", "む"]], ["んだ", ["ぬ", "ぶ", "む"]],
  ["いて", ["く"]], ["いた", ["く"]], ["いで", ["ぐ"]], ["いだ", ["ぐ"]],
  ["して", ["す", "する", ""]], ["した", ["す", "する", ""]],
  ["しない", ["す", "する", ""]], ["しました", ["す", "する", ""]],
  ["ちゃった", ["る", "う", "つ"]], ["ている", ["る"]], ["てる", ["る"]],
  ["て", ["る"]], ["た", ["る"]],
  // conditional / volitional / imperative
  ["れば", ["る"]], ["たら", ["る"]], ["よう", ["る"]], ["ろ", ["る"]],
  // する compounds
  ["します", ["する", ""]], ["される", ["する", ""]], ["できる", [""]],
];

const MAX_DEPTH = 3;

// One deinflection step: every form reachable from `w` by a single rule.
function step(w: string): string[] {
  const out: string[] = [];

  for (const [from, tos] of SWAPS) {
    if (w.length > from.length && w.endsWith(from)) {
      const base = w.slice(0, -from.length);
      for (const to of tos) out.push(base + to);
    }
  }
  for (const end of I_STEM_ENDINGS) {
    if (w.length > end.length && w.endsWith(end)) {
      out.push(...fromStem(w.slice(0, -end.length), I_TO_U));
    }
  }
  for (const end of A_STEM_ENDINGS) {
    if (w.length > end.length && w.endsWith(end)) {
      out.push(...fromStem(w.slice(0, -end.length), A_TO_U));
    }
  }
  // Potential/passive: 書ける → 書く. Applies to anything ending え-row + る, which
  // over-generates (食べる → 食ぶ), but a non-word candidate is free.
  if (w.length > 2 && w.endsWith("る")) {
    const kana = w[w.length - 2];
    if (E_TO_U[kana]) out.push(w.slice(0, -2) + E_TO_U[kana]);
  }
  return out;
}

// Every plausible dictionary form of `word`, including `word` itself first — the
// caller should prefer an exact hit over a deinflected one.
export function deinflect(word: string): string[] {
  const seen = new Set<string>([word]);
  const order: string[] = [word];
  let frontier = [word];

  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
    const next: string[] = [];
    for (const w of frontier) {
      for (const cand of step(w)) {
        if (!cand || seen.has(cand)) continue;
        seen.add(cand);
        order.push(cand);
        next.push(cand);
      }
    }
    frontier = next;
  }
  return order;
}
