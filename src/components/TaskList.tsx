"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { celebrate } from "@/lib/celebrate";
import { URGENCY_RANK, type ListType, type Task, type Urgency } from "@/lib/types";
import { dueLabel, isOverdue, type Deadline } from "@/lib/deadline";
import { useNow } from "@/lib/dates";
import { useApp } from "./AppProvider";
import { DeadlinePicker } from "./DeadlinePicker";
import { DogPic } from "./DogPic";
import { IconTrash } from "./Art";

// Ours also collects household (older items) and dog to-dos, so nothing hides.
export const OURS: ListType[] = ["shared", "household", "dogs"];
const LIST_TAG: Partial<Record<ListType, string>> = { household: "Household", dogs: "Dogs" };
const NEXT_URGENCY: Record<Urgency, Urgency> = { low: "medium", medium: "high", high: "low" };

function sortTasks(list: Task[], now: number) {
  const due = (t: Task) => (t.due_at ? new Date(t.due_at).getTime() : Infinity);
  return [...list].sort(
    (a, b) =>
      Number(isOverdue(b, now)) - Number(isOverdue(a, now)) ||
      (isOverdue(a, now) && isOverdue(b, now) ? due(a) - due(b) : 0) ||
      URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
      due(a) - due(b) ||
      a.created_at.localeCompare(b.created_at),
  );
}

const deadlineOf = (t: Task): Deadline | null => (t.due_at ? { due_at: t.due_at, due_all_day: t.due_all_day } : null);

/** `listType` is where new items go; `show` is which lists this view collects (defaults to just that one). */
export function TaskList({ listType, show = [listType], title, hint }: { listType: ListType; show?: ListType[]; title: string; hint: string }) {
  const { meId, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const [draft, setDraft] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("low");
  const [deadline, setDeadline] = useState<Deadline | null>(null);
  const [pickingDeadline, setPickingDeadline] = useState(false);
  // 0 before hydration: nothing reads as overdue until the phone's clock is known.
  const now = useNow()?.getTime() ?? 0;
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

  const open = sortTasks(tasks.filter((t) => !t.done), now);

  // A passed deadline makes it urgent. The reminders cron does this too; doing
  // it here as well means it flips the moment you're looking at it.
  const stale = tasks.filter((t) => isOverdue(t, now) && t.urgency !== "high").map((t) => t.id).join(",");
  useEffect(() => {
    if (!stale) return;
    supabase.from("tasks").update({ urgency: "high" }).in("id", stale.split(",")).then(() => refreshAll());
  }, [stale, supabase]);
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const title = draft.trim();
    setDraft("");
    const { error } = await supabase
      .from("tasks")
      .insert({ title, list_type: listType, owner: listType === "personal" ? meId : null, urgency, ...(deadline ?? {}), created_by: meId });
    if (error) {
      setDraft(title);
      return toast(error.message);
    }
    setUrgency("low");
    setDeadline(null);
    setPickingDeadline(false);
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

  // "I'll do it" / "never mind". Taking over the other person's claim is fine too.
  async function claim(t: Task) {
    const { error } = await supabase.from("tasks").update({ claimed_by: t.claimed_by === meId ? null : meId }).eq("id", t.id);
    if (error) toast(error.message);
    refreshAll();
  }

  async function edit(t: Task, title: string, d: Deadline | null) {
    const { error } = await supabase
      .from("tasks")
      .update({ title, due_at: d?.due_at ?? null, due_all_day: d?.due_all_day ?? false })
      .eq("id", t.id);
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
        <button
          type="button"
          className="icon-btn"
          aria-pressed={pickingDeadline || deadline !== null}
          onClick={() => setPickingDeadline((p) => !p)}
          aria-label="Set a deadline"
          style={{ minHeight: 46 }}
        >
          📅
        </button>
        <button className="btn btn-primary" disabled={!draft.trim()}>
          Add
        </button>
      </form>
      {pickingDeadline && (
        <div style={{ marginTop: 8 }}>
          <DeadlinePicker value={deadline} onChange={setDeadline} />
        </div>
      )}

      <div className="card" style={{ marginTop: 12, padding: "4px 14px" }}>
        {open.length === 0 && (
          <div className="empty" style={{ padding: 18 }}>
            <DogPic name={listType === "personal" ? "wiley_curled" : "kodo_curled"} size={72} />
            <span>All clear. Put the kettle on.</span>
          </div>
        )}
        {open.map((t) => (
          <TaskRow key={t.id} t={t} tag={show.length > 1 ? LIST_TAG[t.list_type] : undefined} showWho={listType !== "personal"} onToggle={toggle} onBump={bump} onEdit={edit} onClaim={listType !== "personal" ? claim : undefined} meId={meId} now={now} onRemove={remove} nameOf={nameOf} />
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
                <TaskRow key={t.id} t={t} tag={show.length > 1 ? LIST_TAG[t.list_type] : undefined} showWho={listType !== "personal"} onToggle={toggle} onBump={bump} onEdit={edit} onClaim={listType !== "personal" ? claim : undefined} meId={meId} now={now} onRemove={remove} nameOf={nameOf} />
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
  onEdit,
  onClaim,
  onRemove,
  nameOf,
  meId,
  now,
}: {
  t: Task;
  tag?: string;
  showWho: boolean;
  onToggle: (t: Task, el: HTMLElement) => void;
  onBump: (t: Task) => void;
  onEdit: (t: Task, title: string, d: Deadline | null) => void;
  /** Shared lists only: claim or unclaim. */
  onClaim?: (t: Task) => void;
  onRemove: (t: Task) => void;
  nameOf: (id: string | null) => string;
  meId: string;
  now: number;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [due, setDue] = useState<Deadline | null>(deadlineOf(t));
  const startEdit = () => {
    setDue(deadlineOf(t));
    setEditing(t.title);
  };
  const save = () => {
    const title = editing?.trim();
    setEditing(null);
    if (title) onEdit(t, title, due);
  };
  const overdue = isOverdue(t, now);
  const d = deadlineOf(t);
  return (
    <div className={`task${t.done ? " done" : ""}`}>
      <input type="checkbox" className="check" checked={t.done} onChange={(e) => onToggle(t, e.currentTarget)} aria-label={`Done: ${t.title}`} />
      <div className="grow">
        {editing !== null ? (
          <div className="stack-sm">
            <input
              className="input"
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(null);
              }}
              aria-label="Edit to-do"
              autoFocus
            />
            <DeadlinePicker value={due} onChange={setDue} />
            <div className="row">
              <button className="btn btn-primary btn-sm" onClick={save} disabled={!editing.trim()}>
                Save
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="task-title task-edit" onClick={startEdit} aria-label={`Edit ${t.title}`}>
            {t.title}
          </button>
        )}
        {d && !t.done && editing === null && (
          <div className={`small due${overdue ? " overdue" : ""}`}>
            {overdue ? "⏰ Overdue · " : "⏳ "}
            {dueLabel(d, new Date(now))}
          </div>
        )}
        {onClaim && !t.done && editing === null && (
          <button className={`claim${t.claimed_by ? " claimed" : ""}`} onClick={() => onClaim(t)} aria-pressed={t.claimed_by === meId}>
            {t.claimed_by === meId ? "🙋 You're on it" : t.claimed_by ? `🙋 ${nameOf(t.claimed_by)}'s on it` : "🙋 I'll do it"}
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

