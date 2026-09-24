"use client";

import { useState } from "react";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { describeFilters, type FoodFilters } from "@/lib/food";
import { useMeals, usePlaces } from "@/lib/foodData";
import { WORK_OWNER, needsTakeout, type LunchMsg, type LunchPlace, type LunchRef } from "@/lib/lunch";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { FoodFilterPanel } from "./FoodFilterPanel";
import { FoodResults, useFoodMatches, type FoodPick } from "./FoodResults";

/*
 * Two ways to propose lunch, either way round:
 *   "What I want"  → preferences, which arrive with the options that match.
 *                    The other person picks one (done) or adjusts the
 *                    preferences and sends them back.
 *   "Just pick"    → one specific place/meal. The other person says sounds
 *                    good (done), picks something else, or sends preferences.
 * At home/work you can also ask for a few options. Anything can carry a note.
 */

type Picker =
  | { kind: "pick" } // choose one thing to propose
  | { kind: "prefs"; start?: FoodFilters } // set preferences (optionally from theirs) and send
  | { kind: "options" } // choose a few to send
  | { kind: "choose"; refs: LunchRef[] } // choose one of the options they sent
  | null;

type Send = (kind: LunchMsg["kind"], body: { refs?: LunchRef[]; filters?: FoodFilters | null; note?: string | null }, el?: HTMLElement | null) => void;

const toRef = (p: FoodPick): LunchRef => ({ kind: p.kind, id: p.item.id });

/** Lunch today: where, and a little back-and-forth until it's decided. */
export function LunchWidget() {
  const now = useNow();
  if (!now) return null; // the date is the phone's; wait for the client
  return <Lunch day={format(now, "yyyy-MM-dd")} />;
}

function Lunch({ day }: { day: string }) {
  const { meId, profiles, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const places = usePlaces();
  const meals = useMeals();
  const [picker, setPicker] = useState<Picker>(null);

  const { data: today } = useLive<{ place: LunchPlace | null; set_by: string | null } | null>(
    `lunch_day:${day}`,
    async () => {
      const { data } = await supabase.from("lunch_days").select("place, set_by").eq("day", day).maybeSingle();
      return data;
    },
    ["lunch_days"],
  );
  const { data: msgs = [] } = useLive<LunchMsg[]>(
    `lunch_msgs:${day}`,
    async () => {
      const { data, error } = await supabase.from("lunch_msgs").select("*").eq("day", day).order("created_at");
      if (error) throw error;
      return data as LunchMsg[];
    },
    ["lunch_msgs"],
  );

  const place = today?.place ?? null;
  const latest = msgs[msgs.length - 1];
  const theirTurn = !!latest && latest.author !== meId;
  const workOwner = profiles.find((p) => p.display_name.toLowerCase() === WORK_OWNER.toLowerCase());
  const workLabel = workOwner ? (workOwner.id === meId ? "My work" : `${workOwner.display_name}'s work`) : "Work";
  const refName = (r: LunchRef) => (r.kind === "place" ? places.find((p) => p.id === r.id)?.name : meals.find((m) => m.id === r.id)?.name) ?? "something";

  async function setPlace(p: LunchPlace) {
    const { error } = await supabase.from("lunch_days").upsert({ day, place: p, set_by: meId, updated_at: new Date().toISOString() });
    if (error) return toast(error.message);
    refreshAll();
  }

  const send: Send = async (kind, body, el) => {
    const { data, error } = await supabase
      .from("lunch_msgs")
      .insert({ day, author: meId, kind, refs: body.refs ?? [], filters: body.filters ?? null, note: body.note?.trim() || null })
      .select("id")
      .single();
    if (error) return toast(error.message);
    notify({ kind: "lunch", id: data.id });
    if (kind === "decided" && el) celebrate(el, ["🍽️", "✨", "💛"]);
    setPicker(null);
    refreshAll();
    toast(kind === "decided" ? "Lunch is decided 🍽️" : "Sent");
  };

  const choices: { v: LunchPlace; label: string }[] = [
    { v: "home", label: "🏡 Home" },
    { v: "work", label: `💼 ${workLabel}` },
    { v: "out", label: "🍽️ Out" },
  ];

  const startButtons = (
    <>
      <button className="btn btn-sm" onClick={() => setPicker({ kind: "prefs" })}>
        What I want
      </button>
      <button className="btn btn-sm" onClick={() => setPicker({ kind: "pick" })}>
        Just pick something
      </button>
      {needsTakeout(place) && (
        <button className="btn btn-sm btn-ghost" onClick={() => send("request", {})}>
          Send me options
        </button>
      )}
    </>
  );

  return (
    <section className="card lunch" style={{ marginTop: 16 }}>
      <div className="row-between">
        <strong>Lunch today</strong>
        {today?.set_by && <span className="small faint">set by {today.set_by === meId ? "you" : nameOf(today.set_by)}</span>}
      </div>
      <div className="seg" role="group" aria-label="Where's lunch" style={{ marginTop: 8 }}>
        {choices.map((c) => (
          <button key={c.v} aria-pressed={place === c.v} onClick={() => setPlace(c.v)}>
            {c.label}
          </button>
        ))}
      </div>

      {place && (
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <Thread latest={latest} theirTurn={theirTurn} refName={refName} nameOf={nameOf} />

          {theirTurn && latest.kind === "filters" && latest.filters && (
            <TheirPrefs filters={latest.filters} place={place} onPick={(p, el) => send("decided", { refs: [toRef(p)] }, el)} />
          )}

          <div className="row wrap">
            {!latest || !theirTurn ? (
              latest?.kind === "decided" ? (
                <button className="btn btn-sm" onClick={() => setPicker({ kind: "pick" })}>
                  Change it
                </button>
              ) : (
                startButtons
              )
            ) : latest.kind === "decided" ? (
              <button className="btn btn-sm" onClick={() => setPicker({ kind: "pick" })}>
                Change it
              </button>
            ) : latest.kind === "propose" ? (
              <>
                <button className="btn btn-sm btn-primary" onClick={(e) => send("decided", { refs: latest.refs }, e.currentTarget)}>
                  Sounds good
                </button>
                <button className="btn btn-sm" onClick={() => setPicker({ kind: "pick" })}>
                  Pick something else
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setPicker({ kind: "prefs" })}>
                  Send what I want
                </button>
              </>
            ) : latest.kind === "filters" ? (
              <button className="btn btn-sm" onClick={() => setPicker({ kind: "prefs", start: latest.filters ?? undefined })}>
                Adjust &amp; send back
              </button>
            ) : latest.kind === "request" ? (
              <button className="btn btn-sm btn-primary" onClick={() => setPicker({ kind: "options" })}>
                Send some options
              </button>
            ) : (
              <>
                <button className="btn btn-sm btn-primary" onClick={() => setPicker({ kind: "choose", refs: latest.refs })}>
                  Pick one
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setPicker({ kind: "prefs" })}>
                  Send what I want
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {picker && place && <PickerSheet picker={picker} place={place} refName={refName} onClose={() => setPicker(null)} onSend={send} />}
    </section>
  );
}

function Thread({ latest, theirTurn, refName, nameOf }: { latest: LunchMsg | undefined; theirTurn: boolean; refName: (r: LunchRef) => string; nameOf: (id: string) => string }) {
  if (!latest) return <p className="small muted">Nothing picked yet.</p>;
  const who = theirTurn ? nameOf(latest.author) : "You";
  const list = latest.refs.map(refName).join(", ");
  const text =
    latest.kind === "decided"
      ? `Lunch: ${list} ✅`
      : latest.kind === "propose"
        ? `${who} picked ${list}`
        : latest.kind === "filters"
          ? `${who} want${theirTurn ? "s" : ""}:`
          : latest.kind === "request"
            ? `${who} asked for some options`
            : `${who} sent options: ${list}`;
  return (
    <div className="stack-sm">
      <p className={latest.kind === "decided" ? "lunch-decided" : theirTurn ? "" : "muted"}>
        {text}
        {!theirTurn && latest.kind !== "decided" && <span className="small faint"> · waiting…</span>}
      </p>
      {latest.kind === "filters" && latest.filters && <PrefChips filters={latest.filters} />}
      {latest.note && <p className="lunch-note">“{latest.note}”</p>}
    </div>
  );
}

/** Preferences as a list: "Eating out · $ · Italian · Close". */
function PrefChips({ filters }: { filters: FoodFilters }) {
  const parts = describeFilters(filters).split(" · ");
  return (
    <div className="chips">
      {parts.map((p) => (
        <span key={p} className="sticker sage">
          {p}
        </span>
      ))}
    </div>
  );
}

/** The options that match their preferences, right in the card. Tap one and it's decided. */
function TheirPrefs({ filters, place, onPick }: { filters: FoodFilters; place: LunchPlace; onPick: (p: FoodPick, el: HTMLElement) => void }) {
  const { picks, pantry } = useFoodMatches(filters, "", { takeoutOnly: needsTakeout(place) });
  return (
    <div className="stack-sm">
      <span className="small muted">
        {picks.length} option{picks.length === 1 ? "" : "s"} match. Tap one to settle it:
      </span>
      <FoodResults picks={picks.slice(0, 8)} pantry={pantry} empty="Nothing matches those. Adjust and send back?" onPick={onPick} />
    </div>
  );
}

function PickerSheet({ picker, place, refName, onClose, onSend }: { picker: NonNullable<Picker>; place: LunchPlace; refName: (r: LunchRef) => string; onClose: () => void; onSend: Send }) {
  const takeout = needsTakeout(place);
  const [filters, setFilters] = useState<FoodFilters>(picker.kind === "prefs" && picker.start ? picker.start : { mode: place === "out" ? "out" : "cook" });
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Map<string, LunchRef>>(new Map());
  const { picks, pantry } = useFoodMatches(filters, search, { takeoutOnly: takeout });

  const noteField = (
    <label className="field">
      <span>Add a note (optional)</span>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={picker.kind === "prefs" && picker.start ? "I'll pay, go fancier" : "Craving noodles"} />
    </label>
  );

  if (picker.kind === "choose") {
    return (
      <Sheet title="Pick one" onClose={onClose}>
        <div className="stack-sm">
          {picker.refs.map((r) => (
            <button key={r.id} className="card food-card" onClick={(e) => onSend("decided", { refs: [r] }, e.currentTarget)}>
              <span className="name">{refName(r)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  if (picker.kind === "prefs") {
    return (
      <Sheet title={picker.start ? "Adjust and send back" : "What do you want?"} onClose={onClose}>
        <div className="stack">
          <FoodFilterPanel value={filters} onChange={setFilters} lockMode={place === "out"} takeoutOnly={takeout} />
          {takeout && filters.mode === "out" && <p className="small muted">Only places with takeout, drive-thru or delivery.</p>}
          <p className="small muted">
            They&apos;ll get this list and the {picks.length} option{picks.length === 1 ? "" : "s"} that match.
          </p>
          {noteField}
          <button className="btn btn-primary btn-block" onClick={() => onSend("filters", { filters, note })}>
            Send
          </button>
        </div>
      </Sheet>
    );
  }

  const multi = picker.kind === "options";
  const onPick = (p: FoodPick) => {
    if (!multi) return onSend("propose", { refs: [toRef(p)], note });
    setSelected((s) => {
      const n = new Map(s);
      if (n.has(p.item.id)) n.delete(p.item.id);
      else n.set(p.item.id, toRef(p));
      return n;
    });
  };

  return (
    <Sheet title={multi ? "Send a few options" : "Pick something"} onClose={onClose}>
      <div className="stack">
        {noteField}
        <FoodFilterPanel value={filters} onChange={setFilters} lockMode={place === "out"} takeoutOnly={takeout} />
        {takeout && filters.mode === "out" && <p className="small muted">Only places with takeout, drive-thru or delivery.</p>}
        <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" aria-label="Search" />
        <FoodResults
          picks={picks}
          pantry={pantry}
          selected={multi ? new Set(selected.keys()) : undefined}
          empty="Nothing matches. Add more in Eat, or loosen a filter."
          onPick={onPick}
        />
        {multi && (
          <button className="btn btn-primary btn-block" disabled={!selected.size} onClick={() => onSend("options", { refs: [...selected.values()], filters, note })}>
            Send {selected.size || ""} option{selected.size === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </Sheet>
  );
}
