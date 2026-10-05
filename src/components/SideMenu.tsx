"use client";

import { copyLink } from "@/lib/links";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useApp } from "./AppProvider";
import { PersonAvatar } from "./PersonAvatar";
import { useSectionBadges } from "@/lib/badges";
import { IconBag, IconPiggy, IconDice, IconLeaf, IconBookmark, IconCalendar, IconFlame, IconFork, IconGear, IconHeart, IconHome, IconKey, IconList, IconPin, IconWallet, IconPaw, IconSparkle, IconDumbbell, IconDrop, IconBone } from "./Art";

/** Every section. Add new ones here; the drawer scrolls, so there's room. */
type Section = { href: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

/** The drawer, in groups so it stays scannable. Add new sections here. */
export const GROUPS: { id: string; title?: string; items: Section[] }[] = [
  {
    id: "life",
    title: "Life",
    items: [
      { href: "/", label: "Home", Icon: IconHome },
      { href: "/calendar", label: "Calendar", Icon: IconCalendar },
      { href: "/lists", label: "To-dos", Icon: IconList },
      { href: "/shopping", label: "Shopping", Icon: IconBag },
      { href: "/eat", label: "Food", Icon: IconFork },
      { href: "/fit", label: "Fuel & move", Icon: IconDumbbell },
      { href: "/water", label: "Water", Icon: IconDrop },
      { href: "/money", label: "My money", Icon: IconWallet },
    ],
  },
  {
    id: "us",
    title: "Us",
    items: [
      { href: "/little", label: "Little things", Icon: IconHeart },
      { href: "/dogs", label: "Dogs", Icon: IconPaw },
      { href: "/pup", label: "Pup parenting", Icon: IconBone },
      { href: "/do", label: "Do something", Icon: IconSparkle },
      { href: "/goals", label: "Goals", Icon: IconPiggy },
      { href: "/nerd", label: "Nerd dungeon", Icon: IconDice },
      { href: "/garden", label: "Garden", Icon: IconLeaf },
    ],
  },
  { id: "just-us", title: "Just us", items: [{ href: "/spicy", label: "Spicy", Icon: IconFlame }] },
];
export const SECTIONS: Section[] = GROUPS.flatMap((g) => g.items);

const isHere = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** The ☰ button (top left of every page). */
export function MenuButton() {
  const { setMenuOpen, meId } = useApp();
  const fresh = useSectionBadges(meId);
  return (
    <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label={fresh.size ? "Open menu (something new)" : "Open menu"}>
      {fresh.size > 0 && <span className="menu-dot" aria-hidden />}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="24" height="24" aria-hidden>
        <path d="M4 7h16M4 12h16M4 17h11" />
      </svg>
    </button>
  );
}

/* ─── each person's own arrangement ─────────────────────────────────────── */

// Stored per person in nav_prefs (RLS: only yours). Pinned items show at the
// top and hide from their category; unpin and they're back where they were.
type NavGroup = { id: string; title: string; items: string[] };
type NavLayout = { v: 1; pinned: string[]; groups: NavGroup[] };
const BY_HREF = new Map(SECTIONS.map((x) => [x.href, x]));
const DEFAULT_LAYOUT: NavLayout = { v: 1, pinned: [], groups: GROUPS.map((g) => ({ id: g.id, title: g.title ?? "", items: g.items.map((i) => i.href) })) };

/** Drop unknown sections, and slot in any new ones where the default puts them. */
function normalize(l: NavLayout | null | undefined): NavLayout {
  if (!l?.groups?.length) return DEFAULT_LAYOUT;
  const seen = new Set<string>();
  const groups = l.groups.map((g) => ({ ...g, items: g.items.filter((h) => BY_HREF.has(h) && !seen.has(h) && (seen.add(h), true)) }));
  for (const dg of GROUPS)
    for (const it of dg.items)
      if (!seen.has(it.href)) {
        const home = groups.find((g) => g.id === dg.id) ?? groups[groups.length - 1];
        home.items.push(it.href);
        seen.add(it.href);
      }
  return { v: 1, pinned: (l.pinned ?? []).filter((h) => BY_HREF.has(h)), groups };
}

function useNavLayout() {
  const { meId } = useApp();
  const { data } = useLive<NavLayout | null>(
    `nav_prefs:${meId}`,
    async () => {
      if (!meId) return null;
      const { data, error } = await supabaseBrowser().from("nav_prefs").select("layout").eq("user_id", meId).maybeSingle();
      if (error) return null; // table missing or offline: the default menu still works
      return (data?.layout as NavLayout) ?? null;
    },
    ["nav_prefs"],
  );
  return normalize(data);
}

/** Slide-out drawer with every section; Saved and Settings are small icons up top. */
export function SideMenu() {
  const { menuOpen, setMenuOpen, meId, me, toast } = useApp();
  const path = usePathname();
  const fresh = useSectionBadges(meId);
  const saved = useNavLayout();
  const [draft, setDraft] = useState<NavLayout | null>(null);
  const layout = draft ?? saved;
  const editing = draft !== null;

  // Close on navigation and on Escape.
  useEffect(() => setMenuOpen(false), [path, setMenuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, setMenuOpen]);

  async function save(next: NavLayout | null) {
    const db = supabaseBrowser();
    const { error } = next ? await db.from("nav_prefs").upsert({ user_id: meId, layout: next, updated_at: new Date().toISOString() }) : await db.from("nav_prefs").delete().eq("user_id", meId);
    if (error) return toast(error.message);
    refreshAll();
  }

  const item = (href: string) => {
    const x = BY_HREF.get(href)!;
    return (
      <Link key={href} href={href} className="drawer-item" aria-current={isHere(path, href) ? "page" : undefined}>
        <x.Icon width={22} height={22} />
        <span>{x.label}</span>
        {fresh.has(href) && <span className="drawer-dot" aria-label="something new" />}
      </Link>
    );
  };
  const pinned = new Set(layout.pinned);

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
          <Link href="/places" className="icon-btn menu-btn-rel" aria-label="Address book" aria-current={isHere(path, "/places") ? "page" : undefined}>
            <IconPin />
            {fresh.has("/places") && <span className="menu-dot" aria-hidden />}
          </Link>
          <Link href="/keys" className="icon-btn" aria-label="Keys" aria-current={isHere(path, "/keys") ? "page" : undefined}>
            <IconKey />
          </Link>
          <Link href="/settings" className="icon-btn" aria-label="Settings" aria-current={isHere(path, "/settings") ? "page" : undefined}>
            <IconGear />
          </Link>
          {/* Link to whatever page (and tab) is open right now. */}
          <button className="icon-btn" aria-label="Copy a link to this page" onClick={() => copyLink(window.location.pathname + window.location.search, toast)}>
            🔗
          </button>
        </div>
        {editing ? (
          <ArrangeMenu
            layout={layout}
            onChange={setDraft}
            onDone={() => {
              save(draft);
              setDraft(null);
            }}
            onReset={() => {
              save(null);
              setDraft(null);
            }}
          />
        ) : (
          <>
            {layout.pinned.length > 0 && (
              <div className="drawer-group">
                <div className="drawer-heading">📌 Pinned</div>
                {layout.pinned.map(item)}
              </div>
            )}
            {layout.groups.map((g) => {
              const items = g.items.filter((h) => !pinned.has(h));
              if (!items.length) return null;
              return (
                <div key={g.id} className="drawer-group">
                  {g.title && <div className="drawer-heading">{g.title}</div>}
                  {items.map(item)}
                </div>
              );
            })}
            <button className="drawer-arrange" onClick={() => setDraft(structuredClone(layout))}>
              ✎ Arrange my menu
            </button>
          </>
        )}
      </nav>
    </>
  );
}

/** Edit mode: drag ≡ to reorder (across categories too), 📌 to pin, rename or add categories. */
function ArrangeMenu({ layout, onChange, onDone, onReset }: { layout: NavLayout; onChange: (l: NavLayout) => void; onDone: () => void; onReset: () => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const latest = useRef(layout);
  useEffect(() => {
    latest.current = layout;
  }, [layout]);

  const move = (href: string, toGroup: string, before: string | null) => {
    const l: NavLayout = structuredClone(latest.current);
    for (const g of l.groups) g.items = g.items.filter((h) => h !== href);
    const g = l.groups.find((x) => x.id === toGroup);
    if (!g) return;
    const at = before ? g.items.indexOf(before) : -1;
    if (at < 0) g.items.push(href);
    else g.items.splice(at, 0, href);
    latest.current = l;
    onChange(l);
  };

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const over = el?.closest<HTMLElement>("[data-nav-item]");
    if (over && over.dataset.navItem !== dragging) {
      const r = over.getBoundingClientRect();
      const g = over.dataset.group!;
      const list = latest.current.groups.find((x) => x.id === g)!.items;
      const i = list.indexOf(over.dataset.navItem!);
      const after = e.clientY > r.top + r.height / 2;
      const before = after ? (list[i + 1] === dragging ? list[i + 2] : list[i + 1]) ?? null : over.dataset.navItem!;
      move(dragging, g, before);
      return;
    }
    const head = el?.closest<HTMLElement>("[data-nav-group]");
    if (head) {
      const g = head.dataset.navGroup!;
      const first = latest.current.groups.find((x) => x.id === g)!.items.find((h) => h !== dragging) ?? null;
      move(dragging, g, first);
    }
  }

  const set = (fn: (l: NavLayout) => void) => {
    const l: NavLayout = structuredClone(layout);
    fn(l);
    onChange(l);
  };

  return (
    <div className="nav-arrange" onPointerMove={onPointerMove} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>
      <div className="row-between nav-arrange-head">
        <strong>Arrange my menu</strong>
        <button className="btn btn-sm btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
      <p className="small faint" style={{ margin: "0 4px 8px" }}>
        Drag ≡ to move things, 📌 to pin to the top. Only your menu changes.
      </p>
      {layout.groups.map((g, gi) => (
        <div key={g.id} className="drawer-group nav-arrange-group">
          <div className="nav-arrange-title" data-nav-group={g.id}>
            <input className="input input-sm grow" value={g.title} onChange={(e) => set((l) => (l.groups[gi].title = e.target.value))} placeholder="category name" aria-label="Category name" />
            {layout.groups.length > 1 && (
              <button
                className="btn-link small faint"
                aria-label={`Remove category ${g.title}`}
                onClick={() =>
                  set((l) => {
                    const [gone] = l.groups.splice(gi, 1);
                    l.groups[Math.max(0, gi - 1)].items.push(...gone.items);
                  })
                }
              >
                ✕
              </button>
            )}
          </div>
          {g.items.map((href) => {
            const x = BY_HREF.get(href)!;
            const pin = layout.pinned.includes(href);
            return (
              <div key={href} className={`nav-arrange-item${dragging === href ? " dragging" : ""}`} data-nav-item={href} data-group={g.id}>
                <span
                  className="nav-handle"
                  aria-label={`Drag ${x.label}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDragging(href);
                  }}
                >
                  ≡
                </span>
                <x.Icon width={20} height={20} />
                <span className="grow">{x.label}</span>
                <button
                  className={`nav-pin${pin ? " on" : ""}`}
                  aria-pressed={pin}
                  aria-label={pin ? `Unpin ${x.label}` : `Pin ${x.label}`}
                  onClick={() => set((l) => (l.pinned = pin ? l.pinned.filter((h) => h !== href) : [...l.pinned, href]))}
                >
                  📌
                </button>
              </div>
            );
          })}
          {g.items.length === 0 && (
            <div className="nav-arrange-empty" data-nav-group={g.id}>
              drag things here
            </div>
          )}
        </div>
      ))}
      <div className="row-between" style={{ marginTop: 10 }}>
        <button className="btn btn-sm" onClick={() => set((l) => l.groups.push({ id: `c${Date.now().toString(36)}`, title: "New category", items: [] }))}>
          ＋ Category
        </button>
        <button className="btn-link small faint" onClick={onReset}>
          reset to default
        </button>
      </div>
    </div>
  );
}
