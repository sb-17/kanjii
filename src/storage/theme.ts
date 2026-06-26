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
