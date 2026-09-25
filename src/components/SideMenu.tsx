"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ComponentType, type SVGProps } from "react";
import { useApp } from "./AppProvider";
import { PersonAvatar } from "./PersonAvatar";
import { IconBag, IconPiggy, IconBookmark, IconCalendar, IconFlame, IconFork, IconGear, IconHome, IconList, IconPaw, IconSparkle } from "./Art";

/** Every section. Add new ones here; the drawer scrolls, so there's room. */
export const SECTIONS: { href: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { href: "/", label: "Home", Icon: IconHome },
  { href: "/calendar", label: "Calendar", Icon: IconCalendar },
  { href: "/do", label: "Do something", Icon: IconSparkle },
  { href: "/eat", label: "Food", Icon: IconFork },
  { href: "/shopping", label: "Shopping", Icon: IconBag },
  { href: "/lists", label: "To-dos", Icon: IconList },
  { href: "/goals", label: "Goals", Icon: IconPiggy },
  { href: "/dogs", label: "Dogs", Icon: IconPaw },
  { href: "/spicy", label: "Spicy", Icon: IconFlame },
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

/** Slide-out drawer with every section; Saved and Settings are small icons up top. */
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
          <PersonAvatar id={meId} size={40} />
          <strong className="grow">{me?.display_name ?? ""}</strong>
          <Link href="/saved" className="icon-btn" aria-label="Saved" aria-current={isHere(path, "/saved") ? "page" : undefined}>
            <IconBookmark />
          </Link>
          <Link href="/settings" className="icon-btn" aria-label="Settings" aria-current={isHere(path, "/settings") ? "page" : undefined}>
            <IconGear />
          </Link>
        </div>
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="drawer-item" aria-current={isHere(path, s.href) ? "page" : undefined}>
            <s.Icon width={22} height={22} />
            <span>{s.label}</span>
          </Link>
        ))}
        {/* Tucked away on purpose: there when you want it, never a to-do. */}
        <Link href="/little" className="drawer-quiet" aria-current={isHere(path, "/little") ? "page" : undefined}>
          💝 Little things
        </Link>
      </nav>
    </>
  );
}
