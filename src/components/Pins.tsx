"use client";

import { useState } from "react";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { timeLabel, useNow } from "@/lib/dates";
import { isActive } from "@/lib/activity";
import type { Activity } from "@/lib/types";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

// Calendar pins: a small tag at a time ("🎳 bowling · 7 pm"), the same way a
// meal with a set time shows up. For anything, or one of our activity ideas.

export interface CalPin {
  id: string;
  day: string;
  at: string; // HH:mm:ss
  title: string;
  emoji: string | null;
  activity_id: string | null;
  created_by: string;
}

/** A to-do with a set time that's on the calendar. */
export interface CalTask {
  id: string;
  title: string;
  due_at: string;
  done: boolean;
  list_type: string;
}

export function usePinsRange(from: string, to: string) {
  const { data = [] } = useLive<CalPin[]>(
    `cal_pins:${from}:${to}`,
    async () => {
      const { data, error } = await supabaseBrowser().from("cal_pins").select("*").gte("day", from).lte("day", to).order("day").order("at");
      if (error) throw error;
      return data as CalPin[];
    },
    ["cal_pins"],
  );
  return data;
}

/** To-dos marked "show on the calendar" due in the range (private ones only reach their owner). */
export function useCalTasksRange(fromIso: string, toIso: string) {
  const { data = [] } = useLive<CalTask[]>(
    `tasks:cal:${fromIso}:${toIso}`,
    async () => {
      const { data, error } = await supabaseBrowser()
        .from("tasks")
        .select("id, title, due_at, done, list_type")
        .eq("on_calendar", true)
        .eq("due_all_day", false)
        .gte("due_at", fromIso)
        .lte("due_at", toIso)
        .order("due_at");
      if (error) throw error;
      return data as CalTask[];
    },
    ["tasks"],
  );
  return data;
}

export const pinWhen = (p: Pick<CalPin, "day" | "at">) => timeLabel(new Date(`${p.day}T${p.at.slice(0, 5)}`));

/** Add or edit a pin: what, when, and optionally one of our ideas. */
export function PinForm({ initial, defaultDay, onDone }: { initial?: CalPin; defaultDay?: string; onDone: () => void }) {
  const { meId, toast } = useApp();
  const now = useNow();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [day, setDay] = useState(initial?.day ?? defaultDay ?? "");
  const [at, setAt] = useState(initial?.at.slice(0, 5) ?? "");
  const [activityId, setActivityId] = useState<string | null>(initial?.activity_id ?? null);
  const { data: activities = [] } = useLive<Activity[]>(
    "activities",
    async () => {
      const { data, error } = await supabaseBrowser().from("activities").select("*").order("name");
      if (error) throw error;
      return data as Activity[];
    },
    ["activities"],
  );
  const ideas = activities.filter((a) => isActive(a));
  const theDay = day || (now ? format(now, "yyyy-MM-dd") : "");

  async function save() {
    if (!title.trim() || !at || !theDay) return;
    const row = { title: title.trim(), emoji: emoji.trim() || null, day: theDay, at, activity_id: activityId };
    const db = supabaseBrowser();
    const { error } = initial ? await db.from("cal_pins").update(row).eq("id", initial.id) : await db.from("cal_pins").insert({ ...row, created_by: meId });
    if (error) return toast(error.message);
    refreshAll();
    toast(`${row.emoji ? `${row.emoji} ` : ""}${row.title} is on the calendar 📅`);
    onDone();
  }
  async function remove() {
    if (!initial) return;
    await supabaseBrowser().from("cal_pins").delete().eq("id", initial.id);
    refreshAll();
    onDone();
  }

  return (
    <div className="stack">
      {!initial && ideas.length > 0 && (
        <div className="field">
          <span>From our ideas (optional)</span>
          <div className="chips">
            {ideas.map((a) => (
              <button
                key={a.id}
                type="button"
                className="chip chip-sm"
                aria-pressed={activityId === a.id}
                onClick={() => {
                  setActivityId(activityId === a.id ? null : a.id);
                  setTitle(a.name);
                  setEmoji(a.emoji ?? "");
                }}
              >
                {a.emoji ? `${a.emoji} ` : ""}
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="row">
        <input className="input" style={{ width: 56, textAlign: "center" }} value={emoji} placeholder="📍" onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" />
        <input className="input grow" value={title} placeholder="What's happening" onChange={(e) => setTitle(e.target.value)} aria-label="What" autoFocus={!initial} />
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Day</span>
          <input className="input input-sm" type="date" value={theDay} onChange={(e) => setDay(e.target.value)} aria-label="Day" />
        </label>
        <label className="field">
          <span>Time</span>
          <input className="input input-sm" type="time" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Time" />
        </label>
      </div>
      <button className="btn btn-primary btn-block" disabled={!title.trim() || !at} onClick={save}>
        {initial ? "Save" : "Pin it"}
      </button>
      {initial && (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={remove}>
          Remove from the calendar
        </button>
      )}
    </div>
  );
}

export function PinSheet({ pin, onClose }: { pin: CalPin; onClose: () => void }) {
  return (
    <Sheet title={`${pin.emoji ? `${pin.emoji} ` : "📍 "}${pin.title}`} onClose={onClose}>
      <PinForm initial={pin} onDone={onClose} />
    </Sheet>
  );
}
