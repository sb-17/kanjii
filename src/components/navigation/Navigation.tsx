import { useState } from "react";
import { NavLink } from "react-router-dom";
import "./Navigation.css";

const DESKTOP_BREAKPOINT = 900;

const pages = [
  { id: "home", label: "Home", path: "/" },
  { id: "kanji-list", label: "All kanji", path: "/kanji-list" },
  { id: "learn", label: "Learn", path: "/learn" },
  { id: "cards", label: "Cards", path: "/cards" },
  { id: "practice", label: "Practice", path: "/practice" },
  { id: "settings", label: "Settings", path: "/settings" },
  { id: "about", label: "About", path: "/about" },
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
        {pages.map((page) => (
          <NavLink
            key={page.id}
            to={page.path}
            end={page.path === "/"}
            className={({ isActive }) =>
              "navButton" + (isActive ? " active" : "")
            }
            onClick={closeOnMobile}
          >
            {page.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
