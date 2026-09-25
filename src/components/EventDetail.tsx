"use client";

import { useState } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { fromInputs, timeLabel, toDateInput, toTimeInput } from "@/lib/dates";
import { eventWhen, postAskUpdate } from "@/lib/askFeed";
import { WhenPicker } from "./WhenPicker";
import { EVENT_TYPE_LABEL, effectiveType, type CalEvent } from "@/lib/types";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { EventForm } from "./EventForm";
import { IconBell, IconPin } from "./Art";

export const startOf = (e: CalEvent) => new Date(e.start_time);
export const endOf = (e: CalEvent) => (e.end_time ? new Date(e.end_time) : new Date(e.start_time));

export function whenText(e: CalEvent) {
  const s = startOf(e);
  const en = endOf(e);
  if (e.all_day) {
    const last = new Date(en.getTime() - 60_000);
    return isSameDay(s, last) ? "All day" : `All day · through ${format(last, "EEE MMM d")}`;
  }
  if (!e.end_time || en.getTime() === s.getTime()) return timeLabel(s);
  if (isSameDay(s, en)) return `${timeLabel(s)} – ${timeLabel(en)}`;
  return `${timeLabel(s)} – ${format(en, "EEE")} ${timeLabel(en)}`;
}


/* ─── event card + ask actions ──────────────────────────────────────────── */

type Decline = { note: string | null; proposed: string | null };

function useAnswer() {
  const { meId, toast, nameOf } = useApp();
  return async (e: CalEvent, answer: { yes: true; el: HTMLElement } | ({ yes: false } & Decline)) => {
    const { error } = await supabaseBrowser()
      .from("events")
      .update({
        response_status: answer.yes ? "accepted" : "declined",
        responded_at: new Date().toISOString(),
        decline_note: answer.yes ? null : answer.note,
        proposed_start: answer.yes ? null : answer.proposed,
      })
      .eq("id", e.id);
    if (error) {
      toast(error.message);
      return false;
    }
    if (answer.yes) celebrate(answer.el, ["💛", "🌼", "✨", "🎉"]);
    notify({ kind: "ask_answered", id: e.id });
    await postAskUpdate(e, meId, answer.yes ? { kind: "accepted" } : { kind: "declined", note: answer.note, proposed: answer.proposed });
    refreshAll();
    toast(answer.yes ? "You're in 💛" : `Got it — sent to ${nameOf(e.created_by)}`);
    return true;
  };
}

export function AskActions({ e }: { e: CalEvent }) {
  const answer = useAnswer();
  const [declining, setDeclining] = useState(false);
  return (
    <div className="ask-actions" onClick={(ev) => ev.stopPropagation()}>
      <button className="btn btn-plum" onClick={(ev) => answer(e, { yes: true, el: ev.currentTarget })}>
        I&apos;m in
      </button>
      <button className="btn" onClick={() => setDeclining(true)}>
        Can&apos;t make it
      </button>
      {declining && (
        <Sheet title={`Can't make ${e.title}`} onClose={() => setDeclining(false)}>
          <DeclineForm e={e} onSend={async (d) => (await answer(e, { yes: false, ...d })) && setDeclining(false)} />
        </Sheet>
      )}
    </div>
  );
}

/** Why not, and optionally a better time. Both optional; it all goes to the feed. */
function DeclineForm({ e, onSend }: { e: CalEvent; onSend: (d: Decline) => Promise<unknown> }) {
  const { nameOf } = useApp();
  const start = startOf(e);
  const [note, setNote] = useState("");
  const [propose, setPropose] = useState(false);
  const [date, setDate] = useState(toDateInput(addDays(start, 1)));
  const [time, setTime] = useState(toTimeInput(start));
  const [busy, setBusy] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    const proposed = propose && date ? (e.all_day ? fromInputs(date) : fromInputs(date, time || "00:00")).toISOString() : null;
    await onSend({ note: note.trim() || null, proposed });
    setBusy(false);
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Why not? (optional)</span>
        <textarea className="textarea" rows={3} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Working late, already have plans…" autoFocus />
      </label>
      <div className="toggle-row">
        <span className="label">Suggest another time</span>
        <label className="switch">
          <input type="checkbox" checked={propose} onChange={(ev) => setPropose(ev.target.checked)} />
          <span />
        </label>
      </div>
      {propose && (
        <WhenPicker
          mode="point"
          allowAllDay={false}
          value={{ date, start: e.all_day ? undefined : time, allDay: e.all_day }}
          onChange={(w) => {
            setDate(w.date);
            if (w.start) setTime(w.start);
          }}
        />
      )}
      <p className="small muted">This goes to {nameOf(e.created_by)} and shows in the feed.</p>
      <button className="btn btn-primary btn-block" disabled={busy}>
        Send
      </button>
    </form>
  );
}

/** After declining, the one note you can still leave or change. Goes to the feed. */
function DeclineNote({ e }: { e: CalEvent }) {
  const { meId, toast } = useApp();
  const [note, setNote] = useState(e.decline_note ?? "");
  const [busy, setBusy] = useState(false);
  const changed = note.trim() !== (e.decline_note ?? "");

  async function save() {
    setBusy(true);
    const { error } = await supabaseBrowser().from("events").update({ decline_note: note.trim() || null }).eq("id", e.id);
    setBusy(false);
    if (error) return toast(error.message);
    if (note.trim()) await postAskUpdate(e, meId, { kind: "note", note: note.trim() });
    refreshAll();
    toast("Note saved");
  }

  return (
    <div className="field">
      <span>Your note</span>
      <textarea className="textarea" rows={2} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Why you can't make it…" />
      {changed && (
        <button className="btn btn-sm btn-primary" onClick={save} disabled={busy} style={{ alignSelf: "flex-start" }}>
          Save note
        </button>
      )}
    </div>
  );
}

/** The asker takes the suggested time: move the event and ask again. */
function TakeProposal({ e }: { e: CalEvent }) {
  const { meId, partner, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!e.proposed_start) return null;
  const proposed = e.proposed_start;

  async function take() {
    setBusy(true);
    const length = e.end_time ? new Date(e.end_time).getTime() - new Date(e.start_time).getTime() : 0;
    const moved = {
      start_time: proposed,
      end_time: e.end_time ? new Date(new Date(proposed).getTime() + length).toISOString() : null,
      response_status: "pending",
      responded_at: null,
      decline_note: null,
      proposed_start: null,
      reminder_sent_at: null,
    };
    const { error } = await supabaseBrowser().from("events").update(moved).eq("id", e.id);
    setBusy(false);
    if (error) return toast(error.message);
    notify({ kind: "ask", id: e.id });
    await postAskUpdate({ ...e, start_time: proposed }, meId, { kind: "moved", note: note.trim() || null });
    refreshAll();
    toast(`Moved & asked ${partner?.display_name ?? "again"} 💌`);
  }

  return (
    <div className="card stack-sm" style={{ background: "var(--surface-sunk)" }}>
      <span style={{ fontWeight: 800 }}>
        {partner?.display_name ?? "They"} suggested {eventWhen(proposed, e.all_day)}
      </span>
      <input className="input" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Add a note (optional)" aria-label="Note" />
      <button className="btn btn-plum btn-sm" onClick={take} disabled={busy} style={{ alignSelf: "flex-start" }}>
        Move it there &amp; ask again
      </button>
    </div>
  );
}

export function EventBadges({ e }: { e: CalEvent }) {
  const { meId, nameOf, partner } = useApp();
  const t = effectiveType(e);
  if (t === "ask") {
    return e.created_by === meId ? (
      <span className="sticker plum">⏳ awaiting {partner?.display_name ?? "answer"}</span>
    ) : (
      <span className="sticker plum">💌 {nameOf(e.created_by)} asked</span>
    );
  }
  if (t === "solo") return <span className="sticker">{nameOf(e.created_by)}{e.type === "ask" ? " · solo" : ""}</span>;
  return null;
}

export function EventDetail({ e, onClose, onEdit }: { e: CalEvent; onClose: () => void; onEdit: () => void }) {
  const { meId, nameOf } = useApp();
  const t = effectiveType(e);
  const reminder = e.reminder_lead_minutes;
  return (
    <Sheet title={e.title} onClose={onClose}>
      <div className="stack">
        <div className="row wrap">
          <span className="ev sticker" data-type={t} style={{ borderStyle: t === "radar" ? "dashed" : "solid" }}>
            {EVENT_TYPE_LABEL[t]}
          </span>
          <EventBadges e={e} />
        </div>
        <p style={{ fontWeight: 800 }}>
          {format(startOf(e), "EEEE, MMMM d")} · {whenText(e)}
        </p>
        {e.location && (
          <p className="row muted">
            <IconPin width={18} height={18} /> {e.location}
          </p>
        )}
        {reminder !== null && (
          <p className="row muted small">
            <IconBell width={18} height={18} /> Reminder {e.reminder_sent_at ? "sent" : "set"}
          </p>
        )}
        {e.notes && <p className="card" style={{ whiteSpace: "pre-wrap" }}>{e.notes}</p>}
        <p className="small faint">
          Added by {nameOf(e.created_by)}
          {e.type === "ask" && e.response_status !== "pending" && e.responded_at && ` · answered ${format(new Date(e.responded_at), "MMM d")}`}
        </p>
        {e.type === "ask" && e.response_status === "declined" && e.decline_note && e.created_by === meId && (
          <p className="card" style={{ whiteSpace: "pre-wrap" }}>
            <strong>Their note:</strong> {e.decline_note}
          </p>
        )}
        {e.type === "ask" && e.response_status === "declined" && e.created_by !== meId && <DeclineNote e={e} />}
        {e.type === "ask" && e.response_status === "declined" && e.proposed_start && e.created_by !== meId && (
          <p className="small muted">You suggested {eventWhen(e.proposed_start, e.all_day)}.</p>
        )}
        {e.type === "ask" && e.response_status === "declined" && e.created_by === meId && <TakeProposal e={e} />}
        {t === "ask" && e.created_by !== meId && <AskActions e={e} />}
        {/* Until it's accepted, an ask is the asker's plan; the other side answers or leaves a note. */}
        {e.type === "ask" && e.created_by !== meId && e.response_status !== "accepted" ? (
          <p className="small muted" style={{ textAlign: "center" }}>
            {e.response_status === "pending"
              ? `Only ${nameOf(e.created_by)} can change this until you answer. Suggest a different time with "Can't make it".`
              : `It's ${nameOf(e.created_by)}'s plan now.`}
          </p>
        ) : (
          <button className="btn btn-block" onClick={onEdit}>
            Edit
          </button>
        )}
      </div>
    </Sheet>
  );
}


/** Open one event by id anywhere (the feed, requests) without leaving the page. */
export function EventPeek({ id, onClose }: { id: string; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const { data: e } = useLive<CalEvent | null>(
    `event:${id}`,
    async () => {
      const { data } = await supabaseBrowser().from("events").select("*").eq("id", id).maybeSingle();
      return (data as CalEvent) ?? null;
    },
    ["events"],
  );
  if (e === undefined) return null;
  if (!e)
    return (
      <Sheet title="Gone" onClose={onClose}>
        <p className="muted">That plan isn&apos;t on the calendar anymore.</p>
      </Sheet>
    );
  if (editing)
    return (
      <Sheet title="Edit plan" onClose={() => setEditing(false)}>
        <EventForm initial={e} onDone={onClose} />
      </Sheet>
    );
  return <EventDetail e={e} onClose={onClose} onEdit={() => setEditing(true)} />;
}
