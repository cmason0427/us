"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive } from "@/lib/useLive";
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
  const firstLine = (t: string | null) => (t ?? "").replace(/^#+\s*/gm, "").replace(/\[( |x|X)\]\s?/g, "").replace(TOKEN, "$1").trim().split("\n")[0].slice(0, 60);
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

/** Search everything linkable and pick one. */
export function LinkPicker({ onPick, onClose }: { onPick: (label: string, path: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const groups = useLinkables(true);
  const needle = q.trim().toLowerCase();
  const shown = groups.map((g) => ({ ...g, rows: g.rows.filter((r) => !needle || `${r.label} ${r.hint ?? ""}`.toLowerCase().includes(needle)).slice(0, needle ? 30 : g.title === "Pages & tabs" ? 8 : 6) })).filter((g) => g.rows.length);
  return (
    <Sheet title="🔗 Link something" onClose={onClose}>
      <div className="stack">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search pages, boards, updates, plans…" autoFocus aria-label="Search" />
        <div className="link-pick-list">
          {shown.map((g) => (
            <section key={g.title}>
              <h3 className="link-pick-title">{g.title}</h3>
              {g.rows.map((r) => (
                <button key={r.path} className="link-pick-row" onClick={() => onPick(r.label, r.path)}>
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
  const insert = (label: string, path: string) => {
    if (!at) return;
    const { el, i } = at;
    const t = token(label, path);
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
    const path = m[2] ?? appPath(m[0]);
    if (!path) continue; // an outside link: leave it as text
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<AppLink key={`${key}-${n++}`} path={path} label={m[1]} />);
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
