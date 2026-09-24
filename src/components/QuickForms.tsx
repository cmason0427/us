"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import type { Activity, Cost, Duration, Energy, ListType, Setting, Urgency } from "@/lib/types";
import { COST_OPTIONS, DURATION_OPTIONS, KEEP_OPTIONS, SETTING_OPTIONS } from "@/lib/activity";
import type { Deadline } from "@/lib/deadline";
import { DeadlinePicker } from "./DeadlinePicker";
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
  const [deadline, setDeadline] = useState<Deadline | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabaseBrowser()
      .from("tasks")
      .insert({ title: title.trim(), list_type: list, owner: list === "personal" ? meId : null, urgency, ...(deadline ?? {}), created_by: meId });
    setBusy(false);
    if (error) return toast(error.message);
    refreshAll();
    toast(list === "personal" ? "Added to your list" : list === "household" ? "Added to household" : list === "dogs" ? "Added to dog to-dos" : "Added to our list");
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
          <button type="button" aria-pressed={list === "dogs"} onClick={() => setList("dogs")}>
            Dogs
          </button>
        </div>
        <p className="small muted">
          {list === "personal"
            ? `Private — ${partner?.display_name ?? "they"} can't see this.`
            : list === "household"
              ? "Shows in Household and in Ours."
              : list === "dogs"
                ? "Shows in Dogs and in Ours."
                : "Either of you can check it off."}
        </p>
      </div>
      <div className="field">
        <span>Urgency</span>
        <UrgencyPicker value={urgency} onChange={setUrgency} />
      </div>
      <div className="field">
        <span>Deadline</span>
        <DeadlinePicker value={deadline} onChange={setDeadline} />
        <p className="small muted">If it passes, it jumps to the top as high priority.</p>
      </div>
      <button className="btn btn-primary btn-block" disabled={busy || !title.trim()}>
        Add it
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

/** Pick one or leave it unset ("Any"). */
function OptionalPicker<T extends string>({ label, options, value, onChange }: { label: string; options: { v: T; label: string }[]; value: T | null; onChange: (v: T | null) => void }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" className="chip" aria-pressed={value === o.v} onClick={() => onChange(value === o.v ? null : o.v)}>
          {o.label}
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
  const [setting, setSetting] = useState<Setting | null>(initial?.setting ?? null);
  const [cost, setCost] = useState<Cost | null>(initial?.cost ?? null);
  const [duration, setDuration] = useState<Duration | null>(initial?.duration ?? null);
  const [recurring, setRecurring] = useState(initial?.recurring ?? true);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const supabase = supabaseBrowser();
    const row = { name: name.trim(), energy_level: energy, participant, setting, cost, duration, recurring };
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
      <div className="field">
        <span>Keep it?</span>
        <div className="seg" role="group" aria-label="Keep or one-time">
          {KEEP_OPTIONS.map((o) => (
            <button key={o.v} type="button" aria-pressed={recurring === (o.v === "keep")} onClick={() => setRecurring(o.v === "keep")}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="small muted">{recurring ? "Always stays in the ideas." : "Mark it done and it won't be suggested again."}</p>
      </div>
      <p className="small muted">These are optional; tap again to clear. Unset ones match any filter.</p>
      <div className="field">
        <span>Where</span>
        <OptionalPicker label="Where" options={SETTING_OPTIONS} value={setting} onChange={setSetting} />
      </div>
      <div className="field">
        <span>Cost</span>
        <OptionalPicker label="Cost" options={COST_OPTIONS} value={cost} onChange={setCost} />
      </div>
      <div className="field">
        <span>How long</span>
        <OptionalPicker label="How long" options={DURATION_OPTIONS} value={duration} onChange={setDuration} />
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
