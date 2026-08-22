Deployed at [https://sb-17.github.io/kanjii/](https://sb-17.github.io/kanjii/).

## Credits and licensing

**[KanjiVG](http://kanjivg.tagaini.net)** — stroke data. © 2009–2011 Ulrich Apel,
[CC BY-SA 3.0](http://creativecommons.org/licenses/by-sa/3.0/). Shared under the
same licence: `public/kanjiVG/`, and `src/data/kanjiGraph.json` +
`src/data/kanjiStrokeIndex.json`, both derived from it.

**[KANJIDIC](https://www.edrdg.org/)** (EDRDG) — kanji meanings, readings and
frequency ranks in `src/data/kanji.json`.
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). It reached the
project via an intermediary that had dropped the notice, hence the late
attribution.

**[Sawarabi Mincho](https://github.com/googlefonts/sawarabi-mincho)** — the
mincho face for large kanji. © 2024 the Sawarabi Mincho Project Authors,
[OFL 1.1](https://openfontlicense.org); the licence ships alongside it as
`public/fonts/OFL.txt`, as the OFL requires.

### Regenerating the font subset

Only needed if `src/data/` gains characters the subset lacks. The character list
is everything `kanji.json`, `vocab.json` and `dictionary.json` can render, plus
kana, ASCII and CJK punctuation.

```
pip install fonttools brotli
pyftsubset SawarabiMincho-Regular.ttf \
  --text-file=charset.txt \
  --output-file=sawarabi-mincho-subset.woff2 \
  --flavor=woff2 --no-hinting --desubroutinize --drop-tables+=DSIG
```

**Give the output a new filename**, or the CacheFirst rule in `vite.config.ts`
serves the old one for a year.

17 kanji — 璽喩嗅嘲毀彙恣惧摯璧瘍諧踪辣錮塡頰, the 2010 jōyō additions — aren't in
Sawarabi Mincho at all and fall back to the next font in `--font-jp-serif`.
