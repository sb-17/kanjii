import "../styles/Support.css";

// GitHub Sponsors is still pending approval — flip this to the real URL once the
// account is live.
const GITHUB_SPONSORS_URL: string | null = null; // e.g. "https://github.com/sponsors/sb-17"

export default function Support() {
  return (
    <div className="page">
      <h1 className="page-title">Support Kanjii</h1>

      <p className="support-text">
        Kanjii is free, has no ads, and stores everything locally on your device.
        I build and maintain this project entirely in my spare time. If it helps you on your language journey,
        a small contribution helps me keep improving it.
      </p>

      <div className="support-options">
        <a
          className="support-card kofi"
          href="https://ko-fi.com/kanjii"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="support-card-emoji">☕</span>
          <span className="support-card-body">
            <span className="support-card-title">Buy me a coffee</span>
            <span className="support-card-desc">Support on Ko-fi</span>
          </span>
        </a>

        {GITHUB_SPONSORS_URL ? (
          <a
            className="support-card github"
            href={GITHUB_SPONSORS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="support-card-emoji">💖</span>
            <span className="support-card-body">
              <span className="support-card-title">GitHub Sponsors</span>
              <span className="support-card-desc">Recurring monthly support</span>
            </span>
          </a>
        ) : (
          <div className="support-card github disabled" aria-disabled="true">
            <span className="support-card-emoji">💖</span>
            <span className="support-card-body">
              <span className="support-card-title">GitHub Sponsors</span>
              <span className="support-card-desc">Coming soon</span>
            </span>
          </div>
        )}
      </div>

      <p className="support-text support-thanks">
        Thank you, it genuinely means a lot!
      </p>
    </div>
  );
}
