"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { usePhotoUrls } from "@/lib/photos";
import { shrinkImage } from "@/lib/image";
import { useApp } from "./AppProvider";
import { ImageSources, filesFromPaste } from "./ImageSources";
import type { Thread } from "./Threads";

interface Item {
  id: string;
  thread_id: string;
  author: string;
  kind: "note" | "sticky" | "photo" | "link" | "ink";
  text: string | null;
  photo_path: string | null;
  link: string | null;
  ink: string | null; // JSON { d, w, h }: the path at its drawn size
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  color: string | null;
  z: number;
  rot: number;
  created_at: string;
}
type Box = { x: number; y: number; w: number; h: number; rot: number };

const BOARD_W = 700;
const BOARD_H = 900;
const STICKY = ["#fff3a8", "#ffd1dc", "#c8f0c8", "#cfe3ff", "#ffd9b3", "#e6d4ff"];
const PENS = ["#3b2a2a", "#e0457b", "#2f9a55", "#3f86d4", "#e69b1a"];
const SIZE: Record<Item["kind"], [number, number]> = { note: [240, 110], sticky: [170, 160], photo: [240, 240], link: [240, 64], ink: [100, 100] };

/** Where an item sits; older items (from before boards) get a tidy spot. */
function boxOf(i: Item, index: number): Box {
  const [w, h] = SIZE[i.kind];
  if (i.x != null && i.y != null) return { x: i.x, y: i.y, w: i.w ?? w, h: i.h ?? h, rot: i.rot ?? 0 };
  return { x: 16 + (index % 2) * 260, y: 16 + Math.floor(index / 2) * 250, w, h, rot: i.rot ?? 0 };
}

/**
 * A board: sticky notes, pictures, links and doodles you
 * can drag anywhere and resize with a corner. Changes land for the other
 * person quietly; no feed, no push.
 */
export function Board({ thread }: { thread: Thread }) {
  const { meId, nameOf, toast } = useApp();
  const router = useRouter();
  const supabase = supabaseBrowser();
  const { data: items = [] } = useLive<Item[]>(
    `board:${thread.id}`,
    async () => {
      const { data, error } = await supabase.from("thread_items").select("*").eq("thread_id", thread.id).order("z").order("created_at");
      if (error) throw error;
      return data as Item[];
    },
    ["thread_items"],
  );
  const urls = usePhotoUrls(items.flatMap((i) => (i.photo_path ? [i.photo_path] : [])));
  const [tool, setTool] = useState<"move" | "pen">("move");
  const [pen, setPen] = useState(PENS[0]);
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | "photo" | "link">(null);
  const [menu, setMenu] = useState(false);
  // Live positions while a finger is dragging (saved on release).
  const [local, setLocal] = useState<Record<string, Box>>({});
  const [stroke, setStroke] = useState<{ x: number; y: number }[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  // The finger's gesture moves the element directly (no re-render per frame),
  // then saves once on release. Much smoother on phones.
  const gesture = useRef<{ id: string; el: HTMLElement; mode: "move" | "resize" | "rotate"; sx: number; sy: number; box: Box; next: Box; moved: boolean } | null>(null);

  // Opening the board (and anything that lands while it's open) counts as seen.
  const last = items[items.length - 1]?.created_at ?? thread.last_at;
  useEffect(() => {
    supabase.from("thread_reads").upsert({ thread_id: thread.id, user_id: meId, seen_at: new Date().toISOString() }).then(() => refreshAll());
  }, [thread.id, last, meId, supabase]);

  const maxZ = items.reduce((m, i) => Math.max(m, i.z), 0);
  const boxes = new Map(items.map((i, n) => [i.id, local[i.id] ?? boxOf(i, n)]));

  /** Canvas coordinates of a pointer (undoing scroll and zoom). */
  function at(e: { clientX: number; clientY: number }) {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }
  /** Somewhere in view to drop a new thing. */
  function spot(w: number, h: number) {
    const el = scroller.current;
    const cx = el ? (el.scrollLeft + el.clientWidth / 2) / scale : 200;
    const cy = el ? (el.scrollTop + el.clientHeight / 2) / scale : 200;
    return { x: Math.max(8, cx - w / 2 + (Math.random() * 40 - 20)), y: Math.max(8, cy - h / 2 + (Math.random() * 40 - 20)) };
  }

  async function add(kind: Item["kind"], fields: Partial<Item>) {
    const [w, h] = SIZE[kind];
    const p = spot(fields.w ?? w, fields.h ?? h);
    const { data, error } = await supabase
      .from("thread_items")
      .insert({ thread_id: thread.id, author: meId, kind, x: p.x, y: p.y, w, h, z: maxZ + 1, ...fields })
      .select("id")
      .single();
    if (error) return toast(error.message);
    refreshAll();
    setSelected(data.id);
    if (kind === "sticky" || kind === "note") setEditing(data.id);
  }
  async function patch(id: string, fields: Partial<Item>) {
    const { error } = await supabase.from("thread_items").update(fields).eq("id", id);
    if (error) toast(error.message);
    refreshAll();
  }
  async function remove(id: string) {
    await supabase.from("thread_items").delete().eq("id", id);
    setSelected(null);
    refreshAll();
  }
  async function addPhotos(files: File[]) {
    setAdding(null);
    for (const f of files) {
      const { blob, ext, width, height } = await shrinkImage(f);
      const path = `${meId}/threads/${thread.id}/${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
      if (error) {
        toast(error.message);
        continue;
      }
      const w = 240;
      const h = width && height ? Math.round((240 * height) / width) : 240;
      await add("photo", { photo_path: path, w, h });
    }
  }

  /* ── dragging and resizing ─────────────────────────────────────────── */
  function down(e: React.PointerEvent, i: Item, mode: "move" | "resize" | "rotate") {
    if (tool !== "move" || editing === i.id) return;
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const el = (target.closest(".board-item") as HTMLElement) ?? target;
    const box = boxes.get(i.id)!;
    gesture.current = { id: i.id, el, mode, sx: e.clientX, sy: e.clientY, box, next: box, moved: false };
    setSelected(i.id);
  }
  function paint(el: HTMLElement, b: Box) {
    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;
    el.style.width = `${b.w}px`;
    el.style.height = `${b.h}px`;
    el.style.transform = `rotate(${b.rot}deg)`;
  }
  function move(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const dx = (e.clientX - g.sx) / scale;
    const dy = (e.clientY - g.sy) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
    const b = g.box;
    let next: Box;
    if (g.mode === "move") next = { ...b, x: Math.min(BOARD_W - 30, Math.max(-b.w + 30, b.x + dx)), y: Math.min(BOARD_H - 30, Math.max(0, b.y + dy)) };
    else if (g.mode === "resize") next = { ...b, w: Math.max(50, b.w + dx), h: Math.max(36, b.h + dy) };
    else {
      // Tilt: the angle from the item's center to your finger.
      const r = g.el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      const snapped = Math.abs(deg) < 4 ? 0 : deg; // easy to get back to straight
      next = { ...b, rot: Math.round(snapped) };
    }
    g.next = next;
    paint(g.el, next);
  }
  async function up() {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !g.moved) return;
    const b = g.next;
    // Hold the new spot locally until the save comes back, so nothing snaps.
    setLocal((l) => ({ ...l, [g.id]: b }));
    await patch(g.id, { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), rot: b.rot, z: maxZ + 1 });
    setLocal((l) => {
      const { [g.id]: _drop, ...rest } = l;
      void _drop;
      return rest;
    });
  }

  /* ── drawing ───────────────────────────────────────────────────────── */
  function penDown(e: React.PointerEvent) {
    if (tool !== "pen") {
      if (e.target === canvas.current) {
        setSelected(null);
        setEditing(null);
      }
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setStroke([at(e)]);
  }
  function penMove(e: React.PointerEvent) {
    if (stroke) setStroke([...stroke, at(e)]);
  }
  async function penUp() {
    const pts = stroke;
    setStroke(null);
    if (!pts || pts.length < 2) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs) - 4;
    const y0 = Math.min(...ys) - 4;
    const w = Math.max(...xs) - x0 + 4;
    const h = Math.max(...ys) - y0 + 4;
    const d = pts.map((p, n) => `${n ? "L" : "M"}${Math.round(p.x - x0)} ${Math.round(p.y - y0)}`).join(" ");
    const { error } = await supabase
      .from("thread_items")
      .insert({ thread_id: thread.id, author: meId, kind: "ink", ink: JSON.stringify({ d, w, h }), color: pen, x: x0, y: y0, w, h, z: maxZ + 1 });
    if (error) toast(error.message);
    refreshAll();
  }

  const sel = items.find((i) => i.id === selected);

  return (
    <div
      className="board-page"
      onPaste={(e) => {
        const fs = filesFromPaste(e);
        if (!fs.length || editing) return;
        e.preventDefault();
        addPhotos(fs);
      }}
    >
      <header className="board-bar">
        <button className="icon-btn" onClick={() => router.back()} aria-label="Back">
          ←
        </button>
        <strong className="grow board-title">
          {thread.emoji ?? "🗒️"} {thread.title}
        </strong>
        <button className="icon-btn" onClick={() => setMenu((m) => !m)} aria-label="More">
          ⋯
        </button>
      </header>
      {menu && (
        <div className="board-menu">
          <button
            className="btn btn-sm"
            onClick={async () => {
              await supabase.from("threads").update({ archived_at: thread.archived_at ? null : new Date().toISOString() }).eq("id", thread.id);
              refreshAll();
              toast(thread.archived_at ? "Back above the feed" : "Archived. It lives in Saved now 🔖");
              router.push("/");
            }}
          >
            {thread.archived_at ? "Unarchive" : "Archive"}
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={async () => {
              if (!confirm(`Delete "${thread.title}" and everything on it?`)) return;
              await supabase.from("threads").delete().eq("id", thread.id);
              refreshAll();
              router.push("/");
            }}
          >
            Delete board
          </button>
        </div>
      )}

      <div ref={scroller} className={`board-scroll${tool === "pen" ? " drawing" : ""}`}>
        <div
          ref={canvas}
          className="board-canvas"
          style={{ width: BOARD_W, height: BOARD_H, transform: `scale(${scale})` }}
          onPointerDown={penDown}
          onPointerMove={penMove}
          onPointerUp={penUp}
        >
          {items.map((i) => {
            const b = boxes.get(i.id)!;
            const isSel = selected === i.id;
            const common = {
              className: `board-item k-${i.kind}${isSel ? " sel" : ""}`,
              style: { left: b.x, top: b.y, width: b.w, height: b.h, transform: `rotate(${b.rot}deg)`, zIndex: isSel ? 9999 : i.z, background: i.kind === "sticky" ? (i.color ?? STICKY[0]) : undefined },
              onPointerDown: (e: React.PointerEvent) => down(e, i, "move"),
              onPointerMove: move,
              onPointerUp: up,
              onDoubleClick: () => (i.kind === "sticky" || i.kind === "note") && setEditing(i.id),
            };
            let body: React.ReactNode = null;
            if (i.kind === "ink" && i.ink) {
              const ink = JSON.parse(i.ink) as { d: string; w: number; h: number };
              body = (
                <svg viewBox={`0 0 ${ink.w} ${ink.h}`} preserveAspectRatio="none" width="100%" height="100%">
                  <path d={ink.d} fill="none" stroke={i.color ?? PENS[0]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
              );
            } else if (i.kind === "photo" && i.photo_path) {
              // eslint-disable-next-line @next/next/no-img-element
              body = urls[i.photo_path] ? <img src={urls[i.photo_path]} alt="" draggable={false} /> : <span className="board-wait" />;
            } else if (i.kind === "link" && i.link) {
              body = (
                <a href={i.link} target="_blank" rel="noreferrer" className="keep-case" onPointerDown={(e) => tool === "move" && isSel && e.stopPropagation()}>
                  🔗 {i.link.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              );
            } else if (editing === i.id) {
              body = (
                <textarea
                  className="board-edit"
                  defaultValue={i.text ?? ""}
                  autoFocus
                  placeholder={i.kind === "sticky" ? "write on it…" : "a thought…"}
                  onBlur={(e) => {
                    setEditing(null);
                    const t = e.target.value.trim();
                    if (!t && i.kind === "note") remove(i.id);
                    else if (t !== (i.text ?? "")) patch(i.id, { text: t || null });
                  }}
                />
              );
            } else body = <span className="board-text">{i.text || (i.kind === "sticky" ? "" : "…")}</span>;
            return (
              <div key={i.id} {...common}>
                {body}
                {i.kind !== "ink" && <span className="board-by">{i.author === meId ? "" : nameOf(i.author).slice(0, 1)}</span>}
                {isSel && tool === "move" && (
                  <>
                    <span className="board-resize" onPointerDown={(e) => down(e, i, "resize")} onPointerMove={move} onPointerUp={up} aria-label="Resize" />
                    <span className="board-rotate" onPointerDown={(e) => down(e, i, "rotate")} onPointerMove={move} onPointerUp={up} aria-label="Tilt" />
                  </>
                )}
              </div>
            );
          })}
          {stroke && stroke.length > 1 && (
            <svg className="board-live" width={BOARD_W} height={BOARD_H}>
              <path d={stroke.map((p, n) => `${n ? "L" : "M"}${p.x} ${p.y}`).join(" ")} fill="none" stroke={pen} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>

      {sel && tool === "move" && !editing && (
        <div className="board-selbar">
          {(sel.kind === "sticky" || sel.kind === "note") && (
            <button className="btn btn-sm" onClick={() => setEditing(sel.id)}>
              ✏️ Write
            </button>
          )}
          {sel.kind === "sticky" &&
            STICKY.map((c) => <button key={c} className="board-swatch" style={{ background: c }} aria-label="Color" onClick={() => patch(sel.id, { color: c })} />)}
          {sel.kind === "ink" &&
            PENS.map((c) => <button key={c} className="board-swatch" style={{ background: c }} aria-label="Color" onClick={() => patch(sel.id, { color: c })} />)}
          <button className="btn btn-sm btn-ghost" onClick={() => remove(sel.id)}>
            🗑
          </button>
        </div>
      )}

      {adding === "photo" && (
        <div className="board-menu">
          <label className="btn btn-sm">
            📷 Upload
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(Array.from(e.target.files ?? []))} />
          </label>
          <ImageSources onFiles={addPhotos} />
        </div>
      )}
      {adding === "link" && (
        <form
          className="board-menu"
          onSubmit={(e) => {
            e.preventDefault();
            const v = (new FormData(e.currentTarget).get("link") as string).trim();
            if (!v) return;
            setAdding(null);
            add("link", { link: /^https?:\/\//.test(v) ? v : `https://${v}` });
          }}
        >
          <input name="link" className="input input-sm grow keep-case" placeholder="paste a link" autoFocus />
          <button className="btn btn-sm btn-primary">Add</button>
        </form>
      )}

      <nav className="board-tools">
        <button aria-pressed={tool === "move"} onClick={() => setTool("move")} aria-label="Move things">
          ✋
        </button>
        <button aria-pressed={tool === "pen"} onClick={() => (setTool("pen"), setSelected(null))} aria-label="Draw">
          ✏️
        </button>
        {tool === "pen" &&
          PENS.map((c) => <button key={c} className="board-swatch" aria-pressed={pen === c} style={{ background: c }} onClick={() => setPen(c)} aria-label="Pen color" />)}
        {tool === "move" && (
          <>
            <button onClick={() => add("sticky", { color: STICKY[Math.floor(Math.random() * STICKY.length)] })} aria-label="Sticky note">
              🗒️
            </button>
            <button onClick={() => add("note", { text: null })} aria-label="Text">
              Aa
            </button>
            <button aria-pressed={adding === "photo"} onClick={() => setAdding(adding === "photo" ? null : "photo")} aria-label="Picture">
              🖼️
            </button>
            <button aria-pressed={adding === "link"} onClick={() => setAdding(adding === "link" ? null : "link")} aria-label="Link">
              🔗
            </button>
          </>
        )}
        <span className="grow" />
        <button onClick={() => setScale((s) => Math.max(0.4, +(s - 0.2).toFixed(1)))} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => setScale((s) => Math.min(1.6, +(s + 0.2).toFixed(1)))} aria-label="Zoom in">
          +
        </button>
      </nav>
    </div>
  );
}
