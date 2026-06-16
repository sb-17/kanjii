import { useState } from "react";
import { NavLink } from "react-router-dom";
import "./Navigation.css";

const DESKTOP_BREAKPOINT = 900;

type NavItem = { id: string; label: string; path: string; end?: boolean };
type NavGroup = { title?: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  { items: [{ id: "home", label: "Home", path: "/", end: true }] },
  {
    title: "Kanji",
    items: [
      { id: "kanji", label: "All kanji", path: "/kanji" },
      { id: "sets", label: "Sets", path: "/sets" },
      { id: "write", label: "Write", path: "/write" },
      { id: "print", label: "Print", path: "/print" },
    ],
  },
  {
    title: "Vocabulary",
    items: [
      { id: "words", label: "My words", path: "/words" },
      { id: "cards", label: "Cards", path: "/cards" },
      { id: "practice", label: "Practice", path: "/practice" },
    ],
  },
  {
    title: "Other",
    items: [
      { id: "settings", label: "Settings", path: "/settings" },
      { id: "about", label: "About", path: "/about" },
      { id: "support", label: "Support me", path: "/support" },
    ],
  },
];

export default function Navigation() {
  const [open, setOpen] = useState(
    () => window.innerWidth >= DESKTOP_BREAKPOINT,
  );

  const closeOnMobile = () => {
    if (window.innerWidth < DESKTOP_BREAKPOINT) {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        className="nav-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "Close navigation" : "Open navigation"}
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <div className="nav-backdrop" onClick={() => setOpen(false)} />
      )}

      <nav className={`side-nav ${open ? "open" : "closed"}`}>
        {navGroups.map((group, gi) => (
          <div className="nav-group" key={group.title ?? `group-${gi}`}>
            {group.title && <div className="nav-group-title">{group.title}</div>}
            {group.items.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  "navButton" + (isActive ? " active" : "")
                }
                onClick={closeOnMobile}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}
