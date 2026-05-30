import { NavLink } from "react-router-dom";
import "./Navigation.css";

const pages = [
  { id: "kanji", label: "All kanji", path: "/" },
//   { id: "learn", label: "Learn", path: "/learn" },
  { id: "cards", label: "Cards", path: "/cards" },
  { id: "practice", label: "Practice", path: "/practice" },
  { id: "settings", label: "Settings", path: "/settings" },
//   { id: "about", label: "About", path: "/about" },
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
