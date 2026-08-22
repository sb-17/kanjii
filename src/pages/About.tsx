import "../styles/About.css";

// The build actually running, so a stale service worker is obvious rather than
// something you have to deduce. Commit identifies the source; the timestamp is
// the part you can sanity-check against "I pushed that ten minutes ago".
const built = new Date(__APP_BUILT__);
const builtLabel = Number.isNaN(built.getTime())
  ? __APP_BUILT__
  : built.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function About() {
  return (
    <div className="page">
      <h1 className="page-title">About</h1>

      <p className="about-text">
        Hi! My name is Šimon and I developed this app. I have been learning Japanese since July 2025. 
        When I first started learning kanji, I couldn't find an app that fit my exact needs. 
        That's why I decided to create Kanjii. I wanted a simple, minimalistic tool with the 
        ability to tag kanji based on how well I knew them. 
      </p>
      
      <p className="about-text">
        After building the core tagging system, I added a few more features, and I am still 
        actively working on improving the app.
      </p>
      
      <p className="about-text">
        If you have any ideas or bugs to report, please let me know by{" "}
        <a 
            href="https://github.com/sb-17/kanjii/issues" 
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
        >
            creating an issue on GitHub
        </a>, or send me an email at{" "}
        <a
            href="mailto:kanjii.simon@gmail.com"
            className="github-link"
        >
            kanjii.simon@gmail.com
        </a>.
      </p>

      <h2 className="about-heading">Credits</h2>

      <p className="about-text">
        Stroke order, writing practice, the handwriting checker and drawing to
        search are all built on{" "}
        <a
            href="http://kanjivg.tagaini.net"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
        >
            KanjiVG
        </a>
        , copyright © 2009–2011 Ulrich Apel, distributed under the{" "}
        <a
            href="http://creativecommons.org/licenses/by-sa/3.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
        >
            Creative Commons Attribution-Share Alike 3.0
        </a>{" "}
        licence. The stroke files Kanjii ships, and the connection and
        stroke-signature data derived from them, are shared under that same
        licence.
      </p>

      <p className="about-text">
        Kanji meanings, readings and frequency rankings come from{" "}
        <a
            href="https://www.edrdg.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
        >
            KANJIDIC
        </a>
        , a project of the Electronic Dictionary Research and Development Group,
        distributed under the{" "}
        <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
        >
            Creative Commons Attribution-Share Alike 4.0
        </a>{" "}
        licence.
      </p>

      {/* Quiet and out of the navigation. A real <a>, not a <Link>: /privacy/ is
          a static file in public/, not a route, so the router must not intercept
          it. It's static because GitHub Pages serves SPA deep links via 404.html
          — a 404 status with no policy text in the HTML, which is exactly what
          Google's OAuth review fetches. */}
      <p className="about-privacy">
        <a href="/privacy/" className="about-privacy-link">
          Privacy
        </a>
      </p>

      <p className="about-version">
        Build <code>{__APP_COMMIT__}</code> · {builtLabel}
        {import.meta.env.DEV ? " · dev" : ""}
      </p>
    </div>
  );
}