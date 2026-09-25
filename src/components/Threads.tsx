"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { usePhotoUrls } from "@/lib/photos";
import { shrinkImage } from "@/lib/image";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

export interface Thread {
  id: string;
  title: string;
  emoji: string | null;
  archived_at: string | null;
  last_by: string | null;
  last_at: string;
  created_by: string;
}
interface Item {
  id: string;
  thread_id: string;
  author: string;
  text: string | null;
  photo_path: string | null;
  link: string | null;
  created_at: string;
}

/** Every thread, plus when I last looked at each. */
export function useThreads() {
  const { meId } = useApp();
  const supabase = supabaseBrowser();
  const { data: threads = [] } = useLive<Thread[]>(
    "threads",
    async () => {
      const { data, error } = await supabase.from("threads").select("*").order("last_at", { ascending: false });
      if (error) throw error;
      return data as Thread[];
    },
    ["threads"],
  );
  const { data: reads = [] } = useLive<{ thread_id: string; seen_at: string }[]>(
    "thread_reads",
    async () => {
      const { data, error } = await supabase.from("thread_reads").select("thread_id, seen_at");
      if (error) throw error;
      return data;
    },
    ["thread_reads"],
  );
  const seen = new Map(reads.map((r) => [r.thread_id, r.seen_at]));
  // New to me = the other person touched it since I last opened it.
  const isNew = (t: Thread) => !!t.last_by && t.last_by !== meId && (!seen.has(t.id) || t.last_at > seen.get(t.id)!);
  return { threads, isNew };
}

const EMOJI = ["💭", "🎃", "🎄", "✈️", "🏠", "🎁", "🍽️", "🐶", "💡", "🛋️"];

/**
 * Threads sit at the top of the feed: little shared boards for brainstorming
 * (costumes, a trip, the living room). Adding to one never posts or pings;
 * the other person just sees a dot next time they open the app.
 */
export function ThreadStrip() {
  const { threads, isNew } = useThreads();
  const active = threads.filter((t) => !t.archived_at);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { nameOf } = useApp();
  const openThread = threads.find((t) => t.id === open);

  return (
    <div className="thread-strip">
      {active.map((t) => (
        <button key={t.id} className={`thread-chip${isNew(t) ? " is-new" : ""}`} onClick={() => setOpen(t.id)}>
          <span>{t.emoji ?? "💭"}</span>
          <span className="thread-chip-title">{t.title}</span>
          {isNew(t) && (
            <span className="thread-dot" aria-label={`${nameOf(t.last_by)} added something`}>
              •
            </span>
          )}
        </button>
      ))}
      <button className="thread-chip thread-new" onClick={() => setCreating(true)}>
        ＋ thread
      </button>
      {active.some(isNew) && <p className="small thread-note">{nameOf(active.find(isNew)!.last_by)} added to {active.filter(isNew).length === 1 ? "a thread" : "some threads"} 💭</p>}
      {openThread && <ThreadSheet thread={openThread} onClose={() => setOpen(null)} />}
      {creating && <NewThread onDone={(id) => (setCreating(false), id && setOpen(id))} />}
    </div>
  );
}

export function NewThread({ onDone, bare = false }: { onDone: (id?: string) => void; bare?: boolean }) {
  const { meId, toast } = useApp();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("💭");
  const form = (
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const { data, error } = await supabaseBrowser().from("threads").insert({ title: title.trim(), emoji, created_by: meId, last_by: meId }).select("id").single();
          if (error) return toast(error.message);
          refreshAll();
          onDone(data.id);
        }}
      >
        <div className="chips">
          {EMOJI.map((e) => (
            <button key={e} type="button" className="chip chip-sm" aria-pressed={emoji === e} onClick={() => setEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="halloween costumes" autoFocus aria-label="What it's about" />
        <p className="small muted">A shared board for ideas, pics and links. It never goes in the feed or sends a push.</p>
        <button className="btn btn-primary btn-block" disabled={!title.trim()}>
          Start it
        </button>
      </form>
  );
  if (bare) return form;
  return (
    <Sheet title="New thread" onClose={() => onDone()}>
      {form}
    </Sheet>
  );
}

export function ThreadSheet({ thread, onClose }: { thread: Thread; onClose: () => void }) {
  const { meId, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const { data: items = [] } = useLive<Item[]>(
    `thread_items:${thread.id}`,
    async () => {
      const { data, error } = await supabase.from("thread_items").select("*").eq("thread_id", thread.id).order("created_at");
      if (error) throw error;
      return data as Item[];
    },
    ["thread_items"],
  );
  const urls = usePhotoUrls(items.flatMap((i) => (i.photo_path ? [i.photo_path] : [])));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Opening it (and anything that lands while it's open) counts as seen.
  const lastItem = items[items.length - 1]?.created_at ?? thread.last_at;
  useEffect(() => {
    supabase
      .from("thread_reads")
      .upsert({ thread_id: thread.id, user_id: meId, seen_at: new Date().toISOString() })
      .then(() => refreshAll());
  }, [thread.id, lastItem, meId, supabase]);

  async function addText(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const link = /^https?:\/\/\S+$/.test(t) ? t : null;
    const { error } = await supabase.from("thread_items").insert({ thread_id: thread.id, author: meId, text: link ? null : t, link });
    if (error) return toast(error.message);
    setText("");
    refreshAll();
  }
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      const { blob, ext } = await shrinkImage(f);
      const path = `${meId}/threads/${thread.id}/${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
      if (error) {
        toast(error.message);
        continue;
      }
      await supabase.from("thread_items").insert({ thread_id: thread.id, author: meId, photo_path: path });
    }
    setBusy(false);
    refreshAll();
  }
  async function archive() {
    await supabase.from("threads").update({ archived_at: thread.archived_at ? null : new Date().toISOString() }).eq("id", thread.id);
    refreshAll();
    toast(thread.archived_at ? "Back at the top of the feed" : "Archived. It lives in Saved now 🔖");
    onClose();
  }

  return (
    <Sheet title={`${thread.emoji ?? "💭"} ${thread.title}`} onClose={onClose}>
      <div className="stack">
        {items.length === 0 && <p className="small muted">Empty so far. Drop an idea, a pic or a link.</p>}
        <div className="thread-items">
          {items.map((i) => (
            <div key={i.id} className={`thread-item${i.author === meId ? " mine" : ""}`}>
              <span className="thread-who">
                {i.author === meId ? "you" : nameOf(i.author)} · {formatDistanceToNowStrict(new Date(i.created_at))}
              </span>
              {i.text && <p className="thread-text">{i.text}</p>}
              {i.link && (
                <a className="thread-text keep-case" href={i.link} target="_blank" rel="noreferrer">
                  {i.link}
                </a>
              )}
              {i.photo_path &&
                (urls[i.photo_path] ? (
                  <a href={urls[i.photo_path]} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="thread-photo" src={urls[i.photo_path]} alt="" />
                  </a>
                ) : (
                  <div className="thread-photo thread-photo-wait" />
                ))}
              {i.author === meId && (
                <button
                  className="lt-x thread-del"
                  aria-label="Delete"
                  onClick={async () => {
                    await supabase.from("thread_items").delete().eq("id", i.id);
                    refreshAll();
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {!thread.archived_at && (
          <form className="thread-compose" onSubmit={addText}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Add photos">
              {busy ? "…" : "📷"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
            <input className="input input-sm grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="an idea, or paste a link…" aria-label="Add to the thread" />
            <button className="btn btn-sm btn-primary" disabled={!text.trim()}>
              Add
            </button>
          </form>
        )}
        <div className="row-between">
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              if (!confirm(`Delete "${thread.title}" and everything in it?`)) return;
              await supabase.from("threads").delete().eq("id", thread.id);
              refreshAll();
              onClose();
            }}
          >
            Delete
          </button>
          <button className="btn btn-sm" onClick={archive}>
            {thread.archived_at ? "Unarchive" : "Archive"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** Archived threads, for the Saved page. */
export function ArchivedThreads() {
  const { threads } = useThreads();
  const [open, setOpen] = useState<string | null>(null);
  const archived = threads.filter((t) => t.archived_at);
  const openThread = threads.find((t) => t.id === open);
  if (!archived.length) return null;
  return (
    <section style={{ marginTop: 16 }}>
      <h3 className="pantry-h">Archived threads</h3>
      <ul className="mini-list">
        {archived.map((t) => (
          <li key={t.id}>
            <button onClick={() => setOpen(t.id)} style={{ border: "1px solid var(--line)" }}>
              <span className="mini-emoji">{t.emoji ?? "💭"}</span>
              <span className="grow">{t.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {openThread && <ThreadSheet thread={openThread} onClose={() => setOpen(null)} />}
    </section>
  );
}
