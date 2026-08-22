import { useState, useSyncExternalStore } from "react";
import {
  applyUpdate,
  isUpdatePending,
  subscribeToUpdate,
} from "../../lib/swUpdate";
import "./UpdateToast.css";

// Offers the reload when a new build is waiting, instead of taking it.
//
// The app used to update with `registerType: "autoUpdate"`, whose generated
// registration calls `window.location.reload()` the moment an updated worker
// activates. That reloads whatever you were in the middle of — a graded card,
// a half-typed word, a half-drawn kanji — with no warning and nothing saved.
// A deploy should never cost someone their session, so the reload is now theirs
// to trigger.
export default function UpdateToast() {
  const pending = useSyncExternalStore(subscribeToUpdate, isUpdatePending);
  // Dismissable, and only for this page load: an unmissable bar that can't be
  // put away is its own interruption, and the update is waiting either way —
  // the next natural reload picks it up.
  const [dismissed, setDismissed] = useState(false);

  if (!pending || dismissed) return null;

  return (
    <div className="update-toast" role="status">
      <span className="update-toast-text">A new version of Kanjii is ready.</span>
      <button className="update-toast-apply" onClick={applyUpdate}>
        Reload
      </button>
      <button
        className="update-toast-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update notice"
      >
        ✕
      </button>
    </div>
  );
}
