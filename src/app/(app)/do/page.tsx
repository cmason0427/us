"use client";

import { DogPic } from "@/components/DogPic";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { ago } from "@/lib/dates";
import { ENERGY_RANK, type Activity, type Checkin, type Energy } from "@/lib/types";
import { COST_OPTIONS, DURATION_OPTIONS, KEEP_OPTIONS, NO_FILTERS, SETTING_OPTIONS, isActive, labelOf, matchesFilters, type ActivityFilters } from "@/lib/activity";
import { BatchAdd, type BatchColumn, type BatchRow } from "@/components/BatchAdd";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { ActivityForm, EnergyPicker } from "@/components/QuickForms";
import { IconEdit, IconPlus, Wavy } from "@/components/Art";

// A check-in counts as "right now" for this long.
const FRESH_MS = 4 * 60 * 60 * 1000;
const ENERGY_EMOJI: Record<Energy, string> = { low: "🛋️", medium: "🚶", high: "⚡" };

function FilterRow<T extends string>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T | null; onChange: (v: T | null) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.v} className="chip" aria-pressed={value === o.v} onClick={() => onChange(value === o.v ? null : o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Optional filters: nothing picked = everything. Tap a chip again to clear it. */
function Filters({ value, onChange }: { value: ActivityFilters; onChange: (f: ActivityFilters) => void }) {
  const any = value.setting || value.cost || value.duration;
  return (
    <div className="stack-sm" style={{ marginBottom: 12 }}>
      <FilterRow options={SETTING_OPTIONS.map((o) => ({ v: o.v, label: o.filter }))} value={value.setting} onChange={(setting) => onChange({ ...value, setting })} />
      <FilterRow options={COST_OPTIONS} value={value.cost} onChange={(cost) => onChange({ ...value, cost })} />
      <FilterRow options={DURATION_OPTIONS} value={value.duration} onChange={(duration) => onChange({ ...value, duration })} />
      {any && (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => onChange(NO_FILTERS)}>
          Clear filters
        </button>
      )}
    </div>
  );
}

function Tags({ a }: { a: Activity }) {
  return (
    <>
      {a.setting && <span className="sticker">{labelOf(SETTING_OPTIONS, a.setting)}</span>}
      {a.cost && <span className="sticker">{labelOf(COST_OPTIONS, a.cost)}</span>}
      {a.duration && <span className="sticker">{labelOf(DURATION_OPTIONS, a.duration)}</span>}
    </>
  );
}

type Match = "exact" | "atOrBelow";

export default function DoSomethingPage() {
  const { meId, me, partner, profiles, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const [match, setMatch] = useState<Match>("exact");
  const [enteringFor, setEnteringFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<Activity | "new" | "batch" | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [filters, setFilters] = useState<ActivityFilters>(NO_FILTERS);

  const { data: activities = [] } = useLive<Activity[]>(
    "activities",
    async () => {
      const { data, error } = await supabase.from("activities").select("*").order("name");
      if (error) throw error;
      return data as Activity[];
    },
    ["activities"],
  );

  const { data: checkins = [] } = useLive<Checkin[]>(
    "checkins:fresh",
    async () => {
      const { data, error } = await supabase
        .from("checkins")
        .select("*")
        .gte("created_at", new Date(Date.now() - FRESH_MS).toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Checkin[];
    },
    ["checkins"],
  );

  const latest = (uid?: string) => checkins.find((c) => c.user_id === uid);
  const mine = latest(meId);
  const theirs = latest(partner?.id);

  async function checkIn(userId: string, energy: Energy, el: HTMLElement) {
    const { error } = await supabase.from("checkins").insert({ user_id: userId, energy, entered_by: meId });
    if (error) return toast(error.message);
    celebrate(el, ["✨", "🌿", "🍄"]);
    setEnteringFor(null);
    refreshAll();
  }

  async function ping() {
    const res = await notify({ kind: "energy_request" });
    toast(res.sent ? `Asked ${partner?.display_name} 🔋` : `${partner?.display_name} hasn't turned on notifications yet`);
  }

  // Who's "here": everyone with a fresh check-in.
  const energyOf = new Map<string, Energy>();
  if (mine) energyOf.set(meId, mine.energy);
  if (theirs && partner) energyOf.set(partner.id, theirs.energy);

  const fits = (need: Energy, have: Energy) => (match === "exact" ? need === have : ENERGY_RANK[need] <= ENERGY_RANK[have]);

  const active = activities.filter(isActive);
  const doneOnes = activities.filter((a) => !isActive(a));

  // One-time ideas can be checked off; they drop out of suggestions (undo from Done).
  async function markDone(a: Activity, done: boolean, el?: HTMLElement) {
    const { error } = await supabase
      .from("activities")
      .update({ done_at: done ? new Date().toISOString() : null, done_by: done ? meId : null })
      .eq("id", a.id);
    if (error) return toast(error.message);
    if (done && el) celebrate(el, ["✅", "✨", "🌿"]);
    refreshAll();
    toast(done ? `Done: ${a.name}` : "Back on the list");
  }

  const batchColumns: BatchColumn[] = [
    { key: "energy", label: "Energy", required: true, initial: "low", options: [{ v: "low", label: "🛋️ Low" }, { v: "medium", label: "🚶 Medium" }, { v: "high", label: "⚡ High" }] },
    { key: "who", label: "Who", required: true, initial: "both", options: [{ v: "both", label: "Both" }, ...profiles.map((p) => ({ v: p.id, label: p.display_name }))] },
    { key: "keep", label: "Keep it?", required: true, initial: "keep", options: KEEP_OPTIONS },
    { key: "setting", label: "Where", options: SETTING_OPTIONS },
    { key: "cost", label: "Cost", options: COST_OPTIONS },
    { key: "duration", label: "How long", options: DURATION_OPTIONS },
  ];
  async function saveBatch(rows: BatchRow[]) {
    const { error } = await supabase.from("activities").insert(
      rows.map((r) => ({
        name: r.name,
        energy_level: r.values.energy,
        participant: r.values.who === "both" ? null : r.values.who,
        recurring: r.values.keep !== "once",
        setting: r.values.setting,
        cost: r.values.cost,
        duration: r.values.duration,
        created_by: meId,
      })),
    );
    if (error) return error.message;
    refreshAll();
    toast(`Added ${rows.length} idea${rows.length === 1 ? "" : "s"} ✨`);
    setEditing(null);
    return null;
  }

  const results = active.filter((a) => {
    if (!matchesFilters(a, filters)) return false;
    if (a.participant) {
      const e = energyOf.get(a.participant);
      return e !== undefined && fits(a.energy_level, e);
    }
    // Needs both: both must have checked in; the lower energy sets the bar.
    if (energyOf.size < 2) return false;
    const low = [...energyOf.values()].sort((x, y) => ENERGY_RANK[x] - ENERGY_RANK[y])[0];
    return fits(a.energy_level, low);
  });

  const anyCheckin = energyOf.size > 0;

  return (
    <main className="page">
      <PageHead eyebrow="Mood & activity matcher" title="Do Something" art={<DogPic name="kodo_run" size={44} />} />
      <Wavy className="terracotta" />

      {/* ─── Check-in ─── */}
      <section className="stack">
        {!mine || enteringFor === meId ? (
          <div className="card stack">
            <div className="row-between">
              <h2>How&apos;s your energy{me ? `, ${me.display_name}` : ""}?</h2>
              {mine && (
                <button className="btn btn-ghost btn-sm" onClick={() => setEnteringFor(null)}>
                  Cancel
                </button>
              )}
            </div>
            <EnergyPicker big value={null} onChange={(e, el) => checkIn(meId, e, el)} />
          </div>
        ) : null}

        {partner && enteringFor === partner.id && (
          <div className="card stack">
            <div className="row-between">
              <h2>{partner.display_name}&apos;s energy?</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setEnteringFor(null)}>
                Cancel
              </button>
            </div>
            <EnergyPicker big value={null} onChange={(e, el) => checkIn(partner.id, e, el)} />
          </div>
        )}

        {mine && enteringFor === null && (
          <div className="checkin-status">
            <button className="card checkin-pill" onClick={() => setEnteringFor(meId)} style={{ cursor: "pointer" }}>
              <span style={{ fontSize: "1.6rem" }}>{ENERGY_EMOJI[mine.energy]}</span>
              <span className="grow" style={{ textAlign: "left" }}>
                <span className="who">{nameOf(meId)}</span>
                <br />
                <span className="small muted">
                  {mine.energy} · {ago(mine.created_at)}
                </span>
              </span>
            </button>
            {partner && theirs && (
              <button className="card checkin-pill" onClick={() => setEnteringFor(partner.id)} style={{ cursor: "pointer" }}>
                <span style={{ fontSize: "1.6rem" }}>{ENERGY_EMOJI[theirs.energy]}</span>
                <span className="grow" style={{ textAlign: "left" }}>
                  <span className="who">{partner.display_name}</span>
                  <br />
                  <span className="small muted">
                    {theirs.energy} · {ago(theirs.created_at)}
                  </span>
                </span>
              </button>
            )}
          </div>
        )}

        {mine && partner && !theirs && enteringFor === null && (
          <div className="card row-between wrap">
            <span style={{ fontWeight: 700 }}>Get {partner.display_name}&apos;s too?</span>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setEnteringFor(partner.id)}>
                They&apos;re here
              </button>
              <button className="btn btn-sm btn-butter" onClick={ping}>
                Ping them
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─── Results ─── */}
      {anyCheckin && (
        <section>
          <div className="section-title">
            <DogPic name="wiley_walk" size={28} /> Things that fit
          </div>
          <div className="seg" role="group" aria-label="Energy match" style={{ marginBottom: 12 }}>
            <button aria-pressed={match === "exact"} onClick={() => setMatch("exact")}>
              Same energy
            </button>
            <button aria-pressed={match === "atOrBelow"} onClick={() => setMatch("atOrBelow")}>
              That or less
            </button>
          </div>
          <Filters value={filters} onChange={setFilters} />
          {results.length ? (
            <div className="activity-grid">
              {results.map((a) => (
                <div key={a.id} className="card activity-card">
                  <div className="name">{a.name}</div>
                  <div className="row wrap" style={{ marginTop: "auto" }}>
                    <span className="sticker sage">
                      {ENERGY_EMOJI[a.energy_level]} {a.energy_level}
                    </span>
                    <span className="sticker">{a.participant ? nameOf(a.participant) : "Both"}</span>
                    <Tags a={a} />
                  </div>
                  {!a.recurring && (
                    <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={(e) => markDone(a, true, e.currentTarget)}>
                      ✅ We did it
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <DogPic name="kodo_down" size={110} />
              <p className="display">Nothing matches that exactly.</p>
              {match === "exact" ? (
                <button className="btn btn-sm" onClick={() => setMatch("atOrBelow")}>
                  Include lower-energy ideas
                </button>
              ) : (
                <p>Add a few more ideas to the library below.</p>
              )}
            </div>
          )}
          {energyOf.size < 2 && partner && activities.some((a) => !a.participant) && (
            <p className="small muted" style={{ marginTop: 10 }}>
              Ideas for both of you show up once {partner.display_name} checks in too.
            </p>
          )}
        </section>
      )}

      {/* ─── Library ─── */}
      <div className="section-title" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-ghost" style={{ padding: 0, fontFamily: "var(--font-display)", fontSize: "1.15rem" }} onClick={() => setShowLibrary((s) => !s)}>
          Idea library ({active.length}) {showLibrary ? "▾" : "▸"}
        </button>
        <div className="row">
          <button className="btn btn-sm btn-ghost" onClick={() => setEditing("batch")}>
            Add several
          </button>
          <button className="btn btn-sm" onClick={() => setEditing("new")}>
            <IconPlus width={16} height={16} /> Add
          </button>
        </div>
      </div>
      {(showLibrary || activities.length === 0) && activities.length > 0 && <Filters value={filters} onChange={setFilters} />}
      {(showLibrary || activities.length === 0) && (
        <div className="card">
          {activities.length === 0 && <p className="muted">No ideas yet. Add things you like doing — low-key stuff counts.</p>}
          {active.filter((a) => matchesFilters(a, filters)).map((a) => (
            <div key={a.id} className="lib-item">
              <span style={{ fontSize: "1.2rem" }}>{ENERGY_EMOJI[a.energy_level]}</span>
              <span className="grow" style={{ fontWeight: 700 }}>
                {a.name}
                <span className="small muted">
                  {" "}
                  · {a.participant ? nameOf(a.participant) : "Both"}
                  {[labelOf(SETTING_OPTIONS, a.setting), labelOf(COST_OPTIONS, a.cost), labelOf(DURATION_OPTIONS, a.duration)]
                    .filter(Boolean)
                    .map((l) => ` · ${l}`)
                    .join("")}
                  {!a.recurring && " · one-time"}
                </span>
              </span>
              {!a.recurring && (
                <button className="icon-btn" onClick={(e) => markDone(a, true, e.currentTarget)} aria-label={`Mark ${a.name} done`}>
                  ✅
                </button>
              )}
              <button className="icon-btn" onClick={() => setEditing(a)} aria-label={`Edit ${a.name}`}>
                <IconEdit />
              </button>
            </div>
          ))}
        </div>
      )}

      {(showLibrary || activities.length === 0) && doneOnes.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowDone((d) => !d)}>
            {showDone ? "▾" : "▸"} Done ({doneOnes.length})
          </button>
          {showDone && (
            <div className="card">
              {doneOnes.map((a) => (
                <div key={a.id} className="lib-item">
                  <span className="grow faint" style={{ textDecoration: "line-through" }}>
                    {a.name}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => markDone(a, false)}>
                    Undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing === "batch" && (
        <Sheet title="Add several ideas" onClose={() => setEditing(null)}>
          <BatchAdd columns={batchColumns} placeholder="Farmers market, puzzle…" noun="ideas" onSave={saveBatch} />
        </Sheet>
      )}
      {editing && editing !== "batch" && (
        <Sheet title={editing === "new" ? "Activity idea" : "Edit idea"} onClose={() => setEditing(null)}>
          <ActivityForm initial={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
        </Sheet>
      )}
    </main>
  );
}
