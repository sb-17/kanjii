// Shown instead of the app when the storage caches can't be hydrated at boot.
//
// Deliberately dependency-free: no router, no ProgressContext, no storage reads.
// Everything it might otherwise lean on is the thing that just failed, and a
// second crash here would put the user back on the blank page this exists to
// prevent. It styles itself from index.css/shared.css, which main.tsx imports
// before any of this runs.
export default function BootFailure({ error }: { error: unknown }) {
  const detail = error instanceof Error ? error.message : String(error);

  return (
    <div className="page page-center">
      <h1 className="page-title">Kanjii couldn't open your data</h1>

      <p className="boot-fail-text">
        Your kanji tags, words and review history are stored in this browser, and
        they are still there. This is a problem reading them, not a sign they've
        gone.
      </p>

      {/* Says why it won't just start empty. Without this the obvious reading is
          "the app is broken, I'll poke at it until it works" — and poking is
          exactly what would do the damage. */}
      <p className="boot-fail-text">
        Kanjii is refusing to start rather than starting blank. It holds your data
        in memory while you use it and writes the whole lot back whenever you
        change something, so an empty start wouldn't just look wrong — the first
        tag you set would overwrite the real data with nothing.
      </p>

      <button
        className="boot-fail-button"
        onClick={() => window.location.reload()}
      >
        Try again
      </button>

      <p className="boot-fail-hint">
        If it keeps failing, don't clear this site's data — that is the one action
        that would actually delete it. Most causes are fixed by reopening in a
        normal (not private) window, or by freeing up disk space.
      </p>

      <pre className="boot-fail-detail">{detail}</pre>
    </div>
  );
}
