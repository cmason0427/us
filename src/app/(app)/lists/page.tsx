"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { celebrate } from "@/lib/celebrate";
import { URGENCY_RANK, type ListType, type Post, type Task, type Urgency } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { PostComposer } from "@/components/PostComposer";
import { PostCard, usePhotoUrls } from "@/components/PostCard";
import { DOGS, type DogId } from "@/lib/dogs";
import { IconTrash, Paw, Sprig, Teapot, Wavy } from "@/components/Art";

// Ours also collects household and dog to-dos, so nothing hides in a side tab.
const OURS: ListType[] = ["shared", "household", "dogs"];
const LIST_TAG: Partial<Record<ListType, string>> = { household: "🧺 Household", dogs: "🐾 Dogs" };

type Tab = "todo" | "dogs" | "household";
const NEXT_URGENCY: Record<Urgency, Urgency> = { low: "medium", medium: "high", high: "low" };

export default function ListsPage() {
  const params = useSearchParams();
  const initialTab = params.get("tab");
  // "kodo" is the old name of the dogs tab; old links still land there.
  const [tab, setTab] = useState<Tab>(initialTab === "dogs" || initialTab === "kodo" ? "dogs" : initialTab === "household" ? "household" : "todo");
  const initialDog = DOGS.find((d) => d.id === params.get("dog"))?.id ?? null;
  const pick = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", t === "todo" ? "/lists" : `/lists?tab=${t}`);
  };

  return (
    <main className="page">
      <PageHead eyebrow="Keeping track" title="Lists" art={<Sprig width={34} height={34} />} />
      <Wavy />
      <div className="seg" role="group" aria-label="List" style={{ marginBottom: 16 }}>
        <button aria-pressed={tab === "todo"} onClick={() => pick("todo")}>
          To-dos
        </button>
        <button aria-pressed={tab === "dogs"} onClick={() => pick("dogs")}>
          🐾 Dogs
        </button>
        <button aria-pressed={tab === "household"} onClick={() => pick("household")}>
          Household
        </button>
      </div>
      {tab === "todo" && <Todos />}
      {tab === "dogs" && <Dogs initialDog={initialDog} />}
      {tab === "household" && <TaskList listType="household" title="Around the house" hint="Also shows in Ours. No rush unless it's marked." />}
    </main>
  );
}

/* ─── To-dos ────────────────────────────────────────────────────────────── */

function Todos() {
  const { partner } = useApp();
  return (
    <>
      <TaskList listType="shared" show={OURS} title="Ours" hint="Everything shared, including household and dog to-dos. Tap an item to edit it." />
      <div className="checker" style={{ margin: "22px 0 4px" }} />
      <TaskList listType="personal" title="Just mine" hint={`Private — ${partner?.display_name ?? "they"} can't see these.`} />
    </>
  );
}

function sortTasks(list: Task[]) {
  return [...list].sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || a.created_at.localeCompare(b.created_at));
}

/** `listType` is where new items go; `show` is which lists this view collects (defaults to just that one). */
function TaskList({ listType, show = [listType], title, hint }: { listType: ListType; show?: ListType[]; title: string; hint: string }) {
  const { meId, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const [draft, setDraft] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("low");
  const [showDone, setShowDone] = useState(false);

  const { data: tasks = [] } = useLive<Task[]>(
    `tasks:${show.join("+")}`,
    async () => {
      // RLS already hides the other person's personal list; the owner filter
      // is belt-and-braces.
      let q = supabase.from("tasks").select("*").in("list_type", show);
      if (listType === "personal") q = q.eq("owner", meId);
      const { data, error } = await q.order("created_at");
      if (error) throw error;
      return data as Task[];
    },
    ["tasks"],
  );

  const open = sortTasks(tasks.filter((t) => !t.done));
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const title = draft.trim();
    setDraft("");
    const { error } = await supabase
      .from("tasks")
      .insert({ title, list_type: listType, owner: listType === "personal" ? meId : null, urgency, created_by: meId });
    if (error) {
      setDraft(title);
      return toast(error.message);
    }
    setUrgency("low");
    refreshAll();
  }

  async function toggle(t: Task, el: HTMLElement) {
    const nowDone = !t.done;
    if (nowDone) celebrate(el);
    await supabase
      .from("tasks")
      .update({ done: nowDone, done_at: nowDone ? new Date().toISOString() : null, done_by: nowDone ? meId : null })
      .eq("id", t.id);
    refreshAll();
  }

  async function bump(t: Task) {
    await supabase.from("tasks").update({ urgency: NEXT_URGENCY[t.urgency] }).eq("id", t.id);
    refreshAll();
  }

  async function rename(t: Task, title: string) {
    const { error } = await supabase.from("tasks").update({ title }).eq("id", t.id);
    if (error) toast(error.message);
    refreshAll();
  }

  async function remove(t: Task) {
    await supabase.from("tasks").delete().eq("id", t.id);
    refreshAll();
  }

  async function clearDone() {
    if (!confirm(`Clear ${done.length} finished item${done.length === 1 ? "" : "s"}?`)) return;
    await supabase.from("tasks").delete().in("id", done.map((t) => t.id));
    refreshAll();
  }

  return (
    <section>
      <div className="section-title">{title}</div>
      <p className="small muted" style={{ marginTop: -6, marginBottom: 10 }}>
        {hint}
      </p>
      <form className="quick-add" onSubmit={add}>
        <input className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add something…" aria-label={`Add to ${title}`} />
        <button type="button" className="urg" data-u={urgency} onClick={() => setUrgency(NEXT_URGENCY[urgency])} aria-label={`Urgency: ${urgency}. Tap to change.`} style={{ minHeight: 46, paddingInline: 12 }}>
          {urgency === "low" ? "no rush" : urgency}
        </button>
        <button className="btn btn-primary" disabled={!draft.trim()}>
          Add
        </button>
      </form>

      <div className="card" style={{ marginTop: 12, padding: "4px 14px" }}>
        {open.length === 0 && (
          <div className="empty" style={{ padding: 18 }}>
            <Teapot width={52} height={52} />
            <span>All clear. Put the kettle on.</span>
          </div>
        )}
        {open.map((t) => (
          <TaskRow key={t.id} t={t} tag={show.length > 1 ? LIST_TAG[t.list_type] : undefined} showWho={listType !== "personal"} onToggle={toggle} onBump={bump} onRename={rename} onRemove={remove} nameOf={nameOf} />
        ))}
      </div>

      {done.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="row-between">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowDone((s) => !s)}>
              {showDone ? "▾" : "▸"} Done ({done.length})
            </button>
            {showDone && (
              <button className="btn btn-ghost btn-sm" onClick={clearDone}>
                Clear done
              </button>
            )}
          </div>
          {showDone && (
            <div className="card" style={{ padding: "4px 14px" }}>
              {done.map((t) => (
                <TaskRow key={t.id} t={t} tag={show.length > 1 ? LIST_TAG[t.list_type] : undefined} showWho={listType !== "personal"} onToggle={toggle} onBump={bump} onRename={rename} onRemove={remove} nameOf={nameOf} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TaskRow({
  t,
  tag,
  showWho,
  onToggle,
  onBump,
  onRename,
  onRemove,
  nameOf,
}: {
  t: Task;
  tag?: string;
  showWho: boolean;
  onToggle: (t: Task, el: HTMLElement) => void;
  onBump: (t: Task) => void;
  onRename: (t: Task, title: string) => void;
  onRemove: (t: Task) => void;
  nameOf: (id: string | null) => string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const save = () => {
    const title = editing?.trim();
    setEditing(null);
    if (title && title !== t.title) onRename(t, title);
  };
  return (
    <div className={`task${t.done ? " done" : ""}`}>
      <input type="checkbox" className="check" checked={t.done} onChange={(e) => onToggle(t, e.currentTarget)} aria-label={`Done: ${t.title}`} />
      <div className="grow">
        {editing !== null ? (
          <input
            className="input"
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(null);
            }}
            aria-label="Edit to-do"
            autoFocus
          />
        ) : (
          <button className="task-title task-edit" onClick={() => setEditing(t.title)} aria-label={`Edit ${t.title}`}>
            {t.title}
          </button>
        )}
        {showWho && (
          <div className="small faint">
            {tag && <span className="sticker" style={{ marginRight: 6 }}>{tag}</span>}
            {t.done && t.done_by ? `done by ${nameOf(t.done_by)}` : `added by ${nameOf(t.created_by)}`}
          </div>
        )}
      </div>
      {t.done ? (
        <button className="icon-btn" onClick={() => onRemove(t)} aria-label={`Delete ${t.title}`}>
          <IconTrash />
        </button>
      ) : (
        <button className="urg" data-u={t.urgency} onClick={() => onBump(t)} aria-label={`Urgency ${t.urgency}. Tap to change.`}>
          {t.urgency === "low" ? "no rush" : t.urgency === "high" ? "🔥 high" : "medium"}
        </button>
      )}
    </div>
  );
}

/* ─── Dogs ──────────────────────────────────────────────────────────────── */

// Dog notes are feed posts tagged with dogs; to-dos also show in Ours.
function Dogs({ initialDog }: { initialDog: DogId | null }) {
  const supabase = supabaseBrowser();
  const [filter, setFilter] = useState<DogId | null>(initialDog);
  const [writing, setWriting] = useState(false);
  const pickFilter = (d: DogId | null) => {
    setFilter(d);
    window.history.replaceState(null, "", d ? `/lists?tab=dogs&dog=${d}` : "/lists?tab=dogs");
  };

  const { data: notes = [] } = useLive<Post[]>(
    `dog-notes:${filter ?? "all"}`,
    async () => {
      let q = supabase.from("posts").select("*, post_photos(*)");
      q = filter ? q.contains("dogs", [filter]) : q.overlaps("dogs", DOGS.map((d) => d.id));
      const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as Post[];
    },
    ["posts", "post_photos"],
  );
  const urls = usePhotoUrls(notes.flatMap((p) => p.post_photos.map((ph) => ph.storage_path)));

  return (
    <>
      <button className="card composer-prompt" onClick={() => setWriting(true)}>
        <Paw width={34} height={34} style={{ color: "var(--terracotta)" }} />
        <span>Add a dog note… it goes in the feed too</span>
      </button>

      <div style={{ marginTop: 18 }}>
        <TaskList listType="dogs" title="Dog to-dos" hint="Also shows in Ours. Tap an item to edit it." />
      </div>

      <div className="section-title">
        <Paw width={20} height={20} style={{ color: "var(--rose)" }} /> Dog notes
      </div>
      <div className="chips" role="group" aria-label="Show notes for" style={{ marginBottom: 12 }}>
        <button className="chip" aria-pressed={filter === null} onClick={() => pickFilter(null)}>
          Both
        </button>
        {DOGS.map((d) => (
          <button key={d.id} className="chip" aria-pressed={filter === d.id} onClick={() => pickFilter(d.id)}>
            🐾 {d.name}
          </button>
        ))}
      </div>
      {notes.length === 0 ? (
        <p className="muted">No dog notes yet.</p>
      ) : (
        <div className="feed">
          {notes.map((p) => (
            <PostCard key={p.id} post={p} urls={urls} />
          ))}
        </div>
      )}

      {writing && (
        <Sheet title="Dog note" onClose={() => setWriting(false)}>
          <PostComposer dogNote initialDogs={filter ? [filter] : []} onDone={() => setWriting(false)} />
        </Sheet>
      )}
    </>
  );
}
