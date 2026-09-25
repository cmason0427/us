"use client";

import { useState } from "react";
import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { addYearly, addYearlyDates, birthdayTitle, daysUntil, ordinal, removeYearly, untilText, yearsAtNext } from "@/lib/annual";
import { COMMON, MON, ORD, WD, nextDate, ruleText, upcomingDates, type Occasion } from "@/lib/occasions";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { PersonSheet, type Person } from "@/components/UsShared";

const KIND_LABEL: Record<Occasion["kind"], string> = { holiday: "Holidays", birthday: "Birthdays", other: "Other dates" };

/**
 * Holidays and birthdays that aren't ours (coworkers, nieces, Mother's Day):
 * a list to glance at, and each can put itself on the calendar every year.
 */
export default function OccasionsPage() {
  const { meId, toast } = useApp();
  const supabase = supabaseBrowser();
  const { data: list = [] } = useLive<Occasion[]>(
    "occasions",
    async () => {
      const { data, error } = await supabase.from("occasions").select("*");
      if (error) throw error;
      return data as Occasion[];
    },
    ["occasions"],
  );
  const [open, setOpen] = useState<Occasion | "new" | null>(null);
  const [showCommon, setShowCommon] = useState(false);
  const today = startOfDay(new Date());
  const days = (o: Occasion) => differenceInCalendarDays(nextDate(o, today), today);
  const have = new Set(list.map((o) => o.title.toLowerCase()));
  const common = COMMON.filter((c) => !have.has(c.title.toLowerCase()));

  async function quickAdd(c: (typeof COMMON)[number]) {
    const { data, error } = await supabase
      .from("occasions")
      .insert({ ...c, kind: c.kind ?? "holiday", created_by: meId })
      .select("id")
      .single();
    if (error) return toast(error.message);
    const series = await addYearlyDates(`${c.emoji} ${c.title}`, upcomingDates(c), meId);
    if (series) await supabase.from("occasions").update({ series_id: series }).eq("id", data.id);
    refreshAll();
    toast(`${c.emoji} ${c.title} is on the calendar every year`);
  }

  return (
    <main className="page">
      <PageHead eyebrow="Settings" title="Holidays & birthdays" />
      <p className="small muted" style={{ marginTop: 6 }}>
        Other people&apos;s birthdays and the holidays you care about. Ours live in Little things → Us.
      </p>
      <div className="row" style={{ margin: "10px 0" }}>
        <button className="btn btn-sm btn-primary" onClick={() => setOpen("new")}>
          ＋ Add
        </button>
        {common.length > 0 && (
          <button className="btn btn-sm btn-ghost" aria-pressed={showCommon} onClick={() => setShowCommon((s) => !s)}>
            Common holidays
          </button>
        )}
      </div>
      {showCommon && (
        <div className="chips" style={{ marginBottom: 10 }}>
          {common.map((c) => (
            <button key={c.title} className="chip chip-sm" onClick={() => quickAdd(c)}>
              {c.emoji} {c.title}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 && <p className="small muted">Nothing yet.</p>}
      <OurBirthdays />
      {(["birthday", "holiday", "other"] as const).map((k) => {
        const group = list.filter((o) => o.kind === k).sort((a, b) => days(a) - days(b));
        if (!group.length) return null;
        return (
          <div key={k} className="pantry-group" style={{ marginBottom: 10 }}>
            <h3 className="pantry-h">{KIND_LABEL[k]}</h3>
            <ul className="mini-list">
              {group.map((o) => (
                <li key={o.id}>
                  <button onClick={() => setOpen(o)} style={{ border: "1px solid var(--line)" }}>
                    <span className="mini-emoji">{o.emoji ?? "📅"}</span>
                    <span className="grow">
                      <strong>{o.title}</strong>
                      <span className="small faint">
                        {" "}
                        {ruleText(o)}
                        {o.year && nextDate(o, today).getFullYear() > o.year ? ` · ${ordinal(nextDate(o, today).getFullYear() - o.year)}` : ""}
                      </span>
                    </span>
                    <span className={`small ${days(o) < 14 ? "soon" : "faint"}`}>{untilText(days(o))}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {open && (
        <Sheet title={open === "new" ? "A date to remember" : `${open.emoji ?? "📅"} ${open.title}`} onClose={() => setOpen(null)}>
          <OccasionForm initial={open === "new" ? undefined : open} onDone={() => setOpen(null)} />
        </Sheet>
      )}
    </main>
  );
}

function OccasionForm({ initial, onDone }: { initial?: Occasion; onDone: () => void }) {
  const { meId, toast } = useApp();
  const supabase = supabaseBrowser();
  const [f, setF] = useState({
    title: initial?.title ?? "",
    emoji: initial?.emoji ?? "🎂",
    kind: initial?.kind ?? ("birthday" as Occasion["kind"]),
    rule: initial?.rule ?? ("date" as Occasion["rule"]),
    month: initial?.month ?? new Date().getMonth() + 1,
    day: initial?.day ?? new Date().getDate(),
    nth: initial?.nth ?? 1,
    weekday: initial?.weekday ?? 0,
    note: initial?.note ?? "",
    year: initial?.year ? String(initial.year) : "",
  });
  const [onCal, setOnCal] = useState(initial ? !!initial.series_id : true);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const rule = { rule: f.rule, month: f.month, day: f.rule === "date" ? f.day : null, nth: f.rule === "nth" ? f.nth : null, weekday: f.rule === "nth" ? f.weekday : null };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return;
    setBusy(true);
    const year = f.kind === "birthday" && /^\d{4}$/.test(f.year) ? Number(f.year) : null;
    const row = { title: f.title.trim(), emoji: f.emoji || null, kind: f.kind, note: f.note.trim() || null, year, ...rule };
    let id = initial?.id;
    if (initial) {
      const { error } = await supabase.from("occasions").update(row).eq("id", initial.id);
      if (error) return (setBusy(false), toast(error.message));
    } else {
      const { data, error } = await supabase.from("occasions").insert({ ...row, created_by: meId }).select("id").single();
      if (error) return (setBusy(false), toast(error.message));
      id = data.id;
    }
    const changed = !!initial && (["title", "emoji", "rule", "month", "day", "nth", "weekday", "year"] as const).some((k) => initial[k] !== (row as Record<string, unknown>)[k]);
    let series = initial?.series_id ?? null;
    if (series && (!onCal || changed)) {
      await removeYearly(series);
      series = null;
    }
    // Birthdays with a year get "34th" on each year's calendar entry.
    const title = f.kind === "birthday" ? birthdayTitle(row.title.replace(/'s birthday$|'s bday$/i, ""), year) : `${row.emoji ?? ""} ${row.title}`.trim();
    if (onCal && !series) series = await addYearlyDates(title, upcomingDates(rule), meId);
    if (series !== (initial?.series_id ?? null)) await supabase.from("occasions").update({ series_id: series }).eq("id", id!);
    setBusy(false);
    refreshAll();
    onDone();
  }
  async function remove() {
    if (!initial || !confirm(`Remove ${initial.title}?`)) return;
    if (initial.series_id) await removeYearly(initial.series_id);
    await supabase.from("occasions").delete().eq("id", initial.id);
    refreshAll();
    onDone();
  }

  const next = nextDate(rule);
  return (
    <form className="stack" onSubmit={save}>
      <div className="seg seg-sm" role="group" aria-label="Kind">
        {(["birthday", "holiday", "other"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k, emoji: f.emoji === "🎂" || f.emoji === "🎉" || f.emoji === "📅" ? { birthday: "🎂", holiday: "🎉", other: "📅" }[k] : f.emoji })}>
            {KIND_LABEL[k].replace(/s$/, "").replace("Other date", "Other")}
          </button>
        ))}
      </div>
      <div className="row">
        <input className="input" style={{ width: 56, textAlign: "center" }} value={f.emoji} onChange={(e) => set("emoji", e.target.value.slice(0, 4))} aria-label="Emoji" />
        <input className="input grow" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={f.kind === "birthday" ? "Aunt Jo's birthday" : "Diwali"} required autoFocus={!initial} aria-label="What" />
      </div>
      <div className="seg seg-sm" role="group" aria-label="How it repeats">
        <button type="button" aria-pressed={f.rule === "date"} onClick={() => set("rule", "date")}>
          Same date
        </button>
        <button type="button" aria-pressed={f.rule === "nth"} onClick={() => set("rule", "nth")}>
          A weekday (4th Thu)
        </button>
      </div>
      <div className="row">
        {f.rule === "nth" && (
          <>
            <select className="select select-sm grow" value={f.nth} onChange={(e) => set("nth", Number(e.target.value))} aria-label="Which">
              {ORD.map((o, i) => (
                <option key={o} value={i + 1}>
                  {o}
                </option>
              ))}
            </select>
            <select className="select select-sm grow" value={f.weekday} onChange={(e) => set("weekday", Number(e.target.value))} aria-label="Weekday">
              {WD.map((w, i) => (
                <option key={w} value={i}>
                  {w}
                </option>
              ))}
            </select>
          </>
        )}
        <select className="select select-sm grow" value={f.month} onChange={(e) => set("month", Number(e.target.value))} aria-label="Month">
          {MON.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        {f.rule === "date" && (
          <select className="select select-sm grow" value={f.day} onChange={(e) => set("day", Number(e.target.value))} aria-label="Day">
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        )}
      </div>
      {f.kind === "birthday" && (
        <input className="input input-sm" inputMode="numeric" value={f.year} onChange={(e) => set("year", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Birth year (optional)" aria-label="Birth year" />
      )}
      <p className="small muted">
        Next: {format(next, "EEEE, MMM d, yyyy")}
        {f.kind === "birthday" && /^\d{4}$/.test(f.year) && next.getFullYear() > Number(f.year) && ` · their ${ordinal(next.getFullYear() - Number(f.year))}`}
      </p>
      <label className="toggle-row small">
        <span>On the calendar every year</span>
        <input type="checkbox" checked={onCal} onChange={(e) => setOnCal(e.target.checked)} />
      </label>
      <textarea className="textarea" rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Notes (gift ideas, send a card…)" aria-label="Notes" />
      <div className="row-between">
        {initial ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={remove}>
            Remove
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={busy || !f.title.trim()}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

/**
 * Birthdays that live elsewhere (your profiles in Little things, people in
 * Us), listed here too so every birthday is in one place and editable.
 */
function OurBirthdays() {
  const { nameOf, meId, toast } = useApp();
  const supabase = supabaseBrowser();
  const { data: profileBdays = [] } = useLive<{ id: string; about_user: string; text: string; series_id: string | null }[]>(
    "bdays:profiles",
    async () => {
      const { data, error } = await supabase.from("little_things").select("id, about_user, text, series_id").eq("section", "about").eq("label", "Birthday");
      if (error) throw error;
      return data;
    },
    ["little_things"],
  );
  const { data: people = [] } = useLive<Person[]>(
    "bdays:people",
    async () => {
      const { data, error } = await supabase.from("people").select("*").not("birthday", "is", null);
      if (error) throw error;
      return data as Person[];
    },
    ["people"],
  );
  const [person, setPerson] = useState<Person | null>(null);
  const [mine, setMine] = useState<{ id: string; about_user: string; text: string; series_id: string | null } | null>(null);
  const [date, setDate] = useState("");
  const rows = [
    ...profileBdays.map((b) => ({ key: b.id, name: b.about_user === meId ? "me" : nameOf(b.about_user), iso: b.text, open: () => (setMine(b), setDate(b.text)) })),
    ...people.map((p) => ({ key: p.id, name: p.name, iso: p.birthday!, open: () => setPerson(p) })),
  ].sort((a, b) => daysUntil(a.iso) - daysUntil(b.iso));
  if (!rows.length) return null;
  return (
    <div className="pantry-group" style={{ marginBottom: 10 }}>
      <h3 className="pantry-h">Our people (from Little things)</h3>
      <ul className="mini-list">
        {rows.map((r) => (
          <li key={r.key}>
            <button onClick={r.open}>
              <span className="mini-emoji">🎂</span>
              <span className="grow">
                <strong>{r.name}</strong>
                <span className="small faint"> {format(new Date(r.iso + "T00:00"), "MMM d")}</span>
              </span>
              <span className={`small ${daysUntil(r.iso) < 14 ? "soon" : "faint"}`}>
                turns {yearsAtNext(r.iso)} {untilText(daysUntil(r.iso))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {person && (
        <Sheet title={person.name} onClose={() => setPerson(null)}>
          <PersonSheet person={person} onDone={() => setPerson(null)} />
        </Sheet>
      )}
      {mine && (
        <Sheet title={`${mine.about_user === meId ? "My" : `${nameOf(mine.about_user)}'s`} birthday`} onClose={() => setMine(null)}>
          <form
            className="stack-sm"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!date) return;
              await supabase.from("little_things").update({ text: date }).eq("id", mine.id);
              // Keep the calendar in step with the new date.
              if (mine.series_id && date !== mine.text) {
                await removeYearly(mine.series_id);
                const id = await addYearly(birthdayTitle(nameOf(mine.about_user), Number(date.slice(0, 4))), date, meId);
                await supabase.from("little_things").update({ series_id: id }).eq("id", mine.id);
              }
              refreshAll();
              toast("Saved 🎂");
              setMine(null);
            }}
          >
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Birthday" />
            <button className="btn btn-primary btn-block">Save</button>
          </form>
        </Sheet>
      )}
    </div>
  );
}
