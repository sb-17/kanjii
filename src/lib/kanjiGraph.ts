// Runtime side of the kanji connection map.
//
// Builds inverted indexes once (component -> kanji, phonetic -> kanji, on-yomi
// reading -> kanji) from the precomputed graph (src/data/kanjiGraph.json, see
// scripts/build-kanji-graph.mjs) plus kanji.json, then answers focused
// "neighborhood" queries for one kanji at a time (hub-and-spoke).

import graphRaw from "../data/kanjiGraph.json";
import { ALL_KANJI, getKanji, hasKanji } from "./kanjiIndex";

type GraphEntry = { c: string[]; p?: string; r?: string };
const graph = graphRaw as Record<string, GraphEntry>;

export type GraphMode = "shapes" | "sounds";
export type ConnectorKind = "phon" | "radical" | "component" | "reading";

export type Connector = {
  /** The shared element: a component kanji (shapes) or a kana reading (sounds). */
  el: string;
  kind: ConnectorKind;
  /** Whether `el` is itself one of our kanji and can be recentered on. */
  clickable: boolean;
  /** Neighboring kanji that connect through `el`, most frequent first. */
  kanji: string[];
};

export type Neighborhood = {
  center: string;
  connectors: Connector[];
};

// Tuning: keep each neighborhood small so the graph stays readable and fast.
const MAX_NEIGHBORS = 20;
const PER_CONNECTOR = 9;
// Components shared by more than this many kanji are too generic to be a useful
// link (e.g. 口, 一), so they're skipped — except the phonetic component, which
// is always shown because it's the strongest signal.
const MAX_COMPONENT_GROUP = 40;

export function isMappableKanji(char: string): boolean {
  return hasKanji(char);
}

// ---- Indexes (built lazily, once) ----
let componentIndex: Map<string, string[]> | null = null;
let phonIndex: Map<string, string[]> | null = null;
let readingIndex: Map<string, string[]> | null = null;

function buildIndexes() {
  if (componentIndex) return;
  componentIndex = new Map();
  phonIndex = new Map();
  readingIndex = new Map();

  const add = (map: Map<string, string[]>, key: string, char: string) => {
    const arr = map.get(key);
    if (arr) arr.push(char);
    else map.set(key, [char]);
  };

  for (const k of ALL_KANJI) {
    const g = graph[k.character];
    if (g) {
      for (const c of g.c) add(componentIndex, c, k.character);
      if (g.p) add(phonIndex, g.p, k.character);
    }
    for (const r of k.on) add(readingIndex, r, k.character);
  }
}

const freqOf = (char: string) => getKanji(char)?.frequency ?? Number.MAX_SAFE_INTEGER;
const byFrequency = (a: string, b: string) => freqOf(a) - freqOf(b);

const neighborhoodCache = new Map<string, Neighborhood>();

export function getNeighborhood(center: string, mode: GraphMode): Neighborhood {
  const cacheKey = `${mode}:${center}`;
  const cached = neighborhoodCache.get(cacheKey);
  if (cached) return cached;

  buildIndexes();
  const result: Neighborhood = {
    center,
    connectors: mode === "shapes" ? shapeConnectors(center) : soundConnectors(center),
  };
  neighborhoodCache.set(cacheKey, result);
  return result;
}

function shapeConnectors(center: string): Connector[] {
  const g = graph[center];
  if (!g) return [];

  const seen = new Set<string>([center]);
  const connectors: Connector[] = [];
  let total = 0;

  const tryAdd = (el: string, kind: ConnectorKind, pool: string[]) => {
    if (total >= MAX_NEIGHBORS) return;
    const kanji = pool
      .filter((c) => !seen.has(c))
      .sort(byFrequency)
      .slice(0, PER_CONNECTOR);
    if (kanji.length === 0) return;
    kanji.forEach((c) => seen.add(c));
    total += kanji.length;
    connectors.push({ el, kind, clickable: isMappableKanji(el), kanji });
  };

  // Phonetic family first — the strongest shape+sound signal (寺 → 持待特詩…).
  if (g.p) tryAdd(g.p, "phon", phonIndex!.get(g.p) ?? []);

  // Then other shared components, rarest first (a rare shared part is a stronger
  // visual link than a ubiquitous one), skipping over-generic components.
  const others = g.c
    .filter((c) => c !== g.p)
    .map((c) => ({ c, size: (componentIndex!.get(c) ?? []).length }))
    .filter((o) => o.size > 1 && o.size <= MAX_COMPONENT_GROUP)
    .sort((a, b) => a.size - b.size);

  for (const { c } of others) {
    tryAdd(c, c === g.r ? "radical" : "component", componentIndex!.get(c) ?? []);
  }

  return connectors;
}

function soundConnectors(center: string): Connector[] {
  const k = getKanji(center);
  if (!k) return [];

  const seen = new Set<string>([center]);
  const connectors: Connector[] = [];
  let total = 0;

  // Group by on-yomi reading; most specific (smallest) groups first.
  const readings = k.on
    .map((r) => ({ r, size: (readingIndex!.get(r) ?? []).length }))
    .filter((o) => o.size > 1)
    .sort((a, b) => a.size - b.size);

  for (const { r } of readings) {
    if (total >= MAX_NEIGHBORS) break;
    const kanji = (readingIndex!.get(r) ?? [])
      .filter((c) => !seen.has(c))
      .sort(byFrequency)
      .slice(0, PER_CONNECTOR);
    if (kanji.length === 0) continue;
    kanji.forEach((c) => seen.add(c));
    total += kanji.length;
    connectors.push({ el: r, kind: "reading", clickable: false, kanji });
  }

  return connectors;
}
