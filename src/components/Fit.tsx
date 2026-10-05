"use client";

import { useState } from "react";
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { useMeals } from "@/lib/foodData";
import { DOGS, dogName } from "@/lib/dogs";
import { useUrlTab } from "@/lib/links";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

// Fuel & move: weight-gain and workout tracking, shaped per person.
//   simple   → "did I eat?" per meal, walks & hikes, weigh-ins
//   detailed → calories + protein vs goals, reps vs goals, walks, weigh-ins
// Either of you can log for the other; every entry says who logged it, and
// anything logged can be opened to fix it or move it to another day.
// Look back by day, week or month.

export type Style = "simple" | "detailed";
export interface FitProfile {
  user_id: string;
  style: Style;
  kcal_goal: number | null;
  protein_goal: number | null;
  start_weight: number | null;
  goal_weight: number | null;
  goal_date: string | null;
  unit: "lb" | "kg";
  rep_goals: { name: string; reps: number }[];
  /** Walk goals: minutes and miles a day, days a week (any can be empty). */
  walk_minutes_goal?: number | null;
  walk_miles_goal?: number | null;
  walk_days_goal?: number | null;
}
interface FoodLog {
  id: string;
  user_id: string;
  logged_by: string;
  day: string;
  meal: Meal | null;
  name: string | null;
  kcal: number | null;
  protein: number | null;
  servings: number;
  created_at: string;
}
type Kind = "hike" | "walk" | "strength" | "cardio" | "other";
interface WorkoutLog {
  id: string;
  user_id: string;
  logged_by: string;
  day: string;
  kind: Kind;
  name: string | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  minutes: number | null;
  distance: number | null;
  notes: string | null;
  dogs?: string[];
  created_at: string;
}
interface WeighIn {
  id: string;
  user_id: string;
  day: string;
  weight: number;
}
type Meal = "breakfast" | "lunch" | "dinner" | "snack";
const MEALS: { v: Meal; label: string; emoji: string }[] = [
  { v: "breakfast", label: "Breakfast", emoji: "🥞" },
  { v: "lunch", label: "Lunch", emoji: "🥪" },
  { v: "dinner", label: "Dinner", emoji: "🍝" },
  { v: "snack", label: "Snack", emoji: "🍎" },
];
const KINDS: { v: Kind; label: string }[] = [
  { v: "walk", label: "🚶 Walk" },
  { v: "hike", label: "🥾 Hike" },
  { v: "strength", label: "💪 Strength" },
  { v: "cardio", label: "🏃 Cardio" },
  { v: "other", label: "✨ Other" },
];
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const mealAt = (h: number): Meal => (h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack");
const isWalk = (w: WorkoutLog) => w.kind === "walk" || w.kind === "hike";
const sum = <T,>(xs: T[], f: (x: T) => number | null | undefined) => xs.reduce((a, x) => a + Number(f(x) ?? 0), 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
/** The 7 days ending on `day` (a rolling week, so there's always a full one to look at). */
const last7 = (day: string) => Array.from({ length: 7 }, (_, k) => iso(addDays(parseISO(day), k - 6)));
const niceDay = (day: string, today: string) => {
  const d = differenceInCalendarDays(parseISO(today), parseISO(day));
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : format(parseISO(day), d < 7 ? "EEEE, MMM d" : "EEE, MMM d, yyyy");
};
/** "45 min · 2.1 mi" */
const walkLine = (ws: WorkoutLog[]) => {
  const m = sum(ws, (w) => w.minutes);
  const mi = sum(ws, (w) => w.distance);
  return [m ? `${m} min` : null, mi ? `${round1(mi)} mi` : null].filter(Boolean).join(" · ");
};

function useFit(userId: string | undefined) {
  const db = supabaseBrowser();
  // A bit over a year back, so the month view and streaks have history.
  const since = iso(addDays(new Date(), -400));
  const { data: profiles = [] } = useLive<FitProfile[]>(
    "fit_profiles",
    async () => {
      const { data, error } = await db.from("fit_profiles").select("*");
      if (error) throw error;
      return data as FitProfile[];
    },
    ["fit_profiles"],
  );
  const { data: food = [] } = useLive<FoodLog[]>(
    `food_logs:${userId}`,
    async () => {
      if (!userId) return [];
      const { data, error } = await db.from("food_logs").select("*").eq("user_id", userId).gte("day", since).order("created_at");
      if (error) throw error;
      return data as FoodLog[];
    },
    ["food_logs"],
  );
  const { data: work = [] } = useLive<WorkoutLog[]>(
    `workout_logs:${userId}`,
    async () => {
      if (!userId) return [];
      const { data, error } = await db.from("workout_logs").select("*").eq("user_id", userId).gte("day", since).order("created_at");
      if (error) throw error;
      return data as WorkoutLog[];
    },
    ["workout_logs"],
  );
  const { data: weights = [] } = useLive<WeighIn[]>(
    `weigh_ins:${userId}`,
    async () => {
      if (!userId) return [];
      const { data, error } = await db.from("weigh_ins").select("*").eq("user_id", userId).order("day").order("created_at");
      if (error) throw error;
      return data as WeighIn[];
    },
    ["weigh_ins"],
  );
  const profile: FitProfile = profiles.find((p) => p.user_id === userId) ?? { user_id: userId ?? "", style: "simple", kcal_goal: null, protein_goal: null, start_weight: null, goal_weight: null, goal_date: null, unit: "lb", rep_goals: [] };
  return { profile, food, work, weights };
}

type Editing = { kind: "work"; row: WorkoutLog } | { kind: "food"; row: FoodLog } | { kind: "weigh"; row: WeighIn } | null;

/** The whole page: whose, then a day (or a week / month to look back over). */
export function FitView() {
  const { meId, partner, nameOf } = useApp();
  const now = useNow();
  const [who, setWho] = useState<string | null>(null);
  const [view, setView] = useUrlTab(["day", "week", "month"] as const, "day", "view");
  const [picked, setPicked] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const person = who ?? meId;
  const fit = useFit(person);
  const { profile, food, work, weights } = fit;
  if (!now) return null;
  const today = iso(now);
  const day = picked && picked <= today ? picked : today;
  const mine = person === meId;
  const name = mine ? "you" : nameOf(person);
  /** Jump to a day (never past today) and show it. */
  const go = (d: string) => {
    setPicked(d > today ? today : d);
    setView("day");
  };
  const edit = setEditing;

  return (
    <div className="stack">
      <div className="row-between">
        <div className="seg seg-sm" role="group" aria-label="Whose">
          <button aria-pressed={person === meId} onClick={() => setWho(meId)}>
            Me
          </button>
          {partner && (
            <button aria-pressed={person === partner.id} onClick={() => setWho(partner.id)}>
              {partner.display_name}
            </button>
          )}
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setSettings(true)}>
          ⚙︎ {mine ? "My setup" : `${nameOf(person)}'s setup`}
        </button>
      </div>
      <div className="seg" role="group" aria-label="View">
        <button aria-pressed={view === "day"} onClick={() => setView("day")}>
          Day
        </button>
        <button aria-pressed={view === "week"} onClick={() => setView("week")}>
          Week
        </button>
        <button aria-pressed={view === "month"} onClick={() => setView("month")}>
          Month
        </button>
      </div>

      {view === "day" && (
        <>
          <DayPicker day={day} today={today} onPick={go} />
          <WeekStrip day={day} today={today} food={food} work={work} onPick={go} />
          {profile.style === "simple" ? (
            <DidEat person={person} day={day} food={food.filter((f) => f.day === day)} name={name} mine={mine} onEdit={(row) => edit({ kind: "food", row })} />
          ) : (
            <Fuel person={person} day={day} profile={profile} food={food.filter((f) => f.day === day)} onEdit={(row) => edit({ kind: "food", row })} />
          )}
          <Walks person={person} day={day} today={today} profile={profile} work={work} onEdit={(row) => edit({ kind: "work", row })} />
          {profile.style === "detailed" && <Reps person={person} day={day} profile={profile} work={work.filter((w) => w.day === day && !isWalk(w))} onEdit={(row) => edit({ kind: "work", row })} />}
          <Weight person={person} profile={profile} weights={weights} day={day} today={today} onEdit={(row) => edit({ kind: "weigh", row })} />
        </>
      )}
      {view === "week" && <WeekView day={day} today={today} profile={profile} food={food} work={work} weights={weights} onPick={go} onMove={setPicked} />}
      {view === "month" && <MonthView day={day} today={today} profile={profile} food={food} work={work} onPick={go} onMove={setPicked} />}

      {settings && <FitSettings profile={profile} onClose={() => setSettings(false)} />}
      {editing?.kind === "work" && <EditWorkout row={editing.row} unit={profile.unit} today={today} onClose={() => setEditing(null)} />}
      {editing?.kind === "food" && <EditFood row={editing.row} today={today} onClose={() => setEditing(null)} />}
      {editing?.kind === "weigh" && <EditWeigh row={editing.row} unit={profile.unit} today={today} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ─── picking a day ───────────────────────────────────────────────────── */

/** ‹ day › — tap the day itself for a calendar to jump anywhere back. */
function DayPicker({ day, today, onPick }: { day: string; today: string; onPick: (d: string) => void }) {
  return (
    <div className="row-between fit-day">
      <button className="icon-btn" onClick={() => onPick(iso(addDays(parseISO(day), -1)))} aria-label="Day before">
        ‹
      </button>
      <span className="row" style={{ gap: 8 }}>
        <label className="fit-date">
          <strong>{niceDay(day, today)}</strong>
          <span aria-hidden className="faint"> ▾</span>
          <input type="date" className="fit-date-input" max={today} value={day} onChange={(e) => e.target.value && onPick(e.target.value)} aria-label="Pick a day" />
        </label>
        {day !== today && (
          <button className="btn btn-sm btn-ghost" onClick={() => onPick(today)}>
            today
          </button>
        )}
      </span>
      <button className="icon-btn" disabled={day >= today} onClick={() => onPick(iso(addDays(parseISO(day), 1)))} aria-label="Next day">
        ›
      </button>
    </div>
  );
}

/** The days around the picked one: what got done each day, tap to pick one. */
function WeekStrip({ day, today, food, work, onPick }: { day: string; today: string; food: FoodLog[]; work: WorkoutLog[]; onPick: (d: string) => void }) {
  const end = iso(addDays(parseISO(day), 3)) > today ? today : iso(addDays(parseISO(day), 3));
  return (
    <div className="fit-strip" role="group" aria-label="These days">
      {last7(end).map((d) => {
        const future = d > today;
        const ate = food.some((f) => f.day === d);
        const walked = work.some((w) => w.day === d && isWalk(w));
        const lifted = work.some((w) => w.day === d && !isWalk(w));
        return (
          <button key={d} className={`fit-strip-day${d === day ? " sel" : ""}${d === today ? " today" : ""}`} disabled={future} onClick={() => onPick(d)} aria-label={format(parseISO(d), "EEEE, MMM d")}>
            <span className="small faint">{format(parseISO(d), "EEEEE")}</span>
            <strong>{format(parseISO(d), "d")}</strong>
            <span className="fit-marks" aria-hidden>
              {ate && <i className="m-eat" />}
              {walked && <i className="m-walk" />}
              {lifted && <i className="m-lift" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── simple: did you eat ─────────────────────────────────────────────── */

function DidEat({ person, day, food, name, mine, onEdit }: { person: string; day: string; food: FoodLog[]; name: string; mine: boolean; onEdit: (f: FoodLog) => void }) {
  const { meId, nameOf, toast } = useApp();
  const db = supabaseBrowser();
  const [adding, setAdding] = useState(false);
  async function toggle(m: Meal) {
    const had = food.filter((f) => f.meal === m && !f.name);
    const named = food.some((f) => f.meal === m && f.name);
    // A meal with something written down stays (open it to remove); a plain tick toggles.
    if (named && !had.length) return toast("Tap it in the list below to change it.");
    const { error } = had.length ? await db.from("food_logs").delete().in("id", had.map((f) => f.id)) : await db.from("food_logs").insert({ user_id: person, logged_by: meId, day, meal: m });
    if (error) return toast(error.message);
    refreshAll();
  }
  const count = MEALS.filter((m) => food.some((f) => f.meal === m.v)).length + food.filter((f) => !f.meal).length;
  return (
    <section className="card fit-card">
      <div className="row-between">
        <strong>🍽️ {mine ? "Did you eat?" : `Did ${name} eat?`}</strong>
        <span className="small faint">{count ? `${count} so far` : "nothing yet"}</span>
      </div>
      <div className="fit-meals">
        {MEALS.map((m) => {
          const f = food.find((x) => x.meal === m.v);
          return (
            <button key={m.v} className="fit-meal" aria-pressed={!!f} onClick={() => toggle(m.v)}>
              <span className="fit-meal-emoji">{f ? "✓" : m.emoji}</span>
              {m.label}
              {f && f.logged_by !== person && <span className="small faint">by {f.logged_by === meId ? "you" : nameOf(f.logged_by)}</span>}
            </button>
          );
        })}
      </div>
      {food.some((f) => f.name) && (
        <ul className="fit-list">
          {food
            .filter((f) => f.name)
            .map((f) => (
              <li key={f.id}>
                <button className="fit-row" onClick={() => onEdit(f)}>
                  <span className="grow">
                    {f.meal ? `${MEALS.find((m) => m.v === f.meal)?.emoji} ` : ""}
                    {f.name}
                    {f.logged_by !== person && <span className="small faint"> · by {f.logged_by === meId ? "you" : nameOf(f.logged_by)}</span>}
                  </span>
                  <span className="small faint">✎</span>
                </button>
              </li>
            ))}
        </ul>
      )}
      {adding ? (
        <FoodLogForm person={person} day={day} onDone={() => setAdding(false)} />
      ) : (
        <div className="row-between">
          <span className="small faint">Just tap what got eaten. No numbers.</span>
          <button className="btn-link small" onClick={() => setAdding(true)}>
            ＋ write what
          </button>
        </div>
      )}
    </section>
  );
}

/* ─── walks & hikes (both styles) ─────────────────────────────────────── */

function Walks({ person, day, today, profile, work, onEdit }: { person: string; day: string; today: string; profile: FitProfile; work: WorkoutLog[]; onEdit: (w: WorkoutLog) => void }) {
  const { meId, nameOf, toast } = useApp();
  const db = supabaseBrowser();
  const [kind, setKind] = useState<"walk" | "hike">("walk");
  const [minutes, setMinutes] = useState("");
  const [miles, setMiles] = useState("");
  const [dogs, setDogs] = useState<string[]>([]);
  const walks = work.filter(isWalk);
  const todays = walks.filter((w) => w.day === day);
  const mins = sum(todays, (w) => w.minutes);
  const mi = sum(todays, (w) => w.distance);
  // Streak: days in a row with a walk or hike, counting back from today (or yesterday, if today's not done yet).
  const days = new Set(walks.map((w) => w.day));
  let streak = 0;
  for (let d = days.has(today) ? parseISO(today) : addDays(parseISO(today), -1); days.has(iso(d)); d = addDays(d, -1)) streak++;
  const week = last7(day);
  const weekDays = new Set(walks.filter((w) => week.includes(w.day)).map((w) => w.day)).size;
  const hasGoals = !!(profile.walk_minutes_goal || profile.walk_miles_goal || profile.walk_days_goal);

  async function log() {
    const { error } = await db.from("workout_logs").insert({
      user_id: person,
      logged_by: meId,
      day,
      kind,
      name: kind,
      minutes: Number(minutes) || null,
      distance: Number(miles) || null,
      ...(dogs.length ? { dogs } : {}),
    });
    if (error) return toast(error.message);
    setMinutes("");
    setMiles("");
    setDogs([]);
    refreshAll();
    toast(kind === "hike" ? "🥾 Hike logged" : "🚶 Walk logged");
  }

  return (
    <section className="card fit-card">
      <div className="row-between">
        <strong>🚶 Walks & hikes</strong>
        <span className="small faint">{streak ? `🔥 ${streak} day${streak === 1 ? "" : "s"} in a row` : "start a streak"}</span>
      </div>
      {profile.walk_minutes_goal ? <Bar label="Minutes" value={mins} goal={profile.walk_minutes_goal} unit="min" /> : null}
      {profile.walk_miles_goal ? <Bar label="Miles" value={round1(mi)} goal={Number(profile.walk_miles_goal)} unit="mi" /> : null}
      {profile.walk_days_goal ? <Bar label="Days, last 7" value={weekDays} goal={profile.walk_days_goal} unit="days" /> : null}
      {!hasGoals && <span className="small faint">Set walk goals in setup (minutes or miles a day, days a week).</span>}
      {todays.length > 0 && (
        <ul className="fit-list">
          {todays.map((w) => (
            <li key={w.id}>
              <button className="fit-row" onClick={() => onEdit(w)}>
                <span className="grow">
                  {w.kind === "hike" ? "🥾 Hike" : "🚶 Walk"}
                  {w.dogs?.length ? <span className="small faint"> · with {w.dogs.map(dogName).join(" & ")}</span> : null}
                  {w.logged_by !== person && <span className="small faint"> · by {w.logged_by === meId ? "you" : nameOf(w.logged_by)}</span>}
                </span>
                <span className="small">{walkLine([w]) || "✓"}</span>
                <span className="small faint">✎</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="fit-walk-add">
        <div className="seg seg-sm" role="group" aria-label="Walk or hike">
          <button aria-pressed={kind === "walk"} onClick={() => setKind("walk")}>
            🚶 Walk
          </button>
          <button aria-pressed={kind === "hike"} onClick={() => setKind("hike")}>
            🥾 Hike
          </button>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <input className="input input-sm" style={{ width: 70 }} inputMode="numeric" placeholder="min" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ""))} aria-label="Minutes" />
          <input className="input input-sm" style={{ width: 70 }} inputMode="decimal" placeholder="miles" value={miles} onChange={(e) => setMiles(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Miles" />
          {DOGS.map((d) => (
            <button key={d.id} className="chip chip-sm" aria-pressed={dogs.includes(d.id)} onClick={() => setDogs((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))}>
              🐾 {d.name}
            </button>
          ))}
          <button className="btn btn-sm btn-primary" onClick={log}>
            {todays.length ? "＋ Log another" : kind === "hike" ? "✓ Hiked" : "✓ Walked"}
          </button>
        </div>
        <span className="small faint">Numbers are optional.</span>
      </div>
    </section>
  );
}

/* ─── detailed: calories + protein ────────────────────────────────────── */

function Bar({ label, value, goal, unit }: { label: string; value: number; goal: number | null; unit: string }) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div className="fit-bar">
      <div className="row-between small">
        <strong>{label}</strong>
        <span>
          {Math.round(value).toLocaleString()}
          {goal ? ` / ${goal.toLocaleString()}` : ""} {unit}
          {goal && value < goal ? <span className="faint"> · {Math.round(goal - value).toLocaleString()} to go</span> : goal ? " ✓" : ""}
        </span>
      </div>
      {goal ? (
        <div className="fit-track">
          <span style={{ width: `${pct}%` }} className={value >= goal ? "met" : ""} />
        </div>
      ) : (
        <span className="small faint">set a goal in setup</span>
      )}
    </div>
  );
}

/** Log something eaten, for yourself or for the other person. Numbers are optional. */
export function FoodLogForm({ person, day, onDone, defaultMeal = null }: { person: string; day: string; onDone?: () => void; defaultMeal?: Meal | null }) {
  const { meId, toast } = useApp();
  const meals = useMeals();
  const db = supabaseBrowser();
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [meal, setMeal] = useState<Meal | null>(defaultMeal);
  const [mealId, setMealId] = useState<string | null>(null);
  const [servings, setServings] = useState("1");
  const [picking, setPicking] = useState(false);
  const saved = meals.find((m) => m.id === mealId);

  function pickMeal(id: string) {
    const m = meals.find((x) => x.id === id);
    setMealId(id);
    setPicking(false);
    setName(m?.name ?? "");
    const s = Number(servings) || 1;
    setKcal(m?.kcal != null ? String(Math.round(m.kcal * s)) : "");
    setProtein(m?.protein != null ? String(Math.round(Number(m.protein) * s)) : "");
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() && !kcal && !protein && !meal) return;
    const s = Number(servings) || 1;
    const { error } = await db.from("food_logs").insert({
      user_id: person,
      logged_by: meId,
      day,
      meal,
      name: name.trim() || null,
      kcal: kcal ? Number(kcal) : null,
      protein: protein ? Number(protein) : null,
      home_meal_id: mealId,
      servings: s,
    });
    if (error) return toast(error.message);
    // A saved meal without numbers learns them (per serving) for next time.
    if (saved && (saved.kcal == null || saved.protein == null) && (kcal || protein)) {
      await db
        .from("home_meals")
        .update({ kcal: saved.kcal ?? (kcal ? Math.round(Number(kcal) / s) : null), protein: saved.protein ?? (protein ? Math.round((Number(protein) / s) * 10) / 10 : null) })
        .eq("id", saved.id);
    }
    setName("");
    setKcal("");
    setProtein("");
    setMealId(null);
    setServings("1");
    refreshAll();
    toast("Logged 🍗");
    onDone?.();
  }

  return (
    <form className="stack-sm" onSubmit={add}>
      <div className="chips">
        {MEALS.map((m) => (
          <button key={m.v} type="button" className="chip chip-sm" aria-pressed={meal === m.v} onClick={() => setMeal(meal === m.v ? null : m.v)}>
            {m.emoji} {m.label}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <input
          className="input input-sm grow"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setMealId(null);
          }}
          placeholder="what (optional)"
          aria-label="What"
        />
        <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>
          📖 Our meals
        </button>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <input className="input input-sm" style={{ width: 90 }} inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value.replace(/[^\d]/g, ""))} placeholder="kcal" aria-label="Calories" />
        <input className="input input-sm" style={{ width: 90 }} inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value.replace(/[^\d.]/g, ""))} placeholder="protein g" aria-label="Protein" />
        {mealId && (
          <input
            className="input input-sm"
            style={{ width: 70 }}
            inputMode="decimal"
            value={servings}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d.]/g, "");
              setServings(v);
              const s = Number(v) || 1;
              if (saved?.kcal != null) setKcal(String(Math.round(saved.kcal * s)));
              if (saved?.protein != null) setProtein(String(Math.round(Number(saved.protein) * s)));
            }}
            aria-label="Servings"
            title="servings"
          />
        )}
        <button className="btn btn-sm btn-primary">Log</button>
      </div>
      {saved && (saved.kcal == null || saved.protein == null) && <span className="small faint">Fill in the numbers once and {saved.name} remembers them per serving.</span>}
      {picking && (
        <Sheet title="📖 Our meals" onClose={() => setPicking(false)}>
          <div className="stack-sm">
            {meals.map((m) => (
              <button key={m.id} type="button" className="task task-edit" onClick={() => pickMeal(m.id)}>
                <span className="grow">{m.name}</span>
                <span className="small faint">{[m.kcal != null ? `${m.kcal} kcal` : null, m.protein != null ? `${Number(m.protein)}g protein` : null].filter(Boolean).join(" · ") || "no numbers yet"}</span>
              </button>
            ))}
            {!meals.length && <p className="small muted">No saved meals yet. Add them in Food.</p>}
          </div>
        </Sheet>
      )}
    </form>
  );
}

function Fuel({ person, day, profile, food, onEdit }: { person: string; day: string; profile: FitProfile; food: FoodLog[]; onEdit: (f: FoodLog) => void }) {
  const { meId, nameOf } = useApp();
  const kcalSum = sum(food, (f) => f.kcal);
  const proteinSum = sum(food, (f) => f.protein);
  return (
    <section className="card fit-card">
      <strong>🍗 Fuel</strong>
      <Bar label="Calories" value={kcalSum} goal={profile.kcal_goal} unit="kcal" />
      <Bar label="Protein" value={proteinSum} goal={profile.protein_goal} unit="g" />
      <FoodLogForm person={person} day={day} />
      {food.length > 0 && (
        <ul className="fit-list">
          {food.map((f) => (
            <li key={f.id}>
              <button className="fit-row" onClick={() => onEdit(f)}>
                <span className="grow">
                  {f.meal ? `${MEALS.find((m) => m.v === f.meal)?.emoji} ` : ""}
                  {f.name ?? "something"}
                  {f.logged_by !== person && <span className="small faint"> · by {f.logged_by === meId ? "you" : nameOf(f.logged_by)}</span>}
                </span>
                <span className="small">{[f.kcal != null ? `${f.kcal} kcal` : null, f.protein != null ? `${Number(f.protein)}g` : null].filter(Boolean).join(" · ")}</span>
                <span className="small faint">✎</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The ＋ menu entry: log food for either of you (like the lunch you packed him). */
export function QuickFoodLog({ onDone }: { onDone: () => void }) {
  const { meId, partner } = useApp();
  const now = useNow();
  const [who, setWho] = useState<string | null>(null);
  if (!now) return null;
  const person = who ?? partner?.id ?? meId;
  return (
    <div className="stack">
      <div className="seg seg-sm" role="group" aria-label="Who ate">
        {partner && (
          <button aria-pressed={person === partner.id} onClick={() => setWho(partner.id)}>
            {partner.display_name}
          </button>
        )}
        <button aria-pressed={person === meId} onClick={() => setWho(meId)}>
          Me
        </button>
      </div>
      <FoodLogForm key={person} person={person} day={iso(now)} onDone={onDone} defaultMeal={mealAt(now.getHours())} />
    </div>
  );
}

/* ─── detailed: reps ──────────────────────────────────────────────────── */

function Reps({ person, day, profile, work, onEdit }: { person: string; day: string; profile: FitProfile; work: WorkoutLog[]; onEdit: (w: WorkoutLog) => void }) {
  const { meId, toast } = useApp();
  const db = supabaseBrowser();
  const [ex, setEx] = useState("");
  const [sets, setSets] = useState("1");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const done = (n: string) => work.filter((w) => (w.name ?? "").toLowerCase() === n.toLowerCase()).reduce((a, w) => a + (w.sets ?? 1) * (w.reps ?? 0), 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!ex.trim() || !reps) return;
    const { error } = await db
      .from("workout_logs")
      .insert({ user_id: person, logged_by: meId, day, kind: "strength", name: ex.trim().toLowerCase(), sets: Number(sets) || 1, reps: Number(reps), weight: weight ? Number(weight) : null });
    if (error) return toast(error.message);
    setReps("");
    refreshAll();
    toast("💪 Logged");
  }

  return (
    <section className="card fit-card">
      <strong>💪 Reps</strong>
      {profile.rep_goals.length ? (
        profile.rep_goals.map((g) => <Bar key={g.name} label={g.name} value={done(g.name)} goal={g.reps} unit="reps" />)
      ) : (
        <span className="small faint">Set daily rep goals in setup (like 60 push-ups).</span>
      )}
      <form className="stack-sm" onSubmit={add}>
        {profile.rep_goals.length > 0 && (
          <div className="chips">
            {profile.rep_goals.map((g) => (
              <button key={g.name} type="button" className="chip chip-sm" aria-pressed={ex.toLowerCase() === g.name.toLowerCase()} onClick={() => setEx(g.name)}>
                {g.name}
              </button>
            ))}
          </div>
        )}
        <input className="input input-sm" value={ex} onChange={(e) => setEx(e.target.value)} placeholder="exercise" aria-label="Exercise" />
        <div className="row" style={{ gap: 6 }}>
          <input className="input input-sm" style={{ width: 52 }} inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value.replace(/[^\d]/g, ""))} aria-label="Sets" title="sets" />
          <span className="small">×</span>
          <input className="input input-sm" style={{ width: 60 }} inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/[^\d]/g, ""))} placeholder="reps" aria-label="Reps" />
          <input className="input input-sm" style={{ width: 60 }} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder={profile.unit} aria-label="Weight (optional)" />
          <button className="btn btn-sm btn-primary">Log</button>
        </div>
      </form>
      {work.length > 0 && (
        <ul className="fit-list">
          {work.map((w) => (
            <li key={w.id}>
              <button className="fit-row" onClick={() => onEdit(w)}>
                <span className="grow">{w.name ?? w.kind}</span>
                <span className="small">
                  {[w.sets && w.reps ? `${w.sets}×${w.reps}` : null, w.weight ? `${Number(w.weight)} ${profile.unit}` : null, w.minutes ? `${w.minutes} min` : null].filter(Boolean).join(" · ")}
                </span>
                <span className="small faint">✎</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─── both: weight ────────────────────────────────────────────────────── */

function Weight({ person, profile, weights, day, today, onEdit }: { person: string; profile: FitProfile; weights: WeighIn[]; day: string; today: string; onEdit: (w: WeighIn) => void }) {
  const { meId, toast } = useApp();
  const [draft, setDraft] = useState("");
  const [all, setAll] = useState(false);
  const latest = weights[weights.length - 1];
  const start = profile.start_weight ?? weights[0]?.weight ?? null;
  const change = latest && start != null ? Number(latest.weight) - Number(start) : null;
  const toGo = latest && profile.goal_weight != null ? Number(profile.goal_weight) - Number(latest.weight) : null;
  const daysLeft = profile.goal_date ? differenceInCalendarDays(parseISO(profile.goal_date), parseISO(today)) : null;
  const onDay = weights.filter((w) => w.day === day);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const w = Number(draft);
    if (!(w > 0)) return;
    const { error } = await supabaseBrowser().from("weigh_ins").insert({ user_id: person, logged_by: meId, day, weight: w });
    if (error) return toast(error.message);
    setDraft("");
    refreshAll();
    toast("⚖️ Logged");
  }

  // A small line of the last 60 weigh-ins, with the goal as a dashed line.
  const pts = weights.slice(-60);
  const vals = pts.map((p) => Number(p.weight));
  const lo = Math.min(...vals, profile.goal_weight ?? Infinity, start ?? Infinity);
  const hi = Math.max(...vals, profile.goal_weight ?? -Infinity, start ?? -Infinity);
  const W = 300;
  const H = 70;
  const y = (v: number) => (hi === lo ? H / 2 : H - 6 - ((v - lo) / (hi - lo)) * (H - 12));
  const x = (k: number) => (pts.length < 2 ? W / 2 : 6 + (k / (pts.length - 1)) * (W - 12));

  return (
    <section className="card fit-card">
      <div className="row-between">
        <strong>⚖️ Weight</strong>
        {latest && (
          <span className="small">
            {Number(latest.weight)} {profile.unit}
            {change != null && change !== 0 ? <span className={change > 0 ? "fit-up" : "fit-down"}> {change > 0 ? "▲" : "▼"} {Math.abs(round1(change))}</span> : null}
          </span>
        )}
      </div>
      {pts.length > 1 && (
        <svg className="fit-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Weight over time">
          {profile.goal_weight != null && <line x1={0} x2={W} y1={y(Number(profile.goal_weight))} y2={y(Number(profile.goal_weight))} className="fit-goal-line" />}
          <polyline points={pts.map((p, k) => `${x(k)},${y(Number(p.weight))}`).join(" ")} className="fit-line" />
          {pts.map((p, k) => (
            <circle key={p.id} cx={x(k)} cy={y(Number(p.weight))} r={p.day === day ? 4 : 2.5} className={`fit-point${p.day === day ? " on" : ""}`} />
          ))}
        </svg>
      )}
      {(toGo != null || daysLeft != null) && (
        <span className="small faint">
          {[toGo != null && toGo > 0 ? `${round1(toGo)} ${profile.unit} to goal` : toGo != null ? "goal reached 🎉" : null, daysLeft != null && daysLeft > 0 ? `${daysLeft} days to ${format(parseISO(profile.goal_date!), "MMM d")}` : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
      {onDay.map((w) => (
        <button key={w.id} className="fit-row" onClick={() => onEdit(w)}>
          <span className="grow">
            {niceDay(day, today)}: {Number(w.weight)} {profile.unit}
          </span>
          <span className="small faint">✎</span>
        </button>
      ))}
      <form className="quick-add" onSubmit={add}>
        <input className="input input-sm grow" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))} placeholder={`${day === today ? "today's" : format(parseISO(day), "MMM d")} weight (${profile.unit})`} aria-label="Weight" />
        <button className="btn btn-sm" disabled={!draft}>
          Log
        </button>
      </form>
      {weights.length > 0 && (
        <button className="btn-link small" style={{ alignSelf: "flex-start" }} onClick={() => setAll((a) => !a)}>
          {all ? "hide weigh-ins" : `every weigh-in (${weights.length})`}
        </button>
      )}
      {all && (
        <ul className="fit-list">
          {[...weights].reverse().map((w) => (
            <li key={w.id}>
              <button className="fit-row" onClick={() => onEdit(w)}>
                <span className="grow">{format(parseISO(w.day), "EEE, MMM d, yyyy")}</span>
                <span className="small">
                  {Number(w.weight)} {profile.unit}
                </span>
                <span className="small faint">✎</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─── looking back: week & month ──────────────────────────────────────── */

function WeekView({
  day,
  today,
  profile,
  food,
  work,
  weights,
  onPick,
  onMove,
}: {
  day: string;
  today: string;
  profile: FitProfile;
  food: FoodLog[];
  work: WorkoutLog[];
  weights: WeighIn[];
  onPick: (d: string) => void;
  onMove: (d: string) => void;
}) {
  const days = last7(day);
  const start = parseISO(days[0]);
  const inWeek = (d: string) => d >= days[0] && d <= days[6];
  const walks = work.filter((w) => isWalk(w) && inWeek(w.day));
  const walkDays = new Set(walks.map((w) => w.day)).size;
  const lifts = work.filter((w) => !isWalk(w) && inWeek(w.day));
  const weekFood = food.filter((f) => inWeek(f.day));
  const pastDays = days.filter((d) => d <= today).length || 1;
  return (
    <div className="stack">
      <div className="row-between fit-day">
        <button className="icon-btn" onClick={() => onMove(iso(addDays(parseISO(day), -7)))} aria-label="7 days before">
          ‹
        </button>
        <strong>
          {format(start, "MMM d")} – {format(parseISO(day), "MMM d")}
        </strong>
        <button className="icon-btn" disabled={day >= today} onClick={() => onMove(iso(addDays(parseISO(day), 7)) > today ? today : iso(addDays(parseISO(day), 7)))} aria-label="7 days after">
          ›
        </button>
      </div>
      <section className="card fit-card">
        <strong>{day === today ? "Last 7 days" : "These 7 days"}</strong>
        <div className="fit-totals">
          <span>
            <b>
              {walkDays}
              {profile.walk_days_goal ? `/${profile.walk_days_goal}` : ""}
            </b>
            walk days
          </span>
          <span>
            <b>{sum(walks, (w) => w.minutes)}</b>min walked
          </span>
          <span>
            <b>{round1(sum(walks, (w) => w.distance))}</b>miles
          </span>
          {profile.style === "detailed" ? (
            <span>
              <b>{Math.round(sum(weekFood, (f) => f.kcal) / pastDays).toLocaleString()}</b>kcal/day avg
            </span>
          ) : (
            <span>
              <b>{new Set(weekFood.map((f) => `${f.day}:${f.meal ?? f.id}`)).size}</b>meals ticked
            </span>
          )}
          {lifts.length > 0 && (
            <span>
              <b>{sum(lifts, (w) => (w.sets ?? 1) * (w.reps ?? 0))}</b>reps
            </span>
          )}
        </div>
      </section>
      <ul className="fit-list fit-weeklist">
        {days.map((d) => {
          const f = food.filter((x) => x.day === d);
          const w = work.filter((x) => x.day === d);
          const wi = weights.filter((x) => x.day === d).pop();
          const future = d > today;
          const bits = [
            f.length ? (profile.style === "detailed" ? `🍗 ${sum(f, (x) => x.kcal).toLocaleString()} kcal · ${Math.round(sum(f, (x) => x.protein))}g` : `🍽️ ${new Set(f.map((x) => x.meal ?? x.id)).size} meal${new Set(f.map((x) => x.meal ?? x.id)).size === 1 ? "" : "s"}`) : null,
            w.some(isWalk) ? `🚶 ${walkLine(w.filter(isWalk)) || "walked"}` : null,
            w.some((x) => !isWalk(x)) ? `💪 ${sum(w.filter((x) => !isWalk(x)), (x) => (x.sets ?? 1) * (x.reps ?? 0))} reps` : null,
            wi ? `⚖️ ${Number(wi.weight)}` : null,
          ].filter(Boolean);
          return (
            <li key={d}>
              <button className={`fit-row${d === day ? " sel" : ""}`} disabled={future} onClick={() => onPick(d)}>
                <span className="fit-weekday">
                  <b>{format(parseISO(d), "EEE")}</b>
                  <span className="small faint">{format(parseISO(d), "MMM d")}</span>
                </span>
                <span className="grow small">{future ? "" : bits.length ? bits.join("  ·  ") : <span className="faint">nothing logged</span>}</span>
                {!future && <span className="small faint">›</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MonthView({ day, today, profile, food, work, onPick, onMove }: { day: string; today: string; profile: FitProfile; food: FoodLog[]; work: WorkoutLog[]; onPick: (d: string) => void; onMove: (d: string) => void }) {
  const month = startOfMonth(parseISO(day));
  const first = startOfWeek(month, { weekStartsOn: 1 });
  // Whole weeks, Monday to Sunday, covering the month.
  const grid = Array.from({ length: Math.ceil((differenceInCalendarDays(endOfMonth(month), first) + 1) / 7) * 7 }, (_, k) => addDays(first, k));
  const inMonth = (d: string) => d >= iso(month) && d <= iso(endOfMonth(month));
  const walks = work.filter((w) => isWalk(w) && inMonth(w.day));
  const walkDays = new Set(walks.map((w) => w.day));
  const ateDays = new Set(food.filter((f) => inMonth(f.day)).map((f) => f.day));
  const liftDays = new Set(work.filter((w) => !isWalk(w) && inMonth(w.day)).map((w) => w.day));
  const goalMet = (d: string) => {
    const ws = work.filter((w) => w.day === d && isWalk(w));
    if (!ws.length) return false;
    const okM = !profile.walk_minutes_goal || sum(ws, (w) => w.minutes) >= profile.walk_minutes_goal;
    const okMi = !profile.walk_miles_goal || sum(ws, (w) => w.distance) >= Number(profile.walk_miles_goal);
    return (!!profile.walk_minutes_goal || !!profile.walk_miles_goal) && okM && okMi;
  };
  const next = iso(addMonths(month, 1));
  return (
    <div className="stack">
      <div className="row-between fit-day">
        <button className="icon-btn" onClick={() => onMove(iso(addMonths(month, -1)))} aria-label="Month before">
          ‹
        </button>
        <strong>{format(month, "MMMM yyyy")}</strong>
        <button className="icon-btn" disabled={next > today} onClick={() => onMove(next)} aria-label="Next month">
          ›
        </button>
      </div>
      <section className="card fit-card">
        <div className="fit-totals">
          <span>
            <b>{walkDays.size}</b>walk days
          </span>
          <span>
            <b>{sum(walks, (w) => w.minutes)}</b>min
          </span>
          <span>
            <b>{round1(sum(walks, (w) => w.distance))}</b>miles
          </span>
          <span>
            <b>{ateDays.size}</b>days eating logged
          </span>
          {liftDays.size > 0 && (
            <span>
              <b>{liftDays.size}</b>workout days
            </span>
          )}
        </div>
        <div className="fit-month">
          {["M", "T", "W", "T", "F", "S", "S"].map((l, k) => (
            <span key={k} className="fit-month-head">
              {l}
            </span>
          ))}
          {grid.map((dt) => {
            const d = iso(dt);
            const out = !isSameMonth(dt, month);
            const future = d > today;
            return (
              <button key={d} className={`fit-month-day${out ? " out" : ""}${d === today ? " today" : ""}${goalMet(d) ? " met" : ""}`} disabled={future || out} onClick={() => onPick(d)} aria-label={format(dt, "EEEE, MMM d")}>
                <span>{format(dt, "d")}</span>
                <span className="fit-marks" aria-hidden>
                  {ateDays.has(d) && <i className="m-eat" />}
                  {walkDays.has(d) && <i className="m-walk" />}
                  {liftDays.has(d) && <i className="m-lift" />}
                </span>
              </button>
            );
          })}
        </div>
        <span className="small faint fit-legend">
          <i className="m-eat" /> ate · <i className="m-walk" /> walked · <i className="m-lift" /> worked out{profile.walk_minutes_goal || profile.walk_miles_goal ? " · ringed = walk goal met" : ""}. Tap a day to open it.
        </span>
      </section>
    </div>
  );
}

/* ─── fixing past entries ─────────────────────────────────────────────── */

function EditWorkout({ row, unit, today, onClose }: { row: WorkoutLog; unit: string; today: string; onClose: () => void }) {
  const { toast } = useApp();
  const [w, setW] = useState(row);
  const num = (v: string) => (v === "" ? null : Number(v));
  const walky = w.kind === "walk" || w.kind === "hike";
  async function save() {
    const { error } = await supabaseBrowser()
      .from("workout_logs")
      .update({ day: w.day, kind: w.kind, name: walky ? w.kind : w.name?.trim().toLowerCase() || null, sets: w.sets, reps: w.reps, weight: w.weight, minutes: w.minutes, distance: w.distance, notes: w.notes?.trim() || null, ...(walky ? { dogs: w.dogs ?? [] } : {}) })
      .eq("id", row.id);
    if (error) return toast(error.message);
    refreshAll();
    toast(w.day !== row.day ? `Moved to ${format(parseISO(w.day), "MMM d")}` : "Saved");
    onClose();
  }
  async function remove() {
    if (!confirm("Delete this?")) return;
    await supabaseBrowser().from("workout_logs").delete().eq("id", row.id);
    refreshAll();
    onClose();
  }
  return (
    <Sheet title="Edit" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Day</span>
          <input className="input" type="date" max={today} value={w.day} onChange={(e) => e.target.value && setW({ ...w, day: e.target.value })} />
        </label>
        <div className="chips">
          {KINDS.map((k) => (
            <button key={k.v} className="chip chip-sm" aria-pressed={w.kind === k.v} onClick={() => setW({ ...w, kind: k.v })}>
              {k.label}
            </button>
          ))}
        </div>
        {!walky && <input className="input" value={w.name ?? ""} onChange={(e) => setW({ ...w, name: e.target.value })} placeholder="exercise" aria-label="Exercise" />}
        <div className="grid-2">
          {!walky && (
            <>
              <label className="field">
                <span>Sets</span>
                <input className="input input-sm" inputMode="numeric" value={w.sets ?? ""} onChange={(e) => setW({ ...w, sets: num(e.target.value.replace(/[^\d]/g, "")) })} />
              </label>
              <label className="field">
                <span>Reps</span>
                <input className="input input-sm" inputMode="numeric" value={w.reps ?? ""} onChange={(e) => setW({ ...w, reps: num(e.target.value.replace(/[^\d]/g, "")) })} />
              </label>
              <label className="field">
                <span>Weight ({unit})</span>
                <input className="input input-sm" inputMode="decimal" value={w.weight ?? ""} onChange={(e) => setW({ ...w, weight: num(e.target.value.replace(/[^\d.]/g, "")) })} />
              </label>
            </>
          )}
          <label className="field">
            <span>Minutes</span>
            <input className="input input-sm" inputMode="numeric" value={w.minutes ?? ""} onChange={(e) => setW({ ...w, minutes: num(e.target.value.replace(/[^\d]/g, "")) })} />
          </label>
          <label className="field">
            <span>Miles</span>
            <input className="input input-sm" inputMode="decimal" value={w.distance ?? ""} onChange={(e) => setW({ ...w, distance: num(e.target.value.replace(/[^\d.]/g, "")) })} />
          </label>
        </div>
        {walky && (
          <div className="chips">
            {DOGS.map((d) => (
              <button key={d.id} className="chip chip-sm" aria-pressed={(w.dogs ?? []).includes(d.id)} onClick={() => setW({ ...w, dogs: (w.dogs ?? []).includes(d.id) ? (w.dogs ?? []).filter((x) => x !== d.id) : [...(w.dogs ?? []), d.id] })}>
                🐾 {d.name}
              </button>
            ))}
          </div>
        )}
        <textarea className="textarea" rows={2} value={w.notes ?? ""} onChange={(e) => setW({ ...w, notes: e.target.value })} placeholder="notes (optional)" aria-label="Notes" />
        <div className="row-between">
          <button className="btn btn-sm btn-ghost" onClick={remove}>
            🗑 Delete
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function EditFood({ row, today, onClose }: { row: FoodLog; today: string; onClose: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState(row);
  const num = (v: string) => (v === "" ? null : Number(v));
  async function save() {
    const { error } = await supabaseBrowser().from("food_logs").update({ day: f.day, meal: f.meal, name: f.name?.trim() || null, kcal: f.kcal, protein: f.protein }).eq("id", row.id);
    if (error) return toast(error.message);
    refreshAll();
    toast(f.day !== row.day ? `Moved to ${format(parseISO(f.day), "MMM d")}` : "Saved");
    onClose();
  }
  async function remove() {
    await supabaseBrowser().from("food_logs").delete().eq("id", row.id);
    refreshAll();
    onClose();
  }
  return (
    <Sheet title="Edit" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Day</span>
          <input className="input" type="date" max={today} value={f.day} onChange={(e) => e.target.value && setF({ ...f, day: e.target.value })} />
        </label>
        <div className="chips">
          {MEALS.map((m) => (
            <button key={m.v} className="chip chip-sm" aria-pressed={f.meal === m.v} onClick={() => setF({ ...f, meal: f.meal === m.v ? null : m.v })}>
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
        <input className="input" value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="what (optional)" aria-label="What" />
        <div className="grid-2">
          <label className="field">
            <span>Calories</span>
            <input className="input input-sm" inputMode="numeric" value={f.kcal ?? ""} onChange={(e) => setF({ ...f, kcal: num(e.target.value.replace(/[^\d]/g, "")) })} />
          </label>
          <label className="field">
            <span>Protein (g)</span>
            <input className="input input-sm" inputMode="decimal" value={f.protein ?? ""} onChange={(e) => setF({ ...f, protein: num(e.target.value.replace(/[^\d.]/g, "")) })} />
          </label>
        </div>
        <div className="row-between">
          <button className="btn btn-sm btn-ghost" onClick={remove}>
            🗑 Delete
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function EditWeigh({ row, unit, today, onClose }: { row: WeighIn; unit: string; today: string; onClose: () => void }) {
  const { toast } = useApp();
  const [day, setDay] = useState(row.day);
  const [weight, setWeight] = useState(String(Number(row.weight)));
  async function save() {
    const w = Number(weight);
    if (!(w > 0)) return;
    const { error } = await supabaseBrowser().from("weigh_ins").update({ day, weight: w }).eq("id", row.id);
    if (error) return toast(error.message);
    refreshAll();
    toast("Saved");
    onClose();
  }
  async function remove() {
    await supabaseBrowser().from("weigh_ins").delete().eq("id", row.id);
    refreshAll();
    onClose();
  }
  return (
    <Sheet title="Edit weigh-in" onClose={onClose}>
      <div className="stack">
        <div className="grid-2">
          <label className="field">
            <span>Day</span>
            <input className="input" type="date" max={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </label>
          <label className="field">
            <span>Weight ({unit})</span>
            <input className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
        </div>
        <div className="row-between">
          <button className="btn btn-sm btn-ghost" onClick={remove}>
            🗑 Delete
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/* ─── setup ───────────────────────────────────────────────────────────── */

function FitSettings({ profile, onClose }: { profile: FitProfile; onClose: () => void }) {
  const { meId, nameOf, toast } = useApp();
  const [p, setP] = useState<FitProfile>(profile);
  const [newEx, setNewEx] = useState("");
  const [newReps, setNewReps] = useState("");
  const num = (v: string) => (v === "" ? null : Number(v));
  async function save() {
    const { error } = await supabaseBrowser()
      .from("fit_profiles")
      .upsert({
        user_id: p.user_id,
        style: p.style,
        kcal_goal: p.kcal_goal,
        protein_goal: p.protein_goal,
        start_weight: p.start_weight,
        goal_weight: p.goal_weight,
        goal_date: p.goal_date,
        unit: p.unit,
        rep_goals: p.rep_goals,
        walk_minutes_goal: p.walk_minutes_goal ?? null,
        walk_miles_goal: p.walk_miles_goal ?? null,
        walk_days_goal: p.walk_days_goal ?? null,
        updated_at: new Date().toISOString(),
      });
    if (error) return toast(error.message);
    refreshAll();
    toast("Saved");
    onClose();
  }
  return (
    <Sheet title={p.user_id === meId ? "My setup" : `${nameOf(p.user_id)}'s setup`} onClose={onClose}>
      <div className="stack">
        <div className="field">
          <span>How to track</span>
          <div className="seg seg-sm" role="group" aria-label="Tracking style">
            <button aria-pressed={p.style === "simple"} onClick={() => setP({ ...p, style: "simple" })}>
              Simple
            </button>
            <button aria-pressed={p.style === "detailed"} onClick={() => setP({ ...p, style: "detailed" })}>
              Detailed
            </button>
          </div>
          <span className="small faint">{p.style === "simple" ? "Did you eat (no numbers), walks and hikes." : "Calories and protein vs goals, reps vs goals, walks."}</span>
        </div>
        <div className="field">
          <span>Walk goals (any, all optional)</span>
          <div className="grid-3">
            <label className="field">
              <span className="small">min a day</span>
              <input className="input input-sm" inputMode="numeric" value={p.walk_minutes_goal ?? ""} onChange={(e) => setP({ ...p, walk_minutes_goal: num(e.target.value.replace(/[^\d]/g, "")) })} />
            </label>
            <label className="field">
              <span className="small">miles a day</span>
              <input className="input input-sm" inputMode="decimal" value={p.walk_miles_goal ?? ""} onChange={(e) => setP({ ...p, walk_miles_goal: num(e.target.value.replace(/[^\d.]/g, "")) })} />
            </label>
            <label className="field">
              <span className="small">days a week</span>
              <input className="input input-sm" inputMode="numeric" value={p.walk_days_goal ?? ""} onChange={(e) => setP({ ...p, walk_days_goal: num(e.target.value.replace(/[^1-7]/g, "").slice(0, 1)) })} />
            </label>
          </div>
        </div>
        {p.style === "detailed" && (
          <div className="grid-2">
            <label className="field">
              <span>Calories a day</span>
              <input className="input input-sm" inputMode="numeric" value={p.kcal_goal ?? ""} onChange={(e) => setP({ ...p, kcal_goal: num(e.target.value.replace(/[^\d]/g, "")) })} />
            </label>
            <label className="field">
              <span>Protein a day (g)</span>
              <input className="input input-sm" inputMode="numeric" value={p.protein_goal ?? ""} onChange={(e) => setP({ ...p, protein_goal: num(e.target.value.replace(/[^\d]/g, "")) })} />
            </label>
          </div>
        )}
        <div className="grid-2">
          <label className="field">
            <span>Starting weight</span>
            <input className="input input-sm" inputMode="decimal" value={p.start_weight ?? ""} onChange={(e) => setP({ ...p, start_weight: num(e.target.value.replace(/[^\d.]/g, "")) })} />
          </label>
          <label className="field">
            <span>Goal weight</span>
            <input className="input input-sm" inputMode="decimal" value={p.goal_weight ?? ""} onChange={(e) => setP({ ...p, goal_weight: num(e.target.value.replace(/[^\d.]/g, "")) })} />
          </label>
          <label className="field">
            <span>By when (optional)</span>
            <input className="input input-sm" type="date" value={p.goal_date ?? ""} onChange={(e) => setP({ ...p, goal_date: e.target.value || null })} />
          </label>
          <div className="field">
            <span>Units</span>
            <div className="seg seg-sm" role="group" aria-label="Units">
              <button aria-pressed={p.unit === "lb"} onClick={() => setP({ ...p, unit: "lb" })}>
                lb
              </button>
              <button aria-pressed={p.unit === "kg"} onClick={() => setP({ ...p, unit: "kg" })}>
                kg
              </button>
            </div>
          </div>
        </div>
        {p.style === "detailed" && (
          <div className="field">
            <span>Daily rep goals</span>
            {p.rep_goals.map((g, k) => (
              <div key={k} className="row-between small">
                <span>
                  {g.name}: {g.reps} reps
                </span>
                <button className="btn-link small" onClick={() => setP({ ...p, rep_goals: p.rep_goals.filter((_, j) => j !== k) })}>
                  remove
                </button>
              </div>
            ))}
            <div className="row" style={{ gap: 6 }}>
              <input className="input input-sm grow" value={newEx} onChange={(e) => setNewEx(e.target.value)} placeholder="exercise (push-ups)" aria-label="Goal exercise" />
              <input className="input input-sm" style={{ width: 70 }} inputMode="numeric" value={newReps} onChange={(e) => setNewReps(e.target.value.replace(/[^\d]/g, ""))} placeholder="reps" aria-label="Reps a day" />
              <button
                className="btn btn-sm"
                disabled={!newEx.trim() || !newReps}
                onClick={() => {
                  setP({ ...p, rep_goals: [...p.rep_goals, { name: newEx.trim().toLowerCase(), reps: Number(newReps) }] });
                  setNewEx("");
                  setNewReps("");
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}
        <button className="btn btn-primary btn-block" onClick={save}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
