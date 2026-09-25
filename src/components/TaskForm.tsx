"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { DOGS, dogVoice } from "@/lib/dogs";
import type { ListType, Task, Urgency } from "@/lib/types";
import type { Deadline } from "@/lib/deadline";
import { useApp } from "./AppProvider";
import { DeadlinePicker } from "./DeadlinePicker";
import { DogAvatar, useDogPhotos } from "./DogAvatar";

export interface TaskPreset {
  id: string;
  title: string;
  list_type: ListType;
  dogs: string[];
  urgency: Urgency;
  notes: string | null;
  emoji: string | null;
  /** "Between 7 and 10 am": HH:mm:ss, both or neither. */
  window_start: string | null;
  window_end: string | null;
  /** Adds itself every day (see DailyRoutines). */
  daily: boolean;
  /** Daily ones can ping at a set time (HH:mm:ss), sent by the reminders cron. */
  ping_at: string | null;
}

const hhmm = (t: string) => t.slice(0, 5);
const clock = (t: string) => {
  const [h, m] = hhmm(t).split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? " am" : " pm"}`;
};
/** "7–10 am" / "11 am–1 pm". */
export function windowText(start: string, end: string) {
  const a = clock(start);
  const b = clock(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/**
 * When a windowed preset is used: today's window, or tomorrow's if today's
 * has already closed (tapping "Feed breakfast" at night means tomorrow).
 */
function windowFields(p: Pick<TaskPreset, "window_start" | "window_end">) {
  if (!p.window_start || !p.window_end) return {};
  const [h, m] = hhmm(p.window_end).split(":").map(Number);
  const due = new Date();
  due.setHours(h, m, 0, 0);
  if (due.getTime() <= Date.now()) due.setDate(due.getDate() + 1);
  return { window_start: p.window_start, due_at: due.toISOString(), due_all_day: false };
}

export function useTaskPresets() {
  const { data = [] } = useLive<TaskPreset[]>(
    "task_templates",
    async () => {
      const { data, error } = await supabaseBrowser().from("task_templates").select("*").order("title");
      if (error) throw error;
      return data as TaskPreset[];
    },
    ["task_templates"],
  );
  return data;
}

export const presetLabel = (p: TaskPreset) =>
  `${p.daily ? "🔁 " : ""}${p.emoji ? `${p.emoji} ` : ""}${p.title}${p.dogs.length ? ` · ${dogVoice(p.dogs)}` : ""}${p.window_start && p.window_end ? ` · ${windowText(p.window_start, p.window_end)}` : ""}`;

/** Which dog(s) it's for. Tap to toggle; "Both" picks everyone. */
export function DogPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const all = DOGS.every((d) => value.includes(d.id));
  const photos = useDogPhotos();
  return (
    <div className="chips" role="group" aria-label="Which dog(s)">
      {DOGS.map((d) => (
        <button
          key={d.id}
          type="button"
          className="chip"
          aria-pressed={value.includes(d.id)}
          onClick={() => onChange(value.includes(d.id) ? value.filter((x) => x !== d.id) : [...value, d.id])}
        >
          <DogAvatar ids={[d.id]} size={22} photos={photos} /> {d.name}
        </button>
      ))}
      <button type="button" className="chip" aria-pressed={all} onClick={() => onChange(all ? [] : DOGS.map((d) => d.id))}>
        Both
      </button>
    </div>
  );
}

function ListPicker({ value, onChange, allowPersonal = true }: { value: ListType; onChange: (l: ListType) => void; allowPersonal?: boolean }) {
  return (
    <div className="seg" role="group" aria-label="Which list">
      {allowPersonal && (
        <button type="button" aria-pressed={value === "personal"} onClick={() => onChange("personal")}>
          Just mine
        </button>
      )}
      <button type="button" aria-pressed={value === "shared" || value === "household"} onClick={() => onChange("shared")}>
        Ours
      </button>
      <button type="button" aria-pressed={value === "dogs"} onClick={() => onChange("dogs")}>
        Dogs
      </button>
    </div>
  );
}

function UrgencySeg({ value, onChange }: { value: Urgency; onChange: (u: Urgency) => void }) {
  return (
    <div className="seg" role="group" aria-label="Urgency">
      {(["low", "medium", "high"] as Urgency[]).map((u) => (
        <button key={u} type="button" aria-pressed={value === u} onClick={() => onChange(u)}>
          {u === "high" ? "🔥 High" : u === "medium" ? "Medium" : "No rush"}
        </button>
      ))}
    </div>
  );
}

/** Tap a preset and it's on the list. No questions. */
export function TaskPresets({ onAdded, only }: { onAdded?: () => void; only?: ListType }) {
  const { meId, toast } = useApp();
  // Daily ones add themselves, so a quick-add chip would only make a duplicate.
  const presets = useTaskPresets().filter((p) => !p.daily && (!only || p.list_type === only || (only === "shared" && p.list_type === "household")));
  if (!presets.length) return null;

  async function use(p: TaskPreset) {
    const { error } = await supabaseBrowser()
      .from("tasks")
      .insert({ title: p.title, list_type: p.list_type, dogs: p.dogs, urgency: p.urgency, notes: p.notes, ...windowFields(p), created_by: meId });
    if (error) return toast(error.message);
    refreshAll();
    toast(`Added: ${presetLabel(p)}`);
    onAdded?.();
  }
  return (
    <div className="field">
      <div className="row-between">
        <span>Quick add</span>
        <Link href="/presets" className="btn-link small">
          Edit presets
        </Link>
      </div>
      <div className="chips">
        {presets.map((p) => (
          <button key={p.id} type="button" className="chip" onClick={() => use(p)}>
            + {presetLabel(p)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Add or edit a to-do. Only the words are needed; which dogs (for dog
 * to-dos), urgency, a deadline and a note are all optional.
 */
export function TaskForm({ initial, listType: initialList = "shared", onDone }: { initial?: Task; listType?: ListType; onDone: () => void }) {
  const { meId, partner, toast } = useApp();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [list, setList] = useState<ListType>(initial?.list_type ?? initialList);
  const [dogs, setDogs] = useState<string[]>(initial?.dogs ?? []);
  const [urgency, setUrgency] = useState<Urgency>(initial?.urgency ?? "low");
  const [deadline, setDeadline] = useState<Deadline | null>(initial?.due_at ? { due_at: initial.due_at, due_all_day: initial.due_all_day } : null);
  const [showDeadline, setShowDeadline] = useState(!!initial?.due_at);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [showNotes, setShowNotes] = useState(!!initial?.notes);
  const [busy, setBusy] = useState(false);
  const isDogs = list === "dogs";

  const fields = () => ({
    title: title.trim(),
    list_type: list,
    owner: list === "personal" ? (initial?.owner ?? meId) : null,
    dogs: isDogs ? dogs : [],
    urgency,
    due_at: deadline?.due_at ?? null,
    due_all_day: deadline?.due_all_day ?? false,
    notes: notes.trim() || null,
  });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const supabase = supabaseBrowser();
    const { error } = initial ? await supabase.from("tasks").update(fields()).eq("id", initial.id) : await supabase.from("tasks").insert({ ...fields(), created_by: meId });
    setBusy(false);
    if (error) return toast(error.message);
    refreshAll();
    toast(initial ? "Saved" : list === "personal" ? "Added to your list" : isDogs ? "Added to dog to-dos" : "Added to our list");
    onDone();
  }

  async function saveAsPreset() {
    if (!title.trim() || list === "personal") return;
    const f = fields();
    const emoji = window.prompt("Add an emoji for this preset? (optional)", "") ?? "";
    const { error } = await supabaseBrowser()
      .from("task_templates")
      .insert({
        title: f.title,
        emoji: emoji.trim().slice(0, 4) || null,
        list_type: f.list_type,
        dogs: f.dogs,
        urgency: f.urgency,
        notes: f.notes,
        window_start: initial?.window_start ?? null,
        window_end: initial?.window_start && initial.due_at ? format(new Date(initial.due_at), "HH:mm") : null,
        created_by: meId,
      });
    if (error) return toast(error.message);
    refreshAll();
    toast("Saved as a preset. It's under Quick add now.");
  }

  async function remove() {
    if (!initial) return;
    await supabaseBrowser().from("tasks").delete().eq("id", initial.id);
    refreshAll();
    toast("Deleted");
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      {!initial && <TaskPresets onAdded={onDone} only={initialList === "personal" ? undefined : initialList} />}
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isDogs ? "Nail trim, flea meds…" : "What needs doing?"} autoFocus={!initial} required />
      <div className="field">
        <span>Which list</span>
        <ListPicker value={list} onChange={setList} />
        {list === "personal" && <p className="small muted">Private: {partner?.display_name ?? "they"} can&apos;t see this.</p>}
      </div>
      {isDogs && (
        <div className="field">
          <span>For which dog?</span>
          <DogPicker value={dogs} onChange={setDogs} />
        </div>
      )}
      <div className="field">
        <span>Urgency</span>
        <UrgencySeg value={urgency} onChange={setUrgency} />
      </div>
      {showDeadline ? (
        <div className="field">
          <span>Deadline</span>
          <DeadlinePicker value={deadline} onChange={setDeadline} />
          <p className="small muted">If it passes, it jumps to the top as high priority.</p>
        </div>
      ) : null}
      {showNotes && <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="A note (optional)" aria-label="Note" />}
      {(!showDeadline || !showNotes) && (
        <div className="row wrap">
          {!showDeadline && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDeadline(true)}>
              + Deadline
            </button>
          )}
          {!showNotes && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNotes(true)}>
              + Note
            </button>
          )}
        </div>
      )}
      <div className="row-between">
        {initial ? (
          <button type="button" className="btn btn-ghost" onClick={remove}>
            Delete
          </button>
        ) : list !== "personal" && title.trim() ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={saveAsPreset}>
            📌 Save as preset
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={busy || !title.trim()}>
          {initial ? "Save" : "Add it"}
        </button>
      </div>
    </form>
  );
}

/** Make (or edit) a to-do preset without adding the to-do. */
export function TaskPresetForm({ initial, listType = "dogs", onDone }: { initial?: TaskPreset; listType?: ListType; onDone: () => void }) {
  const { meId, toast } = useApp();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [list, setList] = useState<ListType>(initial?.list_type ?? (listType === "personal" ? "shared" : listType));
  const [dogs, setDogs] = useState<string[]>(initial?.dogs ?? DOGS.map((d) => d.id));
  const [urgency, setUrgency] = useState<Urgency>(initial?.urgency ?? "low");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [winStart, setWinStart] = useState(initial?.window_start ? hhmm(initial.window_start) : "");
  const [winEnd, setWinEnd] = useState(initial?.window_end ? hhmm(initial.window_end) : "");
  const [useWindow, setUseWindow] = useState(!!initial?.window_start);
  const [daily, setDaily] = useState(initial?.daily ?? false);
  const [ping, setPing] = useState(!!initial?.ping_at);
  const [pingAt, setPingAt] = useState(initial?.ping_at ? hhmm(initial.ping_at) : "");
  const windowOk = !useWindow || (winStart && winEnd && winEnd > winStart);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !windowOk) return;
    const row = {
      title: title.trim(),
      emoji: emoji.trim() || null,
      list_type: list,
      dogs: list === "dogs" ? dogs : [],
      urgency,
      notes: notes.trim() || null,
      window_start: useWindow ? winStart : null,
      window_end: useWindow ? winEnd : null,
      daily,
      ping_at: daily && ping && pingAt ? pingAt : null,
    };
    const supabase = supabaseBrowser();
    const { error } = initial ? await supabase.from("task_templates").update(row).eq("id", initial.id) : await supabase.from("task_templates").insert({ ...row, created_by: meId });
    if (error) return toast(error.message);
    refreshAll();
    toast(initial ? "Preset saved" : `Preset saved: tap "+ ${title.trim()}" when adding a to-do`);
    onDone();
  }

  async function remove() {
    if (!initial || !confirm(`Remove the "${initial.title}" preset?`)) return;
    await supabaseBrowser().from("task_templates").delete().eq("id", initial.id);
    refreshAll();
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      {!initial && <p className="small muted">A preset adds a to-do in one tap, with everything below already filled in.</p>}
      <div className="row">
        <input className="input" style={{ width: 64, textAlign: "center" }} value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} placeholder="🥣" aria-label="Emoji (optional)" />
        <input className="input grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={list === "dogs" ? "Feed breakfast" : "Take out the trash"} autoFocus required />
      </div>
      <div className="field">
        <span>Which list</span>
        <ListPicker value={list} onChange={setList} allowPersonal={false} />
      </div>
      {list === "dogs" && (
        <div className="field">
          <span>For which dog?</span>
          <DogPicker value={dogs} onChange={setDogs} />
        </div>
      )}
      <div className="field">
        <span>Urgency</span>
        <UrgencySeg value={urgency} onChange={setUrgency} />
      </div>
      <div className="toggle-row">
        <span className="label">Time window</span>
        <label className="switch">
          <input type="checkbox" checked={useWindow} onChange={(e) => (setUseWindow(e.target.checked), !winStart && (setWinStart("07:00"), setWinEnd("10:00")))} />
          <span />
        </label>
      </div>
      {useWindow && (
        <div className="stack-sm">
          <div className="time-row">
            <label className="time-field">
              <span>Between</span>
              <input type="time" value={winStart} onChange={(e) => setWinStart(e.target.value)} />
            </label>
            <label className="time-field">
              <span>And</span>
              <input type="time" value={winEnd} onChange={(e) => setWinEnd(e.target.value)} />
            </label>
          </div>
          <p className="small muted">
            {windowOk ? `Due by the end of the window. Added after it closes, it's for tomorrow's.` : "The window has to end after it starts."}
          </p>
        </div>
      )}
      <div className="toggle-row">
        <span className="label">Add it every day by itself</span>
        <label className="switch">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          <span />
        </label>
      </div>
      {daily && (
        <p className="small muted">
          {useWindow ? "It shows up an hour before the window opens (skipped if the window's already over)" : "It shows up each morning"}. Unchecked ones clear themselves the next day.
        </p>
      )}
      {daily && (
        <div className="toggle-row">
          <span className="label">Ping at a certain time?</span>
          <label className="switch">
            <input type="checkbox" checked={ping} onChange={(e) => (setPing(e.target.checked), !pingAt && setPingAt(winStart || "08:00"))} />
            <span />
          </label>
        </div>
      )}
      {daily && ping && (
        <div className="stack-sm">
          <label className="time-field" style={{ alignSelf: "flex-start" }}>
            <span>Push at</span>
            <input type="time" value={pingAt} onChange={(e) => setPingAt(e.target.value)} />
          </label>
          <p className="small muted">A quiet push to both of you, unless it&apos;s already checked off.</p>
        </div>
      )}
      <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="A note (optional): 1 cup + fish oil" aria-label="Note" />
      <div className="row-between">
        {initial ? (
          <button type="button" className="btn btn-ghost" onClick={remove}>
            Remove
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={!title.trim() || !windowOk}>
          Save preset
        </button>
      </div>
    </form>
  );
}
