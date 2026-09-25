"use client";

import { useState } from "react";
import { addHours, addMinutes, addMonths, addYears, differenceInMinutes } from "date-fns";
import { FREQ_LABEL, occurrences, weekdayOrdinal, type Freq } from "@/lib/series";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fromInputs, toDateInput, toTimeInput } from "@/lib/dates";
import { refreshAll, useLive } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { EVENT_TYPE_HINT, EVENT_TYPE_LABEL, type CalEvent, type EventType } from "@/lib/types";
import { postAskUpdate } from "@/lib/askFeed";
import { useApp } from "./AppProvider";
import { WhenPicker } from "./WhenPicker";
import { ColorPicker, Swatch } from "./CalendarColors";
import Link from "next/link";

const TYPES: EventType[] = ["confirmed", "solo", "ask", "radar"];

/** A saved default ("Therapy"): everything but the day and start time. */
export interface EventTemplate {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  title: string;
  type: EventType;
  all_day: boolean;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
  reminder_lead_minutes: number | null;
}

export function useTemplates() {
  const { data = [] } = useLive<EventTemplate[]>(
    "event_templates",
    async () => {
      const { data, error } = await supabaseBrowser().from("event_templates").select("*").order("name");
      if (error) throw error;
      return data as EventTemplate[];
    },
    ["event_templates"],
  );
  return data;
}

// Minutes before start. All-day events start at local midnight, so "morning
// of" is a negative lead (8h *after* midnight).
const TIMED_REMINDERS = [
  { v: "", label: "No reminder" },
  { v: "0", label: "When it starts" },
  { v: "15", label: "15 min before" },
  { v: "60", label: "1 hour before" },
  { v: "180", label: "3 hours before" },
  { v: "1440", label: "1 day before" },
];
const ALL_DAY_REMINDERS = [
  { v: "", label: "No reminder" },
  { v: "-480", label: "Morning of (8am)" },
  { v: "960", label: "Day before (8am)" },
  { v: "240", label: "Night before (8pm)" },
];

export function EventForm({ initial, defaultDate, onDone }: { initial?: CalEvent; defaultDate?: Date; onDone: () => void }) {
  const { meId, partner, toast, profiles } = useApp();
  const myColor = profiles.find((p) => p.id === meId)?.cal_color;
  const seedStart = initial ? new Date(initial.start_time) : nextHalfHour(defaultDate);
  // All-day ends are stored as the midnight *after* the last day; show the last day.
  const seedEnd = initial?.end_time
    ? new Date(new Date(initial.end_time).getTime() - (initial.all_day ? 60_000 : 0))
    : addHours(seedStart, 1);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<EventType>(initial?.type ?? "confirmed");
  const [allDay, setAllDay] = useState(initial?.all_day ?? false);
  const [date, setDate] = useState(toDateInput(seedStart));
  const [start, setStart] = useState(toTimeInput(seedStart));
  const [endDate, setEndDate] = useState(toDateInput(seedEnd));
  const [end, setEnd] = useState(toTimeInput(seedEnd));
  const [location, setLocation] = useState(initial?.location ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [reminder, setReminder] = useState(initial?.reminder_lead_minutes?.toString() ?? "");
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  // Repeating (new events only) and, when editing one, how far the edit reaches.
  const [repeat, setRepeat] = useState<Freq | "none">("none");
  const [until, setUntil] = useState(toDateInput(addMonths(seedStart, 3)));
  const [scope, setScope] = useState<"one" | "later">("one");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const templates = useTemplates();
  // The preset this came from, so editing the preset can update it.
  const [usedTemplate, setUsedTemplate] = useState<string | null>(initial?.template_id ?? null);

  function setEndFrom(d: string, t: string, minutes: number) {
    const e = addMinutes(fromInputs(d, t), minutes);
    setEndDate(toDateInput(e));
    setEnd(toTimeInput(e));
  }

  function applyTemplate(t: EventTemplate) {
    setUsedTemplate(t.id);
    setTitle(t.title);
    setType(t.type);
    setAllDay(t.all_day);
    setLocation(t.location ?? "");
    setNotes(t.notes ?? "");
    setReminder(t.reminder_lead_minutes?.toString() ?? "");
    setColor(t.color);
    if (t.all_day) {
      const days = Math.max(1, Math.round((t.duration_minutes ?? 1440) / 1440));
      setEndDate(toDateInput(addHours(fromInputs(date), 24 * (days - 1))));
    } else {
      setEndFrom(date, start, t.duration_minutes ?? 60);
    }
  }

  async function saveAsDefault() {
    const name = window.prompt("Name this default (e.g. Therapy)", title.trim());
    if (!name?.trim()) return;
    const duration = allDay
      ? (Math.round((fromInputs(endDate < date ? date : endDate).getTime() - fromInputs(date).getTime()) / 86_400_000) + 1) * 1440
      : Math.max(0, differenceInMinutes(fromInputs(endDate, end), fromInputs(date, start)));
    const row = {
      name: name.trim(),
      title: title.trim() || name.trim(),
      type,
      all_day: allDay,
      duration_minutes: duration,
      location: location.trim() || null,
      notes: notes.trim() || null,
      reminder_lead_minutes: reminderValid && reminder !== "" ? Number(reminder) : null,
      color,
    };
    const supabase = supabaseBrowser();
    const same = templates.find((t) => t.name.toLowerCase() === row.name.toLowerCase());
    const { error } = same ? await supabase.from("event_templates").update(row).eq("id", same.id) : await supabase.from("event_templates").insert({ ...row, created_by: meId });
    if (error) return toast(error.message);
    refreshAll();
    toast(same ? `Updated "${row.name}"` : `Saved "${row.name}" as a default`);
  }

  const reminderOptions = allDay ? ALL_DAY_REMINDERS : TIMED_REMINDERS;
  const reminderValid = reminderOptions.some((o) => o.v === reminder);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    const submitBtn = e.currentTarget.querySelector<HTMLElement>("button[type=submit]");
    const startAt = allDay ? fromInputs(date) : fromInputs(date, start);
    // All-day end = midnight after the last day, so multi-day spans render right.
    const endAt = allDay ? addHours(fromInputs(endDate < date ? date : endDate), 24) : fromInputs(endDate, end);
    if (!allDay && endAt < startAt) {
      setError("Ends before it starts.");
      return;
    }
    setBusy(true);
    setError(null);

    const becameAsk = type === "ask" && (!initial || initial.type !== "ask");
    const timeChanged = !initial || initial.start_time !== startAt.toISOString();
    const lead = reminderValid && reminder !== "" ? Number(reminder) : null;
    const row = {
      title: title.trim(),
      type,
      all_day: allDay,
      start_time: startAt.toISOString(),
      end_time: endAt.toISOString(),
      location: location.trim() || null,
      notes: notes.trim() || null,
      reminder_lead_minutes: lead,
      color,
      template_id: usedTemplate,
      // Re-arm the reminder if the time or lead changed.
      ...(timeChanged || lead !== initial?.reminder_lead_minutes ? { reminder_sent_at: null } : {}),
      // A fresh ask (or switching to ask) needs an answer; other types don't track one.
      // Moving an existing ask needs a fresh answer for the new time.
      ...(type !== "ask"
        ? { response_status: null, responded_at: null, decline_note: null, proposed_start: null }
        : becameAsk || (initial && timeChanged)
          ? { response_status: "pending", responded_at: null, decline_note: null, proposed_start: null }
          : {}),
    };

    const supabase = supabaseBrowser();

    // A new repeating event: every occurrence is its own row in one series.
    if (!initial && repeat !== "none" && type !== "ask") {
      const { data: series, error: sErr } = await supabase.from("event_series").insert({ freq: repeat, until, created_by: meId }).select("id").single();
      if (sErr) {
        setError(sErr.message);
        setBusy(false);
        return;
      }
      const length = endAt.getTime() - startAt.getTime();
      const starts = occurrences(startAt, repeat, fromInputs(until));
      const { error: oErr } = await supabase.from("events").insert(
        starts.map((s0) => ({ ...row, start_time: s0.toISOString(), end_time: new Date(s0.getTime() + length).toISOString(), series_id: series.id, created_by: meId })),
      );
      setBusy(false);
      if (oErr) return setError(oErr.message);
      refreshAll();
      celebrate(submitBtn);
      toast(`Added ${starts.length} on the calendar ✨`);
      return onDone();
    }

    // Editing one of a series, "this and later": same changes, same shift, to every later one.
    if (initial?.series_id && scope === "later") {
      const { data: later } = await supabase.from("events").select("id, start_time, end_time, type").eq("series_id", initial.series_id).gte("start_time", initial.start_time);
      const shift = startAt.getTime() - new Date(initial.start_time).getTime();
      const length = endAt.getTime() - startAt.getTime();
      const { reminder_sent_at: _r, response_status: _s, responded_at: _ra, decline_note: _d, proposed_start: _p, ...shared } = row as typeof row & Record<string, unknown>;
      void _r; void _s; void _ra; void _d; void _p;
      const results = await Promise.all(
        (later ?? []).map((ev) => {
          const s0 = new Date(new Date(ev.start_time).getTime() + shift);
          return supabase
            .from("events")
            .update({ ...shared, type: ev.type === "ask" ? ev.type : row.type, start_time: s0.toISOString(), end_time: new Date(s0.getTime() + length).toISOString(), reminder_sent_at: null })
            .eq("id", ev.id);
        }),
      );
      setBusy(false);
      const failed = results.find((x) => x.error);
      if (failed?.error) return setError(failed.error.message);
      refreshAll();
      toast(`Updated ${results.length}`);
      return onDone();
    }

    const res = initial
      ? await supabase.from("events").update(row).eq("id", initial.id).select("id").single()
      : await supabase.from("events").insert({ ...row, created_by: meId }).select("id").single();
    if (res.error) {
      setError(res.error.message);
      setBusy(false);
      return;
    }
    const saved = { id: res.data.id, title: row.title, start_time: row.start_time, all_day: row.all_day };
    if (becameAsk) {
      notify({ kind: "ask", id: res.data.id });
      await postAskUpdate(saved, meId, { kind: "sent" });
    } else if (type === "ask" && initial && timeChanged) {
      notify({ kind: "ask", id: res.data.id });
      await postAskUpdate(saved, meId, { kind: "moved" });
    }
    refreshAll();
    if (!initial) celebrate(submitBtn);
    toast(becameAsk ? `Asked ${partner?.display_name ?? "them"} 💌` : initial ? "Saved" : "On the calendar ✨");
    onDone();
  }

  async function remove(later = false) {
    if (!initial || !confirm(later ? `Delete "${initial.title}" and every one after it?` : `Delete "${initial.title}"?`)) return;
    const supabase = supabaseBrowser();
    if (later && initial.series_id) await supabase.from("events").delete().eq("series_id", initial.series_id).gte("start_time", initial.start_time);
    else await supabase.from("events").delete().eq("id", initial.id);
    refreshAll();
    toast("Deleted");
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      {!initial && templates.length > 0 && (
        <div className="field">
          <div className="row-between">
            <span>Quick add</span>
            <Link href="/presets" className="btn-link small" onClick={onDone}>
              Edit presets
            </Link>
          </div>
          <div className="chips">
            {templates.map((t) => (
              <button key={t.id} type="button" className="chip" aria-pressed={usedTemplate === t.id} onClick={() => applyTemplate(t)}>
                {t.color && <Swatch color={t.color} size={10} />}+ {t.emoji ? `${t.emoji} ` : ""}
                {t.name}
              </button>
            ))}
          </div>
          {usedTemplate && <p className="small muted">Just pick the day and start time. The end follows the preset&apos;s length.</p>}
        </div>
      )}
      <label className="field">
        <span>What</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Card show, dinner at Mom's…" autoFocus={!initial} required />
      </label>

      <div className="field">
        <span>Kind of plan</span>
        <div className="chips" role="group">
          {TYPES.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={type === t} onClick={() => setType(t)}>
              <span className="swatch" data-type={t} data-person={t === "solo" ? myColor : undefined} />
              {EVENT_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="small muted">{type === "ask" && partner ? `Ask ${partner.display_name}: can you make it?` : EVENT_TYPE_HINT[type]}</p>
      </div>

      <div className="field">
        <span>When</span>
        <WhenPicker
          value={{ date, endDate, start, end, allDay }}
          onChange={(w) => {
            // The picker keeps the length when the start moves.
            setDate(w.date);
            setAllDay(!!w.allDay);
            setStart(w.start || start);
            setEnd(w.end || end);
            setEndDate(w.endDate ?? w.date);
          }}
        />
      </div>

      {!initial && (
        <div className="field">
          <span>Repeat</span>
          <div className="chips">
            <button type="button" className="chip chip-sm" aria-pressed={repeat === "none"} onClick={() => setRepeat("none")}>
              Just once
            </button>
            {(Object.keys(FREQ_LABEL) as Freq[]).map((f) => (
              <button key={f} type="button" className="chip chip-sm" aria-pressed={repeat === f} onClick={() => (setRepeat(f), f === "yearly" && setUntil(toDateInput(addYears(fromInputs(date), 30))))} disabled={type === "ask"}>
                {f === "monthly_weekday" ? `Every month (${weekdayOrdinal(fromInputs(date))})` : FREQ_LABEL[f]}
              </button>
            ))}
          </div>
          {type === "ask" && <p className="small muted">Asks go one at a time, so they don&apos;t repeat.</p>}
          {repeat !== "none" && type !== "ask" && (
            <>
              <span className="small muted">Until</span>
              <WhenPicker mode="day" allowAllDay={false} value={{ date: until }} onChange={(w) => setUntil(w.date)} />
              <p className="small muted">
                {occurrences(allDay ? fromInputs(date) : fromInputs(date, start), repeat, fromInputs(until)).length} on the calendar. Change or delete one later, or all the ones after it.
              </p>
            </>
          )}
        </div>
      )}
      {initial?.series_id && (
        <div className="field">
          <span>This repeats. Save changes to</span>
          <div className="seg" role="group">
            <button type="button" aria-pressed={scope === "one"} onClick={() => setScope("one")}>
              Just this one
            </button>
            <button type="button" aria-pressed={scope === "later"} onClick={() => setScope("later")}>
              This &amp; later ones
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <span>Color marker (optional)</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <label className="field">
        <span>Where (optional)</span>
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Somewhere cozy" />
      </label>
      <label className="field">
        <span>Notes (optional)</span>
        <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="field">
        <span>Reminder</span>
        <select className="select" value={reminderValid ? reminder : ""} onChange={(e) => setReminder(e.target.value)}>
          {reminderOptions.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {!initial && title.trim() && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={saveAsDefault}>
          ☆ Save as a default
        </button>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row-between">
        {initial ? (
          <div className="row wrap" style={{ gap: 4 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(false)}>
              Delete{initial.series_id ? " this one" : ""}
            </button>
            {initial.series_id && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(true)}>
                …and later ones
              </button>
            )}
          </div>
        ) : (
          <span />
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>
          {busy ? "Saving…" : initial ? "Save" : type === "ask" ? "Send ask" : "Add it"}
        </button>
      </div>
    </form>
  );
}

function nextHalfHour(day?: Date) {
  const now = new Date();
  const d = day ? new Date(day) : new Date(now);
  d.setHours(now.getHours(), now.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

const LENGTHS = [
  { v: 30, label: "30 min" },
  { v: 45, label: "45 min" },
  { v: 60, label: "1 hr" },
  { v: 90, label: "1½ hr" },
  { v: 120, label: "2 hr" },
  { v: 180, label: "3 hr" },
  { v: 240, label: "4 hr" },
];

type Scope = "upcoming" | "all" | "new";

/**
 * Make or edit a calendar preset. Editing asks how far the change reaches:
 * events already made from it that are still ahead, every one of them, or
 * only ones added from now on.
 */
export function EventPresetForm({ initial, onDone }: { initial?: EventTemplate; onDone: () => void }) {
  const { meId, toast } = useApp();
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [type, setType] = useState<EventType>(initial?.type ?? "solo");
  const [allDay, setAllDay] = useState(initial?.all_day ?? false);
  const [length, setLength] = useState(initial?.duration_minutes && !initial.all_day ? initial.duration_minutes : 60);
  const [location, setLocation] = useState(initial?.location ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [reminder, setReminder] = useState(initial?.reminder_lead_minutes?.toString() ?? "");
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [scope, setScope] = useState<Scope>("upcoming");
  const [busy, setBusy] = useState(false);
  const reminderOptions = allDay ? ALL_DAY_REMINDERS : TIMED_REMINDERS;
  const custom = !LENGTHS.some((l) => l.v === length);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const supabase = supabaseBrowser();
    const row = {
      name: name.trim(),
      // What shows on the calendar: the name, unless it was saved from an event with its own title.
      title: initial && initial.title !== initial.name && name.trim() === initial.name ? initial.title : name.trim(),
      emoji: emoji.trim() || null,
      type,
      all_day: allDay,
      duration_minutes: allDay ? 1440 : length,
      location: location.trim() || null,
      notes: notes.trim() || null,
      reminder_lead_minutes: reminder === "" || !reminderOptions.some((o) => o.v === reminder) ? null : Number(reminder),
      color,
    };
    const res = initial ? await supabase.from("event_templates").update(row).eq("id", initial.id) : await supabase.from("event_templates").insert({ ...row, created_by: meId });
    if (res.error) {
      setBusy(false);
      return toast(res.error.message.includes("duplicate") ? "There's already a preset with that name." : res.error.message);
    }

    // Carry the change to events made from this preset.
    let changed = 0;
    if (initial && scope !== "new") {
      let q = supabase.from("events").select("id, start_time, all_day, type").eq("template_id", initial.id);
      if (scope === "upcoming") q = q.gte("start_time", new Date().toISOString());
      const { data: evs } = await q;
      const results = await Promise.all(
        (evs ?? []).map((ev) => {
          const fields: Record<string, unknown> = {
            title: row.title,
            location: row.location,
            notes: row.notes,
            reminder_lead_minutes: row.reminder_lead_minutes,
            color: row.color,
          };
          // Answered asks keep their answer; only non-asks switch kind.
          if (ev.type !== "ask" && row.type !== "ask") fields.type = row.type;
          // Same start, the preset's length.
          if (!ev.all_day && !row.all_day) fields.end_time = addMinutes(new Date(ev.start_time), row.duration_minutes).toISOString();
          return supabase.from("events").update(fields).eq("id", ev.id);
        }),
      );
      changed = results.filter((r) => !r.error).length;
    }
    setBusy(false);
    refreshAll();
    toast(initial ? (changed ? `Saved, and updated ${changed} on the calendar` : "Saved") : `Saved. "+ ${name.trim()}" is ready when you add an event.`);
    onDone();
  }

  async function remove() {
    if (!initial || !confirm(`Remove the "${initial.name}" preset? Events already on the calendar stay as they are.`)) return;
    await supabaseBrowser().from("event_templates").delete().eq("id", initial.id);
    refreshAll();
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      {!initial && <p className="small muted">A preset fills everything in; you only pick the day and start time.</p>}
      <div className="row">
        <input className="input" style={{ width: 64, textAlign: "center" }} value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} placeholder="🛋️" aria-label="Emoji (optional)" />
        <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Therapy, vet visit, date night…" autoFocus={!initial} required />
      </div>
      <div className="field">
        <span>Kind of plan</span>
        <div className="chips" role="group">
          {TYPES.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={type === t} onClick={() => setType(t)}>
              <span className="swatch" data-type={t} />
              {EVENT_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="toggle-row">
        <span className="label">All day</span>
        <label className="switch">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          <span />
        </label>
      </div>
      {!allDay && (
        <div className="field">
          <span>How long</span>
          <div className="chips">
            {LENGTHS.map((l) => (
              <button key={l.v} type="button" className="chip chip-sm" aria-pressed={length === l.v} onClick={() => setLength(l.v)}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="row small">
            <input className="input" style={{ width: 90 }} inputMode="numeric" value={custom ? String(length) : ""} onChange={(e) => Number(e.target.value) > 0 && setLength(Number(e.target.value.replace(/\D/g, "")))} placeholder="50" aria-label="Minutes" />
            minutes
          </div>
        </div>
      )}
      <div className="field">
        <span>Color marker (optional)</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where (optional)" aria-label="Where" />
      <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" aria-label="Notes" />
      <label className="field">
        <span>Reminder</span>
        <select className="select" value={reminder} onChange={(e) => setReminder(e.target.value)}>
          {reminderOptions.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {initial && (
        <div className="field">
          <span>Apply changes to</span>
          <div className="stack-sm">
            {(
              [
                ["upcoming", "Everything on the calendar that's still coming up"],
                ["all", "Everything made with it, past ones too"],
                ["new", "Only ones added from now on"],
              ] as [Scope, string][]
            ).map(([k, label]) => (
              <label key={k} className="row small">
                <input type="radio" name="scope" checked={scope === k} onChange={() => setScope(k)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="row-between">
        {initial ? (
          <button type="button" className="btn btn-ghost" onClick={remove}>
            Remove
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          {initial ? "Save preset" : "Save preset"}
        </button>
      </div>
    </form>
  );
}
