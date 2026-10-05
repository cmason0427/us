"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

// "What time were you thinking?": a quiet ask for one person. It sits as a
// small card at the top of *their* feed (the asker just sees "waiting").
// Answering with a time posts it to the feed for both; "not sure yet" closes
// it gently, with no post and no pressure.

export type TimeWants = "time" | "day" | "range";
export interface TimeAsk {
  id: string;
  asked_by: string;
  to_user: string;
  question: string;
  note: string | null;
  wants: TimeWants;
  status: "open" | "answered" | "unsure" | "withdrawn";
  answer_time: string | null;
  answer_day: string | null;
  answer_until: string | null;
  answer_note: string | null;
  answered_at: string | null;
  seen_by_asker: boolean;
  created_at: string;
}

const WANTS: { k: TimeWants; label: string }[] = [
  { k: "time", label: "just a time" },
  { k: "day", label: "a day + time" },
  { k: "range", label: "dates (from–to)" },
];
const IDEAS = ["for dinner", "to leave", "for the walk", "to head home", "for a call", "to start the movie"];

export function useTimeAsks() {
  const { data = [] } = useLive<TimeAsk[]>(
    "time_asks",
    async () => {
      const { data, error } = await supabaseBrowser().from("time_asks").select("*").order("created_at", { ascending: false }).limit(60);
      if (error) return []; // not set up yet: no asks
      return data as TimeAsk[];
    },
    ["time_asks"],
  );
  return data;
}

/** "7:30 pm", from a Postgres time ("19:30:00"). */
export function fmtClock(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return format(d, m ? "h:mm a" : "h a").toLowerCase();
}
const fmtDay = (d: string | null) => (d ? format(parseISO(d), "EEE, MMM d") : null);

/** The answer in one line: "sat, oct 10 · 7:30 pm" / "oct 10 – oct 12 · 7 pm". */
export function answerLine(a: TimeAsk) {
  const day = a.answer_until && a.answer_day && a.answer_until !== a.answer_day ? `${fmtDay(a.answer_day)} – ${fmtDay(a.answer_until)}` : fmtDay(a.answer_day);
  return [day, fmtClock(a.answer_time)].filter(Boolean).join(" · ");
}

/** The ＋ menu / ⏰ button: ask what time they were thinking. */
export function TimeAskForm({ onDone }: { onDone: () => void }) {
  const { meId, partner, toast } = useApp();
  const [what, setWhat] = useState("");
  const [note, setNote] = useState("");
  const [wants, setWants] = useState<TimeWants>("time");
  const [busy, setBusy] = useState(false);
  if (!partner) return null;
  const question = what.trim() ? `What time were you thinking ${what.trim()}?` : "What time were you thinking?";

  async function send() {
    setBusy(true);
    const { data, error } = await supabaseBrowser()
      .from("time_asks")
      .insert({ asked_by: meId, to_user: partner!.id, question, note: note.trim() || null, wants })
      .select("id")
      .single();
    setBusy(false);
    if (error) return toast(error.message);
    notify({ kind: "time", id: data.id });
    refreshAll();
    toast(`Asked ${partner!.display_name} ⏰`);
    onDone();
  }

  return (
    <div className="stack">
      <label className="field">
        <span>What time were you thinking…</span>
        <input className="input" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="for dinner, to leave, for the walk…" autoFocus maxLength={80} />
      </label>
      <div className="chips">
        {IDEAS.map((x) => (
          <button key={x} type="button" className="chip chip-sm" aria-pressed={what === x} onClick={() => setWhat(what === x ? "" : x)}>
            {x}
          </button>
        ))}
      </div>
      <div className="field">
        <span>Ask for</span>
        <div className="seg" role="group" aria-label="What to ask for">
          {WANTS.map((w) => (
            <button key={w.k} type="button" aria-pressed={wants === w.k} onClick={() => setWants(w.k)}>
              {w.label}
            </button>
          ))}
        </div>
      </div>
      <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="a note (optional), e.g. no rush, just planning food" aria-label="Note" />
      <p className="small faint" style={{ margin: 0 }}>
        &ldquo;{question}&rdquo; · it shows up quietly for {partner.display_name}, and lands in the feed once they answer.
      </p>
      <button className="btn btn-primary btn-block" disabled={busy} onClick={send}>
        {busy ? "…" : "Ask"}
      </button>
    </div>
  );
}

/** Answer with a time (and a day or dates if asked), or "not sure yet". */
function AnswerSheet({ ask, onClose }: { ask: TimeAsk; onClose: () => void }) {
  const { meId, nameOf, toast } = useApp();
  const [time, setTime] = useState("");
  const [day, setDay] = useState("");
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const needDay = ask.wants !== "time";
  const ready = !!time && (!needDay || !!day);

  async function answer(unsure: boolean) {
    setBusy(true);
    const db = supabaseBrowser();
    const fields = unsure
      ? { status: "unsure", answer_note: note.trim() || null, answered_at: new Date().toISOString() }
      : {
          status: "answered",
          answer_time: time,
          answer_day: day || null,
          answer_until: ask.wants === "range" && until ? until : null,
          answer_note: note.trim() || null,
          answered_at: new Date().toISOString(),
        };
    const { error } = await db.from("time_asks").update(fields).eq("id", ask.id);
    if (error) {
      setBusy(false);
      return toast(error.message);
    }
    if (!unsure) await db.from("posts").insert({ author: meId, kind: "time", time_ask_id: ask.id, text: note.trim() || null });
    notify({ kind: "time", id: ask.id });
    refreshAll();
    toast(unsure ? "Okay, no answer needed yet 🌙" : "Sent ⏰");
    onClose();
  }

  return (
    <Sheet title="⏰ What time?" onClose={onClose}>
      <div className="stack">
        <p style={{ margin: 0 }}>
          <strong>{nameOf(ask.asked_by)}:</strong> {ask.question}
        </p>
        {ask.note && <p className="small muted" style={{ margin: 0 }}>{ask.note}</p>}
        <div className="row wrap" style={{ gap: 10 }}>
          {needDay && (
            <label className="field grow">
              <span>{ask.wants === "range" ? "From" : "Day"}</span>
              <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </label>
          )}
          {ask.wants === "range" && (
            <label className="field grow">
              <span>Until (optional)</span>
              <input className="input" type="date" value={until} min={day || undefined} onChange={(e) => setUntil(e.target.value)} />
            </label>
          )}
          <label className="field grow">
            <span>Time</span>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} autoFocus={!needDay} />
          </label>
        </div>
        <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="a note (optional)" aria-label="Note" />
        <div className="row-between">
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => answer(true)}>
            🤷 Not sure yet
          </button>
          <button className="btn btn-primary" disabled={!ready || busy} onClick={() => answer(false)}>
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** Top of the feed: asks waiting on me, and (quietly) mine waiting on them. */
export function TimeAskCards() {
  const { meId, nameOf } = useApp();
  const asks = useTimeAsks();
  const [open, setOpen] = useState<TimeAsk | null>(null);
  const forMe = asks.filter((a) => a.to_user === meId && a.status === "open");
  const mine = asks.filter((a) => a.asked_by === meId && (a.status === "open" || (a.status === "unsure" && !a.seen_by_asker)));
  if (!forMe.length && !mine.length) return null;
  const db = supabaseBrowser();
  return (
    <div className="stack-sm time-asks">
      {forMe.map((a) => (
        <button key={a.id} className="time-ask-card" onClick={() => setOpen(a)}>
          <span className="time-ask-emoji" aria-hidden>
            ⏰
          </span>
          <span className="grow">
            <strong>{nameOf(a.asked_by)}</strong> · {a.question}
            {a.note && <span className="small faint" style={{ display: "block" }}>{a.note}</span>}
          </span>
          <span className="small">answer ›</span>
        </button>
      ))}
      {mine.map((a) => (
        <div key={a.id} className="time-ask-wait small">
          {a.status === "unsure" ? (
            <>
              <span className="grow">
                🤷 {nameOf(a.to_user)} isn&apos;t sure yet: {a.question.replace(/^What time were you thinking\s*/i, "").replace(/\?$/, "") || "what time"}
                {a.answer_note ? ` · “${a.answer_note}”` : ""}
              </span>
              <button className="btn-link small" onClick={() => db.from("time_asks").update({ seen_by_asker: true }).eq("id", a.id).then(() => refreshAll())}>
                ok
              </button>
            </>
          ) : (
            <>
              <span className="grow faint">
                ⏰ waiting on {nameOf(a.to_user)}: {a.question}
              </span>
              <button className="btn-link small faint" onClick={() => db.from("time_asks").update({ status: "withdrawn" }).eq("id", a.id).then(() => refreshAll())}>
                never mind
              </button>
            </>
          )}
        </div>
      ))}
      {open && <AnswerSheet ask={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Inside a "time" post: the question and the answer, big. */
export function TimeAnswer({ id }: { id: string }) {
  const { nameOf } = useApp();
  const a = useTimeAsks().find((x) => x.id === id);
  if (!a) return null;
  return (
    <div className="time-answer">
      <span className="small faint">
        {nameOf(a.asked_by)} asked: {a.question}
      </span>
      <strong className="time-answer-big">⏰ {answerLine(a)}</strong>
    </div>
  );
}
