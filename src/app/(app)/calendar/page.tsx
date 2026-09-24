"use client";

import { DogPic } from "@/components/DogPic";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { fromInputs, timeLabel, toDateInput, toTimeInput } from "@/lib/dates";
import { eventWhen, postAskUpdate } from "@/lib/askFeed";
import { EVENT_TYPE_LABEL, effectiveType, type CalEvent, type EventType } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { EventForm } from "@/components/EventForm";
import { IconBell, IconChevron, IconPin, IconPlus, Wavy } from "@/components/Art";

type View = "day" | "week" | "month" | "agenda";
type AgendaRange = "today" | "week" | "month" | "upcoming";

const HOUR_PX = 52;

/* ─── helpers ───────────────────────────────────────────────────────────── */

const startOf = (e: CalEvent) => new Date(e.start_time);
const endOf = (e: CalEvent) => (e.end_time ? new Date(e.end_time) : new Date(e.start_time));

function onDay(e: CalEvent, day: Date) {
  const s = startOf(e);
  const en = endOf(e);
  const ds = startOfDay(day);
  const de = endOfDay(day);
  if (en.getTime() === s.getTime()) return s >= ds && s <= de;
  return s <= de && en > ds;
}

function sortEvents(list: CalEvent[]) {
  return [...list].sort((a, b) => Number(b.all_day) - Number(a.all_day) || startOf(a).getTime() - startOf(b).getTime());
}

function whenText(e: CalEvent) {
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

function rangeFor(view: View, cursor: Date, agenda: AgendaRange): [Date, Date] {
  const today = new Date();
  switch (view) {
    case "day":
      return [startOfDay(cursor), endOfDay(cursor)];
    case "week":
      return [startOfWeek(cursor), endOfWeek(cursor)];
    case "month":
      return [startOfWeek(startOfMonth(cursor)), endOfWeek(endOfMonth(cursor))];
    case "agenda":
      if (agenda === "today") return [startOfDay(today), endOfDay(today)];
      if (agenda === "week") return [startOfDay(today), endOfWeek(today)];
      if (agenda === "month") return [startOfDay(today), endOfMonth(today)];
      return [startOfDay(today), endOfDay(addDays(today, 120))];
  }
}

/* ─── page ──────────────────────────────────────────────────────────────── */

export default function CalendarPage() {
  const [view, setView] = useState<View>("agenda");
  const [agenda, setAgenda] = useState<AgendaRange>("week");
  const [cursor, setCursor] = useState(() => new Date());
  // Deep link from a push notification: /calendar?event=<id>
  const [openId, setOpenId] = useState<string | null>(useSearchParams().get("event"));
  const [editing, setEditing] = useState<CalEvent | "new" | null>(null);

  const [from, to] = rangeFor(view, cursor, agenda);
  const { data: events = [] } = useLive<CalEvent[]>(
    `events:${from.toISOString()}:${to.toISOString()}`,
    async () => {
      const { data, error } = await supabaseBrowser()
        .from("events")
        .select("*")
        .lte("start_time", to.toISOString())
        .or(`end_time.gte."${from.toISOString()}",start_time.gte."${from.toISOString()}"`)
        .order("start_time");
      if (error) throw error;
      return data as CalEvent[];
    },
    ["events"],
  );

  // Pending asks waiting on me, regardless of the visible range.
  const { meId } = useApp();
  const { data: waiting = [] } = useLive<CalEvent[]>(
    "events:waiting",
    async () => {
      const { data } = await supabaseBrowser()
        .from("events")
        .select("*")
        .eq("type", "ask")
        .eq("response_status", "pending")
        .neq("created_by", meId)
        .gte("start_time", startOfDay(new Date()).toISOString())
        .order("start_time");
      return (data ?? []) as CalEvent[];
    },
    ["events"],
  );

  // The open event usually lives in a loaded range; if not (deep link to a
  // far-off date), fetch it on its own.
  const loaded = openId ? (events.find((e) => e.id === openId) ?? waiting.find((e) => e.id === openId)) : undefined;
  const [fetched, setFetched] = useState<CalEvent | null>(null);
  useEffect(() => {
    if (!openId || loaded) return;
    supabaseBrowser()
      .from("events")
      .select("*")
      .eq("id", openId)
      .maybeSingle()
      .then(({ data }) => setFetched(data as CalEvent | null));
  }, [openId, loaded]);
  const openEvent = loaded ?? (fetched?.id === openId ? fetched : null);

  const step = (dir: 1 | -1) =>
    setCursor((c) => (view === "day" ? addDays(c, dir) : view === "week" ? addWeeks(c, dir) : addMonths(c, dir)));

  const title =
    view === "day"
      ? format(cursor, "EEEE, MMM d")
      : view === "week"
        ? `${format(startOfWeek(cursor), "MMM d")} – ${format(endOfWeek(cursor), isSameMonth(startOfWeek(cursor), endOfWeek(cursor)) ? "d" : "MMM d")}`
        : format(cursor, "MMMM yyyy");

  const open = (e: CalEvent) => setOpenId(e.id);

  return (
    <main className="page">
      <PageHead eyebrow="What's coming up" title="Calendar" art={<DogPic name="kodo_wiley_back_walk" size={40} />} />
      <Wavy className="sage" />

      {waiting.length > 0 && (
        <section className="stack-sm" style={{ marginBottom: 16 }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            <span className="sticker butter">💌 Needs your answer</span>
          </div>
          {waiting.map((e) => (
            <EventCard key={e.id} e={e} onOpen={open} showDate />
          ))}
        </section>
      )}

      <div className="seg" role="group" aria-label="View">
        {(["day", "week", "month", "agenda"] as View[]).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {v === "agenda" ? "List" : v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {view === "agenda" ? (
        <div className="chips" style={{ margin: "12px 0" }}>
          {(
            [
              ["today", "Today"],
              ["week", "This week"],
              ["month", "This month"],
              ["upcoming", "Everything ahead"],
            ] as [AgendaRange, string][]
          ).map(([k, label]) => (
            <button key={k} className="chip" aria-pressed={agenda === k} onClick={() => setAgenda(k)}>
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="cal-toolbar">
          <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous">
            <IconChevron dir="left" />
          </button>
          <button className="btn btn-ghost cal-title" onClick={() => setCursor(new Date())} title="Jump to today">
            {title}
          </button>
          <button className="icon-btn" onClick={() => step(1)} aria-label="Next">
            <IconChevron />
          </button>
        </div>
      )}

      <div className="legend">
        {(["confirmed", "solo", "ask", "radar"] as EventType[]).map((t) => (
          <span key={t}>
            <i className="swatch" data-type={t} /> {EVENT_TYPE_LABEL[t]}
          </span>
        ))}
      </div>

      {view === "agenda" && <Agenda events={events} from={from} to={to} onOpen={open} />}
      {view === "month" && <Month cursor={cursor} events={events} onOpen={open} onPickDay={setCursor} />}
      {view === "week" && (
        <Week
          cursor={cursor}
          events={events}
          onOpen={open}
          onPickDay={(d) => {
            setCursor(d);
            setView("day");
          }}
        />
      )}
      {view === "day" && <Day day={cursor} events={events} onOpen={open} />}

      <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <IconPlus width={18} height={18} /> Add a plan{view !== "agenda" && !isToday(cursor) && view !== "week" ? ` on ${format(cursor, "MMM d")}` : ""}
        </button>
      </div>

      {openEvent && !editing && (
        <EventDetail
          e={openEvent}
          onClose={() => {
            setOpenId(null);
            if (window.location.search) window.history.replaceState(null, "", "/calendar");
          }}
          onEdit={() => setEditing(openEvent)}
        />
      )}
      {editing && (
        <Sheet title={editing === "new" ? "New plan" : "Edit plan"} onClose={() => setEditing(null)}>
          <EventForm
            initial={editing === "new" ? undefined : editing}
            defaultDate={view === "agenda" ? undefined : cursor}
            onDone={() => {
              setEditing(null);
              setOpenId(null);
            }}
          />
        </Sheet>
      )}
    </main>
  );
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

function AskActions({ e }: { e: CalEvent }) {
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
        <div className={e.all_day ? "" : "grid-2"}>
          <input className="input" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} aria-label="Suggested day" required />
          {!e.all_day && <input className="input" type="time" value={time} onChange={(ev) => setTime(ev.target.value)} aria-label="Suggested time" required />}
        </div>
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

function EventBadges({ e }: { e: CalEvent }) {
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

function EventCard({ e, onOpen, showDate = false }: { e: CalEvent; onOpen: (e: CalEvent) => void; showDate?: boolean }) {
  const { meId } = useApp();
  const t = effectiveType(e);
  return (
    <div className="ev ev-card" data-type={t} role="button" tabIndex={0} onClick={() => onOpen(e)} onKeyDown={(k) => k.key === "Enter" && onOpen(e)}>
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <div className="ev-title">{e.title}</div>
          <div className="ev-meta">
            {showDate && `${format(startOf(e), "EEE, MMM d")} · `}
            {whenText(e)}
            {e.location && ` · ${e.location}`}
          </div>
        </div>
        <EventBadges e={e} />
      </div>
      {t === "ask" && e.created_by !== meId && <AskActions e={e} />}
    </div>
  );
}

function EventDetail({ e, onClose, onEdit }: { e: CalEvent; onClose: () => void; onEdit: () => void }) {
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

/* ─── views ─────────────────────────────────────────────────────────────── */

function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <DogPic name="wiley_down" size={110} />
      <p className="display">{text}</p>
    </div>
  );
}

function Agenda({ events, from, to, onOpen }: { events: CalEvent[]; from: Date; to: Date; onOpen: (e: CalEvent) => void }) {
  const days = useMemo(() => {
    const out: { day: Date; list: CalEvent[] }[] = [];
    for (const day of eachDayOfInterval({ start: from, end: to })) {
      const list = sortEvents(events.filter((e) => onDay(e, day)));
      if (list.length) out.push({ day, list });
    }
    return out;
  }, [events, from, to]);

  if (!days.length) return <Empty text="Wide open. Nothing planned." />;
  return (
    <div className="agenda">
      {days.map(({ day, list }) => (
        <section key={day.toISOString()} className="agenda-day">
          <h3>
            {format(day, "EEEE, MMM d")}
            {isToday(day) && <span className="today-pill">Today</span>}
          </h3>
          <div className="stack-sm">
            {list.map((e) => (
              <EventCard key={e.id} e={e} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Month({ cursor, events, onOpen, onPickDay }: { cursor: Date; events: CalEvent[]; onOpen: (e: CalEvent) => void; onPickDay: (d: Date) => void }) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor)), end: endOfWeek(endOfMonth(cursor)) });
  const selected = sortEvents(events.filter((e) => onDay(e, cursor)));
  return (
    <>
      <div className="month">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="dow">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const list = sortEvents(events.filter((e) => onDay(e, d)));
          const cls = ["mcell", !isSameMonth(d, cursor) && "other", isToday(d) && "today", isSameDay(d, cursor) && "selected"].filter(Boolean).join(" ");
          return (
            <button key={d.toISOString()} className={cls} onClick={() => onPickDay(d)} aria-label={`${format(d, "MMMM d")}, ${list.length} plans`}>
              <span className="mnum">{format(d, "d")}</span>
              <span className="mdots">
                {list.slice(0, 3).map((e) => (
                  <i key={e.id} className="mdot ev" data-type={effectiveType(e)} />
                ))}
              </span>
              {list.length > 3 && <span className="mmore">+{list.length - 3}</span>}
            </button>
          );
        })}
      </div>
      <h3 style={{ margin: "18px 0 8px" }}>{format(cursor, "EEEE, MMM d")}</h3>
      {selected.length ? (
        <div className="stack-sm">
          {selected.map((e) => (
            <EventCard key={e.id} e={e} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="muted">Nothing that day.</p>
      )}
    </>
  );
}

function Week({ cursor, events, onOpen, onPickDay }: { cursor: Date; events: CalEvent[]; onOpen: (e: CalEvent) => void; onPickDay: (d: Date) => void }) {
  const days = eachDayOfInterval({ start: startOfWeek(cursor), end: endOfWeek(cursor) });
  return (
    <div className="card" style={{ padding: "4px 12px" }}>
      {days.map((d) => {
        const list = sortEvents(events.filter((e) => onDay(e, d)));
        return (
          <div key={d.toISOString()} className={`week-day${isToday(d) ? " today" : ""}`}>
            <button className="week-date btn-ghost" style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => onPickDay(d)}>
              <div className="w">{format(d, "EEE")}</div>
              <div className="d">{format(d, "d")}</div>
            </button>
            <div className="stack-sm">
              {list.length ? list.map((e) => <EventCard key={e.id} e={e} onOpen={onOpen} />) : <span className="faint small" style={{ paddingTop: 8 }}>—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Day({ day, events, onOpen }: { day: Date; events: CalEvent[]; onOpen: (e: CalEvent) => void }) {
  const list = events.filter((e) => onDay(e, day));
  const allDay = list.filter((e) => e.all_day);
  const timed = list.filter((e) => !e.all_day).sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
  const dayStart = startOfDay(day);

  const firstHour = Math.min(7, ...timed.map((e) => (startOf(e) < dayStart ? 0 : startOf(e).getHours())));
  const hours = Array.from({ length: 24 - firstHour }, (_, i) => firstHour + i);

  // Greedy lanes so overlapping plans sit side by side.
  const lanes: Date[] = [];
  const placed = timed.map((e) => {
    const s = startOf(e) < dayStart ? dayStart : startOf(e);
    const en = new Date(Math.min(endOf(e).getTime(), endOfDay(day).getTime()));
    let lane = lanes.findIndex((end) => end <= s);
    if (lane === -1) lane = lanes.push(en) - 1;
    else lanes[lane] = en;
    return { e, s, en, lane };
  });
  const laneCount = Math.max(1, lanes.length);

  const now = new Date();
  const nowTop = isToday(day) ? (differenceInMinutes(now, dayStart) / 60 - firstHour) * HOUR_PX : null;

  return (
    <div className="dayview">
      {allDay.length > 0 && (
        <div className="allday-strip">
          {allDay.map((e) => (
            <EventCard key={e.id} e={e} onOpen={onOpen} />
          ))}
        </div>
      )}
      <div className="hours">
        {hours.map((h) => (
          <div key={h} className="hour">
            <span>{format(new Date(2000, 0, 1, h), "h a").toLowerCase()}</span>
          </div>
        ))}
        {nowTop !== null && nowTop >= 0 && <div className="nowline" style={{ top: nowTop }} />}
        {placed.map(({ e, s, en, lane }) => {
          const top = (differenceInMinutes(s, dayStart) / 60 - firstHour) * HOUR_PX;
          const height = Math.max(26, (differenceInMinutes(en, s) / 60) * HOUR_PX - 2);
          const t = effectiveType(e);
          return (
            <button
              key={e.id}
              className="ev dayev"
              data-type={t}
              style={{ top, height, left: `calc(48px + (100% - 48px) * ${lane / laneCount})`, width: `calc((100% - 48px) / ${laneCount} - 3px)`, right: "auto" }}
              onClick={() => onOpen(e)}
            >
              <strong>{e.title}</strong>
              {height > 40 && <span>{whenText(e)}</span>}
            </button>
          );
        })}
      </div>
      {list.length === 0 && <p className="muted" style={{ marginTop: 12 }}>Nothing planned — a free day.</p>}
    </div>
  );
}
