// Theme preference (light / dark / follow-system).
//
// Stored in localStorage (not IndexedDB) on purpose: the inline script in
// index.html reads it synchronously before first paint to set data-theme on
// <html>, so there's no flash. This module keeps it in sync afterwards.

export type ThemePref = "system" | "light" | "dark";

const KEY = "kanjii:theme";

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

function systemIsLight(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  );
}

export function effectiveTheme(pref: ThemePref = getThemePref()): "light" | "dark" {
  if (pref === "system") return systemIsLight() ? "light" : "dark";
  return pref;
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  document.documentElement.dataset.theme = effectiveTheme(pref);

  // Keep the browser chrome (and the PWA status bar, where it's most visible)
  // in step with the theme — otherwise light mode runs under dark chrome.
  //
  // The colour is read back off `--bg` rather than written here, so each theme's
  // background has one definition (index.css) instead of two that drift apart.
  // Reading it after setting data-theme is what makes that work: getComputedStyle
  // forces the recalc, so this is already the new theme's value.
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg")
    .trim();
  if (!bg) return; // stylesheet not applied yet; the next call will catch it
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", bg);
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  applyTheme(pref);
}

// When the user follows the system theme, react to OS light/dark changes live.
export function initThemeSync(): void {
  const mq = window.matchMedia?.("(prefers-color-scheme: light)");
  mq?.addEventListener?.("change", () => {
    if (getThemePref() === "system") applyTheme("system");
  });
}
