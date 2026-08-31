import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/Decks.css";
import type { ColumnMap } from "../lib/deckImport";
import {
  previewImport,
  buildDeck,
  deckId,
  detectColumns,
} from "../lib/deckImport";
import { loadDecks, saveDecks } from "../storage/decks";
import { deckBoxes } from "../storage/deckProgress";
import { deckCounts } from "../lib/deckSrs";
import { loadUserVocab } from "../storage/userVocab";
import { isVocabAvailable } from "../lib/vocab";
import { isDueFor, isNewFor } from "../lib/srs";
import { useProgress } from "../context/ProgressContext";
import { useNow } from "../lib/useNow";

// The My Words deck is virtual: it reads the existing word list rather than
// holding a copy. That's what keeps it from adding anything to the backup — your
// words are already in there once, and duplicating them into a deck would have
// doubled the largest section of the file.
export const MY_WORDS_ID = "my-words";

type Pending = {
  rows: string[][];
  columns: ColumnMap;
  name: string;
  // From an .apkg only: the note type's real field names, and how many notes of
  // the collection's other note types were left out.
  fieldNames: string[];
  skipped: number;
};

// The five fields kept from a file. Word and meaning make the card; the rest are
// optional. Every other column in the import is discarded.
const FIELDS: { key: keyof ColumnMap; label: string }[] = [
  { key: "word", label: "Word (Japanese)" },
  { key: "reading", label: "Reading" },
  { key: "meaning", label: "Meaning (English)" },
  { key: "example", label: "Example sentence" },
  { key: "exampleEn", label: "Example sentence translation" },
];

// What kind of file is this? Decided by its first bytes, not by its name.
//
// A phone's file picker doesn't reliably preserve an extension: pick a deck from
// Files, Drive or any content provider and the name can come back without its
// suffix, or as a bare document id. Matching on `.apkg` then sent the file down
// the plain-text path, which failed with "That file has no rows in it" — an error
// about the wrong thing entirely.
//
// Every ZIP starts with "PK", and an .apkg is a ZIP. A NUL byte early on means
// binary that isn't a ZIP — a photo or a PDF picked by mistake, which the file
// dialog no longer filters out (see the input below). Everything else is treated
// as a text export, which is what it has always been.
type FileKind = "zip" | "binary" | "text";

async function sniffFile(file: Blob): Promise<FileKind> {
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) return "zip";
  return head.includes(0) ? "binary" : "text";
}

function sampleOf(rows: string[][], column: number): string {
  const value = rows.find((r) => (r[column] ?? "").trim() !== "")?.[column] ?? "";
  return value.length > 24 ? `${value.slice(0, 24)}…` : value;
}

export default function Decks() {
  const { progress } = useProgress();
  const now = useNow();
  const [decks, setDecks] = useState(loadDecks);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  // Unzipping and reading a deck's database takes a noticeable moment on a large
  // .apkg, and nothing else on the card moves while it happens.
  const [reading, setReading] = useState(false);

  // Counted with the same predicates the card players use, so the numbers here
  // can't advertise work the deck won't actually hand you.
  const myWords = useMemo(() => {
    const available = loadUserVocab().filter((v) => isVocabAvailable(v, progress));
    return {
      // Counted on the same direction the My Words player schedules by (E→J).
      // Judged on both directions this row advertised every started word as due
      // forever, against a player that would not offer them.
      due: available.filter((v) => !isNewFor(v, "etj") && isDueFor(v, now, "etj"))
        .length,
      fresh: available.filter((v) => isNewFor(v, "etj")).length,
      total: available.length,
    };
  }, [progress, now]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");

    const name = file.name.replace(/\.[^.]+$/, "") || "Imported deck";
    setReading(true);
    try {
      const kind = await sniffFile(file);
      if (kind === "binary") {
        throw new Error(
          "That doesn't look like a deck. Pick an Anki .apkg, or a text export.",
        );
      }
      if (kind === "zip") {
        // Loaded on demand: the ZIP, SQLite and zstd readers are only needed by
        // someone importing an .apkg, and this page is on the main bundle.
        const { readApkg } = await import("../lib/apkg");
        const { rows, fieldNames, skipped } = await readApkg(file);
        setPending({ rows, columns: detectColumns(rows), name, fieldNames, skipped });
      } else {
        const { rows, columns } = previewImport(await file.text());
        setPending({ rows, columns, name, fieldNames: [], skipped: 0 });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReading(false);
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    const name = pending.name.trim();
    if (!name) {
      setError("Give the deck a name.");
      return;
    }

    let deck;
    try {
      deck = buildDeck(name, pending.rows, pending.columns, Date.now());
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    // Same name → same id → same deck. Re-importing an updated file replaces the
    // cards and keeps your progress, because progress is keyed by content-derived
    // card id rather than by position.
    const existing = decks.find((d) => d.id === deck.id);
    const next = existing
      ? decks.map((d) => (d.id === deck.id ? deck : d))
      : [...decks, deck];

    setDecks(next);
    saveDecks(next);
    setPending(null);
    setError("");
  };

  const setColumn = (key: keyof ColumnMap, value: number | null) => {
    if (!pending) return;
    setPending({ ...pending, columns: { ...pending.columns, [key]: value } });
  };

  const width = pending
    ? Math.max(...pending.rows.map((r) => r.length))
    : 0;

  // The deck this import would overwrite, if the name resolves to one already
  // here. Matched on the derived id, not the raw name, since that's what decides.
  const replacing = pending
    ? decks.find((d) => d.id === deckId(pending.name.trim()))
    : undefined;

  return (
    <div className="page">
      <h1 className="page-title">Cards</h1>

      <div className="deck-list">
        <Link className="deck-row surface-card" to={`/cards/${MY_WORDS_ID}`}>
          <div className="deck-row-main">
            <strong>My words</strong>
            <span className="deck-row-meta">
              {myWords.total === 0
                ? "No words yet"
                : `${myWords.due} due · ${myWords.fresh} new · ${myWords.total} unlocked`}
            </span>
          </div>
        </Link>

        {decks.map((deck) => {
          const counts = deckCounts(deck.cards, deckBoxes(deck.id), now);
          return (
            <div key={deck.id} className="deck-row surface-card">
              <Link className="deck-row-main" to={`/cards/${deck.id}`}>
                <strong>{deck.name}</strong>
                <span className="deck-row-meta">
                  {counts.due} due · {counts.fresh} new · {counts.total} cards
                </span>
              </Link>
              <Link
                className="deck-row-settings"
                to={`/cards/${deck.id}/settings`}
                aria-label={`${deck.name} settings`}
              >
                ⚙
              </Link>
            </div>
          );
        })}
      </div>

      {pending ? (
        <div className="settings-card surface-card">
          <strong>Import deck</strong>

          <p className="settings-description">
            {pending.rows.length} rows found. Check the columns look right — only
            these five are kept.
            {/* An .apkg holds a whole collection, which may mix note types. Only
                the commonest one is imported, since the others' fields mean
                something else entirely — say so rather than losing rows
                silently. */}
            {pending.skipped > 0 &&
              ` ${pending.skipped} notes of another type were left out.`}
          </p>

          {/* Re-importing under an existing name replaces the cards and keeps
              progress, because it's filed under content-derived card ids. As of
              2026-08-22 deleting first is no longer destructive either — delete
              leaves the boxes behind and a later import re-attaches them — but
              this is still the direct route, so say plainly what's happening. */}
          {replacing && (
            <p className="settings-description deck-replacing">
              Replaces the {replacing.cards.length} cards in “{replacing.name}”
              and keeps your review progress.
            </p>
          )}

          {/* A <div> wrapping a <label for>, not a <label> wrapping the control.
              Wrapping puts the whole row — caption included — inside the control's
              activation area, and on iOS the tap is re-dispatched from the label
              to its control. With five of these stacked a fingertip near the
              bottom of one select lands on the next field's caption and opens
              *that* dropdown instead. Associating by id keeps the caption working
              for screen readers without making the whole block a hit target. */}
          <div className="deck-field">
            <label htmlFor="deck-name">Deck name</label>
            <input
              id="deck-name"
              type="text"
              value={pending.name}
              onChange={(e) => setPending({ ...pending, name: e.target.value })}
            />
          </div>

          {FIELDS.map((field) => (
            <div key={field.key} className="deck-field">
              <label htmlFor={`deck-col-${field.key}`}>{field.label}</label>
              <select
                id={`deck-col-${field.key}`}
                value={pending.columns[field.key] ?? ""}
                onChange={(e) =>
                  setColumn(
                    field.key,
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              >
                <option value="">— none —</option>
                {Array.from({ length: width }, (_, c) => (
                  <option key={c} value={c}>
                    {/* The sample content is what you actually recognise a column
                        by. Anki's own field names mostly restate the label above
                        the dropdown ("Word:" under "Word (Japanese)"), so they're
                        only a fallback for a column with nothing in it — which
                        would otherwise render as a blank, unpickable option. */}
                    {sampleOf(pending.rows, c) ||
                      pending.fieldNames[c] ||
                      `Column ${c + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {error && <p className="deck-error">{error}</p>}

          <div className="settings-actions">
            <button className="settings-button" onClick={confirmImport}>
              <strong>Import</strong>
            </button>
            <button
              className="settings-button"
              onClick={() => {
                setPending(null);
                setError("");
              }}
            >
              <strong>Cancel</strong>
            </button>
          </div>
        </div>
      ) : (
        <div className="settings-card surface-card">
          <strong>Add a deck</strong>

          <p className="settings-description">
            An Anki .apkg — straight from AnkiWeb, no re-export needed — or a
            plain text export (tab or comma separated). Only the five fields below
            are kept; everything else in the file is discarded. Decks stay on this
            device; only your review progress is backed up.
          </p>

          {error && <p className="deck-error">{error}</p>}

          <div className="settings-actions">
            <label className="settings-import">
              <strong>{reading ? "Reading…" : "📥 Import deck file"}</strong>
              {/* No `accept`, deliberately. `.apkg` has no registered MIME type,
                  and a phone's picker resolves the list to MIME types rather than
                  extensions — the unknown ones drop out, leaving `text/*`, which
                  greys out the very file you came to pick. It was unimportable on
                  Android for exactly this reason. Desktop loses a filtered dialog;
                  mobile gains the feature, and `isZip` sorts the file out anyway. */}
              <input
                type="file"
                onChange={handleFile}
                disabled={reading}
                hidden
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
