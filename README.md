# Kanjii

**A free, open-source Japanese kanji and vocabulary tracker.**

Most kanji apps hand you an order and expect you to follow it. Kanjii assumes you
already have a textbook, a class, or a method that works for you — and gives you
somewhere to record what you actually know. Learn what you want; Kanjii keeps
track of the rest.

- **Kanji tracking** — tag all 2,136 jōyō kanji as new, learning or known. Every
  other feature reads from those tags, so the app always works on what you still
  need.
- **Handwriting practice** — write on screen with per-stroke checking, or on
  paper and grade yourself. Scheduled separately from vocabulary.
- **Your own vocabulary** — no built-in word list. Add the words you actually
  meet, and see which kanji inside them you don't know yet.
- **Spaced repetition** — Leitner scheduling in both directions, E→J and J→E.
- **Read** — paste Japanese text and pull the words out of it, checked against
  your own tags.
- **Anki import** (`.apkg` or a text export), **printable genkō-yōshi
  worksheets**, and progress charts.
- **Local-first** — everything stays in your browser. No account, no ads, works
  fully offline. Backup to a file or your own Google Drive, when you ask it to.

No streaks, no XP, no fixed path.

**[kanjii.org](https://kanjii.org)** · [Features](https://kanjii.org/features/) ·
[FAQ](https://kanjii.org/faq/)

Built with Vite, React 19 and TypeScript; deployed to GitHub Pages.

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
