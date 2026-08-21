Deployed at [https://sb-17.github.io/kanjii/](https://sb-17.github.io/kanjii/).

## Credits and licensing

### KanjiVG

Kanjii uses **[KanjiVG](http://kanjivg.tagaini.net)** for its stroke-order data —
the stroke animations, the writing practice, the handwriting checker and the
draw-to-search lookup are all built on it.

> Copyright © 2009/2010/2011 Ulrich Apel.
> KanjiVG is distributed under the
> [Creative Commons Attribution-Share Alike 3.0](http://creativecommons.org/licenses/by-sa/3.0/)
> licence.

Three parts of this repository are covered by that licence and are shared under
the same terms:

- `public/kanjiVG/` — the KanjiVG SVG files, redistributed unmodified.
- `src/data/kanjiGraph.json` — generated from those files by
  `scripts/build-kanji-graph.mjs`, so it is a derivative of KanjiVG.
- `src/data/kanjiStrokeIndex.json` — generated from those files by
  `scripts/build-stroke-index.mjs`, so it is a derivative of KanjiVG.

### KANJIDIC / EDRDG

`src/data/kanji.json` — the kanji meanings, readings and frequency ranks —
derives from **KANJIDIC**, a project of the
[Electronic Dictionary Research and Development Group](https://www.edrdg.org/)
(EDRDG), distributed under the
[Creative Commons Attribution-Share Alike 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
licence.

The file reached this project through an intermediary that had dropped the
licence notice, which is why the attribution was added late rather than at import.
Its origin is not in doubt: the kun readings carry KANJIDIC's okurigana notation
(`ひと.つ`, `ひと-`), and the `frequency` field is the 1–2501 Mainichi Shimbun
ranking from KANJIDIC2's `<freq>`. Only the Title Cased meanings differ from
KANJIDIC's lowercase, a transformation applied downstream.
