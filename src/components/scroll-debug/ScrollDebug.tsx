import { useEffect, useState } from "react";

// TEMPORARY diagnostic for the keyboard/scroll bug. Enable with ?debug=scroll.
//
// The point is to tell apart three things that look identical on a recording but
// need completely different fixes:
//   docScroll  — the document itself moved (what ViewportReset is written to undo)
//   vvOffset   — only the visual viewport is offset inside an unmoved layout
//                viewport (ViewportReset's scrollTop reset does nothing about this)
//   contentTop — .app-content is scrolled (an ordinary, legitimate scroll that
//                nothing currently restores)
//
// `peak` columns keep the largest value seen, because the interesting moment is
// while the keyboard is up — by the time you can screenshot, live values may have
// settled back to 0.
//
// Delete this file and its two lines in App.tsx once the bug is understood.

// Largest magnitude seen per measure, since the moment that matters is while the
// keyboard is up and the live values may have settled by the time you screenshot.
const peaks = new Map<string, number>();

export default function ScrollDebug() {
  const [, tick] = useState(0);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const vv = window.visualViewport;
  const scroller = document.scrollingElement ?? document.documentElement;
  const content = document.querySelector<HTMLElement>(".app-content");
  const toggle = document.querySelector<HTMLElement>(".nav-toggle");
  const title = document.querySelector<HTMLElement>(
    ".page-title, .page h1, .page strong",
  );

  const toggleRect = toggle?.getBoundingClientRect();
  const titleRect = title?.getBoundingClientRect();
  const gap =
    toggleRect && titleRect ? Math.round(titleRect.top - toggleRect.bottom) : NaN;

  const row = (label: string, value: number) => {
    const peak = Math.max(Math.abs(value) || 0, peaks.get(label) ?? 0);
    peaks.set(label, peak);
    return (
      <div key={label} style={{ display: "flex", gap: 6 }}>
        <span style={{ width: 86, opacity: 0.65 }}>{label}</span>
        <span style={{ width: 52, textAlign: "right" }}>{Math.round(value)}</span>
        <span style={{ width: 52, textAlign: "right", opacity: 0.65 }}>
          {Math.round(peak)}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        padding: "6px 8px",
        background: "rgba(0,0,0,0.86)",
        color: "#7CFF9B",
        font: "11px/1.35 ui-monospace, monospace",
        pointerEvents: "none",
        borderTop: "1px solid #7CFF9B",
      }}
    >
      <div style={{ display: "flex", gap: 6, opacity: 0.5 }}>
        <span style={{ width: 86 }}>measure</span>
        <span style={{ width: 52, textAlign: "right" }}>now</span>
        <span style={{ width: 52, textAlign: "right" }}>peak</span>
      </div>
      {row("docScroll", scroller.scrollTop)}
      {row("window.scrollY", window.scrollY)}
      {row("body.scroll", document.body.scrollTop)}
      {row("vvOffsetTop", vv?.offsetTop ?? 0)}
      {row("contentTop", content?.scrollTop ?? 0)}
      <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
        <span style={{ width: 86, opacity: 0.65 }}>vvH / innerH</span>
        <span>
          {Math.round(vv?.height ?? 0)} / {window.innerHeight}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <span style={{ width: 86, opacity: 0.65 }}>toggle.top</span>
        <span style={{ width: 52, textAlign: "right" }}>
          {toggleRect ? Math.round(toggleRect.top) : "—"}
        </span>
        <span style={{ width: 86, opacity: 0.65, marginLeft: 6 }}>title.top</span>
        <span>{titleRect ? Math.round(titleRect.top) : "—"}</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <span style={{ width: 86, opacity: 0.65 }}>gap</span>
        <span style={{ color: gap < 0 ? "#FF7C7C" : "#7CFF9B" }}>
          {Number.isNaN(gap) ? "—" : gap}
        </span>
      </div>
    </div>
  );
}
