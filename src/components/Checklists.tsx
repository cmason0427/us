"use client";

import { useState } from "react";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { celebrate } from "@/lib/celebrate";
import type { ListType, Task } from "@/lib/types";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { addToShopping } from "./Shopping";

/**
 * Checklists: a to-do made of items, like a shopping trip ("chore day":
 * dishes, laundry, vacuum). The to-do only finishes once every item is
 * checked off, removed, or moved somewhere else. A saved checklist can have
 * a suggested day, which asks "chore day today?" that day: yes adds it,
 * no just quietly goes away.
 */

export interface TaskItem {
  id: string;
  task_id: string;
  text: string;
  done: boolean;
  position: number;
}

export interface ChecklistPreset {
  id: string;
  title: string;
  emoji: string | null;
  items: string[];
  weekday: number | null;
  list_type: ListType;
  created_by: string;
}

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function useTaskItems() {
  const { data = [] } = useLive<TaskItem[]>(
    "task_items",
    async () => {
      const { data, error } = await supabaseBrowser().from("task_items").select("*").order("position").order("created_at");
      if (error) throw error;
      return data as TaskItem[];
    },
    ["task_items"],
  );
  return data;
}

export function useChecklistPresets() {
  const { data = [] } = useLive<ChecklistPreset[]>(
    "checklist_presets",
    async () => {
      const { data, error } = await supabaseBrowser().from("checklist_presets").select("*").order("created_at");
      if (error) throw error;
      return data as ChecklistPreset[];
    },
    ["checklist_presets"],
  );
  return data;
}

const splitLines = (s: string) =>
  s
    .split(/\n|,(?=\s)/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);

const presetTitle = (p: { title: string; emoji: string | null }) => `${p.emoji ? `${p.emoji} ` : ""}${p.title}`;

/** Make the to-do and all its items in one go. */
async function createChecklist(meId: string, title: string, listType: ListType, items: string[], presetId: string | null) {
  const supabase = supabaseBrowser();
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({ title, list_type: listType, owner: listType === "personal" ? meId : null, created_by: meId, checklist_preset_id: presetId })
    .select("id")
    .single();
  if (error) return error.message;
  if (items.length) {
    const { error: e2 } = await supabase.from("task_items").insert(items.map((text, position) => ({ task_id: task.id, text, position })));
    if (e2) return e2.message;
  }
  refreshAll();
  return null;
}

/** When the last item is dealt with, the to-do ticks itself off. */
async function finishIfEmpty(taskId: string, meId: string, el?: HTMLElement | null) {
  const supabase = supabaseBrowser();
  const { data } = await supabase.from("task_items").select("done").eq("task_id", taskId);
  if (data && data.length > 0 && data.every((i) => i.done)) {
    if (el) celebrate(el);
    await supabase.from("tasks").update({ done: true, done_at: new Date().toISOString(), done_by: meId }).eq("id", taskId);
  } else if (data && data.length === 0) {
    // Everything removed or moved: nothing left to do here.
    await supabase.from("tasks").update({ done: true, done_at: new Date().toISOString(), done_by: meId }).eq("id", taskId);
  }
  refreshAll();
}

/** Under a to-do: "2 of 5" and the items, each checkable, removable or movable. */
export function ChecklistItems({ task, items, otherLists }: { task: Task; items: TaskItem[]; otherLists: Task[] }) {
  const { meId, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState("");
  const [moving, setMoving] = useState<TaskItem | null>(null);
  const supabase = supabaseBrowser();
  const doneCount = items.filter((i) => i.done).length;

  async function toggle(i: TaskItem, el: HTMLElement) {
    await supabase.from("task_items").update({ done: !i.done }).eq("id", i.id);
    if (!i.done) await finishIfEmpty(task.id, meId, el);
    else {
      // Unticking an item reopens a finished list.
      if (task.done) await supabase.from("tasks").update({ done: false, done_at: null, done_by: null }).eq("id", task.id);
      refreshAll();
    }
  }
  async function remove(i: TaskItem) {
    await supabase.from("task_items").delete().eq("id", i.id);
    await finishIfEmpty(task.id, meId);
  }
  async function add() {
    const lines = splitLines(adding);
    if (!lines.length) return;
    const base = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const { error } = await supabase.from("task_items").insert(lines.map((text, k) => ({ task_id: task.id, text, position: base + k })));
    if (error) return toast(error.message);
    if (task.done) await supabase.from("tasks").update({ done: false, done_at: null, done_by: null }).eq("id", task.id);
    setAdding("");
    refreshAll();
  }
  async function moveTo(i: TaskItem, where: "own" | "shopping" | string) {
    if (where === "own") {
      const { error } = await supabase
        .from("tasks")
        .insert({ title: i.text, list_type: task.list_type, owner: task.list_type === "personal" ? meId : null, created_by: meId });
      if (error) return toast(error.message);
    } else if (where === "shopping") {
      const { error } = await addToShopping(meId, [{ name: i.text, grocery: false }]);
      if (error) return toast(error.message);
    } else {
      const { error } = await supabase.from("task_items").update({ task_id: where, done: false, position: 1e6 }).eq("id", i.id);
      if (error) return toast(error.message);
      setMoving(null);
      toast("Moved");
      return finishIfEmpty(task.id, meId);
    }
    await supabase.from("task_items").delete().eq("id", i.id);
    setMoving(null);
    toast("Moved");
    await finishIfEmpty(task.id, meId);
  }

  return (
    <>
      <button className="small muted task-shop" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "▾" : "▸"} {doneCount} of {items.length} done
        {!open && items.length > 0 && `: ${items.filter((i) => !i.done).map((i) => i.text).join(" · ")}`}
      </button>
      {open && (
        <div className="checklist">
          {items.map((i) => (
            <div key={i.id} className={`checklist-item${i.done ? " done" : ""}`}>
              <input type="checkbox" className="check check-sm" checked={i.done} onChange={(e) => toggle(i, e.currentTarget)} aria-label={`Done: ${i.text}`} />
              <span className="grow">{i.text}</span>
              {!i.done && (
                <button className="btn-link small" onClick={() => setMoving(i)} aria-label={`Move ${i.text}`}>
                  move
                </button>
              )}
              <button className="btn-link small faint" onClick={() => remove(i)} aria-label={`Remove ${i.text}`}>
                ✕
              </button>
            </div>
          ))}
          <div className="row" style={{ marginTop: 6 }}>
            <input
              className="input input-sm grow"
              value={adding}
              placeholder="add an item"
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            />
            {adding.trim() && (
              <button className="btn btn-sm" onClick={add}>
                Add
              </button>
            )}
          </div>
        </div>
      )}
      {moving && (
        <Sheet title={`Move “${moving.text}”`} onClose={() => setMoving(null)}>
          <div className="stack">
            <button className="btn" onClick={() => moveTo(moving, "own")}>
              Its own to-do
            </button>
            <button className="btn" onClick={() => moveTo(moving, "shopping")}>
              🛒 Shopping list
            </button>
            {otherLists.map((l) => (
              <button key={l.id} className="btn" onClick={() => moveTo(moving, l.id)}>
                📋 {l.title}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

/** New checklist: a title and all the items at once. Optionally saved as a soft repeat. */
export function ChecklistForm({ listType, preset, onDone }: { listType: ListType; preset?: ChecklistPreset; onDone: () => void }) {
  const { meId, toast } = useApp();
  const [title, setTitle] = useState(preset?.title ?? "");
  const [emoji, setEmoji] = useState(preset?.emoji ?? "");
  const [text, setText] = useState(preset?.items.join("\n") ?? "");
  const [save, setSave] = useState(!!preset);
  const [weekday, setWeekday] = useState<number | null>(preset?.weekday ?? null);
  const [busy, setBusy] = useState(false);
  const items = splitLines(text);
  const editingPreset = !!preset;

  async function submit(addNow: boolean) {
    if (!title.trim()) return toast("Give it a name");
    setBusy(true);
    const supabase = supabaseBrowser();
    let presetId: string | null = preset?.id ?? null;
    if (save || editingPreset) {
      const row = { title: title.trim(), emoji: emoji.trim() || null, items, weekday, list_type: preset?.list_type ?? listType };
      if (preset) {
        const { error } = await supabase.from("checklist_presets").update(row).eq("id", preset.id);
        if (error) return (setBusy(false), toast(error.message));
      } else {
        const { data, error } = await supabase.from("checklist_presets").insert({ ...row, created_by: meId }).select("id").single();
        if (error) return (setBusy(false), toast(error.message));
        presetId = data.id;
      }
    }
    if (addNow) {
      const err = await createChecklist(meId, presetTitle({ title: title.trim(), emoji: emoji.trim() || null }), preset?.list_type ?? listType, items, presetId);
      if (err) return (setBusy(false), toast(err));
    }
    refreshAll();
    onDone();
  }

  async function del() {
    if (!preset || !confirm(`Delete the saved “${preset.title}” checklist? Lists already added stay.`)) return;
    await supabaseBrowser().from("checklist_presets").delete().eq("id", preset.id);
    refreshAll();
    onDone();
  }

  return (
    <div className="stack">
      <div className="row">
        <input className="input" style={{ width: 56, textAlign: "center" }} value={emoji} placeholder="🧹" onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" />
        <input className="input grow" value={title} placeholder="chore day" onChange={(e) => setTitle(e.target.value)} aria-label="Name" autoFocus={!preset} />
      </div>
      <label className="field">
        <span>Items, one per line</span>
        <textarea className="input" rows={6} value={text} placeholder={"dishes\nlaundry\nvacuum\ntake out trash"} onChange={(e) => setText(e.target.value)} />
        {items.length > 0 && <span className="small faint">{items.length} item{items.length === 1 ? "" : "s"}</span>}
      </label>
      {!editingPreset && (
        <label className="row small">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save it to reuse
        </label>
      )}
      {(save || editingPreset) && (
        <div className="field">
          <span>Suggest it on</span>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={weekday === null} onClick={() => setWeekday(null)}>
              no day
            </button>
            {WEEKDAYS.map((d, k) => (
              <button type="button" key={d} className="chip" aria-pressed={weekday === k} onClick={() => setWeekday(k)}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          {weekday !== null && <span className="small faint">On {WEEKDAYS[weekday]}s it&apos;ll ask “{title.trim() || "chore day"} today?”. No pressure either way.</span>}
        </div>
      )}
      <div className="row wrap">
        {editingPreset ? (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => submit(false)}>
              Save
            </button>
            <button className="btn" disabled={busy} onClick={() => submit(true)}>
              Save &amp; add now
            </button>
            <button className="btn btn-ghost" onClick={del}>
              Delete
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" disabled={busy} onClick={() => submit(true)}>
              Add list
            </button>
            {save && (
              <button className="btn" disabled={busy} onClick={() => submit(false)}>
                Just save it
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Saved checklists as chips next to the quick-add ones: tap to add, long list lives in a sheet. */
export function ChecklistChips({ listType, show }: { listType: ListType; show: ListType[] }) {
  const presets = useChecklistPresets().filter((p) => show.includes(p.list_type));
  const [open, setOpen] = useState<ChecklistPreset | "new" | null>(null);
  const { meId, toast } = useApp();
  async function use(p: ChecklistPreset) {
    const err = await createChecklist(meId, presetTitle(p), p.list_type, p.items, p.id);
    if (err) return toast(err);
    toast(`Added: ${presetTitle(p)}`);
  }
  return (
    <div className="field" style={{ marginTop: 8 }}>
      <span>Checklists</span>
      <div className="chips">
        {presets.map((p) => (
          <span key={p.id} className="chip-pair">
            <button type="button" className="chip" onClick={() => use(p)}>
              + {presetTitle(p)}
              {p.weekday !== null && <span className="faint"> · {WEEKDAYS[p.weekday].slice(0, 3)}</span>}
            </button>
            <button type="button" className="chip chip-edit" onClick={() => setOpen(p)} aria-label={`Edit ${p.title}`}>
              ✎
            </button>
          </span>
        ))}
        <button type="button" className="chip" onClick={() => setOpen("new")}>
          📋 new checklist
        </button>
      </div>
      {open && (
        <Sheet title={open === "new" ? "New checklist" : "Saved checklist"} onClose={() => setOpen(null)}>
          <ChecklistForm listType={listType} preset={open === "new" ? undefined : open} onDone={() => setOpen(null)} />
        </Sheet>
      )}
    </div>
  );
}

/**
 * Today's suggestions: saved checklists whose day it is, not answered yet
 * today and not already on the list. Either of you answering settles it.
 */
export function useChecklistPrompts() {
  const now = useNow();
  const presets = useChecklistPresets();
  const day = now ? format(now, "yyyy-MM-dd") : null;
  const { data: answered = [] } = useLive<{ preset_id: string }[]>(
    `checklist_prompts:${day}`,
    async () => {
      if (!day) return [];
      const { data, error } = await supabaseBrowser().from("checklist_prompts").select("preset_id").eq("day", day);
      if (error) throw error;
      return data;
    },
    ["checklist_prompts"],
  );
  const { data: openFrom = [] } = useLive<{ checklist_preset_id: string }[]>(
    "tasks:checklists:open",
    async () => {
      const { data, error } = await supabaseBrowser().from("tasks").select("checklist_preset_id").eq("done", false).not("checklist_preset_id", "is", null);
      if (error) throw error;
      return data;
    },
    ["tasks"],
  );
  if (!now || !day) return { day, due: [] as ChecklistPreset[] };
  const due = presets.filter(
    (p) => p.weekday === now.getDay() && !answered.some((a) => a.preset_id === p.id) && !openFrom.some((t) => t.checklist_preset_id === p.id),
  );
  return { day, due };
}

export function ChecklistPrompt({ p, day }: { p: ChecklistPreset; day: string }) {
  const { meId, toast } = useApp();
  const [busy, setBusy] = useState(false);
  async function answer(yes: boolean) {
    setBusy(true);
    if (yes) {
      const err = await createChecklist(meId, presetTitle(p), p.list_type, p.items, p.id);
      if (err) return (setBusy(false), toast(err));
    }
    await supabaseBrowser().from("checklist_prompts").upsert({ preset_id: p.id, day, answer: yes ? "yes" : "no", answered_by: meId });
    refreshAll();
    if (yes) toast(`${presetTitle(p)} is on the list`);
  }
  return (
    <div className="dash-row">
      <span className="dash-icon" aria-hidden>
        {p.emoji || "📋"}
      </span>
      <span className="grow">
        <span className="dash-label">{p.title} today?</span>
        <span className="dash-value small muted">{p.items.slice(0, 4).join(" · ")}{p.items.length > 4 ? ` +${p.items.length - 4}` : ""}</span>
      </span>
      <span className="row" style={{ gap: 6 }}>
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => answer(true)}>
          Yes
        </button>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => answer(false)}>
          Not today
        </button>
      </span>
    </div>
  );
}
