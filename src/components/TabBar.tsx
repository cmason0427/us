"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCalendar, IconFork, IconHome, IconList, IconPlus, IconSparkle } from "./Art";
import { useApp } from "./AppProvider";

const TABS = [
  { href: "/", label: "Home", Icon: IconHome },
  { href: "/calendar", label: "Calendar", Icon: IconCalendar },
  { href: "/do", label: "Do Something", Icon: IconSparkle },
  null, // the + button sits in the middle
  { href: "/eat", label: "Eat", Icon: IconFork },
  { href: "/lists", label: "Lists", Icon: IconList },
] as const;

export function TabBar() {
  const path = usePathname();
  const { openAdd } = useApp();
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {TABS.map((t) =>
          t ? (
            <Link key={t.href} href={t.href} className="tab" aria-current={(t.href === "/" ? path === "/" : path.startsWith(t.href)) ? "page" : undefined}>
              <t.Icon />
              <span>{t.label === "Do Something" ? "Do" : t.label}</span>
            </Link>
          ) : (
            <button key="add" className="fab" onClick={() => openAdd("menu")} aria-label="Add something">
              <IconPlus />
            </button>
          ),
        )}
      </div>
    </nav>
  );
}
