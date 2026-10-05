"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "./Sheet";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { usePhotoUrls } from "@/lib/photos";
import { shrinkImage } from "@/lib/image";
import { applyFormat, renderMini, toggleCheck } from "@/lib/miniMarkdown";
import { useApp } from "./AppProvider";
import { ImageSources, filesFromPaste } from "./ImageSources";
import { StickerTray, saveSticker } from "./BoardStickers";
import { TEMPLATES, gridLayout, insertTemplate, templateSize } from "@/lib/boardTemplates";
import type { Thread } from "./Threads";

interface Item {
  id: string;
  thread_id: string;
  author: string;
  kind: "note" | "sticky" | "photo" | "link" | "ink" | "sticker" | "grid";
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
  /** Photo grid: a picture per slot (empty string = empty slot). */
  photos: string[];
  created_at: string;
}
/** How text looks: size, bold, font, color, alignment. */
type Crop = { x: number; y: number; s: number };
type Shape = "polaroid" | "plain" | "rounded" | "circle" | "oval" | "heart" | "softstar" | "custom" | "arch" | "star" | "hex" | "diamond";
type Look = {
  fs?: number;
  b?: boolean;
  font?: "sans" | "serif";
  c?: string;
  al?: "left" | "center" | "right";
  /** Old fixed photo-grid layouts (templates); `n` replaces it with an auto layout. */
  layout?: string;
  /** Auto photo layout: this many photos, arranged to suit the frame's shape. */
  n?: number;
  /** Where a single photo sits in its frame, and per-slot for layouts. */
  crop?: Crop;
  crops?: Record<string, Crop>;
  /** Photo frame shape and border. */
  shape?: Shape;
  bw?: number;
  bc?: string;
  /** A custom frame shape: an image (SVG or transparent PNG) used as a mask. */
  mask?: string;
  /** Background of the photo card / layout (behind the photos). */
  pbg?: string;
  /** Heading highlight: a rounded box around it, or a marker tight to the text. */
  hl?: "box" | "tight";
  hlc?: string;
};

const svgMask = (body: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>${body}</svg>`)}")`;
const HEART = svgMask("<path d='M50 93C22 72 3 55 3 32 3 16 15 5 29 5c9 0 16 5 21 12 5-7 12-12 21-12 14 0 26 11 26 27 0 23-19 40-47 61z'/>");
const SOFT_STAR = svgMask(
  "<path d='M50 12 60.3 36.3 86.4 38.5 66.6 55.7 72.5 81.4 50 67.7 27.5 81.4 33.4 55.7 13.6 38.5 39.7 36.3Z' stroke='black' stroke-width='16' stroke-linejoin='round'/>",
);

const SHAPES: { key: Shape; label: string; clip?: string; mask?: string }[] = [
  { key: "polaroid", label: "▢ classic" },
  { key: "plain", label: "■ plain", clip: "inset(0)" },
  { key: "rounded", label: "▢ rounded", clip: "inset(0 round 16%)" },
  { key: "circle", label: "● circle", clip: "circle(closest-side at 50% 50%)" },
  { key: "oval", label: "⬭ oval", clip: "ellipse(50% 50% at 50% 50%)" },
  { key: "arch", label: "◠ arch", clip: "inset(0 round 50% 50% 0 0)" },
  { key: "star", label: "★ star", clip: "polygon(50% 0%, 61.8% 35%, 98% 35.4%, 68.9% 57.3%, 79.4% 91.6%, 50% 70.8%, 20.6% 91.6%, 31.1% 57.3%, 2% 35.4%, 38.2% 35%)" },
  { key: "heart", label: "♥ heart", mask: HEART },
  { key: "softstar", label: "✪ soft star", mask: SOFT_STAR },
  { key: "hex", label: "⬢ hex", clip: "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)" },
  { key: "diamond", label: "◆ diamond", clip: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" },
];
const BORDERS = [0, 3, 7, 12];
const FRAME_COLORS = ["#ffffff", "#3b2a2a", "#f4c6d4", "#f2d27a", "#b9dcc0", "#bcd3f2", "#d9c3f0", "#e7a58a"];
const HIGHLIGHTS = ["#ffe066", "#ffb3c7", "#b8ecc4", "#b9d7ff", "#e2c9ff", "#ffc9a3"];
const NO_CROP: Crop = { x: 50, y: 50, s: 1 };

/**
 * Where a picture sits in a frame of aspect F (w/h): `c.x`/`c.y` is the point of
 * the image (in %) kept at the frame's centre, `c.s` zooms past "just covers".
 * Clamped so the frame is always full: no blank edges, whatever its shape.
 */
function fitGeom(F: number, A: number, c: Crop) {
  let w = A >= F ? (A / F) * 100 : 100;
  let h = A >= F ? 100 : (F / A) * 100;
  w *= c.s;
  h *= c.s;
  const left = Math.min(0, Math.max(100 - w, 50 - (c.x / 100) * w));
  const top = Math.min(0, Math.max(100 - h, 50 - (c.y / 100) * h));
  return { w, h, left, top };
}

/** A picture filling its box, positioned by `crop`, measuring itself so it stays right at any size. */
function FramedImg({ src, crop }: { src: string; crop: Crop }) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [ar, setAr] = useState<number | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.current.observe(el);
  }, []);
  const g = box && ar && box.h > 0 ? fitGeom(box.w / box.h, ar, crop) : null;
  return (
    <div className="framed" ref={measure}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        crossOrigin="anonymous"
        onLoad={(e) => setAr(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        style={g ? { position: "absolute", width: `${g.w}%`, height: `${g.h}%`, left: `${g.left}%`, top: `${g.top}%`, maxWidth: "none" } : { width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
}

/** Shape + border around anything (a photo, or one slot of a layout). */
/** The CSS that cuts something to a frame's shape (null = a plain rectangle). */
function shapeCut(style: Look | null): React.CSSProperties | null {
  const key = style?.shape ?? "polaroid";
  const shape = SHAPES.find((x) => x.key === key) ?? SHAPES[0];
  const maskUrl = key === "custom" && style?.mask ? `url("${style.mask}")` : shape.mask;
  if (!shape.clip && !maskUrl) return null;
  // Curvy and custom shapes are masks (they keep their proportions, centred); the rest clip.
  return maskUrl
    ? { WebkitMaskImage: maskUrl, maskImage: maskUrl, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }
    : { clipPath: shape.clip };
}

function inFrame(style: Look | null, child: React.ReactNode) {
  const cut = shapeCut(style);
  if (!cut) return <div className="board-frame-in">{child}</div>;
  return (
    <div className="board-frame" style={{ ...cut, background: style?.bw ? (style?.bc ?? FRAME_COLORS[0]) : "transparent", padding: style?.bw ?? 0 }}>
      <div className="board-frame-in" style={cut}>
        {child}
      </div>
    </div>
  );
}

/** Rows of photos that best fill a w×h frame: 4 in a tall frame stacks, in a square goes 2×2. */
function autoRows(n: number, w: number, h: number): number[] {
  let best = { cols: 1, score: Infinity };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cell = w / cols / (h / rows);
    const score = Math.abs(Math.log(cell)) + (cols * rows - n) * 0.25;
    if (score < best.score) best = { cols, score };
  }
  const rows = Math.ceil(n / best.cols);
  // Spread evenly: e.g. 5 in 2 rows → 3 + 2.
  return Array.from({ length: rows }, (_, r) => Math.floor(n / rows) + (r < n % rows ? 1 : 0)).sort((a, b) => b - a);
}
const slotCount = (i: { style: Look | null }) => i.style?.n ?? gridLayout(i.style?.layout).slots.length;
const isHeadingish = (i: { kind: string; text: string | null; style: Look | null }) =>
  /^#{1,2}\s/m.test(i.text ?? "") || (i.kind === "note" && (!!i.style?.b || (i.style?.fs ?? 20) >= 30));
type Box = { x: number; y: number; w: number; h: number; rot: number };
type View = { x: number; y: number; z: number };

// Board backgrounds: the default paper first, then a few colors and darks.
const BGS = ["#fbf7f1", "#ffffff", "#fdeef2", "#eaf6ec", "#e8f0fb", "#f3ecfb", "#fff6d8", "#2b2525", "#1d2433"];
const STICKY = ["#fff3a8", "#ffd1dc", "#c8f0c8", "#cfe3ff", "#ffd9b3", "#e6d4ff"];
const PENS = ["#3b2a2a", "#e0457b", "#2f9a55", "#3f86d4", "#e69b1a", "#8a4fd6"];
const SIZES: { label: string; fs: number }[] = [
  { label: "S", fs: 14 },
  { label: "M", fs: 20 },
  { label: "L", fs: 30 },
  { label: "XL", fs: 46 },
];
const SIZE: Record<Item["kind"], [number, number]> = { note: [200, 40], sticky: [150, 150], photo: [170, 170], link: [180, 48], ink: [100, 100], sticker: [110, 110], grid: [260, 260] };
const SNAP = 7; // screen pixels
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
  const urls = usePhotoUrls(items.flatMap((i) => [...(i.photo_path ? [i.photo_path] : []), ...(i.photos ?? []).filter(Boolean)]));
  const [tool, setTool] = useState<"move" | "pen">("move");
  const [pen, setPen] = useState(PENS[0]);
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "photo" | "link" | "stickers" | "menu" | "templates" | "layers">(null);
  // Screenshot mode: the board fills the screen with no buttons or text on it.
  const [shot, setShot] = useState(false);
  const [shotBar, setShotBar] = useState(false);
  const [shotBg, setShotBg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Live boxes held after a drag until the save comes back, so nothing snaps.
  const [local, setLocal] = useState<Record<string, Box>>({});
  // Drop each "just moved" override once the saved position has come back.
  useEffect(() => {
    const done = Object.keys(local).filter((id) => {
      const it = items.find((i) => i.id === id);
      const b = local[id];
      return !it || (it.x === b.x && it.y === b.y && it.w === b.w && it.h === b.h && (it.rot ?? 0) === b.rot);
    });
    if (done.length) Promise.resolve().then(() => setLocal((l) => done.reduce((acc, id) => (acc[id] === l[id] ? dropKey(acc, id) : acc), l)));
  }, [items, local]);
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const livePath = useRef<SVGPathElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const g = useRef<Gesture>({ kind: "idle" });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const vRef = useRef(view);
  const lastTap = useRef<{ t: number; x: number; y: number; id: string | null }>({ t: 0, x: 0, y: 0, id: null });
  const fitted = useRef(false);
  // Undo: the way back from each change you made here (newest last).
  const history = useRef<(() => PromiseLike<unknown>)[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  // Snap-to-align guides: off unless you turn them on (remembered per phone).
  const [snap, setSnap] = useState(false);
  const guideV = useRef<HTMLDivElement>(null);
  const guideH = useRef<HTMLDivElement>(null);
  const slotInput = useRef<HTMLInputElement>(null);
  const [slotFor, setSlotFor] = useState<{ id: string; slot: number } | null>(null);
  // Adjusting how picture(s) sit in a frame: which item, which slot ("one" = a single photo).
  // The photo editor (like editing a profile pic): which item, which slot, and each slot's frame shape right now.
  const [photoEdit, setPhotoEdit] = useState<{ id: string; slot: number; aspects: number[] } | null>(null);
  const [pendingShape, setPendingShape] = useState<{ id: string; mask: string; name: string } | null>(null);
  const { data: savedShapes = [] } = useLive<{ id: string; name: string; mask: string }[]>(
    "frame_shapes",
    async () => {
      const { data, error } = await supabase.from("frame_shapes").select("id, name, mask").order("created_at");
      if (error) return []; // table not there yet: just no saved shapes
      return data;
    },
    ["frame_shapes"],
  );
  /** Turn an uploaded SVG / transparent PNG into a frame shape (a small mask image) and try it on. */
  async function uploadShape(it: Item, f: File) {
    try {
      const mask = await toMask(f);
      await setLook(it, { shape: "custom", mask });
      setPendingShape({ id: it.id, mask, name: f.name.replace(/\.[^.]+$/, "").slice(0, 20) });
    } catch (err) {
      toast((err as Error).message);
    }
  }
  const [subRaw, setSubRaw] = useState<{ id: string; k: "frame" | "hl" | "color" } | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem("board-snap") === "1") Promise.resolve().then(() => setSnap(true));
    } catch {}
  }, []);

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
    return { x: c.x - w / 2 + ((n % 3) - 1) * 40 + jitter(), y: c.y - h / 2 + (Math.floor(n / 3) - 0.5) * 50 + jitter() };
  }

  /* ── data ───────────────────────────────────────────────────────────── */
  function pushUndo(fn: () => PromiseLike<unknown>) {
    history.current.push(fn);
    if (history.current.length > 60) history.current.shift();
    setUndoCount(history.current.length);
  }
  async function undo() {
    const fn = history.current.pop();
    setUndoCount(history.current.length);
    if (!fn) return;
    setSelected(null);
    setEditing(null);
    await fn();
    refreshAll();
  }
  const dropIds = (ids: string[]) => () => supabase.from("thread_items").delete().in("id", ids);
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
    pushUndo(dropIds([data.id]));
    await refresh();
    setSelected(data.id);
    if (kind === "sticky" || kind === "note") setEditing(data.id);
  }
  async function patch(id: string, fields: Partial<Item>) {
    const it = items.find((i) => i.id === id);
    if (it) {
      const before = Object.fromEntries(Object.keys(fields).map((k) => [k, it[k as keyof Item] ?? null]));
      pushUndo(() => supabase.from("thread_items").update(before).eq("id", id));
    }
    const { error } = await supabase.from("thread_items").update(fields).eq("id", id);
    if (error) toast(error.message);
    refreshAll();
    return !error;
  }
  async function remove(id: string) {
    const it = items.find((i) => i.id === id);
    if (it) pushUndo(() => supabase.from("thread_items").insert(it));
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
  async function addTemplate(key: string) {
    const t = TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    setPanel(null);
    const { w, h } = templateSize(t);
    const c = spot(w, h);
    try {
      const ids = await insertTemplate(thread.id, meId, t, { x: c.x, y: c.y }, maxZ + 1);
      pushUndo(dropIds(ids));
      await refresh();
      const el = viewport.current;
      if (el) {
        // Frame the new layout.
        const z = clampZ(Math.min(el.clientWidth / (w + 40), el.clientHeight / (h + 40), 1.2));
        commitView({ z, x: (el.clientWidth - w * z) / 2 - c.x * z, y: (el.clientHeight - h * z) / 2 - c.y * z });
      }
    } catch (err) {
      toast((err as Error).message);
    }
  }
  /** Fill (or replace) one slot of a photo grid. */
  async function fillSlot(files: File[]) {
    const target = slotFor;
    setSlotFor(null);
    const it = items.find((i) => i.id === target?.id);
    if (!target || !it || !files[0]) return;
    // A single photo: swap the picture, keep the frame, size, shape, border, everything.
    if (it.kind === "photo") {
      const { blob, ext } = await shrinkImage(files[0]);
      const path = `${meId}/threads/${thread.id}/${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
      if (error) return toast(error.message);
      const old = it.photo_path;
      await patch(it.id, { photo_path: path, style: { ...(it.style ?? {}), crop: NO_CROP } });
      if (old && old !== path) supabase.storage.from("photos").remove([old]);
      return;
    }
    const replaced: number[] = [];
    const slots = { length: slotCount(it) };
    const next = Array.from({ length: Math.max(slots.length, it.photos?.length ?? 0) }, (_, k) => it.photos?.[k] ?? "");
    // Several picked at once fill this slot and the empty ones after it.
    let k = target.slot;
    for (const f of files) {
      while (k < slots.length && k !== target.slot && next[k]) k++;
      if (k >= slots.length) break;
      const { blob, ext } = await shrinkImage(f, 1400);
      const path = `${meId}/threads/${thread.id}/${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
      if (error) {
        toast(error.message);
        break;
      }
      next[k] = path;
      replaced.push(k);
      k++;
    }
    // New pictures start centred; the layout, frames and other slots stay as they were.
    const crops = { ...(it.style?.crops ?? {}) };
    for (const r of replaced) delete crops[String(r)];
    await patch(it.id, { photos: next, style: { ...(it.style ?? {}), crops } });
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
  /** Line a box up with the edges and centers of the other things, showing a guide. */
  function snapBox(id: string, b: Box, mode: "move" | "resize"): Box {
    const t = SNAP / vRef.current.z;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [oid, o] of boxes) {
      if (oid === id) continue;
      xs.push(o.x, o.x + o.w / 2, o.x + o.w);
      ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    const best = (cands: number[], mine: number[]) => {
      let hit: { d: number; line: number } | null = null;
      for (const m of mine) for (const c of cands) if (Math.abs(c - m) <= t && (!hit || Math.abs(c - m) < Math.abs(hit.d))) hit = { d: c - m, line: c };
      return hit;
    };
    const next = { ...b };
    const hx = mode === "move" ? best(xs, [b.x, b.x + b.w / 2, b.x + b.w]) : best(xs, [b.x + b.w]);
    const hy = mode === "move" ? best(ys, [b.y, b.y + b.h / 2, b.y + b.h]) : best(ys, [b.y + b.h]);
    if (hx) {
      if (mode === "move") next.x += hx.d;
      else next.w += hx.d;
    }
    if (hy) {
      if (mode === "move") next.y += hy.d;
      else next.h += hy.d;
    }
    showGuides(hx?.line ?? null, hy?.line ?? null);
    return next;
  }
  function showGuides(x: number | null, y: number | null) {
    if (guideV.current) {
      guideV.current.style.display = x == null ? "none" : "block";
      if (x != null) guideV.current.style.left = `${x}px`;
    }
    if (guideH.current) {
      guideH.current.style.display = y == null ? "none" : "block";
      if (y != null) guideH.current.style.top = `${y}px`;
    }
  }

  function onDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("textarea, input, .board-ui")) return;
    // A new first finger means every earlier touch has ended, even if the browser
    // never told us (that's how a one-finger drag used to turn into a "pinch").
    if (e.isPrimary && pointers.current.size) {
      pointers.current.clear();
      g.current = { kind: "idle" };
    }
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
    if (tool === "pen" && !shot) {
      const p = toWorld(e.clientX, e.clientY);
      g.current = { kind: "pen", pts: [p] };
      return;
    }
    const itemEl = shot ? null : (target.closest("[data-item]") as HTMLElement | null);
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
      if (snap && cur.mode !== "rotate") next = snapBox(cur.id, next, cur.mode);
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
    showGuides(null, null);
    const now = nowMs();
    const tap = lastTap.current;
    const isDouble = (id: string | null) => now - tap.t < 320 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 24 && tap.id === id;
    if (cur.kind === "pan") {
      if (cur.moved) return commitView(vRef.current);
      // Screenshot mode: a tap just shows or hides the little bar.
      if (shot) return setShotBar((b) => !b);
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
        // A tap on a selected photo grid's slot: pick a picture for it (or clear it).
        const slotEl = cur.target.closest("[data-slot]") as HTMLElement | null;
        if (it?.kind === "grid" && slotEl && cur.wasSel) {
          const k = Number(slotEl.dataset.slot);
          if (cur.target.closest("[data-clear]")) return patch(it.id, { photos: (it.photos ?? []).map((p, n) => (n === k ? "" : p)) });
          if (it.photos?.[k]) return openPhotoEdit(it, k);
          setSlotFor({ id: it.id, slot: k });
          slotInput.current?.click();
          return;
        }
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
      const n = cur.next;
      const b = { x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h), rot: n.rot };
      // Keep showing it where it was dropped until the saved copy comes back
      // (clearing it sooner made things snap back, then jump on the next drag).
      setLocal((l) => ({ ...l, [cur.id]: b }));
      const ok = await patch(cur.id, { ...b, z: maxZ + 1 });
      if (!ok) setLocal((l) => dropKey(l, cur.id));
      else setTimeout(() => setLocal((l) => (l[cur.id] === b ? dropKey(l, cur.id) : l)), 8000);
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
      const { data, error } = await supabase
        .from("thread_items")
        .insert({ thread_id: thread.id, author: meId, kind: "ink", ink: JSON.stringify({ d, w, h }), color: pen, x: x0, y: y0, w, h, z: maxZ + 1 })
        .select("id")
        .single();
      if (error) toast(error.message);
      else pushUndo(dropIds([data.id]));
      refreshAll();
    }
  }
  function onCancel(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    showGuides(null, null);
    const cur = g.current;
    if (cur.kind === "item") paintBox(cur.el, cur.box, items.find((i) => i.id === cur.id)?.kind ?? "sticky");
    if (cur.kind === "pan" || cur.kind === "pinch") commitView(vRef.current);
    if (pointers.current.size === 0) g.current = { kind: "idle" };
  }

  /* ── download what's in view ─────────────────────────────────────────── */
  /** Save everything on the board (just the content, however big it is) as a picture. */
  async function download() {
    const w = world.current;
    const vp = viewport.current;
    if (!w || !vp || !items.length) return toast("Nothing on the board yet.");
    setSaving(true);
    setSelected(null);
    setEditing(null);
    await new Promise((r) => setTimeout(r, 80));
    try {
      // Where things really are (tilted, auto-height text and all), in board units.
      const vr = vp.getBoundingClientRect();
      const v = vRef.current;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      w.querySelectorAll<HTMLElement>("[data-item]").forEach((el) => {
        const r = el.getBoundingClientRect();
        x0 = Math.min(x0, (r.left - vr.left - v.x) / v.z);
        y0 = Math.min(y0, (r.top - vr.top - v.y) / v.z);
        x1 = Math.max(x1, (r.right - vr.left - v.x) / v.z);
        y1 = Math.max(y1, (r.bottom - vr.top - v.y) / v.z);
      });
      const pad = 24;
      const W = Math.ceil(x1 - x0 + pad * 2);
      const H = Math.ceil(y1 - y0 + pad * 2);
      // Sharp, but within what phones can draw (~16M pixels).
      const ratio = Math.max(0.5, Math.min(3, Math.sqrt(16e6 / (W * H))));
      const { toBlob } = await import("html-to-image");
      const opts = {
        width: W,
        height: H,
        pixelRatio: ratio,
        backgroundColor: thread.bg ?? "#fbf7f1",
        style: { transform: `translate(${pad - x0}px, ${pad - y0}px)`, transformOrigin: "0 0", left: "0", top: "0" },
        filter: (n: HTMLElement) => !n.classList?.contains("board-ui"),
      };
      const blob = (await toBlob(w, opts).catch(() => toBlob(w, { ...opts, skipFonts: true })))!;
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
    } catch (err) {
      toast(`Couldn't make the picture: ${(err as Error).message}`);
    }
    setSaving(false);
  }

  // The board does its own pinch-zoom; the page itself never zooms while it's open.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    const before = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", `${(before ?? "width=device-width, initial-scale=1").replace(/,\s*(maximum-scale|user-scalable)=[^,]*/g, "")}, maximum-scale=1, user-scalable=no`);
    const stop = (e: Event) => e.preventDefault();
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    document.addEventListener("wheel", wheel, { passive: false });
    document.documentElement.classList.add("no-page-zoom");
    return () => {
      if (meta && before != null) meta.setAttribute("content", before);
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("wheel", wheel);
      document.documentElement.classList.remove("no-page-zoom");
    };
  }, []);

  /** Front-to-back order (top layer first). */
  const layerOrder = [...items].sort((a, b) => b.z - a.z || b.created_at.localeCompare(a.created_at)).map((i) => i.id);
  /** Re-number z so `order` (front first) is exactly the stacking order. */
  async function restack(order: string[]) {
    const n = order.length;
    await Promise.all(
      order.map((id, k) => {
        const it = items.find((i) => i.id === id);
        const z = n - k;
        return it && it.z !== z ? patch(id, { z }) : null;
      }),
    );
  }
  function nudgeLayer(id: string, dir: 1 | -1) {
    const order = [...layerOrder];
    const k = order.indexOf(id);
    const j = k - dir; // forward = toward the front of the list
    if (k < 0 || j < 0 || j >= order.length) return;
    [order[k], order[j]] = [order[j], order[k]];
    restack(order);
  }

  const sel = items.find((i) => i.id === selected);
  // Sub-panels belong to the item they were opened for.
  const subPanel = subRaw && subRaw.id === selected ? subRaw.k : null;
  const setSubPanel = (k: "frame" | "hl" | "color" | null) => setSubRaw(k && selected ? { id: selected, k } : null);
  const editItem = items.find((i) => i.id === editing);
  const look = (i: Item): React.CSSProperties => ({
    fontSize: i.style?.fs ?? (i.kind === "note" ? 20 : 14),
    fontWeight: i.style?.b ? 750 : undefined,
    fontFamily: i.style?.font === "serif" ? "var(--font-display)" : undefined,
    color: i.style?.c,
    textAlign: i.style?.al,
    ["--hlc" as string]: i.style?.hlc ?? HIGHLIGHTS[0],
  });
  /** Open the photo editor, measuring each slot's frame as it is right now. */
  function openPhotoEdit(i: Item, slot: number) {
    const el = document.querySelector(`[data-item="${i.id}"]`);
    const boxesOf = i.kind === "grid" ? Array.from({ length: slotCount(i) }, (_, k) => el?.querySelector<HTMLElement>(`[data-slot="${k}"] .framed, [data-slot="${k}"]`)) : [el?.querySelector<HTMLElement>(".framed")];
    const aspects = boxesOf.map((b) => (b && b.offsetHeight ? b.offsetWidth / b.offsetHeight : 1));
    setPhotoEdit({ id: i.id, slot, aspects });
  }
  /** Size the frame to the photo's own proportions (keeps the width). */
  async function fitToPhoto(i: Item) {
    const url = i.photo_path ? urls[i.photo_path] : null;
    if (!url) return;
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {});
    if (!img.naturalWidth) return;
    const b = boxes.get(i.id)!;
    const pad = (i.style?.shape ?? "polaroid") === "polaroid" ? 12 : 0;
    patch(i.id, { h: Math.round(((b.w - pad) * img.naturalHeight) / img.naturalWidth + pad), style: { ...(i.style ?? {}), crop: NO_CROP } });
  }
  const setLook = (i: Item, l: Look) => patch(i.id, { style: { ...(i.style ?? {}), ...l } });

  return (
    <div
      className={`board-page${shot ? " shotmode" : ""}`}
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
        <button className="icon-btn" onClick={() => (setShot(true), setShotBar(true), setSelected(null), setEditing(null), setPanel(null))} aria-label="Screenshot mode">
          📸
        </button>
        <button className="icon-btn" disabled={saving} onClick={download} aria-label="Download a picture of the board">
          {saving ? "…" : "⬇︎"}
        </button>
        <button className="icon-btn" onClick={() => setPanel(panel === "menu" ? null : "menu")} aria-label="More">
          ⋯
        </button>
      </header>
      {panel === "menu" && (
        <div className="board-menu">
          <button className="btn btn-sm" onClick={() => setPanel("templates")}>
            ✨ Add a template
          </button>
          <span className="row" style={{ gap: 4 }} role="group" aria-label="Board background">
            <span className="small faint">background</span>
            <Swatches
              colors={BGS}
              value={thread.bg ?? BGS[0]}
              label="Background"
              onPick={async (c) => {
                const { error } = await supabase.from("threads").update({ bg: c === BGS[0] ? null : c }).eq("id", thread.id);
                if (error) return toast(error.message);
                refreshAll();
              }}
            />
          </span>
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
        className={`board-view${tool === "pen" ? " drawing" : ""}${shot ? " shotting" : ""}${(shot && shotBg ? shotBg : thread.bg ?? "").match(/^#(2|1)/) ? " dark" : ""}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onLostPointerCapture={(e) => pointers.current.has(e.pointerId) && onCancel(e)}
        onPointerCancel={onCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${22 * view.z}px ${22 * view.z}px`, backgroundColor: (shot && shotBg) || thread.bg || undefined }}
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
            } else if (i.kind === "photo" && i.photo_path) {
              body = inFrame(i.style, urls[i.photo_path] ? <FramedImg src={urls[i.photo_path]} crop={i.style?.crop ?? NO_CROP} /> : <span className="board-wait" />);
            } else if (i.kind === "sticker" && i.photo_path) {
              // eslint-disable-next-line @next/next/no-img-element
              body = urls[i.photo_path] ? <img src={urls[i.photo_path]} alt="" draggable={false} crossOrigin="anonymous" /> : <span className="board-wait" />;
            } else if (i.kind === "grid") {
              const slotBody = (k: number) => {
                const path = i.photos?.[k];
                return (
                  <>
                    {path && urls[path] ? inFrame(i.style, <FramedImg src={urls[path]} crop={i.style?.crops?.[String(k)] ?? NO_CROP} />) : <span className="board-slot-add">{isSel ? "＋" : ""}</span>}
                    {path && isSel && (
                      <span className="board-slot-x board-ui" data-clear="1" aria-label="Clear this photo">
                        ×
                      </span>
                    )}
                  </>
                );
              };
              if (i.style?.n) {
                const rows = autoRows(i.style.n, b.w, b.h);
                let k = 0;
                body = (
                  <div className="board-grid auto">
                    {rows.map((count, r) => (
                      <div key={r} className="board-grid-row">
                        {Array.from({ length: count }, () => {
                          const n = k++;
                          return (
                            <div key={n} className="board-slot" data-slot={n}>
                              {slotBody(n)}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              } else {
                const L = gridLayout(i.style?.layout);
                body = (
                  <div className="board-grid" style={{ gridTemplateAreas: L.areas, gridTemplateColumns: L.cols, gridTemplateRows: L.rows }}>
                    {L.slots.map((area, k) => (
                      <div key={area} className="board-slot" data-slot={k} style={{ gridArea: area }}>
                        {slotBody(k)}
                      </div>
                    ))}
                  </div>
                );
              }
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
                <div className={`board-text${i.style?.hl ? ` hl-${i.style.hl}${/^#{1,2}\s/m.test(i.text ?? "") ? "" : " hl-all"}` : ""}`} style={look(i)}>
                  {i.text ? renderMini(i.text) : i.kind === "sticky" ? "" : "…"}
                </div>
              );
            return (
              <div
                key={i.id}
                data-item={i.id}
                className={`board-item k-${i.kind}${isSel ? " sel" : ""}${isEdit ? " editing" : ""}${i.kind === "photo" && (i.style?.shape ?? "polaroid") !== "polaroid" ? " shaped" : ""}`}
                style={{
                  left: b.x,
                  top: b.y,
                  width: b.w,
                  height: i.kind === "note" ? undefined : b.h,
                  minHeight: i.kind === "note" ? 30 : undefined,
                  transform: `rotate(${b.rot}deg)`,
                  zIndex: isSel ? 9999 : i.z,
                  background: i.kind === "sticky" ? (i.color ?? STICKY[0]) : (i.kind === "photo" || i.kind === "grid") && i.style?.pbg ? i.style.pbg : undefined,
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
          <div ref={guideV} className="board-guide v board-ui" />
          <div ref={guideH} className="board-guide h board-ui" />
          <svg className="board-live">
            <path ref={livePath} fill="none" stroke={pen} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {!items.length && !shot && (
          <div className="board-empty board-ui">
            <p>Double-tap anywhere to write, or add something below. Pinch to zoom.</p>
            <button className="btn btn-sm" style={{ pointerEvents: "auto" }} onClick={() => setPanel("templates")}>
              ✨ Start from a template
            </button>
          </div>
        )}
      </div>

      {/* Bottom: whatever's selected or being written, else the tools. */}
      {shot ? (
        shotBar && (
          <div className="board-shotbar">
            <span className="small">background:</span>
            <button className="board-swatch" style={{ background: thread.bg ?? BGS[0] }} aria-pressed={shotBg === null} aria-label="The board's own background" onClick={() => setShotBg(null)}>
              ·
            </button>
            <Swatches colors={BGS} value={shotBg ?? ""} label="Screenshot background" onPick={setShotBg} />
            <button className="btn btn-sm btn-primary" onClick={() => setShotBar(false)}>
              Hide
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => (setShot(false), setShotBar(false), setShotBg(null))}>
              Exit
            </button>
          </div>
        )
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
          {(sel.kind === "sticky" || sel.kind === "note") && (
            <button
              className="fmt"
              aria-label={`Align ${sel.style?.al ?? "left"}`}
              onClick={() => setLook(sel, { al: ({ left: "center", center: "right", right: "left" } as const)[sel.style?.al ?? "left"] })}
            >
              <AlignIcon al={sel.style?.al ?? "left"} />
            </button>
          )}
          {(sel.kind === "sticky" || sel.kind === "note") && isHeadingish(sel) && (
            <button className="fmt" aria-pressed={!!sel.style?.hl} aria-label="Heading highlight" onClick={() => setSubPanel(subPanel === "hl" ? null : "hl")}>
              🖍
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
              <button className="board-swatch board-swatch-btn" style={{ background: sel.style?.c ?? PENS[0] }} aria-pressed={subPanel === "color"} aria-label="Text color" onClick={() => setSubPanel(subPanel === "color" ? null : "color")} />
            </>
          )}
          {(sel.kind === "sticky" || sel.kind === "ink") && (
            <button
              className="board-swatch board-swatch-btn"
              style={{ background: sel.color ?? (sel.kind === "sticky" ? STICKY[0] : PENS[0]) }}
              aria-pressed={subPanel === "color"}
              aria-label={sel.kind === "sticky" ? "Sticky color" : "Ink color"}
              onClick={() => setSubPanel(subPanel === "color" ? null : "color")}
            />
          )}
          {sel.kind === "grid" && (
            <>
              <button className="fmt" aria-pressed={subPanel === "frame"} onClick={() => setSubPanel(subPanel === "frame" ? null : "frame")}>
                🖼 Frames
              </button>
              <span className="small faint" style={{ flex: "none" }}>
                photos
              </span>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} className="fmt" aria-pressed={slotCount(sel) === n} onClick={() => setLook(sel, { n, layout: undefined })}>
                  {n}
                </button>
              ))}
              {sel.photos?.some(Boolean) && (
                <button className="fmt" onClick={() => openPhotoEdit(sel, Math.max(0, (sel.photos ?? []).findIndex(Boolean)))}>
                  ✥ Edit photos
                </button>
              )}
            </>
          )}
          {sel.kind === "link" && sel.link && (
            <a className="btn btn-sm" href={sel.link} target="_blank" rel="noreferrer">
              Open ↗
            </a>
          )}
          {sel.kind === "photo" && sel.photo_path && (
            <>
              <button className="fmt" onClick={() => openPhotoEdit(sel, 0)}>
                ✥ Edit
              </button>
              <button
                className="fmt"
                onClick={() => {
                  setSlotFor({ id: sel.id, slot: 0 });
                  slotInput.current?.click();
                }}
              >
                ↺ Replace
              </button>
              <button className="fmt" aria-pressed={subPanel === "frame"} onClick={() => setSubPanel(subPanel === "frame" ? null : "frame")}>
                🖼 Frame
              </button>
              <button className="fmt" onClick={() => fitToPhoto(sel)} aria-label="Fit frame to photo">
                ⤢ Fit
              </button>
            </>
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
          <span className="board-layerbtns" role="group" aria-label="Layer">
            <button className="fmt" onClick={() => nudgeLayer(sel.id, 1)} disabled={layerOrder[0] === sel.id} aria-label="Bring forward">
              ↑
            </button>
            <button className="fmt" onClick={() => nudgeLayer(sel.id, -1)} disabled={layerOrder[layerOrder.length - 1] === sel.id} aria-label="Send backward">
              ↓
            </button>
            <button className="fmt" onClick={() => restack([sel.id, ...layerOrder.filter((x) => x !== sel.id)])} disabled={layerOrder[0] === sel.id} aria-label="Bring to front">
              ⤒
            </button>
            <button className="fmt" onClick={() => restack([...layerOrder.filter((x) => x !== sel.id), sel.id])} disabled={layerOrder[layerOrder.length - 1] === sel.id} aria-label="Send to back">
              ⤓
            </button>
          </span>
          <button className="fmt" onClick={() => remove(sel.id)} aria-label="Delete">
            🗑
          </button>
        </div>
      ) : null}

      {sel && tool === "move" && !editItem && !shot && subPanel === "frame" && (sel.kind === "photo" || sel.kind === "grid") && (
        <div className="board-subbar board-ui wrap">
          <div className="chips">
            {SHAPES.map((x) => (
              <button key={x.key} className="chip chip-sm" aria-pressed={(sel.style?.shape ?? "polaroid") === x.key} onClick={() => setLook(sel, { shape: x.key })}>
                {x.label}
              </button>
            ))}
            {savedShapes.map((sh) => (
              <span key={sh.id} className="chip chip-sm shape-chip" aria-pressed={sel.style?.shape === "custom" && sel.style?.mask === sh.mask}>
                <button className="shape-chip-pick" onClick={() => setLook(sel, { shape: "custom", mask: sh.mask })} aria-label={`Shape ${sh.name}`}>
                  <i className="shape-thumb" style={{ WebkitMaskImage: `url("${sh.mask}")`, maskImage: `url("${sh.mask}")` }} />
                  {sh.name}
                </button>
                <button
                  className="shape-chip-x"
                  aria-label={`Forget shape ${sh.name}`}
                  onClick={async () => {
                    if (!confirm(`Forget the "${sh.name}" shape? Frames already using it keep it.`)) return;
                    await supabase.from("frame_shapes").delete().eq("id", sh.id);
                    refreshAll();
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            <label className="chip chip-sm" title="Upload an SVG or a transparent PNG">
              ＋ custom
              <input type="file" accept="image/svg+xml,image/png,.svg,.png" hidden onChange={(e) => (e.target.files?.[0] && uploadShape(sel, e.target.files[0]), (e.target.value = ""))} />
            </label>
          </div>
          {pendingShape && pendingShape.id === sel.id && (
            <div className="row wrap shape-save" style={{ gap: 6 }}>
              <i className="shape-thumb big" style={{ WebkitMaskImage: `url("${pendingShape.mask}")`, maskImage: `url("${pendingShape.mask}")` }} />
              <span className="small">Keep this shape for later?</span>
              <input className="input input-sm" style={{ width: 110 }} value={pendingShape.name} onChange={(e) => setPendingShape({ ...pendingShape, name: e.target.value })} aria-label="Shape name" />
              <button
                className="btn btn-sm btn-primary"
                onClick={async () => {
                  const { error } = await supabase.from("frame_shapes").insert({ name: pendingShape.name.trim() || "shape", mask: pendingShape.mask });
                  if (error) return toast(error.message);
                  refreshAll();
                  setPendingShape(null);
                  toast("Shape saved ✨");
                }}
              >
                Save
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setPendingShape(null)}>
                Just this once
              </button>
            </div>
          )}
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="small faint">{sel.kind === "grid" ? "layout background" : "card background"}</span>
            <Swatches colors={["#ffffff", "#fbf7f1", "#3b2a2a", "#f4c6d4", "#f2d27a", "#b9dcc0", "#bcd3f2"]} value={sel.style?.pbg ?? "#ffffff"} label="Card background" onPick={(pbg) => setLook(sel, { pbg })} />
          </div>
          {(sel.style?.shape ?? "polaroid") !== "polaroid" && (
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="small faint">border</span>
              {BORDERS.map((w) => (
                <button key={w} className="fmt" aria-pressed={(sel.style?.bw ?? 0) === w} onClick={() => setLook(sel, { bw: w })}>
                  {w === 0 ? "none" : w === 3 ? "thin" : w === 7 ? "mid" : "thick"}
                </button>
              ))}
              {(sel.style?.bw ?? 0) > 0 && <Swatches colors={FRAME_COLORS} value={sel.style?.bc ?? FRAME_COLORS[0]} label="Border" onPick={(bc) => setLook(sel, { bc })} />}
            </div>
          )}
        </div>
      )}
      {sel && tool === "move" && !editItem && !shot && subPanel === "hl" && (sel.kind === "note" || sel.kind === "sticky") && (
        <div className="board-subbar board-ui wrap">
          <span className="small faint">heading highlight</span>
          <button className="fmt" aria-pressed={!sel.style?.hl} onClick={() => setLook(sel, { hl: undefined })}>
            off
          </button>
          <button className="fmt" aria-pressed={sel.style?.hl === "box"} onClick={() => setLook(sel, { hl: "box" })}>
            ▢ box
          </button>
          <button className="fmt" aria-pressed={sel.style?.hl === "tight"} onClick={() => setLook(sel, { hl: "tight" })}>
            ▬ marker
          </button>
          {sel.style?.hl && <Swatches colors={HIGHLIGHTS} value={sel.style?.hlc ?? HIGHLIGHTS[0]} label="Highlight" onPick={(hlc) => setLook(sel, { hlc })} />}
        </div>
      )}

      {photoEdit && items.find((i) => i.id === photoEdit.id) && (
        <PhotoEditor
          item={items.find((i) => i.id === photoEdit.id)!}
          urls={urls}
          start={photoEdit.slot}
          aspects={photoEdit.aspects}
          onClose={() => setPhotoEdit(null)}
          onSave={async (photos, crops) => {
            const it = items.find((i) => i.id === photoEdit.id)!;
            const st = it.style ?? {};
            if (it.kind === "photo") await patch(it.id, { style: { ...st, crop: crops[0] } });
            else await patch(it.id, { photos, style: { ...st, crops: Object.fromEntries(crops.map((c, k) => [String(k), c])) } });
            setPhotoEdit(null);
          }}
          onReplace={(k) => {
            setPhotoEdit(null);
            setSlotFor({ id: photoEdit.id, slot: k });
            slotInput.current?.click();
          }}
        />
      )}
      {sel && tool === "move" && !editItem && !shot && subPanel === "color" && (
        <div className="board-subbar board-ui wrap">
          <span className="small faint">{sel.kind === "note" ? "text color" : sel.kind === "sticky" ? "sticky color" : "ink color"}</span>
          {sel.kind === "note" && <Swatches colors={PENS} value={sel.style?.c ?? PENS[0]} label="Text color" onPick={(c) => setLook(sel, { c })} />}
          {sel.kind === "sticky" && <Swatches colors={STICKY} value={sel.color ?? STICKY[0]} label="Sticky color" onPick={(color) => patch(sel.id, { color })} />}
          {sel.kind === "ink" && <Swatches colors={PENS} value={sel.color ?? PENS[0]} label="Ink color" onPick={(color) => patch(sel.id, { color })} />}
        </div>
      )}
      {panel === "layers" && (
        <Layers
          order={layerOrder}
          items={items}
          urls={urls}
          selected={selected}
          onSelect={(id) => (setTool("move"), setSelected(id))}
          onReorder={restack}
          onClose={() => setPanel(null)}
        />
      )}

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

      {panel === "templates" && (
        <div className="board-stickers board-ui">
          <div className="row-between">
            <strong className="small">Templates</strong>
            <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Close templates">
              ×
            </button>
          </div>
          <div className="template-list">
            {TEMPLATES.map((t) => (
              <button key={t.key} className="template-card" onClick={() => addTemplate(t.key)}>
                <span className="template-emoji">{t.emoji}</span>
                <span>
                  <strong>{t.name}</strong>
                  <span className="small faint" style={{ display: "block" }}>
                    {t.blurb}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="small faint" style={{ margin: 0 }}>It lands where you&apos;re looking. Undo takes it back off.</p>
        </div>
      )}
      <input ref={slotInput} type="file" accept="image/*" multiple hidden onChange={(e) => (fillSlot(Array.from(e.target.files ?? [])), (e.target.value = ""))} />

      <nav className="board-tools board-ui">
        <button aria-pressed={tool === "move"} onClick={() => setTool("move")} aria-label="Move things">
          ✋
        </button>
        <button aria-pressed={tool === "pen"} onClick={() => (setTool("pen"), setSelected(null))} aria-label="Draw">
          ✏️
        </button>
        {tool === "pen" && <Swatches colors={PENS} value={pen} label="Pen color" onPick={setPen} />}
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
            <button onClick={() => add("grid", { style: { n: 4 }, photos: [] })} aria-label="Photo grid">
              ▦
            </button>
            <button aria-pressed={panel === "stickers"} onClick={() => setPanel(panel === "stickers" ? null : "stickers")} aria-label="Stickers">
              ✨
            </button>
            <button aria-pressed={panel === "link"} onClick={() => setPanel(panel === "link" ? null : "link")} aria-label="Link">
              🔗
            </button>
          </>
        )}
        <button aria-pressed={panel === "layers"} onClick={() => setPanel(panel === "layers" ? null : "layers")} aria-label="Layers">
          <LayersIcon />
        </button>
        <span className="grow" />
        <button onClick={undo} disabled={!undoCount} aria-label="Undo">
          ↶
        </button>
        <button
          aria-pressed={snap}
          onClick={() => {
            const on = !snap;
            setSnap(on);
            toast(on ? "Snapping on: things line up as you drag 🧲" : "Snapping off");
            try {
              localStorage.setItem("board-snap", on ? "1" : "0");
            } catch {}
          }}
          aria-label="Snap to line things up"
        >
          🧲
        </button>
        <button onClick={() => fit()} aria-label="Fit everything in view">
          ⤢
        </button>
      </nav>
    </div>
  );
}

function AlignIcon({ al }: { al: "left" | "center" | "right" }) {
  const ws = [14, 10, 16];
  return (
    <svg viewBox="0 0 22 16" width="20" height="15" aria-hidden fill="currentColor">
      {[2, 7, 12].map((y, k) => (
        <rect key={y} x={al === "left" ? 3 : al === "right" ? 19 - ws[(k + 1) % 3] : 11 - ws[(k + 1) % 3] / 2} y={y} width={ws[(k + 1) % 3]} height={2} rx={1} />
      ))}
    </svg>
  );
}

/** Colour buttons that are the colour, plus a custom picker (the last one, rainbow until used). */
function Swatches({ colors, value, label, onPick }: { colors: string[]; value: string; label: string; onPick: (c: string) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [live, setLive] = useState<string | null>(null);
  const custom = live ?? (colors.some((c) => c.toLowerCase() === value.toLowerCase()) ? null : value);
  return (
    <>
      {colors.map((c) => (
        <button key={c} className="board-swatch" style={{ background: c }} aria-pressed={!custom && value.toLowerCase() === c.toLowerCase()} aria-label={`${label} ${c}`} onClick={() => onPick(c)} />
      ))}
      <label className={`board-swatch board-swatch-custom${custom ? " picked" : ""}`} style={custom ? { background: custom } : undefined} aria-pressed={!!custom} title="Pick any colour">
        <input
          type="color"
          aria-label={`Custom ${label.toLowerCase()}`}
          value={/^#[0-9a-f]{6}$/i.test(custom ?? value) ? (custom ?? value) : "#888888"}
          onChange={(e) => {
            const c = e.target.value;
            setLive(c);
            clearTimeout(timer.current);
            // Save once the picker settles, not on every drag step.
            timer.current = setTimeout(() => {
              onPick(c);
              setLive(null);
            }, 350);
          }}
        />
      </label>
    </>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 3 8l9 5 9-5-9-5z" />
      <path d="m3 12.5 9 5 9-5" />
      <path d="m3 16.5 9 5 9-5" />
    </svg>
  );
}

/** Procreate-style layer list: top of the list is the front. Drag ≡ to restack, tap to select. */
function Layers({
  order,
  items,
  urls,
  selected,
  onSelect,
  onReorder,
  onClose,
}: {
  order: string[];
  items: Item[];
  urls: Record<string, string>;
  selected: string | null;
  onSelect: (id: string) => void;
  onReorder: (order: string[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const list = draft ?? order;
  const byId = new Map(items.map((i) => [i.id, i]));
  const name = (i: Item) => {
    const t = (i.text ?? "").replace(/^#+\s*/gm, "").replace(/\[( |x|X)\]\s?/g, "").trim().split("\n")[0];
    if (i.kind === "note") return t || "Text";
    if (i.kind === "sticky") return t ? `Sticky · ${t}` : "Sticky";
    if (i.kind === "photo") return "Photo";
    if (i.kind === "grid") return `Photo layout · ${slotCount(i)}`;
    if (i.kind === "sticker") return i.photo_path ? "Sticker" : `Sticker ${i.text ?? ""}`;
    if (i.kind === "ink") return "Drawing";
    if (i.kind === "link") return (i.link ?? "Link").replace(/^https?:\/\/(www\.)?/, "");
    return i.kind;
  };
  const thumb = (i: Item) => {
    const path = i.photo_path ?? i.photos?.find(Boolean);
    if (path && urls[path])
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={urls[path]} alt="" />;
    if (i.kind === "sticky") return <span style={{ background: i.color ?? STICKY[0] }} />;
    if (i.kind === "sticker") return <b>{i.text}</b>;
    if (i.kind === "ink") return <b style={{ color: i.color ?? PENS[0] }}>〰</b>;
    if (i.kind === "link") return <b>🔗</b>;
    return <b style={{ color: i.style?.c, fontFamily: i.style?.font === "serif" ? "var(--font-display)" : undefined }}>Aa</b>;
  };
  function onMove(e: React.PointerEvent) {
    if (!dragging) return;
    const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-layer]");
    const id = over?.dataset.layer;
    if (!id || id === dragging) return;
    const cur = draft ?? order;
    const next = cur.filter((x) => x !== dragging);
    const r = over!.getBoundingClientRect();
    const at = next.indexOf(id) + (e.clientY > r.top + r.height / 2 ? 1 : 0);
    next.splice(at, 0, dragging);
    setDraft(next);
  }
  function onUp() {
    if (dragging && draft) onReorder(draft);
    setDragging(null);
    setTimeout(() => setDraft(null), 600);
  }
  return (
    <div className="board-stickers board-layers board-ui" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div className="row-between">
        <strong className="small">Layers · front on top</strong>
        <button className="icon-btn" onClick={onClose} aria-label="Close layers">
          ×
        </button>
      </div>
      {list.length === 0 && <span className="small faint">Nothing on the board yet.</span>}
      <ul className="layer-list">
        {list.map((id) => {
          const i = byId.get(id);
          if (!i) return null;
          return (
            <li key={id} data-layer={id} className={`layer-row${selected === id ? " sel" : ""}${dragging === id ? " dragging" : ""}`}>
              <button className="layer-pick" onClick={() => onSelect(id)}>
                <span className="layer-thumb">{thumb(i)}</span>
                <span className="grow layer-name">{name(i)}</span>
              </button>
              <span
                className="layer-handle"
                aria-label={`Drag ${name(i)} up or down`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDragging(id);
                }}
              >
                ≡
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Edit how photos sit in their frames, like setting a profile picture: the frame
 * is shown at its real shape, drag to move, pinch or slide to zoom. For layouts,
 * the strip underneath picks a slot and drags to reorder.
 */
function PhotoEditor({
  item,
  urls,
  start,
  aspects,
  onSave,
  onReplace,
  onClose,
}: {
  item: Item;
  urls: Record<string, string>;
  start: number;
  aspects: number[];
  onSave: (photos: string[], crops: Crop[]) => void;
  onReplace: (slot: number) => void;
  onClose: () => void;
}) {
  const isGrid = item.kind === "grid";
  const n = isGrid ? slotCount(item) : 1;
  const [photos, setPhotos] = useState<string[]>(() => (isGrid ? Array.from({ length: n }, (_, k) => item.photos?.[k] ?? "") : [item.photo_path ?? ""]));
  const [crops, setCrops] = useState<Crop[]>(() =>
    isGrid ? Array.from({ length: n }, (_, k) => item.style?.crops?.[String(k)] ?? NO_CROP) : [item.style?.crop ?? NO_CROP],
  );
  const [cur, setCur] = useState(Math.min(start, n - 1));
  const [ars, setArs] = useState<Record<string, number>>({});
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ crop: Crop; d0: number; cx: number; cy: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const F = aspects[cur] ?? 1;
  const cut = shapeCut(item.style);
  const W = Math.min(300, (typeof window !== "undefined" ? window.innerWidth : 360) - 72);
  const fw = F >= 1 ? W : Math.round(W * Math.max(F, 0.45));
  const fh = Math.round(fw / F);
  const path = photos[cur];
  const src = path ? urls[path] : undefined;
  const A = path ? ars[path] : undefined;
  const crop = crops[cur] ?? NO_CROP;
  const g = A ? fitGeom(F, A, crop) : null;
  const setCrop = (c: Crop) => setCrops((cs) => cs.map((x, k) => (k === cur ? c : x)));

  function down(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...pointers.current.values()];
    const mid = ps.reduce((a, p) => ({ x: a.x + p.x / ps.length, y: a.y + p.y / ps.length }), { x: 0, y: 0 });
    const d0 = ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    gesture.current = { crop, d0, cx: mid.x, cy: mid.y };
  }
  function move(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !gesture.current || !A) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...pointers.current.values()];
    const mid = ps.reduce((a, p) => ({ x: a.x + p.x / ps.length, y: a.y + p.y / ps.length }), { x: 0, y: 0 });
    const g0 = gesture.current;
    let s2 = g0.crop.s;
    if (ps.length > 1 && g0.d0 > 0) s2 = Math.max(1, Math.min(4, g0.crop.s * (Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) / g0.d0)));
    const geo = fitGeom(F, A, { ...g0.crop, s: s2 });
    // Dragging right shows more of the left of the picture.
    const x = g0.crop.x - ((mid.x - g0.cx) / ((fw * geo.w) / 100)) * 100;
    const y = g0.crop.y - ((mid.y - g0.cy) / ((fh * geo.h) / 100)) * 100;
    // Keep the stored centre inside what the clamp allows, so it never "sticks".
    const half = (v: number, size: number) => Math.max((50 / size) * 100, Math.min(100 - (50 / size) * 100, v));
    setCrop({ x: half(x, geo.w), y: half(y, geo.h), s: s2 });
  }
  function up(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    const ps = [...pointers.current.values()];
    gesture.current = ps.length ? { crop: crops[cur], d0: 0, cx: ps[0].x, cy: ps[0].y } : null;
  }

  // Thumbnail strip: tap to pick, drag to reorder (the crop travels with its photo).
  const thumbDown = useRef<{ k: number; x: number; y: number; moved: boolean } | null>(null);
  function stripMove(e: React.PointerEvent) {
    const t = thumbDown.current;
    if (!t) return;
    if (!t.moved && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 8) return;
    t.moved = true;
    setDragFrom(t.k);
    const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-thumb]");
    const to = over ? Number(over.dataset.thumb) : -1;
    if (to < 0 || to === t.k) return;
    const from = t.k; // updaters run later, after t.k moves on
    const mv = <T,>(arr: T[]) => {
      const a = [...arr];
      const [x] = a.splice(from, 1);
      a.splice(to, 0, x);
      return a;
    };
    setPhotos(mv);
    setCrops(mv);
    setCur((c) => (c === from ? to : c === to ? from : c));
    t.k = to;
  }
  function stripUp() {
    const t = thumbDown.current;
    thumbDown.current = null;
    setDragFrom(null);
    if (!t || t.moved) return;
    if (photos[t.k]) setCur(t.k);
    else onReplace(t.k);
  }

  return (
    <Sheet title={isGrid ? "Edit photos" : "Edit photo"} onClose={onClose}>
      <div className="stack pe">
        <div className="pe-stage" ref={stage} style={{ height: fh + 40 }}>
          {src ? (
            <div className="pe-frame" style={{ width: fw, height: fh }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
              {g && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="pe-ghost" src={src} alt="" draggable={false} style={{ width: `${g.w}%`, height: `${g.h}%`, left: `${g.left}%`, top: `${g.top}%` }} />
              )}
              <div className={`pe-window${cut ? " shaped" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  className={cut ? "pe-dim" : undefined}
                  onLoad={(e) => {
                    const r = e.currentTarget.naturalWidth / e.currentTarget.naturalHeight;
                    setArs((m) => (path && !m[path] ? { ...m, [path]: r } : m));
                  }}
                  style={g ? { width: `${g.w}%`, height: `${g.h}%`, left: `${g.left}%`, top: `${g.top}%` } : { opacity: 0 }}
                />
                {/* What will actually show: the frame's shape, full strength. */}
                {cut && g && (
                  <div className="pe-shape" style={cut}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" draggable={false} style={{ width: `${g.w}%`, height: `${g.h}%`, left: `${g.left}%`, top: `${g.top}%` }} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button className="pe-empty" style={{ width: fw, height: fh }} onClick={() => onReplace(cur)}>
              ＋ add a photo
            </button>
          )}
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="small faint">zoom</span>
          <input className="grow" type="range" min={1} max={4} step={0.02} value={crop.s} onChange={(e) => setCrop({ ...crop, s: Number(e.target.value) })} aria-label="Zoom" />
          <button className="btn btn-sm btn-ghost" onClick={() => setCrop(NO_CROP)}>
            Reset
          </button>
        </div>
        <span className="small faint">Drag the photo to move it in its frame{isGrid ? ". Drag the little ones to reorder" : ""}.</span>
        {isGrid && (
          <div className="pe-strip" onPointerMove={stripMove} onPointerUp={stripUp} onPointerCancel={stripUp}>
            {photos.map((p, k) => (
              <span
                key={k}
                data-thumb={k}
                className={`pe-thumb${k === cur ? " on" : ""}${dragFrom === k ? " dragging" : ""}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  thumbDown.current = { k, x: e.clientX, y: e.clientY, moved: false };
                }}
              >
                {p && urls[p] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[p]} alt="" draggable={false} />
                ) : (
                  <b>＋</b>
                )}
                <i>{k + 1}</i>
              </span>
            ))}
          </div>
        )}
        <div className="row-between">
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm" onClick={() => onReplace(cur)}>
              Replace
            </button>
            {isGrid && path && (
              <button className="btn btn-sm btn-ghost" onClick={() => setPhotos((ps) => ps.map((x, k) => (k === cur ? "" : x)))}>
                Remove
              </button>
            )}
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => onSave(photos, crops)}>
            Save
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * An uploaded SVG or PNG → a small PNG data URL whose transparency is the shape.
 * SVGs are drawn as-is (their filled parts are the shape); PNGs keep their alpha.
 */
async function toMask(f: File): Promise<string> {
  const isSvg = f.type === "image/svg+xml" || /\.svg$/i.test(f.name);
  if (!isSvg && f.type !== "image/png") throw new Error("Use an SVG or a PNG with a transparent background");
  const url = isSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await f.text())}` : URL.createObjectURL(f);
  const img = new Image();
  img.src = url;
  await img.decode().catch(() => {
    throw new Error("Couldn't read that image");
  });
  const w0 = img.naturalWidth || 300;
  const h0 = img.naturalHeight || 300;
  const k = 320 / Math.max(w0, h0);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * k));
  c.height = Math.max(1, Math.round(h0 * k));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  if (!isSvg) URL.revokeObjectURL(url);
  // A PNG with no transparency would just be a rectangle: say so.
  const px = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  let clear = 0;
  for (let i = 3; i < px.length; i += 16) if (px[i] < 20) clear++;
  if (clear < px.length / 16 / 50) throw new Error("That picture has no transparent background, so it would just be a rectangle");
  return c.toDataURL("image/png");
}

function dropKey<T>(o: Record<string, T>, k: string): Record<string, T> {
  const { [k]: _gone, ...rest } = o;
  void _gone;
  return rest;
}

// Event-time helpers (kept outside the component so they're never mistaken for render work).
const jitter = () => Math.random() * 20 - 10;
const nowMs = () => Date.now();
