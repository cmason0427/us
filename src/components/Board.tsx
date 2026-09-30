"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { usePhotoUrls } from "@/lib/photos";
import { shrinkImage } from "@/lib/image";
import { applyFormat, renderMini, toggleCheck } from "@/lib/miniMarkdown";
import { useApp } from "./AppProvider";
import { ImageSources, filesFromPaste } from "./ImageSources";
import { StickerTray, saveSticker } from "./BoardStickers";
import type { Thread } from "./Threads";

interface Item {
  id: string;
  thread_id: string;
  author: string;
  kind: "note" | "sticky" | "photo" | "link" | "ink" | "sticker";
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
  style: Look | null;
  hearts: string[];
  created_at: string;
}
/** How text looks: size, bold, font, color, alignment. */
type Look = { fs?: number; b?: boolean; font?: "sans" | "serif"; c?: string; al?: "left" | "center" };
type Box = { x: number; y: number; w: number; h: number; rot: number };
type View = { x: number; y: number; z: number };

const STICKY = ["#fff3a8", "#ffd1dc", "#c8f0c8", "#cfe3ff", "#ffd9b3", "#e6d4ff"];
const PENS = ["#3b2a2a", "#e0457b", "#2f9a55", "#3f86d4", "#e69b1a", "#8a4fd6"];
const SIZES: { label: string; fs: number }[] = [
  { label: "S", fs: 14 },
  { label: "M", fs: 20 },
  { label: "L", fs: 30 },
  { label: "XL", fs: 46 },
];
const SIZE: Record<Item["kind"], [number, number]> = { note: [200, 40], sticky: [150, 150], photo: [170, 170], link: [180, 48], ink: [100, 100], sticker: [110, 110] };
const MIN_Z = 0.2;
const MAX_Z = 4;

/** Where an item sits; older items (from before boards) get a tidy spot. */
function boxOf(i: Item, index: number): Box {
  const [w, h] = SIZE[i.kind];
  if (i.x != null && i.y != null) return { x: i.x, y: i.y, w: i.w ?? w, h: i.h ?? h, rot: i.rot ?? 0 };
  return { x: 12 + (index % 2) * 180, y: 12 + Math.floor(index / 2) * 180, w, h, rot: i.rot ?? 0 };
}
const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));

// The in-progress gesture; never rendered from.
type Gesture =
  | { kind: "pan"; sx: number; sy: number; v: View; moved: boolean; target: HTMLElement }
  | { kind: "item"; id: string; el: HTMLElement; mode: "move" | "resize" | "rotate"; sx: number; sy: number; box: Box; next: Box; moved: boolean; target: HTMLElement; wasSel: boolean }
  | { kind: "pinch"; d0: number; mx: number; my: number; v: View }
  | { kind: "pen"; pts: { x: number; y: number }[] }
  | { kind: "idle" };

/**
 * A board: stickies, text, pictures, stickers, links and doodles on an open
 * canvas. Pinch to zoom, drag empty space to look around, drag a thing to
 * move it. Changes land for the other person quietly; no feed, no push.
 */
export function Board({ thread }: { thread: Thread }) {
  const { meId, nameOf, toast } = useApp();
  const router = useRouter();
  const supabase = supabaseBrowser();
  const { data: items = [], refresh } = useLive<Item[]>(
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
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "photo" | "link" | "stickers" | "menu">(null);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  // Live boxes held after a drag until the save comes back, so nothing snaps.
  const [local, setLocal] = useState<Record<string, Box>>({});
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const livePath = useRef<SVGPathElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const g = useRef<Gesture>({ kind: "idle" });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const vRef = useRef(view);
  const lastTap = useRef<{ t: number; x: number; y: number; id: string | null }>({ t: 0, x: 0, y: 0, id: null });
  const fitted = useRef(false);

  // Opening the board (and anything that lands while it's open) counts as seen.
  const last = items[items.length - 1]?.created_at ?? thread.last_at;
  useEffect(() => {
    supabase.from("thread_reads").upsert({ thread_id: thread.id, user_id: meId, seen_at: new Date().toISOString() }).then(() => refreshAll());
  }, [thread.id, last, meId, supabase]);

  const maxZ = items.reduce((m, i) => Math.max(m, i.z), 0);
  const boxes = new Map(items.map((i, n) => [i.id, local[i.id] ?? boxOf(i, n)]));

  /* ── the camera ─────────────────────────────────────────────────────── */
  function paintView(v: View) {
    vRef.current = v;
    if (world.current) world.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
    if (world.current) world.current.style.setProperty("--inv", String(1 / v.z));
  }
  function commitView(v: View) {
    paintView(v);
    setView(v);
    try {
      localStorage.setItem(`board-view:${thread.id}`, JSON.stringify(v));
    } catch {}
  }
  /** Zoom and center so everything on the board is in view. */
  function fit(list = items) {
    const el = viewport.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (!list.length) return commitView({ x: 16, y: 16, z: 1 });
    const bs = list.map((i, n) => boxOf(i, n));
    const x0 = Math.min(...bs.map((b) => b.x)) - 20;
    const y0 = Math.min(...bs.map((b) => b.y)) - 20;
    const x1 = Math.max(...bs.map((b) => b.x + b.w)) + 20;
    const y1 = Math.max(...bs.map((b) => b.y + b.h)) + 20;
    const z = clampZ(Math.min(W / (x1 - x0), H / (y1 - y0), 1.5));
    commitView({ x: (W - (x1 - x0) * z) / 2 - x0 * z, y: (H - (y1 - y0) * z) / 2 - y0 * z, z });
  }
  // First look: where you left it, or everything fitted.
  useEffect(() => {
    if (fitted.current || !viewport.current) return;
    if (!items.length && last) return; // still loading
    fitted.current = true;
    let saved: View | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(`board-view:${thread.id}`) ?? "null");
    } catch {}
    Promise.resolve().then(() => (saved ? commitView(saved) : fit()));
  });
  // Trackpad pinch / mouse wheel (needs a non-passive listener to stop page zoom).
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = vRef.current;
      const r = el.getBoundingClientRect();
      let next: View;
      if (e.ctrlKey || e.metaKey) {
        const z = clampZ(v.z * Math.exp(-e.deltaY * 0.01));
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        next = { z, x: px - ((px - v.x) / v.z) * z, y: py - ((py - v.y) / v.z) * z };
      } else next = { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
      paintView(next);
      clearTimeout(timer);
      timer = setTimeout(() => commitView(vRef.current), 150);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // iPhone Safari zooms the whole page on a pinch unless told not to.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
    };
  }, []);

  /** World coordinates of a screen point. */
  function toWorld(cx: number, cy: number) {
    const r = viewport.current!.getBoundingClientRect();
    const v = vRef.current;
    return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
  }
  /** Somewhere in view to drop a new thing. */
  function spot(w: number, h: number) {
    const el = viewport.current;
    const c = el ? toWorld(el.getBoundingClientRect().left + el.clientWidth / 2, el.getBoundingClientRect().top + el.clientHeight / 2) : { x: 200, y: 200 };
    // Spread new things out a little so they don't pile up in one spot.
    const n = items.length % 6;
    return { x: c.x - w / 2 + ((n % 3) - 1) * 40 + (Math.random() * 20 - 10), y: c.y - h / 2 + (Math.floor(n / 3) - 0.5) * 50 + (Math.random() * 20 - 10) };
  }

  /* ── data ───────────────────────────────────────────────────────────── */
  async function add(kind: Item["kind"], fields: Partial<Item>, at?: { x: number; y: number }) {
    const [w0, h0] = SIZE[kind];
    const w = fields.w ?? w0;
    const h = fields.h ?? h0;
    const p = at ?? spot(w, h);
    const { data, error } = await supabase
      .from("thread_items")
      .insert({ thread_id: thread.id, author: meId, kind, x: Math.round(p.x), y: Math.round(p.y), w, h, z: maxZ + 1, ...fields })
      .select("id")
      .single();
    if (error) return toast(error.message);
    await refresh();
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
  async function duplicate(i: Item) {
    const b = boxes.get(i.id)!;
    const { id: _id, created_at: _c, hearts: _h, ...rest } = i;
    void _id;
    void _c;
    void _h;
    await add(i.kind, { ...rest, author: meId, hearts: [] } as Partial<Item>, { x: b.x + 24, y: b.y + 24 });
  }
  async function addPhotos(files: File[]) {
    setPanel(null);
    for (const f of files) {
      const { blob, ext, width, height } = await shrinkImage(f);
      const path = `${meId}/threads/${thread.id}/${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
      if (error) {
        toast(error.message);
        continue;
      }
      const w = 180;
      const h = width && height ? Math.round((180 * height) / width) : 180;
      await add("photo", { photo_path: path, w, h });
    }
  }
  const heart = (i: Item) => patch(i.id, { hearts: i.hearts.includes(meId) ? i.hearts.filter((x) => x !== meId) : [...i.hearts, meId] });

  /* ── gestures ───────────────────────────────────────────────────────── */
  function paintBox(el: HTMLElement, b: Box, kind: Item["kind"]) {
    el.style.left = `${b.x}px`;
    el.style.top = `${b.y}px`;
    el.style.width = `${b.w}px`;
    if (kind !== "note") el.style.height = `${b.h}px`;
    el.style.transform = `rotate(${b.rot}deg)`;
  }
  function onDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("textarea, input, .board-ui")) return;
    try {
      viewport.current!.setPointerCapture(e.pointerId);
    } catch {}
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cur = g.current;
    if (pointers.current.size === 2) {
      // A second finger: whatever the first was doing becomes a pinch.
      if (cur.kind === "item") paintBox(cur.el, cur.box, items.find((i) => i.id === cur.id)?.kind ?? "sticky");
      if (cur.kind === "pen" && livePath.current) livePath.current.setAttribute("d", "");
      const [a, b] = [...pointers.current.values()];
      const r = viewport.current!.getBoundingClientRect();
      g.current = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, v: vRef.current };
      return;
    }
    if (pointers.current.size > 2) return;
    if (tool === "pen") {
      const p = toWorld(e.clientX, e.clientY);
      g.current = { kind: "pen", pts: [p] };
      return;
    }
    const itemEl = target.closest("[data-item]") as HTMLElement | null;
    const id = itemEl?.dataset.item;
    if (itemEl && id && editing !== id) {
      const handle = (target.closest("[data-handle]") as HTMLElement | null)?.dataset.handle as "resize" | "rotate" | undefined;
      const box = boxes.get(id)!;
      g.current = { kind: "item", id, el: itemEl, mode: handle ?? "move", sx: e.clientX, sy: e.clientY, box, next: box, moved: false, target, wasSel: selected === id };
      if (selected !== id) setSelected(id);
      return;
    }
    g.current = { kind: "pan", sx: e.clientX, sy: e.clientY, v: vRef.current, moved: false, target };
  }
  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cur = g.current;
    if (cur.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const r = viewport.current!.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      const z = clampZ(cur.v.z * (Math.hypot(a.x - b.x, a.y - b.y) / cur.d0));
      // Keep the spot that was under your fingers under your fingers.
      const wx = (cur.mx - cur.v.x) / cur.v.z;
      const wy = (cur.my - cur.v.y) / cur.v.z;
      paintView({ z, x: mx - wx * z, y: my - wy * z });
    } else if (cur.kind === "pan") {
      const dx = e.clientX - cur.sx;
      const dy = e.clientY - cur.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) cur.moved = true;
      if (cur.moved) paintView({ ...cur.v, x: cur.v.x + dx, y: cur.v.y + dy });
    } else if (cur.kind === "item") {
      const z = vRef.current.z;
      const dx = (e.clientX - cur.sx) / z;
      const dy = (e.clientY - cur.sy) / z;
      if (Math.abs(dx) + Math.abs(dy) > 3 / z) cur.moved = true;
      if (!cur.moved) return;
      const b = cur.box;
      let next: Box;
      if (cur.mode === "move") next = { ...b, x: b.x + dx, y: b.y + dy };
      else if (cur.mode === "resize") next = { ...b, w: Math.max(40, b.w + dx), h: Math.max(30, b.h + dy) };
      else {
        const r = cur.el.getBoundingClientRect();
        const deg = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 90;
        next = { ...b, rot: Math.abs(deg) < 4 ? 0 : Math.round(deg) }; // easy to get back to straight
      }
      cur.next = next;
      paintBox(cur.el, next, items.find((i) => i.id === cur.id)?.kind ?? "sticky");
    } else if (cur.kind === "pen") {
      cur.pts.push(toWorld(e.clientX, e.clientY));
      livePath.current?.setAttribute("d", cur.pts.map((p, n) => `${n ? "L" : "M"}${p.x} ${p.y}`).join(" "));
    }
  }
  async function onUp(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const cur = g.current;
    if (cur.kind === "pinch") {
      if (pointers.current.size < 2) {
        commitView(vRef.current);
        g.current = { kind: "idle" };
      }
      return;
    }
    if (pointers.current.size > 0) return;
    g.current = { kind: "idle" };
    const now = Date.now();
    const tap = lastTap.current;
    const isDouble = (id: string | null) => now - tap.t < 320 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 24 && tap.id === id;
    if (cur.kind === "pan") {
      if (cur.moved) return commitView(vRef.current);
      // A tap on empty space: let go of things; a double tap writes there.
      setSelected(null);
      if (editing) editor.current?.blur();
      if (isDouble(null)) {
        lastTap.current = { t: 0, x: 0, y: 0, id: null };
        const p = toWorld(e.clientX, e.clientY);
        return add("note", { text: null, style: { fs: 20 } }, { x: p.x - 10, y: p.y - 14 });
      }
      lastTap.current = { t: now, x: e.clientX, y: e.clientY, id: null };
    } else if (cur.kind === "item") {
      const it = items.find((i) => i.id === cur.id);
      if (!cur.moved) {
        // A tap: tick a checkbox, or double tap to write.
        const check = (cur.target.closest("[data-check]") as HTMLElement | null)?.dataset.check;
        if (check != null && it?.text) return patch(it.id, { text: toggleCheck(it.text, Number(check)) });
        if (it && (it.kind === "sticky" || it.kind === "note") && (isDouble(it.id) || (cur.wasSel && it.kind === "note"))) {
          lastTap.current = { t: 0, x: 0, y: 0, id: null };
          return setEditing(it.id);
        }
        lastTap.current = { t: now, x: e.clientX, y: e.clientY, id: cur.id };
        return;
      }
      const b = cur.next;
      setLocal((l) => ({ ...l, [cur.id]: b }));
      await patch(cur.id, { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), rot: b.rot, z: maxZ + 1 });
      setLocal((l) => {
        const { [cur.id]: _drop, ...rest } = l;
        void _drop;
        return rest;
      });
    } else if (cur.kind === "pen") {
      livePath.current?.setAttribute("d", "");
      const pts = cur.pts;
      if (pts.length < 2) return;
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
  }
  function onCancel(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    const cur = g.current;
    if (cur.kind === "item") paintBox(cur.el, cur.box, items.find((i) => i.id === cur.id)?.kind ?? "sticky");
    if (cur.kind === "pan" || cur.kind === "pinch") commitView(vRef.current);
    if (pointers.current.size === 0) g.current = { kind: "idle" };
  }

  /* ── download what's in view ─────────────────────────────────────────── */
  async function download() {
    const el = viewport.current;
    if (!el) return;
    setSaving(true);
    setSelected(null);
    await new Promise((r) => setTimeout(r, 60));
    try {
      const { toBlob } = await import("html-to-image");
      const opts = { pixelRatio: Math.max(2, window.devicePixelRatio || 2), cacheBust: false, backgroundColor: "#fbf7f1", filter: (n: HTMLElement) => !n.classList?.contains("board-ui") };
      const blob = (await toBlob(el, opts).catch(() => toBlob(el, { ...opts, skipFonts: true })))!;
      const name = `${thread.title.replace(/[^\w\- ]+/g, "").trim() || "board"}.png`;
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] }).catch(() => {});
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      setExporting(false);
    } catch (err) {
      toast(`Couldn't make the picture: ${(err as Error).message}`);
    }
    setSaving(false);
  }

  const sel = items.find((i) => i.id === selected);
  const editItem = items.find((i) => i.id === editing);
  const look = (i: Item): React.CSSProperties => ({
    fontSize: i.style?.fs ?? (i.kind === "note" ? 20 : 14),
    fontWeight: i.style?.b ? 750 : undefined,
    fontFamily: i.style?.font === "serif" ? "var(--font-display)" : undefined,
    color: i.style?.c,
    textAlign: i.style?.al,
  });
  const setLook = (i: Item, l: Look) => patch(i.id, { style: { ...(i.style ?? {}), ...l } });

  return (
    <div
      className="board-page"
      onPaste={(e) => {
        const fs = filesFromPaste(e);
        if (!fs.length || editing || panel === "stickers") return;
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
        <button className="icon-btn" onClick={() => (setExporting(true), setSelected(null), setPanel(null))} aria-label="Download a picture of the board">
          ⬇︎
        </button>
        <button className="icon-btn" onClick={() => setPanel(panel === "menu" ? null : "menu")} aria-label="More">
          ⋯
        </button>
      </header>
      {panel === "menu" && (
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

      <div
        ref={viewport}
        className={`board-view${tool === "pen" ? " drawing" : ""}${exporting ? " exporting" : ""}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${22 * view.z}px ${22 * view.z}px` }}
      >
        <div ref={world} className="board-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, ["--inv" as string]: 1 / view.z }}>
          {items.map((i) => {
            const b = boxes.get(i.id)!;
            const isSel = selected === i.id;
            const isEdit = editing === i.id;
            let body: React.ReactNode = null;
            if (i.kind === "ink" && i.ink) {
              const ink = JSON.parse(i.ink) as { d: string; w: number; h: number };
              body = (
                <svg viewBox={`0 0 ${ink.w} ${ink.h}`} preserveAspectRatio="none" width="100%" height="100%">
                  <path d={ink.d} fill="none" stroke={i.color ?? PENS[0]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
              );
            } else if ((i.kind === "photo" || i.kind === "sticker") && i.photo_path) {
              // eslint-disable-next-line @next/next/no-img-element
              body = urls[i.photo_path] ? <img src={urls[i.photo_path]} alt="" draggable={false} crossOrigin="anonymous" /> : <span className="board-wait" />;
            } else if (i.kind === "sticker") {
              body = <span className="board-emoji" style={{ fontSize: Math.min(b.w, b.h) * 0.82 }}>{i.text}</span>;
            } else if (i.kind === "link" && i.link) {
              body = <span className="board-link keep-case">🔗 {i.link.replace(/^https?:\/\/(www\.)?/, "")}</span>;
            } else if (isEdit) {
              body = (
                <textarea
                  ref={editor}
                  className="board-edit"
                  style={look(i)}
                  defaultValue={i.text ?? ""}
                  autoFocus
                  placeholder={i.kind === "sticky" ? "write on it…" : "type here…"}
                  onBlur={(e) => {
                    setEditing(null);
                    const t = e.target.value.replace(/\s+$/, "");
                    if (!t.trim() && i.kind === "note") remove(i.id);
                    else if (t !== (i.text ?? "")) patch(i.id, { text: t || null });
                  }}
                />
              );
            } else
              body = (
                <div className="board-text" style={look(i)}>
                  {i.text ? renderMini(i.text) : i.kind === "sticky" ? "" : "…"}
                </div>
              );
            return (
              <div
                key={i.id}
                data-item={i.id}
                className={`board-item k-${i.kind}${isSel ? " sel" : ""}${isEdit ? " editing" : ""}`}
                style={{
                  left: b.x,
                  top: b.y,
                  width: b.w,
                  height: i.kind === "note" ? undefined : b.h,
                  minHeight: i.kind === "note" ? 30 : undefined,
                  transform: `rotate(${b.rot}deg)`,
                  zIndex: isSel ? 9999 : i.z,
                  background: i.kind === "sticky" ? (i.color ?? STICKY[0]) : undefined,
                }}
              >
                {body}
                {i.kind !== "ink" && i.kind !== "note" && i.kind !== "sticker" && i.author !== meId && <span className="board-by">{nameOf(i.author).slice(0, 1)}</span>}
                {i.hearts.length > 0 && (
                  <span className="board-hearts" style={{ transform: "scale(var(--inv))" }}>
                    ❤️{i.hearts.length > 1 ? " 2" : ""}
                  </span>
                )}
                {isSel && tool === "move" && !isEdit && (
                  <>
                    <span className="board-resize" data-handle="resize" aria-label="Resize" />
                    <span className="board-rotate" data-handle="rotate" aria-label="Tilt" />
                  </>
                )}
              </div>
            );
          })}
          <svg className="board-live">
            <path ref={livePath} fill="none" stroke={pen} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {exporting && <div className="board-frame board-ui" aria-hidden />}
        {!items.length && !exporting && <p className="board-empty board-ui">Double-tap anywhere to write, or add something below. Pinch to zoom.</p>}
      </div>

      {/* Bottom: whatever's selected or being written, else the tools. */}
      {exporting ? (
        <div className="board-selbar board-ui">
          <span className="small">Zoom to frame it</span>
          <button className="btn btn-sm btn-primary" disabled={saving} onClick={download}>
            {saving ? "Making it…" : "Save picture"}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setExporting(false)}>
            Cancel
          </button>
        </div>
      ) : editItem ? (
        <div className="board-selbar board-ui board-fmt" onPointerDown={(e) => e.preventDefault()}>
          {(
            [
              ["h1", "H1", "Heading"],
              ["h2", "H2", "Small heading"],
              ["b", "B", "Bold"],
              ["i", "I", "Italic"],
              ["li", "•", "Bullet"],
              ["check", "☐", "Checkbox"],
            ] as const
          ).map(([k, label, aria]) => (
            <button key={k} className={`fmt fmt-${k}`} aria-label={aria} onClick={() => editor.current && applyFormat(editor.current, k)}>
              {label}
            </button>
          ))}
          <button className="btn btn-sm btn-primary" onClick={() => editor.current?.blur()}>
            Done
          </button>
        </div>
      ) : sel && tool === "move" ? (
        <div className="board-selbar board-ui">
          {(sel.kind === "sticky" || sel.kind === "note") && (
            <button className="btn btn-sm" onClick={() => setEditing(sel.id)}>
              ✏️
            </button>
          )}
          {(sel.kind === "sticky" || sel.kind === "note") &&
            SIZES.map((s) => (
              <button key={s.label} className="fmt" aria-pressed={(sel.style?.fs ?? (sel.kind === "note" ? 20 : 14)) === s.fs} onClick={() => setLook(sel, { fs: s.fs })}>
                {s.label}
              </button>
            ))}
          {sel.kind === "note" && (
            <>
              <button className="fmt fmt-b" aria-pressed={!!sel.style?.b} onClick={() => setLook(sel, { b: !sel.style?.b })} aria-label="Bold">
                B
              </button>
              <button className="fmt" aria-pressed={sel.style?.font === "serif"} onClick={() => setLook(sel, { font: sel.style?.font === "serif" ? "sans" : "serif" })} aria-label="Serif font">
                Aa
              </button>
              {PENS.map((c) => (
                <button key={c} className="board-swatch" style={{ background: c }} aria-pressed={(sel.style?.c ?? PENS[0]) === c} aria-label="Text color" onClick={() => setLook(sel, { c })} />
              ))}
            </>
          )}
          {sel.kind === "sticky" && STICKY.map((c) => <button key={c} className="board-swatch" style={{ background: c }} aria-pressed={sel.color === c} aria-label="Color" onClick={() => patch(sel.id, { color: c })} />)}
          {sel.kind === "ink" && PENS.map((c) => <button key={c} className="board-swatch" style={{ background: c }} aria-label="Color" onClick={() => patch(sel.id, { color: c })} />)}
          {sel.kind === "link" && sel.link && (
            <a className="btn btn-sm" href={sel.link} target="_blank" rel="noreferrer">
              Open ↗
            </a>
          )}
          {sel.kind === "photo" && sel.photo_path && (
            <button
              className="btn btn-sm"
              onClick={async () => {
                const err = await saveSticker({ path: sel.photo_path! }, meId);
                toast(err ?? "Saved to stickers ✨");
              }}
            >
              ✨ Sticker
            </button>
          )}
          <button className="fmt" aria-pressed={sel.hearts.includes(meId)} onClick={() => heart(sel)} aria-label="Heart">
            {sel.hearts.includes(meId) ? "❤️" : "🤍"}
          </button>
          <button className="fmt" onClick={() => duplicate(sel)} aria-label="Duplicate">
            ⧉
          </button>
          <button className="fmt" onClick={() => patch(sel.id, { z: maxZ + 1 })} aria-label="Bring to front">
            ⤒
          </button>
          <button className="fmt" onClick={() => patch(sel.id, { z: Math.min(...items.map((i) => i.z)) - 1 })} aria-label="Send to back">
            ⤓
          </button>
          <button className="fmt" onClick={() => remove(sel.id)} aria-label="Delete">
            🗑
          </button>
        </div>
      ) : null}

      {panel === "photo" && (
        <div className="board-menu board-ui">
          <label className="btn btn-sm">
            📷 Upload
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(Array.from(e.target.files ?? []))} />
          </label>
          <ImageSources onFiles={addPhotos} />
        </div>
      )}
      {panel === "link" && (
        <form
          className="board-menu board-ui"
          onSubmit={(e) => {
            e.preventDefault();
            const v = (new FormData(e.currentTarget).get("link") as string).trim();
            if (!v) return;
            setPanel(null);
            add("link", { link: /^https?:\/\//.test(v) ? v : `https://${v}` });
          }}
        >
          <input name="link" className="input input-sm grow keep-case" placeholder="paste a link" autoFocus />
          <button className="btn btn-sm btn-primary">Add</button>
        </form>
      )}
      {panel === "stickers" && (
        <StickerTray
          onPick={(s) => {
            setPanel(null);
            if (s.emoji) add("sticker", { text: s.emoji, w: 90, h: 90 });
            else if (s.path) add("sticker", { photo_path: s.path, w: 120, h: s.ratio ? Math.round(120 * s.ratio) : 120 });
          }}
          onClose={() => setPanel(null)}
        />
      )}

      <nav className="board-tools board-ui">
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
            <button onClick={() => add("note", { text: null, style: { fs: 20 } })} aria-label="Text">
              Aa
            </button>
            <button aria-pressed={panel === "photo"} onClick={() => setPanel(panel === "photo" ? null : "photo")} aria-label="Picture">
              🖼️
            </button>
            <button aria-pressed={panel === "stickers"} onClick={() => setPanel(panel === "stickers" ? null : "stickers")} aria-label="Stickers">
              ✨
            </button>
            <button aria-pressed={panel === "link"} onClick={() => setPanel(panel === "link" ? null : "link")} aria-label="Link">
              🔗
            </button>
          </>
        )}
        <span className="grow" />
        <button onClick={() => fit()} aria-label="Fit everything in view">
          ⤢
        </button>
        <span className="board-zoom small faint">{Math.round(view.z * 100)}%</span>
      </nav>
    </div>
  );
}
