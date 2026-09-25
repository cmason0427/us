"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
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

const EMOJI = ["🗒️", "🎃", "🎄", "✈️", "🏠", "🎁", "🍽️", "🐶", "💡", "🛋️"];

/**
 * Threads sit at the top of the feed: little shared boards for brainstorming
 * (costumes, a trip, the living room). Adding to one never posts or pings;
 * the other person just sees a dot next time they open the app.
 */
export function ThreadStrip() {
  const { threads, isNew } = useThreads();
  const active = threads.filter((t) => !t.archived_at);
  const [creating, setCreating] = useState(false);
  const { nameOf } = useApp();
  const router = useRouter();
  const setOpen = (id: string) => router.push(`/threads/${id}`);

  return (
    <div className="thread-strip">
      {active.map((t) => (
        <button key={t.id} className={`thread-chip${isNew(t) ? " is-new" : ""}`} onClick={() => setOpen(t.id)}>
          <span>{t.emoji ?? "🗒️"}</span>
          <span className="thread-chip-title">{t.title}</span>
          {isNew(t) && (
            <span className="thread-dot" aria-label={`${nameOf(t.last_by)} added something`}>
              •
            </span>
          )}
        </button>
      ))}
      <button className="thread-chip thread-new" onClick={() => setCreating(true)}>
        ＋ board
      </button>
      {active.some(isNew) && <p className="small thread-note">{nameOf(active.find(isNew)!.last_by)} added to {active.filter(isNew).length === 1 ? "a board" : "some boards"} 🗒️</p>}
      {creating && (
        <NewThread
          onDone={(id) => {
            setCreating(false);
            if (id) setOpen(id);
          }}
        />
      )}
    </div>
  );
}

export function NewThread({ onDone, bare = false }: { onDone: (id?: string) => void; bare?: boolean }) {
  const { meId, toast } = useApp();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🗒️");
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
        <p className="small muted">A shared board: sticky notes, pics, links and doodles you can drag around. It never goes in the feed or sends a push.</p>
        <button className="btn btn-primary btn-block" disabled={!title.trim()}>
          Start it
        </button>
      </form>
  );
  if (bare) return form;
  return (
    <Sheet title="New board" onClose={() => onDone()}>
      {form}
    </Sheet>
  );
}

/** Archived boards, for the Saved page. */
export function ArchivedThreads() {
  const { threads } = useThreads();
  const router = useRouter();
  const archived = threads.filter((t) => t.archived_at);
  if (!archived.length) return null;
  return (
    <section style={{ marginTop: 16 }}>
      <h3 className="pantry-h">Archived boards</h3>
      <ul className="mini-list">
        {archived.map((t) => (
          <li key={t.id}>
            <button onClick={() => router.push(`/threads/${t.id}`)} style={{ border: "1px solid var(--line)" }}>
              <span className="mini-emoji">{t.emoji ?? "🗒️"}</span>
              <span className="grow">{t.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
