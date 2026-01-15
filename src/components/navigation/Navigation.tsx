import { NavLink } from "react-router-dom";
import "./Navigation.css";

const pages = [
  { id: "kanji", label: "All kanji", path: "/kanji-list" },
  { id: "learn", label: "Learn", path: "/learn" },
  { id: "writing", label: "Writing", path: "/writing" },
  { id: "reading", label: "Reading", path: "/reading" },
];

export default function Navigation() {
  return (
    <nav className="navigation">
      {pages.map((page) => (
        <NavLink key={page.id} to={page.path} className="navButton">
          {page.label}
        </NavLink>
      ))}
    </nav>
  );
}
