"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { ago } from "@/lib/dates";
import { ENERGY_RANK, type Activity, type Checkin, type Energy } from "@/lib/types";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { ActivityForm, EnergyPicker } from "@/components/QuickForms";
import { IconEdit, IconPlus, Mushroom, Sprig, Wavy } from "@/components/Art";

// A check-in counts as "right now" for this long.
const FRESH_MS = 4 * 60 * 60 * 1000;
const ENERGY_EMOJI: Record<Energy, string> = { low: "🛋️", medium: "🚶", high: "⚡" };

type Match = "exact" | "atOrBelow";

export default function DoSomethingPage() {
  const { meId, me, partner, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const [match, setMatch] = useState<Match>("exact");
  const [enteringFor, setEnteringFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<Activity | "new" | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

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

  const results = activities.filter((a) => {
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
      <PageHead eyebrow="Mood & activity matcher" title="Do Something" art={<Mushroom width={36} height={36} />} />
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
            <Sprig /> Things that fit
          </div>
          <div className="seg" role="group" aria-label="Energy match" style={{ marginBottom: 12 }}>
            <button aria-pressed={match === "exact"} onClick={() => setMatch("exact")}>
              Same energy
            </button>
            <button aria-pressed={match === "atOrBelow"} onClick={() => setMatch("atOrBelow")}>
              That or less
            </button>
          </div>
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
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <Mushroom />
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
          Idea library ({activities.length}) {showLibrary ? "▾" : "▸"}
        </button>
        <button className="btn btn-sm" onClick={() => setEditing("new")}>
          <IconPlus width={16} height={16} /> Add
        </button>
      </div>
      {(showLibrary || activities.length === 0) && (
        <div className="card">
          {activities.length === 0 && <p className="muted">No ideas yet. Add things you like doing — low-key stuff counts.</p>}
          {activities.map((a) => (
            <div key={a.id} className="lib-item">
              <span style={{ fontSize: "1.2rem" }}>{ENERGY_EMOJI[a.energy_level]}</span>
              <span className="grow" style={{ fontWeight: 700 }}>
                {a.name}
                <span className="small muted"> · {a.participant ? nameOf(a.participant) : "Both"}</span>
              </span>
              <button className="icon-btn" onClick={() => setEditing(a)} aria-label={`Edit ${a.name}`}>
                <IconEdit />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Sheet title={editing === "new" ? "Activity idea" : "Edit idea"} onClose={() => setEditing(null)}>
          <ActivityForm initial={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
        </Sheet>
      )}
    </main>
  );
}
