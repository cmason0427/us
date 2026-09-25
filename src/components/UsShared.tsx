"use client";

import { useState } from "react";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { addYearly, daysUntil, removeYearly, untilText, yearsAtNext } from "@/lib/annual";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

interface UsDate {
  id: string;
  title: string;
  emoji: string | null;
  on_date: string;
  yearly: boolean;
  note: string | null;
  series_id: string | null;
}
interface DateNote {
  id: string;
  date_id: string;
  author: string;
  text: string;
  created_at: string;
}
interface Person {
  id: string;
  name: string;
  relation: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthday: string | null;
  notes: string | null;
  series_id: string | null;
}

const DATE_EMOJI = ["💞", "💍", "🥂", "🏠", "🐶", "✈️", "🎂", "⭐"];

/**
 * The shared tab: our dates (so nobody has to ask "wait, what's today?") and
 * the people who matter, with how to reach them.
 */
export function UsShared() {
  const supabase = supabaseBrowser();
  const { data: dates = [] } = useLive<UsDate[]>(
    "us_dates",
    async () => {
      const { data, error } = await supabase.from("us_dates").select("*");
      if (error) throw error;
      return data as UsDate[];
    },
    ["us_dates"],
  );
  const { data: notes = [] } = useLive<DateNote[]>(
    "us_date_notes",
    async () => {
      const { data, error } = await supabase.from("us_date_notes").select("*").order("created_at");
      if (error) throw error;
      return data as DateNote[];
    },
    ["us_date_notes"],
  );
  const { data: people = [] } = useLive<Person[]>(
    "people",
    async () => {
      const { data, error } = await supabase.from("people").select("*").order("name");
      if (error) throw error;
      return data as Person[];
    },
    ["people"],
  );
  const [openDate, setOpenDate] = useState<UsDate | "new" | null>(null);
  const [openPerson, setOpenPerson] = useState<Person | "new" | null>(null);

  // Soonest first for yearly ones; one-off dates after, newest first.
  const sorted = [...dates].sort((a, b) => (a.yearly !== b.yearly ? (a.yearly ? -1 : 1) : a.yearly ? daysUntil(a.on_date) - daysUntil(b.on_date) : b.on_date.localeCompare(a.on_date)));
  const liveDate = openDate && openDate !== "new" ? (dates.find((d) => d.id === openDate.id) ?? openDate) : openDate;
  const livePerson = openPerson && openPerson !== "new" ? (people.find((p) => p.id === openPerson.id) ?? openPerson) : openPerson;

  return (
    <div className="stack">
      <section className="lt-card lt-pink">
        <div className="lt-card-head">
          <span className="lt-badge">💞</span>
          <h2>Our dates</h2>
          <button className="icon-btn lt-edit" onClick={() => setOpenDate("new")} aria-label="Add a date">
            ＋
          </button>
        </div>
        {sorted.length ? (
          <ul className="mini-list">
            {sorted.map((d) => {
              const days = d.yearly ? daysUntil(d.on_date) : null;
              const n = notes.filter((x) => x.date_id === d.id).length;
              return (
                <li key={d.id}>
                  <button onClick={() => setOpenDate(d)}>
                    <span className="mini-emoji">{d.emoji ?? "💞"}</span>
                    <span className="grow">
                      <strong>{d.title}</strong>
                      <span className="small muted">
                        {" "}
                        {format(parseISO(d.on_date), d.yearly ? "MMM d, yyyy" : "MMM d, yyyy")}
                        {n > 0 && ` · 💬 ${n}`}
                      </span>
                    </span>
                    {days != null && (
                      <span className={`small ${days < 14 ? "soon" : "faint"}`}>
                        {yearsAtNext(d.on_date) > 0 ? `${yearsAtNext(d.on_date)} yrs ` : ""}
                        {untilText(days)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <button className="lt-empty" onClick={() => setOpenDate("new")}>
            First date, anniversary, got Kodo… 💞
          </button>
        )}
      </section>

      <section className="lt-card lt-sage">
        <div className="lt-card-head">
          <span className="lt-badge">📇</span>
          <h2>Important people</h2>
          <button className="icon-btn lt-edit" onClick={() => setOpenPerson("new")} aria-label="Add a person">
            ＋
          </button>
        </div>
        {people.length ? (
          <ul className="mini-list">
            {people.map((p) => (
              <li key={p.id}>
                <button onClick={() => setOpenPerson(p)}>
                  <span className="grow">
                    <strong>{p.name}</strong>
                    {p.relation && <span className="small muted"> · {p.relation}</span>}
                  </span>
                  {p.birthday && <span className="small faint">🎂 {untilText(daysUntil(p.birthday))}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <button className="lt-empty" onClick={() => setOpenPerson("new")}>
            Moms, the vet, the dog sitter… 📇
          </button>
        )}
      </section>

      {liveDate && (
        <Sheet title={liveDate === "new" ? "💞 A date to remember" : `${liveDate.emoji ?? "💞"} ${liveDate.title}`} onClose={() => setOpenDate(null)}>
          <DateSheet date={liveDate === "new" ? undefined : liveDate} notes={liveDate === "new" ? [] : notes.filter((n) => n.date_id === liveDate.id)} onDone={() => setOpenDate(null)} />
        </Sheet>
      )}
      {livePerson && (
        <Sheet title={livePerson === "new" ? "📇 Someone important" : livePerson.name} onClose={() => setOpenPerson(null)}>
          <PersonSheet person={livePerson === "new" ? undefined : livePerson} onDone={() => setOpenPerson(null)} />
        </Sheet>
      )}
    </div>
  );
}

function DateSheet({ date, notes, onDone }: { date?: UsDate; notes: DateNote[]; onDone: () => void }) {
  const { meId, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const [editing, setEditing] = useState(!date);
  const [f, setF] = useState({ title: date?.title ?? "", emoji: date?.emoji ?? "💞", on_date: date?.on_date ?? "", yearly: date?.yearly ?? true, note: date?.note ?? "" });
  const [onCal, setOnCal] = useState(date ? !!date.series_id : true);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim() || !f.on_date) return;
    setBusy(true);
    const row = { title: f.title.trim(), emoji: f.emoji, on_date: f.on_date, yearly: f.yearly, note: f.note.trim() || null };
    let id = date?.id;
    if (date) {
      const { error } = await supabase.from("us_dates").update(row).eq("id", date.id);
      if (error) return (setBusy(false), toast(error.message));
    } else {
      const { data, error } = await supabase.from("us_dates").insert({ ...row, created_by: meId }).select("id").single();
      if (error) return (setBusy(false), toast(error.message));
      id = data.id;
    }
    // Keep the calendar in step: a yearly date that's "on the calendar" has a series.
    const want = f.yearly && onCal;
    const changed = !!date && (date.on_date !== f.on_date || date.title !== row.title || date.emoji !== row.emoji);
    let series = date?.series_id ?? null;
    if (series && (!want || changed)) {
      await removeYearly(series);
      series = null;
    }
    if (want && !series) series = await addYearly(`${row.emoji ?? ""} ${row.title}`.trim(), f.on_date, meId);
    if (series !== (date?.series_id ?? null)) await supabase.from("us_dates").update({ series_id: series }).eq("id", id!);
    setBusy(false);
    refreshAll();
    if (date) setEditing(false);
    else onDone();
  }
  async function remove() {
    if (!date || !confirm(`Delete "${date.title}"?`)) return;
    if (date.series_id) await removeYearly(date.series_id);
    await supabase.from("us_dates").delete().eq("id", date.id);
    refreshAll();
    onDone();
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !reply.trim()) return;
    const { error } = await supabase.from("us_date_notes").insert({ date_id: date.id, author: meId, text: reply.trim() });
    if (error) return toast(error.message);
    setReply("");
    refreshAll();
  }

  if (!editing && date)
    return (
      <div className="stack">
        <div className="small">
          {format(parseISO(date.on_date), "EEEE, MMMM d, yyyy")}
          <span className="muted">
            {" · "}
            {date.yearly ? `${yearsAtNext(date.on_date)} years ${untilText(daysUntil(date.on_date))}` : formatDistanceToNowStrict(parseISO(date.on_date), { addSuffix: true })}
          </span>
        </div>
        {date.series_id && <div className="small faint">📅 On the calendar every year</div>}
        {date.note && <p style={{ whiteSpace: "pre-wrap" }}>{date.note}</p>}
        <div className="note-thread">
          {notes.map((n) => (
            <div key={n.id} className="note-line">
              <strong className="small">{n.author === meId ? "You" : nameOf(n.author)}</strong>
              <span className="grow">{n.text}</span>
              {n.author === meId && (
                <button
                  className="lt-x"
                  aria-label="Delete note"
                  onClick={async () => {
                    await supabase.from("us_date_notes").delete().eq("id", n.id);
                    refreshAll();
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <form className="quick-add" onSubmit={addNote}>
            <input className="input grow" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Leave a note…" aria-label="Note" />
            <button className="btn btn-sm" disabled={!reply.trim()}>
              Add
            </button>
          </form>
        </div>
        <div className="row-between">
          <button className="btn btn-ghost btn-sm" onClick={remove}>
            Delete
          </button>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      </div>
    );

  return (
    <form className="stack" onSubmit={save}>
      <div className="chips">
        {DATE_EMOJI.map((e) => (
          <button key={e} type="button" className="chip chip-sm" aria-pressed={f.emoji === e} onClick={() => setF({ ...f, emoji: e })}>
            {e}
          </button>
        ))}
      </div>
      <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="First date, anniversary…" autoFocus={!date} required aria-label="What" />
      <input className="input" type="date" value={f.on_date} onChange={(e) => setF({ ...f, on_date: e.target.value })} required aria-label="Date" />
      <label className="toggle-row small">
        <span>Comes around every year</span>
        <input type="checkbox" checked={f.yearly} onChange={(e) => setF({ ...f, yearly: e.target.checked })} />
      </label>
      {f.yearly && (
        <label className="toggle-row small">
          <span>Put it on the calendar every year</span>
          <input type="checkbox" checked={onCal} onChange={(e) => setOnCal(e.target.checked)} />
        </label>
      )}
      <textarea className="textarea" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="The story (optional)" aria-label="Story" />
      <button className="btn btn-primary btn-block" disabled={busy || !f.title.trim() || !f.on_date}>
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function PersonSheet({ person, onDone }: { person?: Person; onDone: () => void }) {
  const { meId, toast } = useApp();
  const supabase = supabaseBrowser();
  const [editing, setEditing] = useState(!person);
  const blank = { name: "", relation: "", phone: "", email: "", address: "", birthday: "", notes: "" };
  const [f, setF] = useState(person ? { ...blank, ...Object.fromEntries(Object.entries(person).map(([k, v]) => [k, v ?? ""])) } : blank);
  const [onCal, setOnCal] = useState(person ? !!person.series_id : true);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blank, v: string) => setF({ ...f, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setBusy(true);
    const row = {
      name: f.name.trim(),
      relation: f.relation.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      address: f.address.trim() || null,
      birthday: f.birthday || null,
      notes: f.notes.trim() || null,
    };
    let id = person?.id;
    if (person) {
      const { error } = await supabase.from("people").update(row).eq("id", person.id);
      if (error) return (setBusy(false), toast(error.message));
    } else {
      const { data, error } = await supabase.from("people").insert({ ...row, created_by: meId }).select("id").single();
      if (error) return (setBusy(false), toast(error.message));
      id = data.id;
    }
    const want = !!row.birthday && onCal;
    const changed = !!person && (person.birthday !== row.birthday || person.name !== row.name);
    let series = person?.series_id ?? null;
    if (series && (!want || changed)) {
      await removeYearly(series);
      series = null;
    }
    if (want && !series) series = await addYearly(`🎂 ${row.name}'s birthday`, row.birthday!, meId);
    if (series !== (person?.series_id ?? null)) await supabase.from("people").update({ series_id: series }).eq("id", id!);
    setBusy(false);
    refreshAll();
    if (person) setEditing(false);
    else onDone();
  }
  async function remove() {
    if (!person || !confirm(`Remove ${person.name}?`)) return;
    if (person.series_id) await removeYearly(person.series_id);
    await supabase.from("people").delete().eq("id", person.id);
    refreshAll();
    onDone();
  }

  if (!editing && person)
    return (
      <div className="stack-sm">
        {person.relation && <div className="small muted">{person.relation}</div>}
        <dl className="about-prompts">
          {person.phone && (
            <div>
              <dt>Phone</dt>
              <dd>
                <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}>{person.phone}</a>
              </dd>
            </div>
          )}
          {person.email && (
            <div>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${person.email}`}>{person.email}</a>
              </dd>
            </div>
          )}
          {person.address && (
            <div>
              <dt>Address</dt>
              <dd>
                <a href={`https://maps.apple.com/?q=${encodeURIComponent(person.address)}`} target="_blank" rel="noreferrer">
                  {person.address}
                </a>
              </dd>
            </div>
          )}
          {person.birthday && (
            <div>
              <dt>Birthday</dt>
              <dd>
                {format(parseISO(person.birthday), "MMM d, yyyy")} <span className="muted">· {untilText(daysUntil(person.birthday))}</span>
                {person.series_id && <span className="faint"> · 📅</span>}
              </dd>
            </div>
          )}
        </dl>
        {person.notes && <p style={{ whiteSpace: "pre-wrap" }}>{person.notes}</p>}
        <div className="row-between">
          <button className="btn btn-ghost btn-sm" onClick={remove}>
            Remove
          </button>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      </div>
    );

  return (
    <form className="stack" onSubmit={save}>
      <div className="lt-form">
        <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Name" required autoFocus={!person} aria-label="Name" />
        <input className="input" value={f.relation} onChange={(e) => set("relation", e.target.value)} placeholder="Who (Parker's mom, vet…)" aria-label="Relation" />
        <input className="input" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone" aria-label="Phone" />
        <input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="Email" aria-label="Email" />
      </div>
      <input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Address" aria-label="Address" />
      <label className="field">
        <span>Birthday</span>
        <input className="input" type="date" value={f.birthday} onChange={(e) => set("birthday", e.target.value)} />
      </label>
      {f.birthday && (
        <label className="toggle-row small">
          <span>Birthday on the calendar every year</span>
          <input type="checkbox" checked={onCal} onChange={(e) => setOnCal(e.target.checked)} />
        </label>
      )}
      <textarea className="textarea" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes (allergies, gift ideas, kids' names…)" aria-label="Notes" />
      <button className="btn btn-primary btn-block" disabled={busy || !f.name.trim()}>
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
