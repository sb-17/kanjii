import "../styles/Privacy.css";

// Linked from the About page and pasted into the Google Cloud Console OAuth
// consent screen ("Privacy policy URL"), which is the reason it exists as a
// stable, standalone URL rather than a section of About.
//
// The date is hardcoded on purpose. Deriving it from the build stamp would move
// it on every deploy and claim the policy changed when it didn't.
const UPDATED = "21 August 2026";

export default function Privacy() {
  return (
    <div className="page">
      <h1 className="page-title">Privacy</h1>

      <p className="privacy-lead">
        Kanjii runs entirely in your browser. There are no accounts, and I don't
        run a server that stores anything you do here.
      </p>

      <h2 className="privacy-heading">What stays on your device</h2>

      <p className="privacy-text">
        Everything you create in Kanjii — your kanji tags, vocabulary, review
        history, imported decks, settings and theme — is saved locally in your
        browser's storage. None of it is sent anywhere unless you export it
        yourself or turn on Google Drive backup. It also means clearing your
        browser data deletes it, so it's worth taking a backup from Settings.
      </p>

      <h2 className="privacy-heading">Google Drive backup</h2>

      <p className="privacy-text">
        Google Drive backup is optional and off until you connect it. When you
        do, Kanjii requests only the{" "}
        <code className="privacy-code">drive.file</code> permission, which limits
        it to files Kanjii itself created — it cannot see anything else in your
        Drive.
      </p>

      <p className="privacy-text">
        Your backup is uploaded to <em>your</em> Google Drive as{" "}
        <code className="privacy-code">kanjii-backup.json</code>. I have no
        access to it and keep no copy. Transfers happen only when you press Back
        up or Restore; there is no background sync. The access token Google
        issues is stored on your device, expires after an hour, and is deleted
        and revoked when you press Disconnect. You can also revoke access at any
        time from your{" "}
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
        >
          Google account permissions
        </a>
        .
      </p>

      <h2 className="privacy-heading">Analytics</h2>

      <p className="privacy-text">
        Kanjii counts page views using{" "}
        <a
          href="https://www.goatcounter.com"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
        >
          GoatCounter
        </a>
        , which sets no cookies and stores nothing in your browser. It records
        the page path, referrer, and rough browser, language, screen width and
        country. It does not keep IP addresses or a tracking ID; to tell repeat
        visits apart it holds a temporary in-memory hash for a few hours and then
        discards it. Nothing you study is included.
      </p>

      <h2 className="privacy-heading">Hosting and fonts</h2>

      <p className="privacy-text">
        The app is served by GitHub Pages, and one typeface is loaded from Google
        Fonts. As with any web request, those servers see your IP address and
        browser version in their own logs. That's outside my control and I don't
        receive it.
      </p>

      <h2 className="privacy-heading">What I don't do</h2>

      <p className="privacy-text">
        No accounts, no ads, no selling or sharing of data, and no trackers
        beyond the page counter described above.
      </p>

      <h2 className="privacy-heading">Contact</h2>

      <p className="privacy-text">
        Questions about any of this? Email me at{" "}
        <a href="mailto:kanjii.simon@gmail.com" className="github-link">
          kanjii.simon@gmail.com
        </a>
        .
      </p>

      <p className="privacy-updated">Last updated {UPDATED}</p>
    </div>
  );
}
