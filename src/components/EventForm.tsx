"use client";

import { useState } from "react";
import { addHours } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fromInputs, toDateInput, toTimeInput } from "@/lib/dates";
import { refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { EVENT_TYPE_HINT, EVENT_TYPE_LABEL, type CalEvent, type EventType } from "@/lib/types";
import { postAskUpdate } from "@/lib/askFeed";
import { useApp } from "./AppProvider";

const TYPES: EventType[] = ["confirmed", "solo", "ask", "radar"];

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
  const { meId, partner, toast } = useApp();
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function remove() {
    if (!initial || !confirm(`Delete "${initial.title}"?`)) return;
    await supabaseBrowser().from("events").delete().eq("id", initial.id);
    refreshAll();
    toast("Deleted");
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>What</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Card show, dinner at Mom's…" autoFocus={!initial} required />
      </label>

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
        <p className="small muted">{type === "ask" && partner ? `Ask ${partner.display_name}: can you make it?` : EVENT_TYPE_HINT[type]}</p>
      </div>

      <div className="toggle-row">
        <span className="label">All day</span>
        <label className="switch">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          <span />
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>{allDay ? "From" : "Date"}</span>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
            }}
            required
          />
        </label>
        {allDay ? (
          <label className="field">
            <span>Through</span>
            <input className="input" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        ) : (
          <label className="field">
            <span>Starts</span>
            <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
        )}
      </div>
      {!allDay && (
        <div className="grid-2">
          <label className="field">
            <span>End date</span>
            <input className="input" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Ends</span>
            <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
      )}

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

      {error && <p className="error">{error}</p>}
      <div className="row-between">
        {initial ? (
          <button type="button" className="btn btn-ghost" onClick={remove}>
            Delete
          </button>
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
