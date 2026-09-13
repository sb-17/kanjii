import { useEffect } from "react";

// Keyboard for anything shaped "reveal, then grade": the card players
// (CardActions) and paper writing practice. One hook so they can't drift into
// different keys for the same three actions.
//
// Anki's layout, since anyone arriving with a deck already has it in their
// fingers: Space reveals, then Space or 2 is "Got it" and 1 is "Again". The keys
// can only do what the visible buttons can: before the reveal the grade keys are
// dead, exactly as the grade buttons are absent. `enabled` is for a caller whose
// buttons can disappear altogether (Write's promote dialog, screen mode).
export function useRevealGradeKeys({
  revealed,
  onShow,
  onGrade,
  enabled = true,
}: {
  revealed: boolean;
  onShow: () => void;
  onGrade: (correct: boolean) => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      // Never steal a shortcut (Cmd-R, Ctrl-F…) or a key meant for a field. The
      // listener is on window, and Write has a checkbox and toggles beside it.
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      // Auto-repeat would run away: a held Space reveals, the next repeat grades,
      // the one after reveals the following item, and a leaning thumb burns
      // through the queue marking everything correct.
      if (e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (
        el?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName ?? "")
      ) {
        return;
      }

      const space = e.key === " " || e.key === "Spacebar";

      if (!revealed) {
        // Enter as well as Space: Space scrolls by default, so someone who has
        // been scrolling the page may well reach for Enter instead.
        if (space || e.key === "Enter") {
          e.preventDefault();
          onShow();
        }
        return;
      }

      if (e.key === "1") {
        e.preventDefault();
        onGrade(false);
      } else if (e.key === "2" || space || e.key === "Enter") {
        e.preventDefault();
        onGrade(true);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, revealed, onShow, onGrade]);
}
