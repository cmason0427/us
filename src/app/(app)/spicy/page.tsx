"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { usePhotoUrls } from "@/lib/photos";
import { shrinkImage } from "@/lib/image";
import { PART_BYTES, partPaths, prepareVideo, stitchVideo } from "@/lib/video";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { ImageSources } from "@/components/ImageSources";
import { SpicyGate } from "@/components/SpicyGate";
import { Wavy } from "@/components/Art";

interface SpicyItem {
  id: string;
  author: string;
  kind: "fantasy" | "try" | "remember" | "worked" | "didnt";
  text: string;
  to_user: string | null;
  created_at: string;
}

const NOTE_KINDS = [
  { v: "remember", label: "📝 Remember this" },
  { v: "worked", label: "👍 Worked for me" },
  { v: "didnt", label: "👎 Didn't work for me" },
] as const;

type Section = "pics" | "ideas" | "notes";

export default function SpicyPage() {
  return (
    <main className="page">
      <PageHead eyebrow="Just us" title="Spicy" />
      <Wavy />
      <SpicyGate>
        <Spicy />
      </SpicyGate>
    </main>
  );
}

function useItems() {
  const { data = [] } = useLive<SpicyItem[]>(
    "spicy_items",
    async () => {
      const { data, error } = await supabaseBrowser().from("spicy_items").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as SpicyItem[];
    },
    ["spicy_items"],
  );
  return data;
}

function Spicy() {
  const [section, setSection] = useState<Section>("pics");
  const [asking, setAsking] = useState(false);

  return (
    <div className="stack">
      <button className="btn btn-block spicy-lunch" onClick={() => setAsking(true)}>
        😏 In the mood?
      </button>
      {asking && <MoodAsk onClose={() => setAsking(false)} />}
      <div className="seg" role="group" aria-label="Section">
        <button aria-pressed={section === "pics"} onClick={() => setSection("pics")}>
          Pics
        </button>
        <button aria-pressed={section === "ideas"} onClick={() => setSection("ideas")}>
          Ideas
        </button>
        <button aria-pressed={section === "notes"} onClick={() => setSection("notes")}>
          Notes
        </button>
      </div>
      {section === "pics" && <Pics />}
      {section === "ideas" && <Ideas />}
      {section === "notes" && <Notes />}
    </div>
  );
}

/* ─── Pics & videos: one shared collection, tagged by who's in each ────── */

const isVideo = (path: string) => /\.(mp4|mov|m4v|webm|3gp)$/i.test(path);

interface SpicyMedia {
  id: string;
  storage_path: string;
  people: string[];
  caption: string | null;
  /** Long videos are stored in pieces (see lib/video). */
  parts: number;
  poster_path: string | null;
  duration: number | null;
  added_by: string;
  created_at: string;
}

type PeopleFilter = "all" | "me" | "them" | "both";

/** Who's in it: tap one of you, or both. */
function PeopleTags({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { profiles, meId } = useApp();
  const ordered = [...profiles].sort((a) => (a.id === meId ? -1 : 1));
  return (
    <div className="chips" role="group" aria-label="Who's in it">
      {ordered.map((p) => {
        const on = value.includes(p.id);
        return (
          <button key={p.id} type="button" className="chip chip-sm" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}>
            {p.id === meId ? "Me" : p.display_name}
          </button>
        );
      })}
    </div>
  );
}

function Pics() {
  const { meId, partner, toast } = useApp();
  const supabase = supabaseBrowser();
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const [pending, setPending] = useState<{ file: File; url: string; people: string[] }[]>([]);
  // Which one is open in the viewer (swipes through what's showing).
  const [open, setOpen] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [editFolder, setEditFolder] = useState<string | null>(null);
  const [filing, setFiling] = useState<string[] | null>(null);
  // Select several in the grid to file them at once.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const { folders, links } = useFolders();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const { data: media = [] } = useLive<SpicyMedia[]>(
    "spicy_media",
    async () => {
      const { data, error } = await supabase.from("spicy_media").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as SpicyMedia[];
    },
    ["spicy_media"],
  );
  const urls = usePhotoUrls(media.flatMap((m) => (m.poster_path ? [m.poster_path] : m.parts > 1 ? [] : [m.storage_path])));
  const them = partner?.id ?? "";
  const only = (m: SpicyMedia, id: string) => m.people.length === 1 && m.people[0] === id;
  const inFolder = folder ? new Set(links.filter((l) => l.folder_id === folder).map((l) => l.media_id)) : null;
  const shown = media.filter(
    (m) =>
      (!inFolder || inFolder.has(m.id)) &&
      (filter === "all" ? true : filter === "me" ? only(m, meId) : filter === "them" ? only(m, them) : m.people.includes(meId) && m.people.includes(them)),
  );
  const activeFolder = folders.find((f) => f.id === folder);
  const untagged = media.filter((m) => m.people.length === 0).length;

  function pick(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    setPending(list.map((file) => ({ file, url: URL.createObjectURL(file), people: [] })));
  }

  async function upload() {
    setBusy(true);
    const done: string[] = [];
    // Shrinking a long video takes a while; keep the screen on meanwhile.
    const lock = await navigator.wakeLock?.request("screen").catch(() => null);
    try {
      for (const [n, p] of pending.entries()) {
        const video = p.file.type.startsWith("video/");
        const of = pending.length > 1 ? ` (${n + 1} of ${pending.length})` : "";
        if (!video) {
          const { blob, ext } = await shrinkImage(p.file);
          const path = `${meId}/spicy/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
          if (error) throw error;
          done.push(path);
          const { error: rowErr } = await supabase.from("spicy_media").insert({ storage_path: path, people: p.people, added_by: meId });
          if (rowErr) throw rowErr;
          continue;
        }
        setProgress(`Getting the video ready${of}…`);
        const v = await prepareVideo(p.file, (label) => setProgress(label + of));
        const ext = v.shrunk ? "mp4" : p.file.name.split(".").pop()?.toLowerCase() || "mp4";
        const path = `${meId}/spicy/${crypto.randomUUID()}.${ext}`;
        const parts = Math.max(1, Math.ceil(v.blob.size / PART_BYTES));
        const paths = partPaths(path, parts);
        for (const [k, pp] of paths.entries()) {
          setProgress(`Uploading${parts > 1 ? ` part ${k + 1} of ${parts}` : ""}${of}…`);
          const { error } = await supabase.storage.from("photos").upload(pp, v.blob.slice(k * PART_BYTES, (k + 1) * PART_BYTES, v.blob.type || "video/mp4"), { contentType: v.blob.type || "video/mp4", cacheControl: "31536000" });
          if (error) {
            await supabase.storage.from("photos").remove(paths.slice(0, k));
            throw error;
          }
        }
        let poster: string | null = null;
        if (v.poster) {
          poster = `${path}.jpg`;
          const { error } = await supabase.storage.from("photos").upload(poster, v.poster, { contentType: "image/jpeg", cacheControl: "31536000" });
          if (error) poster = null;
        }
        done.push(path);
        const { error: rowErr } = await supabase.from("spicy_media").insert({ storage_path: path, parts, poster_path: poster, duration: Math.round(v.duration), people: p.people, added_by: meId });
        if (rowErr) throw rowErr;
      }
      // The feed only hears that something's new; never what.
      const { data: post } = await supabase.from("posts").insert({ author: meId, text: "🌶️ Something new in Spicy", spicy: true }).select("id").single();
      if (post) notify({ kind: "spicy", id: post.id });
      pending.forEach((p) => URL.revokeObjectURL(p.url));
      setPending([]);
      refreshAll();
      toast(`Added ${done.length} 🌶️`);
    } catch (err) {
      toast((err as Error).message);
    }
    lock?.release().catch(() => {});
    setProgress("");
    setBusy(false);
  }

  async function retag(m: SpicyMedia, people: string[]) {
    const { error } = await supabase.from("spicy_media").update({ people }).eq("id", m.id);
    if (error) return toast(error.message);
    refreshAll();
  }

  async function remove(m: SpicyMedia) {
    if (!confirm("Remove this for both of you? (It leaves your folders too.)")) return;
    await supabase.from("spicy_media").delete().eq("id", m.id);
    if (m.storage_path.startsWith(`${meId}/`)) await supabase.storage.from("photos").remove([...partPaths(m.storage_path, m.parts ?? 1), ...(m.poster_path ? [m.poster_path] : [])]);
    setOpen(null);
    refreshAll();
  }

  return (
    <div className="stack">
      <label className="card composer-prompt" style={{ cursor: "pointer" }}>
        <span style={{ fontSize: "1.6rem" }}>🌶️</span>
        <span>Add pics or videos…</span>
        <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
      </label>
      <ImageSources onFiles={(fs) => pick(fs)} />

      <FolderStrip folders={folders} links={links} media={media} urls={urls} active={folder} onPick={setFolder} onEdit={setEditFolder} />
      {activeFolder && (
        <div className="row-between">
          <strong>📁 {activeFolder.title}</strong>
          <button className="btn-link small" onClick={() => setEditFolder(activeFolder.id)}>
            title + cover
          </button>
        </div>
      )}

      <div className="chips" role="group" aria-label="Show">
        {(
          [
            ["all", "All"],
            ["me", "Just me"],
            ["them", `Just ${partner?.display_name ?? "them"}`],
            ["both", "Both of us"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} className="chip chip-sm" aria-pressed={filter === v} onClick={() => setFilter(v)}>
            {label}
          </button>
        ))}
      </div>
      {untagged > 0 && filter === "all" && <p className="small muted">{untagged} not tagged yet. Tap one to tag who&apos;s in it.</p>}
      {shown.length > 0 && (
        <div className="row-between">
          <span className="small faint">{selecting ? `${picked.length} picked` : `${shown.length} here`}</span>
          <span className="row" style={{ gap: 8 }}>
            {selecting && (
              <button className="btn-link small" onClick={() => setPicked(picked.length === shown.length ? [] : shown.map((m) => m.id))}>
                {picked.length === shown.length ? "none" : "all"}
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={() => (setSelecting((x) => !x), setPicked([]))}>
              {selecting ? "Cancel" : "Select"}
            </button>
          </span>
        </div>
      )}
      {selecting && picked.length > 0 && (
        <div className="select-bar">
          <button className="btn btn-primary btn-sm" onClick={() => setFiling(picked)}>
            📁 Add {picked.length} to a folder
          </button>
          {activeFolder && (
            <button
              className="btn btn-sm"
              onClick={async () => {
                const { error } = await supabase.from("spicy_folder_items").delete().eq("folder_id", activeFolder.id).in("media_id", picked);
                if (error) return toast(error.message);
                toast(`Took ${picked.length} out of ${activeFolder.title} (still in Spicy)`);
                setPicked([]);
                setSelecting(false);
                refreshAll();
              }}
            >
              Take out of this folder
            </button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: 48 }}>🌶️</div>
          <p>{media.length ? "None of those yet." : "Nothing here yet."}</p>
        </div>
      ) : (
        <div className="saved-grid">
          {shown.map((m) => (
            <button
              key={m.id}
              className={`saved-item spicy-thumb${selecting && picked.includes(m.id) ? " picked" : ""}`}
              onClick={() => (selecting ? setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id])) : setOpen(m.id))}
              aria-pressed={selecting ? picked.includes(m.id) : undefined}
            >
              {selecting && <span className="pick-dot">{picked.includes(m.id) ? "✓" : ""}</span>}
              {m.poster_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                urls[m.poster_path] && <img src={urls[m.poster_path]} alt="" loading="lazy" />
              ) : isVideo(m.storage_path) ? (
                urls[m.storage_path] && <video src={urls[m.storage_path]} muted playsInline preload="metadata" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                urls[m.storage_path] && <img src={urls[m.storage_path]} alt="" loading="lazy" />
              )}
              {isVideo(m.storage_path) && <span className="spicy-play">▶</span>}
              {m.duration ? <span className="spicy-dur">{Math.floor(m.duration / 60)}:{String(Math.round(m.duration % 60)).padStart(2, "0")}</span> : null}
            </button>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <Sheet title={`Tag who's in ${pending.length > 1 ? "each" : "it"}`} onClose={() => setPending([])}>
          <div className="stack">
            {pending.map((p, i) => (
              <div key={p.url} className="row" style={{ alignItems: "flex-start" }}>
                <div className="photo-pick">
                  {p.file.type.startsWith("video/") ? (
                    <video src={p.url} muted playsInline />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="" />
                  )}
                </div>
                <PeopleTags value={p.people} onChange={(people) => setPending((ps) => ps.map((x, j) => (j === i ? { ...x, people } : x)))} />
              </div>
            ))}
            <p className="small muted">Videos up to 10 minutes. Big ones get shrunk a little on your phone first so they fit; keep the app open until it&apos;s done.</p>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={upload}>
              {busy ? progress || "Adding…" : `Add ${pending.length}`}
            </button>
          </div>
        </Sheet>
      )}

      {open && shown.some((m) => m.id === open) && (
        <SpicyViewer
          list={shown}
          openId={open}
          urls={urls}
          onClose={() => setOpen(null)}
          onRetag={retag}
          onRemove={remove}
          onFile={(m) => setFiling([m.id])}
          folderCount={(m) => links.filter((l) => l.media_id === m.id).length}
        />
      )}
      {filing && <FilePicker mediaIds={filing} folders={folders} links={links} onClose={() => (setFiling(null), setSelecting(false), setPicked([]))} />}
      {editFolder && folders.some((f) => f.id === editFolder) && (
        <FolderSheet
          folder={folders.find((f) => f.id === editFolder)!}
          items={media.filter((m) => links.some((l) => l.folder_id === editFolder && l.media_id === m.id))}
          urls={urls}
          onClose={() => setEditFolder(null)}
          onDeleted={() => (setEditFolder(null), setFolder(null))}
        />
      )}
    </div>
  );
}

/* ─── folders: personal, one pic can be in many ────────────────────────── */

interface SpicyFolder {
  id: string;
  title: string;
  cover_media_id: string | null;
  position: number;
  created_at: string;
}
type FolderLink = { folder_id: string; media_id: string; added_at: string };

/** Your own folders (the database only ever gives you yours). */
function useFolders() {
  const { data: folders = [] } = useLive<SpicyFolder[]>(
    "spicy_folders",
    async () => {
      const { data, error } = await supabaseBrowser().from("spicy_folders").select("*").order("position").order("created_at");
      if (error) throw error;
      return data as SpicyFolder[];
    },
    ["spicy_folders"],
  );
  const { data: links = [] } = useLive<FolderLink[]>(
    "spicy_folder_items",
    async () => {
      const { data, error } = await supabaseBrowser().from("spicy_folder_items").select("*").order("added_at", { ascending: false });
      if (error) throw error;
      return data as FolderLink[];
    },
    ["spicy_folder_items"],
  );
  return { folders, links };
}

async function newFolder(title: string, meId: string) {
  const { data, error } = await supabaseBrowser().from("spicy_folders").insert({ title: title.trim(), owner: meId }).select("id").single();
  if (error) throw error;
  refreshAll();
  return data.id as string;
}

/** A little square of a pic or video (its still, if it has one). */
function Thumb({ m, urls }: { m: SpicyMedia | undefined; urls: Record<string, string> }) {
  if (!m) return <span className="spicy-thumb-empty">🌶️</span>;
  const src = m.poster_path ? urls[m.poster_path] : m.parts > 1 ? undefined : urls[m.storage_path];
  if (!src) return <span className="spicy-thumb-empty">▶</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return !m.poster_path && isVideo(m.storage_path) ? <video src={src} muted playsInline preload="metadata" /> : <img src={src} alt="" loading="lazy" />;
}

function coverOf(f: SpicyFolder, links: FolderLink[], media: SpicyMedia[]) {
  const id = f.cover_media_id ?? links.find((l) => l.folder_id === f.id)?.media_id;
  return media.find((m) => m.id === id);
}

function FolderStrip({
  folders,
  links,
  media,
  urls,
  active,
  onPick,
  onEdit,
}: {
  folders: SpicyFolder[];
  links: FolderLink[];
  media: SpicyMedia[];
  urls: Record<string, string>;
  active: string | null;
  onPick: (id: string | null) => void;
  onEdit: (id: string) => void;
}) {
  const { meId, toast } = useApp();
  async function create() {
    const title = window.prompt("Name the folder", "");
    if (!title?.trim()) return;
    try {
      const id = await newFolder(title, meId);
      onPick(id);
    } catch (err) {
      toast((err as Error).message);
    }
  }
  return (
    <div className="folder-strip" role="group" aria-label="Your folders">
      <button className="folder-tile" aria-pressed={active === null} onClick={() => onPick(null)}>
        <span className="folder-cover all">🌶️</span>
        <span className="folder-name">everything</span>
      </button>
      {folders.map((f) => (
        <button
          key={f.id}
          className="folder-tile"
          aria-pressed={active === f.id}
          onClick={() => (active === f.id ? onEdit(f.id) : onPick(f.id))}
          aria-label={`${f.title}${active === f.id ? " (tap again to edit)" : ""}`}
        >
          <span className="folder-cover">
            <Thumb m={coverOf(f, links, media)} urls={urls} />
          </span>
          <span className="folder-name">{f.title}</span>
          <span className="folder-count">{links.filter((l) => l.folder_id === f.id).length}</span>
        </button>
      ))}
      <button className="folder-tile" onClick={create}>
        <span className="folder-cover add">＋</span>
        <span className="folder-name">new folder</span>
      </button>
    </div>
  );
}

/** Put one pic in (or take it out of) any of your folders. It always stays in the main collection. */
function FilePicker({ mediaIds, folders, links, onClose }: { mediaIds: string[]; folders: SpicyFolder[]; links: FolderLink[]; onClose: () => void }) {
  const { meId, toast } = useApp();
  const [draft, setDraft] = useState("");
  const db = supabaseBrowser();
  // A folder counts as "has them" when every picked one is already in it.
  const hasAll = (f: SpicyFolder) => mediaIds.every((m) => links.some((l) => l.folder_id === f.id && l.media_id === m));
  async function toggle(f: SpicyFolder) {
    const { error } = hasAll(f)
      ? await db.from("spicy_folder_items").delete().eq("folder_id", f.id).in("media_id", mediaIds)
      : await db.from("spicy_folder_items").upsert(mediaIds.map((m) => ({ folder_id: f.id, media_id: m })), { ignoreDuplicates: true });
    if (error) toast(error.message);
    else if (mediaIds.length > 1) toast(hasAll(f) ? `Took ${mediaIds.length} out of ${f.title}` : `Added ${mediaIds.length} to ${f.title} 📁`);
    refreshAll();
  }
  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      const id = await newFolder(draft, meId);
      await db.from("spicy_folder_items").insert(mediaIds.map((m) => ({ folder_id: id, media_id: m })));
      setDraft("");
      refreshAll();
    } catch (err) {
      toast((err as Error).message);
    }
  }
  return (
    <Sheet title={mediaIds.length > 1 ? `📁 Add ${mediaIds.length} to…` : "📁 Your folders"} onClose={onClose}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>Only you see your folders. It stays in the main collection either way.</p>
        {folders.length > 0 && (
          <div className="chips">
            {folders.map((f) => (
              <button key={f.id} className="chip" aria-pressed={hasAll(f)} onClick={() => toggle(f)}>
                {hasAll(f) ? "✓ " : ""}
                {f.title}
              </button>
            ))}
          </div>
        )}
        <form className="quick-add" onSubmit={createAndAdd}>
          <input className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="new folder name" aria-label="New folder" />
          <button className="btn" disabled={!draft.trim()}>
            Add
          </button>
        </form>
        <button className="btn btn-primary btn-block" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

/** A folder's title and cover (any pic in it), or delete the folder (the pics stay). */
function FolderSheet({ folder, items, urls, onClose, onDeleted }: { folder: SpicyFolder; items: SpicyMedia[]; urls: Record<string, string>; onClose: () => void; onDeleted: () => void }) {
  const { toast } = useApp();
  const [title, setTitle] = useState(folder.title);
  const db = supabaseBrowser();
  const cover = folder.cover_media_id ?? items[0]?.id;
  async function save(fields: Partial<SpicyFolder>) {
    const { error } = await db.from("spicy_folders").update(fields).eq("id", folder.id);
    if (error) toast(error.message);
    refreshAll();
  }
  return (
    <Sheet title="📁 Folder" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title.trim() !== folder.title && save({ title: title.trim() })} />
        </label>
        <div className="field">
          <span>Cover</span>
          {items.length ? (
            <div className="saved-grid">
              {items.map((m) => (
                <button key={m.id} className={`saved-item spicy-thumb${cover === m.id ? " cover-on" : ""}`} onClick={() => save({ cover_media_id: m.id })} aria-pressed={cover === m.id}>
                  <Thumb m={m} urls={urls} />
                  {cover === m.id && <span className="cover-badge">cover</span>}
                </button>
              ))}
            </div>
          ) : (
            <p className="small muted">Add pics to it first (open one and tap 📁).</p>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start" }}
          onClick={async () => {
            if (!confirm(`Delete the "${folder.title}" folder? The pics stay in Spicy.`)) return;
            await db.from("spicy_folders").delete().eq("id", folder.id);
            refreshAll();
            onDeleted();
          }}
        >
          Delete folder
        </button>
      </div>
    </Sheet>
  );
}

/** Full screen: swipe (or arrow) through whatever's showing, like a photo app. */
function SpicyViewer({
  list,
  openId,
  urls,
  onClose,
  onRetag,
  onRemove,
  onFile,
  folderCount,
}: {
  list: SpicyMedia[];
  openId: string;
  urls: Record<string, string>;
  onClose: () => void;
  onRetag: (m: SpicyMedia, people: string[]) => void;
  onRemove: (m: SpicyMedia) => void;
  onFile: (m: SpicyMedia) => void;
  folderCount: (m: SpicyMedia) => number;
}) {
  const { meId, nameOf } = useApp();
  const [idx, setIdx] = useState(() => Math.max(0, list.findIndex((m) => m.id === openId)));
  const [info, setInfo] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const cur = list[Math.min(idx, list.length - 1)];
  const full = usePhotoUrls(cur && !isVideo(cur.storage_path) ? [cur.storage_path] : []);

  useLayoutEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = idx * el.clientWidth;
    // Only on open: after that, the strip's scroll decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  });
  function go(d: number) {
    const el = strip.current;
    const k = Math.min(list.length - 1, Math.max(0, idx + d));
    if (el) el.scrollTo({ left: k * el.clientWidth, behavior: "smooth" });
  }
  if (!cur) return null;
  const n = folderCount(cur);

  return (
    <div className="spicy-viewer" role="dialog" aria-label="Viewer">
      <div className="sv-top">
        <button className="sv-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
        <span className="sv-count">
          {idx + 1} / {list.length}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <button className="sv-btn" onClick={() => onFile(cur)} aria-label="Folders">
            📁{n ? <sup>{n}</sup> : null}
          </button>
          <button className="sv-btn" aria-pressed={info} onClick={() => setInfo((x) => !x)} aria-label="Details">
            ⓘ
          </button>
        </span>
      </div>
      <div
        ref={strip}
        className="sv-strip"
        onScroll={(e) => {
          const el = e.currentTarget;
          const k = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (k !== idx) setIdx(k);
        }}
      >
        {list.map((m, k) => (
          <div key={m.id} className="sv-slide">
            {Math.abs(k - idx) > 1 ? null : isVideo(m.storage_path) ? (
              k === idx ? (
                <SpicyVideo m={m} />
              ) : (
                <Thumb m={m} urls={urls} />
              )
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(k === idx ? full[m.storage_path] : undefined) ?? urls[m.storage_path]} alt="" draggable={false} />
            )}
          </div>
        ))}
      </div>
      {idx > 0 && (
        <button className="sv-arrow left" onClick={() => go(-1)} aria-label="Previous">
          ‹
        </button>
      )}
      {idx < list.length - 1 && (
        <button className="sv-arrow right" onClick={() => go(1)} aria-label="Next">
          ›
        </button>
      )}
      {info && (
        <div className="sv-info">
          <div className="field">
            <span>Who&apos;s in it</span>
            <PeopleTags value={cur.people} onChange={(people) => onRetag(cur, people)} />
          </div>
          <p className="small faint" style={{ margin: 0 }}>
            Added by {cur.added_by === meId ? "you" : nameOf(cur.added_by)}
            {n ? ` · in ${n} of your folders` : ""}
          </p>
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => onRemove(cur)}>
            Remove for both of us
          </button>
        </div>
      )}
    </div>
  );
}

/** Plays a video; one stored in pieces is downloaded and joined first. */
function SpicyVideo({ m }: { m: SpicyMedia }) {
  const [src, setSrc] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const paths = partPaths(m.storage_path, m.parts ?? 1);
    supabaseBrowser()
      .storage.from("photos")
      .createSignedUrls(paths, 3600)
      .then(async ({ data, error }) => {
        if (error || !data) throw error ?? new Error("Couldn't load the video.");
        const signed = paths.map((p) => data.find((d) => d.path === p)?.signedUrl ?? "");
        const url = signed.length === 1 ? signed[0] : await stitchVideo(signed, m.storage_path, (p) => live && setPct(p));
        if (live) setSrc(url);
      })
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [m.storage_path, m.parts]);
  if (err) return <p className="small muted">{err}</p>;
  if (!src) return <div className="spicy-loading small muted">{m.parts > 1 ? `Loading… ${pct}%` : "Loading…"}</div>;
  return <video src={src} controls playsInline autoPlay style={{ width: "100%", borderRadius: 14 }} />;
}

/* ─── Ideas: private fantasies, and the want-to-try list ──────────────────── */

function Ideas() {
  const { meId, partner, toast } = useApp();
  const items = useItems();
  const tryList = items.filter((i) => i.kind === "try");
  const mine = items.filter((i) => i.kind === "fantasy" && i.author === meId);
  const [tryDraft, setTryDraft] = useState("");
  const { data: reactions = [] } = useLive<{ item_id: string; user_id: string; emoji: string }[]>(
    "spicy_reactions",
    async () => {
      const { data, error } = await supabaseBrowser().from("spicy_reactions").select("item_id, user_id, emoji");
      if (error) throw error;
      return data;
    },
    ["spicy_reactions"],
  );
  const { data: notes = [] } = useLive<IdeaNote[]>(
    "spicy_item_notes",
    async () => {
      const { data, error } = await supabaseBrowser().from("spicy_item_notes").select("*").order("created_at");
      if (error) throw error;
      return data as IdeaNote[];
    },
    ["spicy_item_notes"],
  );
  const [fantasyDraft, setFantasyDraft] = useState("");
  const supabase = supabaseBrowser();

  async function add(kind: "try" | "fantasy", text: string) {
    const { data, error } = await supabase.from("spicy_items").insert({ author: meId, kind, text: text.trim() }).select("id").single();
    if (error) return toast(error.message);
    if (kind === "try") {
      notify({ kind: "spicy_item", id: data.id });
      await feedHint();
    }
    refreshAll();
  }
  // A vague heads-up in the feed (no details); the rest stays behind the PIN.
  async function feedHint() {
    await supabase.from("posts").insert({ author: meId, text: "🌶️ A new idea in Spicy", spicy: true });
  }

  async function share(f: SpicyItem) {
    if (!confirm(`Share this with ${partner?.display_name ?? "them"}? It moves to your want-to-try list.`)) return;
    const { data, error } = await supabase.from("spicy_items").insert({ author: meId, kind: "try", text: f.text }).select("id").single();
    if (error) return toast(error.message);
    await supabase.from("spicy_items").delete().eq("id", f.id);
    notify({ kind: "spicy_item", id: data.id });
    await feedHint();
    refreshAll();
    toast("Shared 😏");
  }

  async function remove(id: string) {
    await supabase.from("spicy_items").delete().eq("id", id);
    refreshAll();
  }

  return (
    <div className="stack">
      <section>
        <div className="section-title" style={{ margin: "4px 0 6px" }}>
          Want to try
        </div>
        <p className="small muted" style={{ marginBottom: 8 }}>
          Both of you see this. Add or take things off whenever.
        </p>
        <form
          className="quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (tryDraft.trim()) add("try", tryDraft).then(() => setTryDraft(""));
          }}
        >
          <input className="input grow" value={tryDraft} onChange={(e) => setTryDraft(e.target.value)} placeholder="Wanna try this?" aria-label="Add to want to try" />
          <button className="btn btn-primary" disabled={!tryDraft.trim()}>
            Add
          </button>
        </form>
        {tryList.length > 0 && (
          <div className="card" style={{ marginTop: 10, padding: "2px 12px" }}>
            {tryList.map((i) => (
              <IdeaRow key={i.id} item={i} reactions={reactions.filter((r) => r.item_id === i.id)} notes={notes.filter((n) => n.item_id === i.id)} onRemove={() => remove(i.id)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-title" style={{ margin: "10px 0 6px" }}>
          🔒 Just mine
        </div>
        <p className="small muted" style={{ marginBottom: 8 }}>
          Private. {partner?.display_name ?? "They"} can&apos;t see these unless you share one.
        </p>
        <form
          className="quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (fantasyDraft.trim()) add("fantasy", fantasyDraft).then(() => setFantasyDraft(""));
          }}
        >
          <input className="input grow" value={fantasyDraft} onChange={(e) => setFantasyDraft(e.target.value)} placeholder="A private fantasy…" aria-label="Add a private fantasy" />
          <button className="btn" disabled={!fantasyDraft.trim()}>
            Keep
          </button>
        </form>
        {mine.length > 0 && (
          <div className="card" style={{ marginTop: 10, padding: "2px 12px" }}>
            {mine.map((f) => (
              <div key={f.id} className="task">
                <span className="grow task-title" style={{ fontWeight: 500 }}>
                  {f.text}
                </span>
                <button className="btn btn-sm btn-ghost" onClick={() => share(f)}>
                  Share?
                </button>
                <button className="icon-btn" onClick={() => remove(f.id)} aria-label="Delete">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface IdeaNote {
  id: string;
  item_id: string;
  author: string;
  text: string;
  created_at: string;
}
const REACTIONS = ["🔥", "😍", "😏", "🤔", "🙈"];

/** One want-to-try idea: a reaction each (tap again to clear) and a little note thread. */
function IdeaRow({ item, reactions, notes, onRemove }: { item: SpicyItem; reactions: { user_id: string; emoji: string }[]; notes: IdeaNote[]; onRemove: () => void }) {
  const { meId, nameOf, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const supabase = supabaseBrowser();
  const mine = reactions.find((r) => r.user_id === meId)?.emoji;
  async function react(e: string) {
    const { error } =
      mine === e ? await supabase.from("spicy_reactions").delete().eq("item_id", item.id).eq("user_id", meId) : await supabase.from("spicy_reactions").upsert({ item_id: item.id, user_id: meId, emoji: e });
    if (error) toast(error.message);
    refreshAll();
  }
  async function addNote(ev: React.FormEvent) {
    ev.preventDefault();
    if (!draft.trim()) return;
    const { error } = await supabase.from("spicy_item_notes").insert({ item_id: item.id, author: meId, text: draft.trim() });
    if (error) return toast(error.message);
    setDraft("");
    refreshAll();
  }
  return (
    <div className="idea-row">
      <div className="row">
        <span className="grow task-title" style={{ fontWeight: 500 }}>
          {item.text}
        </span>
        <span className="small faint">{item.author === meId ? "you" : nameOf(item.author)}</span>
        <button className="icon-btn icon-btn-sm" onClick={onRemove} aria-label="Take off the list">
          ×
        </button>
      </div>
      <div className="row wrap idea-react">
        {reactions
          .filter((r) => r.user_id !== meId)
          .map((r) => (
            <span key={r.user_id} className="small" title={nameOf(r.user_id)}>
              {nameOf(r.user_id).slice(0, 1)} {r.emoji}
            </span>
          ))}
        {REACTIONS.map((e) => (
          <button key={e} type="button" className="idea-emoji" aria-pressed={mine === e} onClick={() => react(e)}>
            {e}
          </button>
        ))}
        <button type="button" className="btn-link small" onClick={() => setOpen((o) => !o)}>
          💬 {notes.length || ""}
        </button>
      </div>
      {open && (
        <div className="note-thread">
          {notes.map((n) => (
            <div key={n.id} className="note-line">
              <strong className="small">{n.author === meId ? "you" : nameOf(n.author)}</strong>
              <span className="grow">{n.text}</span>
              {n.author === meId && (
                <button
                  className="lt-x"
                  aria-label="Delete note"
                  onClick={async () => {
                    await supabase.from("spicy_item_notes").delete().eq("id", n.id);
                    refreshAll();
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <form className="quick-add" onSubmit={addNote}>
            <input className="input input-sm grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="a thought on this…" aria-label="Note" />
            <button className="btn btn-sm" disabled={!draft.trim()}>
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ─── Notes: remember this / worked / didn't. They clear once seen. ──────── */

function Notes() {
  const { meId, partner, toast } = useApp();
  const items = useItems();
  const forMe = items.filter((i) => i.to_user === meId);
  const sent = items.filter((i) => i.author === meId && i.to_user && i.kind !== "try" && i.kind !== "fantasy");
  const [kind, setKind] = useState<(typeof NOTE_KINDS)[number]["v"]>("remember");
  const [draft, setDraft] = useState("");
  const supabase = supabaseBrowser();
  const label = (k: string) => NOTE_KINDS.find((n) => n.v === k)?.label ?? "";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !partner) return;
    const { data, error } = await supabase.from("spicy_items").insert({ author: meId, kind, text: draft.trim(), to_user: partner.id }).select("id").single();
    if (error) return toast(error.message);
    notify({ kind: "spicy_item", id: data.id });
    setDraft("");
    refreshAll();
    toast("Sent 💛");
  }

  async function clear(id: string) {
    await supabase.from("spicy_items").delete().eq("id", id);
    refreshAll();
  }

  return (
    <div className="stack">
      {forMe.length > 0 && (
        <section>
          <div className="section-title" style={{ margin: "4px 0 6px" }}>
            For you
          </div>
          <div className="stack-sm">
            {forMe.map((n) => (
              <div key={n.id} className="card spicy-note">
                <span className="small muted">{label(n.kind)}</span>
                <p>{n.text}</p>
                <button className="btn btn-sm" onClick={() => clear(n.id)} style={{ alignSelf: "flex-start" }}>
                  Seen ✓ clear
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <form className="card stack" onSubmit={send}>
        <strong>Tell {partner?.display_name ?? "them"}</strong>
        <div className="chips" role="radiogroup" aria-label="Kind of note">
          {NOTE_KINDS.map((k) => (
            <button key={k.v} type="button" role="radio" aria-checked={kind === k.v} className="chip chip-sm" onClick={() => setKind(k.v)}>
              {k.label}
            </button>
          ))}
        </div>
        <textarea className="textarea" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Super casual. They'll clear it once they've seen it." />
        <button className="btn btn-primary" disabled={!draft.trim()}>
          Send
        </button>
      </form>

      {sent.length > 0 && (
        <section>
          <div className="small muted" style={{ fontWeight: 650, margin: "4px 0 6px" }}>
            Waiting to be seen
          </div>
          {sent.map((n) => (
            <p key={n.id} className="small">
              {label(n.kind)}: {n.text}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

const MOOD_PRESETS = ["Lunch: you? 😏", "In the mood. Are you? 😏", "Tonight? 🌙", "Thinking about you 🔥"];
const COOLDOWN_MS = 3 * 60 * 60 * 1000;

/** How long ago I last sent a mood ask (answered or not), in ms. */
async function lastMoodAskAge(meId: string) {
  const { data: last } = await supabaseBrowser()
    .from("posts")
    .select("created_at")
    .eq("author", meId)
    .eq("kind", "lunch_you")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return last ? Date.now() - Date.parse(last.created_at) : Infinity;
}

/**
 * A mood ask: a preset or your own words. It lands in their feed; "not right
 * now" quietly takes it away. If you asked in the last 3 hours, it checks first.
 */
function MoodAsk({ onClose }: { onClose: () => void }) {
  const { meId, partner, toast } = useApp();
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ text: string; hours: string } | null>(null);
  const them = partner?.display_name ?? "them";

  async function send(text: string, force = false) {
    setBusy(true);
    if (!force) {
      const age = await lastMoodAskAge(meId);
      if (age < COOLDOWN_MS) {
        setBusy(false);
        const h = age / 3600000;
        return setConfirm({ text, hours: h < 1 ? "less than an hour" : `${Math.floor(h)} hour${Math.floor(h) === 1 ? "" : "s"}` });
      }
    }
    const res = await fetch("/api/spicy/lunch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", text }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast("Couldn't send. Try again?");
    refreshAll();
    toast(`Sent to ${them} 😏`);
    onClose();
  }

  return (
    <Sheet title="In the mood?" onClose={onClose}>
      {confirm ? (
        <div className="stack">
          <p>You sent a mood ask {confirm.hours} ago. Would you like to send another?</p>
          <div className="row-between">
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Not yet
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={() => send(confirm.text, true)}>
              Send another
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="stack-sm">
            {MOOD_PRESETS.map((p) => (
              <button key={p} className="btn btn-block" disabled={busy} onClick={() => send(p)}>
                {p}
              </button>
            ))}
          </div>
          <form
            className="quick-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) send(custom.trim());
            }}
          >
            <input className="input grow" value={custom} maxLength={140} onChange={(e) => setCustom(e.target.value)} placeholder="Or say it your way…" aria-label="Your own words" />
            <button className="btn btn-primary" disabled={busy || !custom.trim()}>
              Send
            </button>
          </form>
          <p className="small muted">It goes to {them}&apos;s feed. “Not right now” just makes it disappear, no hard feelings.</p>
        </div>
      )}
    </Sheet>
  );
}
