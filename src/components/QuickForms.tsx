"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { celebrate } from "@/lib/celebrate";
import { fromInputs, toDateInput, toTimeInput } from "@/lib/dates";
import type { Activity, Energy, ListType, PottyKind, Urgency } from "@/lib/types";
import { useApp } from "./AppProvider";

const URGENCIES: Urgency[] = ["low", "medium", "high"];
const ENERGIES: { v: Energy; label: string; emoji: string }[] = [
  { v: "low", label: "Low", emoji: "🛋️" },
  { v: "medium", label: "Medium", emoji: "🚶" },
  { v: "high", label: "High", emoji: "⚡" },
];

export function UrgencyPicker({ value, onChange }: { value: Urgency; onChange: (u: Urgency) => void }) {
  return (
    <div className="seg" role="group" aria-label="Urgency">
      {URGENCIES.map((u) => (
        <button key={u} type="button" aria-pressed={value === u} onClick={() => onChange(u)}>
          {u === "high" ? "🔥 High" : u === "medium" ? "Medium" : "No rush"}
        </button>
      ))}
    </div>
  );
}

/* ─── To-do / household ─────────────────────────────────────────────────── */

export function TaskForm({ listType: initialList = "shared", onDone }: { listType?: ListType; onDone: () => void }) {
  const { meId, partner, toast } = useApp();
  const [title, setTitle] = useState("");
  const [list, setList] = useState<ListType>(initialList);
  const [urgency, setUrgency] = useState<Urgency>("low");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabaseBrowser()
      .from("tasks")
      .insert({ title: title.trim(), list_type: list, owner: list === "personal" ? meId : null, urgency, created_by: meId });
    setBusy(false);
    if (error) return toast(error.message);
    refreshAll();
    toast(list === "personal" ? "Added to your list" : list === "household" ? "Added to household" : "Added to our list");
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" autoFocus required />
      <div className="field">
        <span>Which list</span>
        <div className="seg" role="group">
          <button type="button" aria-pressed={list === "personal"} onClick={() => setList("personal")}>
            Just mine
          </button>
          <button type="button" aria-pressed={list === "shared"} onClick={() => setList("shared")}>
            Shared
          </button>
          <button type="button" aria-pressed={list === "household"} onClick={() => setList("household")}>
            Household
          </button>
        </div>
        <p className="small muted">
          {list === "personal"
            ? `Private — ${partner?.display_name ?? "they"} can't see this.`
            : list === "household"
              ? "Needs doing at some point. No pressure."
              : "Either of you can check it off."}
        </p>
      </div>
      <div className="field">
        <span>Urgency</span>
        <UrgencyPicker value={urgency} onChange={setUrgency} />
      </div>
      <button className="btn btn-primary btn-block" disabled={busy || !title.trim()}>
        Add it
      </button>
    </form>
  );
}

/* ─── Kodo ──────────────────────────────────────────────────────────────── */

export function PottyForm({ onDone }: { onDone: () => void }) {
  const { meId, toast } = useApp();
  const [when, setWhen] = useState<"now" | "earlier">("now");
  const now = new Date();
  const [date, setDate] = useState(toDateInput(now));
  const [time, setTime] = useState(toTimeInput(now));
  const [busy, setBusy] = useState(false);

  async function log(kind: PottyKind, el: HTMLElement) {
    setBusy(true);
    const occurred_at = when === "now" ? new Date().toISOString() : fromInputs(date, time).toISOString();
    const { error } = await supabaseBrowser().from("kodo_logs").insert({ type: "potty", potty_kind: kind, occurred_at, created_by: meId });
    setBusy(false);
    if (error) return toast(error.message);
    refreshAll();
    celebrate(el, ["🐾", "🦴", "🌼", "✨"]);
    toast(kind === "pee" ? "Pee logged 💧" : kind === "poop" ? "Poop logged 💩" : "Both logged 🐾");
    onDone();
  }

  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="When">
        <button type="button" aria-pressed={when === "now"} onClick={() => setWhen("now")}>
          Just now
        </button>
        <button type="button" aria-pressed={when === "earlier"} onClick={() => setWhen("earlier")}>
          Earlier…
        </button>
      </div>
      {when === "earlier" && (
        <div className="grid-2">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
        </div>
      )}
      <div className="tiles">
        <button className="tile" disabled={busy} onClick={(e) => log("pee", e.currentTarget)}>
          <span className="tile-emoji">💧</span>Pee
        </button>
        <button className="tile" disabled={busy} onClick={(e) => log("poop", e.currentTarget)}>
          <span className="tile-emoji">💩</span>Poop
        </button>
        <button className="tile" disabled={busy} onClick={(e) => log("both", e.currentTarget)}>
          <span className="tile-emoji">🐾</span>Both
        </button>
      </div>
    </div>
  );
}

export function KodoNoteForm({ onDone }: { onDone: () => void }) {
  const { meId, toast } = useApp();
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail.trim()) return;
    setBusy(true);
    const { error } = await supabaseBrowser().from("kodo_logs").insert({ type: "note", detail: detail.trim(), created_by: meId });
    setBusy(false);
    if (error) return toast(error.message);
    refreshAll();
    toast("Noted 🐾");
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <textarea className="textarea" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Upset tummy today, extra zoomies, ate grass again…" autoFocus rows={3} />
      <button className="btn btn-primary btn-block" disabled={busy || !detail.trim()}>
        Save note
      </button>
    </form>
  );
}

/* ─── Activities ────────────────────────────────────────────────────────── */

export function EnergyPicker({ value, onChange, big = false }: { value: Energy | null; onChange: (e: Energy, el: HTMLElement) => void; big?: boolean }) {
  if (big) {
    return (
      <div className="tiles">
        {ENERGIES.map((en) => (
          <button key={en.v} type="button" className="tile" aria-pressed={value === en.v} onClick={(e) => onChange(en.v, e.currentTarget)}>
            <span className="tile-emoji">{en.emoji}</span>
            {en.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="seg" role="group" aria-label="Energy">
      {ENERGIES.map((en) => (
        <button key={en.v} type="button" aria-pressed={value === en.v} onClick={(e) => onChange(en.v, e.currentTarget)}>
          {en.emoji} {en.label}
        </button>
      ))}
    </div>
  );
}

export function ActivityForm({ initial, onDone }: { initial?: Activity; onDone: () => void }) {
  const { meId, profiles, toast } = useApp();
  const [name, setName] = useState(initial?.name ?? "");
  const [energy, setEnergy] = useState<Energy>(initial?.energy_level ?? "low");
  const [participant, setParticipant] = useState<string | null>(initial ? initial.participant : null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const supabase = supabaseBrowser();
    const row = { name: name.trim(), energy_level: energy, participant };
    const { error } = initial
      ? await supabase.from("activities").update(row).eq("id", initial.id)
      : await supabase.from("activities").insert({ ...row, created_by: meId });
    setBusy(false);
    if (error) return toast(error.message);
    refreshAll();
    toast(initial ? "Saved" : "Added to the library");
    onDone();
  }

  async function remove() {
    if (!initial || !confirm(`Remove "${initial.name}" from the library?`)) return;
    await supabaseBrowser().from("activities").delete().eq("id", initial.id);
    refreshAll();
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Farmers market, puzzle, long walk…" autoFocus={!initial} required />
      <div className="field">
        <span>Energy it takes</span>
        <EnergyPicker value={energy} onChange={setEnergy} />
      </div>
      <div className="field">
        <span>Who it needs</span>
        <div className="seg" role="group">
          {profiles.map((p) => (
            <button key={p.id} type="button" aria-pressed={participant === p.id} onClick={() => setParticipant(p.id)}>
              {p.display_name}
            </button>
          ))}
          <button type="button" aria-pressed={participant === null} onClick={() => setParticipant(null)}>
            Both
          </button>
        </div>
      </div>
      <div className="row-between">
        {initial ? (
          <button type="button" className="btn btn-ghost" onClick={remove}>
            Remove
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          {initial ? "Save" : "Add it"}
        </button>
      </div>
    </form>
  );
}
