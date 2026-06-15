// Shared helpers for loading and parsing KanjiVG stroke data
// (files live in public/kanjiVG/<codepoint>.svg, served under the /kanjii base).

// "山" -> "05c71.svg"
export function kanjiToSvgName(kanji: string): string {
  const codePoint = kanji.codePointAt(0);
  if (!codePoint) throw new Error("Invalid kanji");
  return codePoint.toString(16).padStart(5, "0") + ".svg";
}

// Pull the ordered stroke path `d` attributes out of a KanjiVG SVG string.
export function parseStrokePaths(svgText: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");

  const groups = Array.from(doc.getElementsByTagName("g"));
  const strokeGroup = groups.find((g) => g.id && g.id.includes("StrokePaths"));
  if (!strokeGroup) return [];

  return Array.from(strokeGroup.getElementsByTagName("path"))
    .map((p) => p.getAttribute("d"))
    .filter((d): d is string => Boolean(d));
}

// Parsed strokes are cached for the session so repeated practice of the same
// kanji (and revisits) are instant instead of re-fetching + re-parsing the SVG.
const strokeCache = new Map<string, string[]>();

// Fetch + parse a kanji's ordered stroke paths. Returns [] if unavailable.
export async function loadKanjiStrokes(kanji: string): Promise<string[]> {
  const cached = strokeCache.get(kanji);
  if (cached) return cached;

  const fileName = kanjiToSvgName(kanji);
  try {
    const res = await fetch(`/kanjii/kanjiVG/${fileName}`);
    if (!res.ok) {
      console.error("KanjiVG not found:", fileName);
      return [];
    }
    const paths = parseStrokePaths(await res.text());
    strokeCache.set(kanji, paths);
    return paths;
  } catch (err) {
    console.error("Error loading KanjiVG:", err);
    return [];
  }
}

// The start point (the `M x y`) of a stroke path's `d`, for drawing order dots.
export function strokeStartPoint(d: string): { x: number; y: number } | null {
  const match = d.match(/M\s*([\d.]+)[ ,]([\d.]+)/);
  if (!match) return null;
  return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
}
