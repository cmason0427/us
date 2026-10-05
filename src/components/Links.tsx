"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
import { usePhotoUrls } from "@/lib/photos";
import { PLACES, TOKEN, appPath, targetOf, token, type Dest } from "@/lib/links";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { useThreads } from "./Threads";

type Pick = { label: string; path: string; emoji: string; hint?: string };

/** Things that can be linked right now, besides pages: updates, boards (and what's written on them), plans. */
function useLinkables(on: boolean) {
  const { nameOf, profiles } = useApp();
  const { threads } = useThreads();
  const boards = threads.filter((t) => !t.archived_at);
  const { data: posts = [] } = useLive<{ id: string; author: string; text: string | null; kind: string; created_at: string }[]>(
    on ? "link:posts" : "link:off",
    async () => {
      if (!on) return [];
      const { data } = await supabaseBrowser().from("posts").select("id, author, text, kind, created_at, reply").or("reply.is.null,reply.neq.no").order("created_at", { ascending: false }).limit(60);
      return data ?? [];
    },
    ["posts"],
  );
  const live = new Set(boards.map((b) => b.id));
  const { data: notes = [] } = useLive<{ id: string; thread_id: string; kind: string; text: string | null }[]>(
    on ? "link:board-notes" : "link:off2",
    async () => {
      if (!on) return [];
      const { data } = await supabaseBrowser().from("thread_items").select("id, thread_id, kind, text").in("kind", ["note", "sticky", "box"]).not("text", "is", null).order("created_at", { ascending: false }).limit(300);
      return data ?? [];
    },
    ["thread_items"],
  );
  const { data: events = [] } = useLive<{ id: string; title: string; start_time: string; response_status: string | null }[]>(
    on ? "link:events" : "link:off3",
    async () => {
      if (!on) return [];
      const from = new Date(Date.now() - 14 * 864e5).toISOString();
      const { data } = await supabaseBrowser().from("events").select("id, title, start_time, response_status").gte("start_time", from).order("start_time").limit(120);
      return data ?? [];
    },
    ["events"],
  );
  const firstLine = (t: string | null) => (t ?? "").replace(/^#+\s*/gm, "").replace(/\[( |x|X)\]\s?/g, "").replace(TOKEN, "$2").trim().split("\n")[0].slice(0, 60);
  const out: { title: string; rows: Pick[] }[] = [
    {
      title: "Pages & tabs",
      rows: [
        ...PLACES.map((d) => ({ label: d.label, path: d.path, emoji: d.emoji })),
        ...profiles.map((p) => ({ label: `Little things · ${p.display_name}`, path: `/little?about=${p.id}`, emoji: "💞" })),
      ],
    },
    { title: "Boards", rows: boards.map((b) => ({ label: b.title, path: `/threads/${b.id}`, emoji: b.emoji ?? "🗒️" })) },
    {
      title: "On boards",
      rows: notes
        .filter((n) => live.has(n.thread_id) && firstLine(n.text))
        .map((n) => ({ label: firstLine(n.text), path: `/threads/${n.thread_id}?item=${n.id}`, emoji: n.kind === "box" ? "▭" : n.kind === "sticky" ? "🗒️" : "✏️", hint: boards.find((b) => b.id === n.thread_id)?.title })),
    },
    {
      title: "Updates",
      rows: posts.map((p) => ({
        label: firstLine(p.text) || (p.kind === "star" ? "a star" : p.kind === "time" ? "a what-time" : "an update"),
        path: `/posts/${p.id}`,
        emoji: p.kind === "star" ? "⭐" : "🌼",
        hint: `${nameOf(p.author)} · ${format(new Date(p.created_at), "MMM d")}`,
      })),
    },
    {
      title: "Calendar",
      rows: events.filter((e) => e.response_status !== "declined").map((e) => ({ label: e.title, path: `/calendar?event=${e.id}`, emoji: "📅", hint: format(new Date(e.start_time), "EEE, MMM d") })),
    },
  ];
  return out;
}

/**
 * Search everything linkable and pick one, as a link (a chip that takes them
 * there) or an embed (a little preview of it, right where it's put). The
 * choice is remembered on this phone.
 */
export function LinkPicker({ onPick, onClose, embeddable = true }: { onPick: (label: string, path: string, embed: boolean) => void; onClose: () => void; embeddable?: boolean }) {
  const [q, setQ] = useState("");
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    try {
      if (embeddable && localStorage.getItem("link-embed") === "1") Promise.resolve().then(() => setEmbed(true));
    } catch {}
  }, [embeddable]);
  const pickMode = (on: boolean) => {
    setEmbed(on);
    try {
      localStorage.setItem("link-embed", on ? "1" : "0");
    } catch {}
  };
  const groups = useLinkables(true);
  const needle = q.trim().toLowerCase();
  const shown = groups.map((g) => ({ ...g, rows: g.rows.filter((r) => !needle || `${r.label} ${r.hint ?? ""}`.toLowerCase().includes(needle)).slice(0, needle ? 30 : g.title === "Pages & tabs" ? 8 : 6) })).filter((g) => g.rows.length);
  return (
    <Sheet title="🔗 Link something" onClose={onClose}>
      <div className="stack">
        {embeddable && (
          <div className="seg seg-sm" role="group" aria-label="How it shows">
            <button aria-pressed={!embed} onClick={() => pickMode(false)}>
              🔗 Take them there
            </button>
            <button aria-pressed={embed} onClick={() => pickMode(true)}>
              🪟 Embed it
            </button>
          </div>
        )}
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search pages, boards, updates, plans…" autoFocus aria-label="Search" />
        <div className="link-pick-list">
          {shown.map((g) => (
            <section key={g.title}>
              <h3 className="link-pick-title">{g.title}</h3>
              {g.rows.map((r) => (
                <button key={r.path} className="link-pick-row" onClick={() => onPick(r.label, r.path, embed)}>
                  <span aria-hidden>{r.emoji}</span>
                  <span className="grow">{r.label}</span>
                  {r.hint && <span className="small faint">{r.hint}</span>}
                </button>
              ))}
            </section>
          ))}
          {!shown.length && <p className="muted small">Nothing like that. Only things you can both see can be linked.</p>}
          {!needle && <p className="small faint" style={{ margin: 0 }}>Search to see every page, tab, board, update and plan.</p>}
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Type \ in a text box to link something. Spread `onInput` onto the box and
 * render `picker`. While the picker is open, `picking` is true (so a box that
 * saves when it loses focus can wait).
 */
export function useLinkInsert() {
  const [at, setAt] = useState<{ el: HTMLTextAreaElement | HTMLInputElement; i: number } | null>(null);
  const picking = useRef(false);
  const onInput = (e: React.FormEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const el = e.currentTarget;
    const i = el.selectionStart ?? 0;
    if ((e.nativeEvent as InputEvent).data === "\\" && el.value[i - 1] === "\\") {
      picking.current = true;
      setAt({ el, i: i - 1 });
    }
  };
  const close = () => {
    picking.current = false;
    const a = at;
    setAt(null);
    if (a) setTimeout(() => a.el.focus(), 30);
  };
  const insert = (label: string, path: string, embed: boolean) => {
    if (!at) return;
    const { el, i } = at;
    const t = token(label, path, embed);
    const v = el.value;
    // Replace the \ that opened the picker (if it's still there), else insert at the cursor.
    const next = v[i] === "\\" ? v.slice(0, i) + t + v.slice(i + 1) : v.slice(0, i) + t + v.slice(i);
    // Set it the way typing would, so React's onChange sees it.
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
    setter?.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const caret = i + t.length;
    picking.current = false;
    setAt(null);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 30);
  };
  return { onInput, picking, picker: at ? <LinkPicker onPick={insert} onClose={close} /> : null };
}

/** Is the thing a link points at still there (and visible to me)? */
function useAlive(path: string): { alive: boolean | undefined; name: string | null } {
  const t = targetOf(path);
  const { threads } = useThreads();
  const { data } = useLive<boolean | null>(
    `alive:${path}`,
    async () => {
      const db = supabaseBrowser();
      if (t.kind === "post") {
        const { data } = await db.from("posts").select("id, reply").eq("id", t.id).maybeSingle();
        return !!data && data.reply !== "no";
      }
      if (t.kind === "board" && t.item) {
        const { data } = await db.from("thread_items").select("id").eq("id", t.item).maybeSingle();
        return !!data;
      }
      if (t.kind === "event") {
        const { data } = await db.from("events").select("id, response_status").eq("id", t.id).maybeSingle();
        return !!data && data.response_status !== "declined";
      }
      return null; // pages and boards: answered below without a fetch
    },
    t.kind === "post" ? ["posts"] : t.kind === "board" ? ["thread_items"] : t.kind === "event" ? ["events"] : [],
  );
  if (t.kind === "place") return { alive: true, name: t.dest?.label ?? null };
  if (t.kind === "board") {
    const b = threads.find((x) => x.id === t.id);
    if (!threads.length) return { alive: undefined, name: null };
    if (!b) return { alive: false, name: null };
    return { alive: t.item ? (data ?? undefined) : true, name: t.item ? `on ${b.title}` : b.title };
  }
  return { alive: data ?? undefined, name: null };
}

const DEFAULT_LABEL: Record<string, string> = { post: "an update", board: "a board", event: "a plan", place: "a page" };

/** A link to something in the app, as a little chip. Greyed out if it's gone. */
export function AppLink({ path, label }: { path: string; label?: string }) {
  const { alive, name } = useAlive(path);
  const t = targetOf(path);
  const text = label || name || DEFAULT_LABEL[t.kind];
  const emoji = t.kind === "place" ? (t.dest as Dest | null)?.emoji ?? "↗" : t.kind === "post" ? "🌼" : t.kind === "event" ? "📅" : "🗒️";
  if (alive === false)
    return (
      <span className="app-link gone" title="Not here anymore">
        {text} · not here anymore
      </span>
    );
  return (
    <Link className="app-link" href={path} data-href={path} onClick={(e) => e.stopPropagation()}>
      <span aria-hidden>{emoji}</span> {text}
    </Link>
  );
}

/** Text with its app links (`[label](/path)` or a pasted app URL) turned into chips. */
export function linkify(text: string, key = "t"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(`${TOKEN.source}|https?:\\/\\/[^\\s)]+`, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    const path = m[3] ?? appPath(m[0]);
    if (!path) continue; // an outside link: leave it as text
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] === "!" ? <AppEmbed key={`${key}-${n++}`} path={path} label={m[2]} /> : <AppLink key={`${key}-${n++}`} path={path} label={m[2]} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function LinkedText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  return (
    <p className={className} style={style}>
      {linkify(text)}
    </p>
  );
}

type Peek = { title: string; sub?: string; text?: string; photo?: string; kind: string } | false;

/** An embed: a little preview card of the linked thing, right where it's put. Tap to open it. */
export function AppEmbed({ path, label }: { path: string; label?: string }) {
  const { nameOf } = useApp();
  const { threads } = useThreads();
  const t = targetOf(path);
  const { data: peek } = useLive<Peek | null>(
    `embed:${path}`,
    async () => {
      const db = supabaseBrowser();
      if (t.kind === "post") {
        const { data } = await db.from("posts").select("id, author, text, kind, created_at, reply, post_photos(*)").eq("id", t.id).maybeSingle();
        if (!data || data.reply === "no") return false;
        // Surprise pics stay hidden here too.
        const ph = ((data.post_photos ?? []) as { storage_path: string; position: number; hidden?: boolean }[]).filter((p) => !p.hidden).sort((a, b) => a.position - b.position)[0];
        return { kind: "post", title: data.author as string, sub: format(new Date(data.created_at), "EEE, MMM d"), text: (data.text ?? "").replace(TOKEN, "$2").slice(0, 220), photo: ph?.storage_path };
      }
      if (t.kind === "board" && t.item) {
        const { data } = await db.from("thread_items").select("id, kind, text, photo_path, photos, thread_id").eq("id", t.item).maybeSingle();
        if (!data) return false;
        const text = (data.text ?? "").replace(/^#+\s*/gm, "").replace(TOKEN, "$2").slice(0, 220);
        return { kind: "item", title: "", text, photo: data.photo_path ?? (data.photos ?? []).find(Boolean) };
      }
      if (t.kind === "event") {
        const { data } = await db.from("events").select("title, start_time, all_day, location, response_status").eq("id", t.id).maybeSingle();
        if (!data || data.response_status === "declined") return false;
        const when = format(new Date(data.start_time), data.all_day ? "EEE, MMM d" : "EEE, MMM d · h:mm a");
        return { kind: "event", title: data.title, sub: [when, data.location].filter(Boolean).join(" · ") };
      }
      return null;
    },
    t.kind === "post" ? ["posts", "post_photos"] : t.kind === "board" ? ["thread_items"] : t.kind === "event" ? ["events"] : [],
  );
  const photoUrls = usePhotoUrls(peek && peek.photo ? [peek.photo] : []);
  const board = t.kind === "board" ? threads.find((x) => x.id === t.id) : undefined;
  if (peek === false || (t.kind === "board" && threads.length > 0 && !board))
    return (
      <span className="app-link gone" title="Not here anymore">
        {label || "that"} · not here anymore
      </span>
    );
  let head = "";
  let title = label ?? "";
  let sub: string | undefined;
  if (t.kind === "place") {
    head = `${t.dest?.emoji ?? "↗"} page`;
    title = t.dest?.label ?? label ?? "a page";
    sub = "open it ›";
  } else if (t.kind === "board") {
    head = `${board?.emoji ?? "🗒️"} ${t.item ? `on ${board?.title ?? "a board"}` : "board"}`;
    if (!t.item) {
      title = board?.title ?? label ?? "a board";
      sub = "open the board ›";
    }
  } else if (t.kind === "post") {
    head = "🌼 update";
    if (peek) {
      title = nameOf(peek.title);
      sub = peek.sub;
    }
  } else if (t.kind === "event") {
    head = "📅 plan";
    if (peek) {
      title = peek.title;
      sub = peek.sub;
    }
  }
  const text = peek ? peek.text : undefined;
  const img = peek && peek.photo ? photoUrls[peek.photo] : undefined;
  return (
    <Link className="app-embed" href={path} data-href={path} onClick={(e) => e.stopPropagation()}>
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="app-embed-img" />
      )}
      <span className="app-embed-body">
        <span className="app-embed-head">{head}</span>
        {title && <strong>{title}</strong>}
        {text && <span className="app-embed-text">{text}</span>}
        {sub && <span className="app-embed-sub">{sub}</span>}
      </span>
    </Link>
  );
}
