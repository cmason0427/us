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
import { FoodDetailSheet } from "./FoodDetail";

/*
 * Two ways to suggest a meal, either way round:
 *   "What I want"  → preferences, which arrive with the options that match.
 *                    The other person picks one (done) or adjusts the
 *                    preferences and sends them back.
 *   "Just pick"    → one specific place/meal. The other person says sounds
 *                    good (done), picks something else, or sends preferences.
 * Lunch also has a "where" (home / work / out). Breakfast and dinner have no
 * where, and only exist once one of you starts one.
 */

export type Meal = "breakfast" | "lunch" | "dinner";

/**
 * The meal worth thinking about right now, and which day it's for:
 * 9am–1pm lunch, 1pm–9pm dinner, then breakfast (tomorrow's, after 9pm).
 */
export function currentMeal(now: Date): { meal: Meal; day: string } {
  const h = now.getHours();
  if (h >= 9 && h < 13) return { meal: "lunch", day: format(now, "yyyy-MM-dd") };
  if (h >= 13 && h < 21) return { meal: "dinner", day: format(now, "yyyy-MM-dd") };
  const d = new Date(now);
  if (h >= 21) d.setDate(d.getDate() + 1);
  return { meal: "breakfast", day: format(d, "yyyy-MM-dd") };
}

/** Breakfast suggested at night is for tomorrow morning. */
export function dayFor(meal: Meal, now: Date) {
  const d = new Date(now);
  if (meal === "breakfast" && now.getHours() >= 21) d.setDate(d.getDate() + 1);
  return format(d, "yyyy-MM-dd");
}
export const MEAL_LABEL: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };

type Picker =
  | { kind: "pick"; start?: FoodFilters } // choose one thing to propose (optionally starting from their wants)
  | { kind: "prefs"; start?: FoodFilters } // set preferences (optionally from theirs) and send
  | { kind: "options" } // choose a few to send
  | { kind: "choose"; refs: LunchRef[] } // choose one of the options they sent
  | null;

type Send = (kind: LunchMsg["kind"], body: { refs?: LunchRef[]; filters?: FoodFilters | null; note?: string | null }, el?: HTMLElement | null) => void;

const toRef = (p: FoodPick): LunchRef => ({ kind: p.kind, id: p.item.id });

/** Today's thread for one meal: where (lunch only), the messages, and how to reply. */
export function useMealThread(day: string, meal: Meal) {
  const { meId, profiles, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const places = usePlaces();
  const meals = useMeals();

  const { data: today } = useLive<{ place: LunchPlace | null; set_by: string | null } | null>(
    `lunch_day:${day}`,
    async () => {
      const { data } = await supabase.from("lunch_days").select("place, set_by").eq("day", day).maybeSingle();
      return data;
    },
    ["lunch_days"],
  );
  const { data: msgs = [] } = useLive<LunchMsg[]>(
    `lunch_msgs:${day}:${meal}`,
    async () => {
      const { data, error } = await supabase.from("lunch_msgs").select("*").eq("day", day).eq("meal", meal).order("created_at");
      if (error) throw error;
      return data as LunchMsg[];
    },
    ["lunch_msgs"],
  );

  const place = meal === "lunch" ? (today?.place ?? null) : null;
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

  const send = async (kind: LunchMsg["kind"], body: { refs?: LunchRef[]; filters?: FoodFilters | null; note?: string | null }, el?: HTMLElement | null) => {
    const { data, error } = await supabase
      .from("lunch_msgs")
      .insert({ day, meal, author: meId, kind, refs: body.refs ?? [], filters: body.filters ?? null, note: body.note?.trim() || null })
      .select("id")
      .single();
    if (error) {
      toast(error.message);
      return false;
    }
    notify({ kind: "lunch", id: data.id });
    if (kind === "decided" && el) celebrate(el, ["🍽️", "✨", "💛"]);
    refreshAll();
    toast(kind === "decided" ? `${MEAL_LABEL[meal]} is decided 🍽️` : "Sent");
    return true;
  };

  /** One line for the dashboard. */
  const summary = (() => {
    const list = latest?.refs.map(refName).join(", ") ?? "";
    const who = latest ? (theirTurn ? nameOf(latest.author) : "You") : "";
    if (!latest) return meal === "lunch" && place ? `${placeLabel(place, workLabel)}. Nothing picked yet.` : null;
    if (latest.kind === "decided") return `${list} ✅`;
    const turn = theirTurn ? " · your turn" : "";
    if (latest.kind === "propose") return `${who} picked ${list}${turn}`;
    if (latest.kind === "filters") return `${who} sent what ${theirTurn ? "they want" : "you want"}${turn}`;
    if (latest.kind === "request") return `${who} asked for options${turn}`;
    return `${who} sent options: ${list}${turn}`;
  })();

  return { meal, day, place, setBy: today?.set_by ?? null, msgs, latest, theirTurn, workLabel, refName, setPlace, send, summary };
}

export type MealThreadState = ReturnType<typeof useMealThread>;

const placeLabel = (p: LunchPlace, workLabel: string) => (p === "home" ? "🏡 Home" : p === "work" ? `💼 ${workLabel}` : "🍽️ Out");

/** The whole back-and-forth for one meal, with every control. Lives in a sheet off the dashboard. */
export function MealPanel({ t }: { t: MealThreadState }) {
  const { meId, nameOf } = useApp();
  const [picker, setPicker] = useState<Picker>(null);
  const [detail, setDetail] = useState<LunchRef | null>(null);
  const { meal, place, latest, theirTurn, workLabel, refName, setPlace } = t;
  const send: Send = async (kind, body, el) => {
    if (await t.send(kind, body, el)) setPicker(null);
  };
  // Lunch needs a "where" first; breakfast and dinner don't have one.
  const ready = meal !== "lunch" || !!place;

  const choices = (["home", "work", "out"] as LunchPlace[]).map((v) => ({ v, label: placeLabel(v, workLabel) }));

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
    <div className="stack-sm lunch">
      {meal === "lunch" && (
        <>
          <div className="row-between">
            <span className="small muted">Where?</span>
            {t.setBy && <span className="small faint">set by {t.setBy === meId ? "you" : nameOf(t.setBy)}</span>}
          </div>
          <div className="seg" role="group" aria-label="Where's lunch">
            {choices.map((c) => (
              <button key={c.v} aria-pressed={place === c.v} onClick={() => setPlace(c.v)}>
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}

      {ready && (
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <Thread latest={latest} theirTurn={theirTurn} refName={refName} nameOf={nameOf} onOpen={setDetail} />

          {theirTurn && latest.kind === "filters" && latest.filters && (
            <TheirPrefs filters={latest.filters} place={place} onPick={(p) => send("propose", { refs: [toRef(p)] })} />
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
              <>
                <button className="btn btn-sm btn-primary" onClick={() => setPicker({ kind: "pick", start: latest.filters ?? undefined })}>
                  Suggest something
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setPicker({ kind: "prefs", start: latest.filters ?? undefined })}>
                  Adjust &amp; send back
                </button>
              </>
            ) : latest.kind === "request" ? (
              <>
                <button className="btn btn-sm btn-primary" onClick={() => setPicker({ kind: "pick" })}>
                  Suggest something
                </button>
                <button className="btn btn-sm" onClick={() => setPicker({ kind: "options" })}>
                  Send a few options
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-sm btn-primary" onClick={() => setPicker({ kind: "choose", refs: latest.refs })}>
                  Pick one
                </button>
                <button className="btn btn-sm" onClick={() => setPicker({ kind: "pick" })}>
                  Suggest something else
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setPicker({ kind: "prefs" })}>
                  Send what I want
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {picker && ready && <PickerSheet picker={picker} meal={meal} place={place} refName={refName} onClose={() => setPicker(null)} onSend={send} />}
      {detail && <FoodDetailSheet item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** Start a breakfast or dinner suggestion (from the ＋ menu). */
export function MealStart({ onDone }: { onDone: () => void }) {
  const now = useNow();
  const [picked, setMeal] = useState<Meal | null>(null);
  const meal = picked ?? (now ? currentMeal(now).meal : "lunch");
  if (!now) return null;
  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="Which meal">
        {(["breakfast", "lunch", "dinner"] as Meal[]).map((m) => (
          <button key={m} aria-pressed={meal === m} onClick={() => setMeal(m)}>
            {MEAL_LABEL[m]}
          </button>
        ))}
      </div>
      <MealStartFor key={meal} day={dayFor(meal, now)} meal={meal} onDone={onDone} />
    </div>
  );
}

function MealStartFor({ day, meal, onDone }: { day: string; meal: Meal; onDone: () => void }) {
  const t = useMealThread(day, meal);
  const [picker, setPicker] = useState<Picker>(null);
  const send: Send = async (kind, body, el) => {
    if (await t.send(kind, body, el)) onDone();
  };
  if (meal === "lunch") return <MealPanel t={t} />;
  return (
    <>
      {t.summary && <p className="small muted">Today so far: {t.summary}</p>}
      <p className="small muted">{MEAL_LABEL[meal]} only shows on Home once you send it.</p>
      <div className="row wrap">
        <button className="btn btn-sm" onClick={() => setPicker({ kind: "prefs" })}>
          What I want
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => setPicker({ kind: "pick" })}>
          Just pick something
        </button>
      </div>
      {picker && <PickerSheet picker={picker} meal={meal} place={t.place} refName={t.refName} onClose={() => setPicker(null)} onSend={send} />}
    </>
  );
}

function Thread({
  latest,
  theirTurn,
  refName,
  nameOf,
  onOpen,
}: {
  latest: LunchMsg | undefined;
  theirTurn: boolean;
  refName: (r: LunchRef) => string;
  nameOf: (id: string) => string;
  onOpen: (r: LunchRef) => void;
}) {
  if (!latest) return <p className="small muted">Nothing picked yet.</p>;
  const who = theirTurn ? nameOf(latest.author) : "You";
  const text =
    latest.kind === "decided"
      ? "Decided:"
      : latest.kind === "propose"
        ? `${who} picked`
        : latest.kind === "filters"
          ? `${who} want${theirTurn ? "s" : ""}:`
          : latest.kind === "request"
            ? `${who} asked for some options`
            : `${who} sent options:`;
  return (
    <div className="stack-sm">
      <p className={latest.kind === "decided" ? "lunch-decided" : theirTurn ? "" : "muted"}>
        {text}
        {!theirTurn && latest.kind !== "decided" && <span className="small faint"> · waiting…</span>}
      </p>
      {latest.refs.length > 0 && latest.kind !== "request" && (
        <div className="chips">
          {latest.refs.map((r) => (
            <button key={r.id} className="chip chip-sm" onClick={() => onOpen(r)} title="See details">
              {refName(r)} ›
            </button>
          ))}
        </div>
      )}
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
function TheirPrefs({ filters, place, onPick }: { filters: FoodFilters; place: LunchPlace | null; onPick: (p: FoodPick, el: HTMLElement) => void }) {
  const { picks, pantry } = useFoodMatches(filters, "", { takeoutOnly: needsTakeout(place) });
  return (
    <div className="stack-sm">
      <span className="small muted">
        {picks.length} option{picks.length === 1 ? "" : "s"} match. Tap one to suggest it back:
      </span>
      <FoodResults picks={picks.slice(0, 8)} pantry={pantry} empty="Nothing we've saved matches those. Suggest something anyway?" onPick={onPick} />
    </div>
  );
}

function PickerSheet({
  picker,
  meal,
  place,
  refName,
  onClose,
  onSend,
}: {
  picker: NonNullable<Picker>;
  meal: Meal;
  place: LunchPlace | null;
  refName: (r: LunchRef) => string;
  onClose: () => void;
  onSend: Send;
}) {
  const takeout = needsTakeout(place);
  const [filters, setFilters] = useState<FoodFilters>((picker.kind === "prefs" || picker.kind === "pick") && picker.start ? picker.start : { mode: place === "out" ? "out" : "cook" });
  const label = MEAL_LABEL[meal].toLowerCase();
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
      <Sheet title={picker.start ? "Adjust and send back" : `What do you want for ${label}?`} onClose={onClose}>
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
    <Sheet title={multi ? "Send a few options" : `Pick ${label}`} onClose={onClose}>
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
