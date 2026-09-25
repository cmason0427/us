"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { addYearly, birthdayTitle, daysUntil, removeYearly, untilText, yearsAtNext } from "@/lib/annual";
import { useApp } from "./AppProvider";
import { PersonAvatar } from "./PersonAvatar";
import { Sheet } from "./Sheet";

export interface AboutFact {
  id: string;
  label: string | null;
  text: string;
  section: string | null;
  series_id: string | null;
}

/** The quick-glance bits, dating-profile style. Birthday is a real date so it can count down. */
/** Names beyond the one we use every day. */
const NAMES = [
  { label: "Full / legal name", ph: "As it is on the ID" },
  { label: "Middle name", ph: "" },
];
const BASICS = [
  { label: "Height", icon: "📏", ph: `5'10"` },
  { label: "Star sign", icon: "✨", ph: "Worked out from the birthday" },
  { label: "Hometown", icon: "🏠", ph: "Where they grew up" },
  { label: "Job", icon: "💼", ph: "What they do" },
  { label: "Personality", icon: "🧠", ph: "INFP, Enneagram 4…" },
];
const PROMPTS = [
  { label: "Green flag", ph: "Remembers your coffee order" },
  { label: "The ick", ph: "Loud chewing" },
  { label: "Guaranteed laugh", ph: "Dogs in sweaters" },
  { label: "Simple pleasure", ph: "Clean sheets" },
  { label: "Hidden talent", ph: "Parallel parking" },
  { label: "Don't forget", ph: "Hates surprises" },
];

const SIGNS: [string, string, number, number][] = [
  ["♑", "Capricorn", 1, 19], ["♒", "Aquarius", 2, 18], ["♓", "Pisces", 3, 20], ["♈", "Aries", 4, 19],
  ["♉", "Taurus", 5, 20], ["♊", "Gemini", 6, 20], ["♋", "Cancer", 7, 22], ["♌", "Leo", 8, 22],
  ["♍", "Virgo", 9, 22], ["♎", "Libra", 10, 22], ["♏", "Scorpio", 11, 21], ["♐", "Sagittarius", 12, 21],
];
/** Sun sign from a birthday: the sign runs until its end day, then the next one starts. */
export function starSign(iso: string) {
  const d = parseISO(iso);
  const m = d.getMonth() + 1;
  const i = SIGNS.findIndex(([, , mm, end]) => mm === m && d.getDate() <= end);
  const [icon, name] = i >= 0 ? SIGNS[i] : SIGNS[m % 12];
  return `${icon} ${name}`;
}

const val = (facts: AboutFact[], label: string) => facts.find((f) => f.label === label)?.text ?? "";

export function AboutCard({ personId, facts }: { personId: string; facts: AboutFact[] }) {
  const { meId, nameOf } = useApp();
  const [editing, setEditing] = useState(false);
  const isMe = personId === meId;
  const bday = val(facts, "Birthday");
  const sign = val(facts, "Star sign") || (bday ? starSign(bday) : "");
  // Age from the birthday, then the rest of the quick facts.
  const age = bday ? yearsAtNext(bday) - (daysUntil(bday) === 0 ? 0 : 1) : null;
  const basics = [
    ...(age != null && age > 0 ? [{ label: "Age", icon: "🎈", ph: "", v: String(age) }] : []),
    ...BASICS.map((b) => ({ ...b, v: b.label === "Star sign" ? sign : val(facts, b.label) })).filter((b) => b.v),
  ];
  const prompts = PROMPTS.map((p) => ({ ...p, v: val(facts, p.label) })).filter((p) => p.v);
  const days = bday ? daysUntil(bday) : null;

  return (
    <section className="about-card">
      <div className="about-top">
        <PersonAvatar id={personId} size={52} />
        <div className="grow">
          <div className="about-name">{isMe ? "Me" : nameOf(personId)}</div>
          {(val(facts, "Full / legal name") || val(facts, "Middle name")) && (
            <div className="small muted keep-name">
              {val(facts, "Full / legal name")}
              {val(facts, "Middle name") && !val(facts, "Full / legal name").includes(val(facts, "Middle name")) ? `${val(facts, "Full / legal name") ? " · " : ""}middle: ${val(facts, "Middle name")}` : ""}
            </div>
          )}
          {bday ? (
            <div className="small">
              🎂 {format(parseISO(bday), "MMM d")}
              <span className="muted">
                {" "}
                · turns {yearsAtNext(bday)} {untilText(days!)}
              </span>
            </div>
          ) : (
            <div className="small faint">No birthday yet</div>
          )}
        </div>
        <button className="icon-btn icon-btn-sm" onClick={() => setEditing(true)} aria-label="Edit the basics">
          ✏️
        </button>
      </div>
      {basics.length > 0 && (
        <div className="about-chips">
          {basics.map((b) => (
            <span key={b.label} className="about-chip" title={b.label}>
              {b.label === "Star sign" ? "" : `${b.icon} `}
              {b.v}
            </span>
          ))}
        </div>
      )}
      {prompts.length > 0 && (
        <dl className="about-prompts">
          {prompts.map((p) => (
            <div key={p.label}>
              <dt>{p.label}</dt>
              <dd>{p.v}</dd>
            </div>
          ))}
        </dl>
      )}
      {!basics.length && !prompts.length && !bday && (
        <button className="lt-empty" onClick={() => setEditing(true)}>
          Birthday, height, star sign, the ick… ✏️
        </button>
      )}
      {editing && (
        <Sheet title={isMe ? "About me" : `About ${nameOf(personId)}`} onClose={() => setEditing(false)}>
          <AboutForm personId={personId} facts={facts} onDone={() => setEditing(false)} />
        </Sheet>
      )}
    </section>
  );
}

function AboutForm({ personId, facts, onDone }: { personId: string; facts: AboutFact[]; onDone: () => void }) {
  const { meId, nameOf, toast } = useApp();
  const labels = [...NAMES.map((n) => n.label), "Birthday", ...BASICS.map((b) => b.label), ...PROMPTS.map((p) => p.label)];
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(labels.map((l) => [l, val(facts, l)])));
  const bdayFact = facts.find((f) => f.label === "Birthday");
  const [onCal, setOnCal] = useState(bdayFact ? !!bdayFact.series_id : true);
  const [busy, setBusy] = useState(false);
  const who = personId === meId ? "My" : `${nameOf(personId)}'s`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = supabaseBrowser();
    for (const l of labels) {
      const text = (v[l] ?? "").trim();
      const had = facts.find((f) => f.label === l);
      if (had && !text) await supabase.from("little_things").delete().eq("id", had.id);
      else if (had && text !== had.text) await supabase.from("little_things").update({ text }).eq("id", had.id);
      else if (!had && text) await supabase.from("little_things").insert({ about_user: personId, author: meId, kind: "fact", section: "about", label: l, text });
    }
    // Birthday on the calendar: redo it if the date changed, add or take it off per the toggle.
    const bday = (v.Birthday ?? "").trim();
    const { data: row } = await supabase.from("little_things").select("id, text, series_id").eq("about_user", personId).eq("section", "about").eq("label", "Birthday").maybeSingle();
    const oldSeries = bdayFact?.series_id ?? null;
    const dateChanged = !!bdayFact && bdayFact.text !== bday;
    if (oldSeries && (!onCal || dateChanged || !bday)) await removeYearly(oldSeries);
    if (row && bday && onCal && (!oldSeries || dateChanged)) {
      const id = await addYearly(birthdayTitle(nameOf(personId), Number(bday.slice(0, 4))), bday, meId);
      await supabase.from("little_things").update({ series_id: id }).eq("id", row.id);
    } else if (row && oldSeries && (!onCal || dateChanged)) {
      await supabase.from("little_things").update({ series_id: null }).eq("id", row.id);
    }
    setBusy(false);
    refreshAll();
    toast("Saved 💝");
    onDone();
  }

  const input = (l: string, ph: string) => (
    <label key={l} className="field">
      <span>{l}</span>
      <input className="input" value={v[l] ?? ""} placeholder={ph} onChange={(e) => setV({ ...v, [l]: e.target.value })} />
    </label>
  );
  return (
    <form className="stack" onSubmit={save}>
      <div className="lt-form">{NAMES.map((n) => input(n.label, n.ph))}</div>
      <div className="lt-form">
        <label className="field">
          <span>Birthday</span>
          <input className="input" type="date" value={v.Birthday ?? ""} onChange={(e) => setV({ ...v, Birthday: e.target.value })} />
        </label>
        {BASICS.map((b) => input(b.label, b.label === "Star sign" && v.Birthday ? starSign(v.Birthday) : b.ph))}
      </div>
      {v.Birthday && (
        <label className="toggle-row small">
          <span>{who} birthday on the calendar every year</span>
          <input type="checkbox" checked={onCal} onChange={(e) => setOnCal(e.target.checked)} />
        </label>
      )}
      <div className="lt-form">{PROMPTS.map((p) => input(p.label, p.ph))}</div>
      <p className="small muted">Leave anything blank. Only what&apos;s filled in shows.</p>
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
