"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "./AppProvider";
import { DogPic, type ArtName } from "./DogPic";
import { PersonAvatar } from "./PersonAvatar";

/** Every section. Add new ones here; the drawer scrolls, so there's room. */
export const SECTIONS: { href: string; label: string; art: ArtName }[] = [
  { href: "/", label: "Home", art: "kodo_wiley_face" },
  { href: "/calendar", label: "Calendar", art: "kodo_wiley_back_walk" },
  { href: "/do", label: "Do something", art: "kodo_run" },
  { href: "/eat", label: "Eat", art: "food_bowl" },
  { href: "/lists", label: "Lists", art: "wiley_standing" },
  { href: "/saved", label: "Saved", art: "wiley_happy" },
  { href: "/spicy", label: "Spicy", art: "kodo_wiley_cuddle" },
  { href: "/settings", label: "Settings", art: "kodo_happy" },
];

const isHere = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** The ☰ button (top left of every page). */
export function MenuButton() {
  const { setMenuOpen } = useApp();
  return (
    <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="24" height="24" aria-hidden>
        <path d="M4 7h16M4 12h16M4 17h11" />
      </svg>
    </button>
  );
}

/** Slide-out drawer with every section. */
export function SideMenu() {
  const { menuOpen, setMenuOpen, meId, me } = useApp();
  const path = usePathname();

  // Close on navigation and on Escape.
  useEffect(() => setMenuOpen(false), [path, setMenuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, setMenuOpen]);

  return (
    <>
      <div className={`drawer-backdrop${menuOpen ? " open" : ""}`} onClick={() => setMenuOpen(false)} aria-hidden />
      <nav className={`drawer${menuOpen ? " open" : ""}`} aria-label="Sections" aria-hidden={!menuOpen} inert={!menuOpen}>
        <div className="drawer-head">
          <PersonAvatar id={meId} size={44} />
          <div>
            <strong>{me?.display_name ?? ""}</strong>
            <div className="small muted">Us</div>
          </div>
        </div>
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="drawer-item" aria-current={isHere(path, s.href) ? "page" : undefined}>
            <DogPic name={s.art} size={36} />
            <span>{s.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
