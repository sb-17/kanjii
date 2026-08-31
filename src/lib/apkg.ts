// Reading Anki's own `.apkg` export, so a deck downloaded from AnkiWeb can be
// imported directly instead of being re-exported as text from Anki desktop.
//
// An `.apkg` is a ZIP holding a SQLite collection database plus the deck's media
// as numbered files. Anki 2.1.50+ writes `collection.anki21b`, which is that
// database compressed with zstd; older versions write `collection.anki21` (or
// `collection.anki2`) straight into the ZIP.
//
// The file is read through `Blob.slice`, never all at once: a deck with audio
// runs to hundreds of megabytes and pulling that into an ArrayBuffer is how the
// import fails on a phone. Only the collection entry is ever decompressed.
//
// Media is otherwise ignored. The fields that reference it carry `[sound:...]`
// and `<img>` markup, and `cleanField` strips both.

import { decompress as unzstd } from "fzstd";
import { readTable } from "./sqliteRead";

// --- ZIP --------------------------------------------------------------------

type Entry = {
  name: string;
  method: number;
  compressedSize: number;
  headerOffset: number;
};

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

// ZIP stores its sizes and offsets in 32 bits and escapes to a ZIP64 extra field
// past that. Only a deck over 4 GB reaches it, so it's reported rather than
// implemented — silently reading from offset 0xffffffff would be worse.
const ZIP64 = 0xffffffff;

async function bytes(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

const viewOf = (b: Uint8Array) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength);

// The central directory is at the end of the file, behind a comment of unknown
// length, so it's found by scanning back for the end-of-central-directory
// signature. The comment length field is 16 bits, hence the 64 KB bound.
async function listEntries(file: Blob): Promise<Entry[]> {
  const tailStart = Math.max(0, file.size - 22 - 0xffff);
  const tail = await bytes(file, tailStart, file.size);
  const tailView = viewOf(tail);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("That file isn't a valid .apkg.");

  const count = tailView.getUint16(eocd + 10, true);
  const size = tailView.getUint32(eocd + 12, true);
  const offset = tailView.getUint32(eocd + 16, true);
  if (offset === ZIP64 || size === ZIP64) {
    throw new Error("That .apkg is too large to read here.");
  }

  const directory = await bytes(file, offset, offset + size);
  const view = viewOf(directory);
  const decoder = new TextDecoder("utf-8");
  const entries: Entry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > directory.length || view.getUint32(p, true) !== CENTRAL) break;
    const nameLength = view.getUint16(p + 28, true);
    entries.push({
      name: decoder.decode(directory.subarray(p + 46, p + 46 + nameLength)),
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      headerOffset: view.getUint32(p + 42, true),
    });
    p +=
      46 +
      nameLength +
      view.getUint16(p + 30, true) +
      view.getUint16(p + 32, true);
  }
  return entries;
}

async function extract(file: Blob, entry: Entry): Promise<Uint8Array> {
  if (entry.headerOffset === ZIP64 || entry.compressedSize === ZIP64) {
    throw new Error("That .apkg is too large to read here.");
  }
  // The local header repeats the name and extra fields, and its extra field can
  // be a different length from the central directory's — so the data offset has
  // to be read from the local header, not computed from the central one.
  const header = await bytes(file, entry.headerOffset, entry.headerOffset + 30);
  const view = viewOf(header);
  const start =
    entry.headerOffset +
    30 +
    view.getUint16(26, true) +
    view.getUint16(28, true);
  const raw = await bytes(file, start, start + entry.compressedSize);

  if (entry.method === 0) return raw;
  if (entry.method !== 8) {
    throw new Error("That .apkg uses a compression method we can't read.");
  }
  // Safari only got DecompressionStream in 16.4, so an older iPhone reaches this
  // with the global missing and would otherwise fail on a bare ReferenceError.
  // Anki 2.1.50+ files store their collection uncompressed inside the ZIP (it's
  // already zstd), so this is only on the path for older exports — worth naming
  // the way out rather than just the obstacle.
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "This browser is too old to unpack that deck. Update iOS/your browser, or re-export the deck from a newer Anki.",
    );
  }
  const stream = new Blob([raw as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// --- Notes ------------------------------------------------------------------

// Anki separates a note's fields with this, in the database and in text exports
// alike. Written as an escape rather than a raw control character, which is
// invisible in the source and easy to delete by accident.
const FIELD_SEPARATOR = "\u001f";

// Newest first: when two are present, the older is a stub kept for clients that
// can't read the newer schema.
const COLLECTIONS = [
  "collection.anki21b",
  "collection.anki21",
  "collection.anki2",
];

// Field names per note type, used to label the column pickers. Anki 2.1.28 moved
// these out of a JSON blob in `col` into real tables; both layouts are still in
// circulation, since an `.apkg` is written by whichever version exported it.
function readFieldNames(db: Uint8Array, notetype: number): string[] {
  const fields = readTable(db, "fields");
  if (fields) {
    const ntid = fields.columns.indexOf("ntid");
    const ord = fields.columns.indexOf("ord");
    const name = fields.columns.indexOf("name");
    return fields.rows
      .filter((r) => Number(r[ntid]) === notetype)
      .sort((a, b) => Number(a[ord]) - Number(b[ord]))
      .map((r) => String(r[name] ?? ""));
  }

  const col = readTable(db, "col");
  const models = col?.rows[0]?.[col.columns.indexOf("models")];
  if (typeof models !== "string") return [];
  try {
    const parsed = JSON.parse(models) as Record<
      string,
      { flds?: { name?: string; ord?: number }[] }
    >;
    return [...(parsed[String(notetype)]?.flds ?? [])]
      .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
      .map((f) => f.name ?? "");
  } catch {
    // A model blob we can't read costs nothing but nicer labels.
    return [];
  }
}

export type ApkgNotes = {
  rows: string[][];
  // Empty when the file's schema didn't yield names; the pickers fall back to
  // column numbers.
  fieldNames: string[];
  // Notes belonging to the collection's other note types, which are left out.
  skipped: number;
};

export async function readApkg(file: Blob): Promise<ApkgNotes> {
  const entries = await listEntries(file);
  const collection = COLLECTIONS.map((name) =>
    entries.find((e) => e.name === name),
  ).find(Boolean);
  if (!collection) throw new Error("That .apkg has no collection in it.");

  let db = await extract(file, collection);
  if (collection.name.endsWith("b")) db = unzstd(db);

  const notes = readTable(db, "notes");
  const flds = notes ? notes.columns.indexOf("flds") : -1;
  if (!notes || flds === -1 || notes.rows.length === 0) {
    throw new Error("That .apkg has no notes in it.");
  }
  const mid = notes.columns.indexOf("mid");

  // A collection can hold several note types with different fields. Take the one
  // most of the notes use rather than merging them: field 1 of a vocabulary note
  // and field 1 of a kanji note are unrelated, so column detection — and then
  // every card built from it — would be reading a blend of the two.
  const counts = new Map<number, number>();
  for (const row of notes.rows) {
    const type = mid === -1 ? 0 : Number(row[mid]);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  let main = 0;
  let best = -1;
  for (const [type, n] of counts) {
    if (n > best) {
      main = type;
      best = n;
    }
  }

  // Rows arrive in note-id order, which for Anki is creation order — the order
  // the deck's author added them in, and the sequence deck scopes preserve.
  const rows = notes.rows
    .filter((row) => mid === -1 || Number(row[mid]) === main)
    .map((row) => String(row[flds] ?? "").split(FIELD_SEPARATOR));

  return {
    rows,
    fieldNames: mid === -1 ? [] : readFieldNames(db, main),
    skipped: notes.rows.length - rows.length,
  };
}
