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
