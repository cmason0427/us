"use client";

import { useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { useMeals } from "@/lib/foodData";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

// Fuel & move: weight-gain and workout tracking, shaped per person.
//   simple   → "did I eat?" per meal, a daily hike, weigh-ins
//   detailed → calories + protein vs goals, reps vs goals, weigh-ins
// Either of you can log for the other; every entry says who logged it.

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
interface WorkoutLog {
  id: string;
  user_id: string;
  logged_by: string;
  day: string;
  kind: "hike" | "strength" | "cardio" | "other";
  name: string | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  minutes: number | null;
  distance: number | null;
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
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const mealAt = (h: number): Meal => (h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack");

function useFit(userId: string | undefined) {
  const db = supabaseBrowser();
  const since = iso(addDays(new Date(), -120));
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

/** The whole page: whose, which day, then their style of tracking. */
export function FitView() {
  const { meId, partner, nameOf } = useApp();
  const now = useNow();
  const [who, setWho] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [settings, setSettings] = useState(false);
  const person = who ?? meId;
  const { profile, food, work, weights } = useFit(person);
  if (!now) return null;
  const day = iso(addDays(now, offset));
  const mine = person === meId;
  const name = mine ? "you" : nameOf(person);

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
      <div className="row-between fit-day">
        <button className="icon-btn" onClick={() => setOffset((o) => o - 1)} aria-label="Day before">
          ‹
        </button>
        <strong>{offset === 0 ? "Today" : offset === -1 ? "Yesterday" : format(parseISO(day), "EEE, MMM d")}</strong>
        <button className="icon-btn" disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))} aria-label="Next day">
          ›
        </button>
      </div>

      {profile.style === "simple" ? (
        <>
          <DidEat person={person} day={day} food={food.filter((f) => f.day === day)} name={name} mine={mine} />
          <Hikes person={person} day={day} work={work} today={iso(now)} />
        </>
      ) : (
        <>
          <Fuel person={person} day={day} profile={profile} food={food.filter((f) => f.day === day)} />
          <Reps person={person} day={day} profile={profile} work={work.filter((w) => w.day === day)} />
        </>
      )}
      <Weight person={person} profile={profile} weights={weights} today={iso(now)} />
      {settings && <FitSettings profile={profile} onClose={() => setSettings(false)} />}
    </div>
  );
}

/* ─── simple: did you eat ─────────────────────────────────────────────── */

function DidEat({ person, day, food, name, mine }: { person: string; day: string; food: FoodLog[]; name: string; mine: boolean }) {
  const { meId, nameOf, toast } = useApp();
  const db = supabaseBrowser();
  async function toggle(m: Meal) {
    const had = food.filter((f) => f.meal === m);
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
                <span className="grow">
                  {f.meal ? `${MEALS.find((m) => m.v === f.meal)?.emoji} ` : ""}
                  {f.name}
                  {f.logged_by !== person && <span className="small faint"> · by {f.logged_by === meId ? "you" : nameOf(f.logged_by)}</span>}
                </span>
              </li>
            ))}
        </ul>
      )}
      <p className="small faint" style={{ margin: 0 }}>Just tap what got eaten. No numbers.</p>
    </section>
  );
}

/* ─── simple: hikes ───────────────────────────────────────────────────── */

function Hikes({ person, day, work, today }: { person: string; day: string; work: WorkoutLog[]; today: string }) {
  const { meId, toast } = useApp();
  const db = supabaseBrowser();
  const hikes = work.filter((w) => w.kind === "hike");
  const todays = hikes.find((h) => h.day === day);
  const [minutes, setMinutes] = useState("");
  const [miles, setMiles] = useState("");
  // Streak: days in a row with a hike, counting back from today (or yesterday, if today's not done yet).
  const days = new Set(hikes.map((h) => h.day));
  let streak = 0;
  for (let d = days.has(today) ? parseISO(today) : addDays(parseISO(today), -1); days.has(iso(d)); d = addDays(d, -1)) streak++;
  const week = Array.from({ length: 7 }, (_, k) => iso(addDays(parseISO(today), k - 6)));

  async function toggle() {
    const { error } = todays ? await db.from("workout_logs").delete().eq("id", todays.id) : await db.from("workout_logs").insert({ user_id: person, logged_by: meId, day, kind: "hike", name: "hike" });
    if (error) return toast(error.message);
    if (!todays) toast("🥾 Hike logged");
    refreshAll();
  }
  async function saveDetails() {
    if (!todays) return;
    const { error } = await db.from("workout_logs").update({ minutes: Number(minutes) || null, distance: Number(miles) || null }).eq("id", todays.id);
    if (error) return toast(error.message);
    setMinutes("");
    setMiles("");
    refreshAll();
  }

  return (
    <section className="card fit-card">
      <div className="row-between">
        <strong>🥾 Hike</strong>
        <span className="small faint">{streak ? `🔥 ${streak} day${streak === 1 ? "" : "s"} in a row` : "start a streak"}</span>
      </div>
      <button className={`fit-big${todays ? " done" : ""}`} onClick={toggle}>
        {todays ? "✓ Hiked" : "Hiked?"}
      </button>
      {todays && (
        <div className="row wrap" style={{ gap: 6 }}>
          {todays.minutes || todays.distance ? (
            <span className="small">
              {[todays.minutes ? `${todays.minutes} min` : null, todays.distance ? `${todays.distance} mi` : null].filter(Boolean).join(" · ")}
            </span>
          ) : (
            <span className="small faint">How long? (optional)</span>
          )}
          <input className="input input-sm" style={{ width: 70 }} inputMode="numeric" placeholder="min" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ""))} aria-label="Minutes" />
          <input className="input input-sm" style={{ width: 70 }} inputMode="decimal" placeholder="miles" value={miles} onChange={(e) => setMiles(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Miles" />
          {(minutes || miles) && (
            <button className="btn btn-sm" onClick={saveDetails}>
              Save
            </button>
          )}
        </div>
      )}
      <div className="fit-week" aria-label="This week">
        {week.map((d) => (
          <span key={d} className={`fit-dot${days.has(d) ? " on" : ""}${d === day ? " sel" : ""}`} title={d}>
            {format(parseISO(d), "EEEEE")}
          </span>
        ))}
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

function Fuel({ person, day, profile, food }: { person: string; day: string; profile: FitProfile; food: FoodLog[] }) {
  const { meId, nameOf } = useApp();
  const db = supabaseBrowser();
  const kcalSum = food.reduce((a, f) => a + (f.kcal ?? 0), 0);
  const proteinSum = food.reduce((a, f) => a + Number(f.protein ?? 0), 0);
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
              <span className="grow">
                {f.meal ? `${MEALS.find((m) => m.v === f.meal)?.emoji} ` : ""}
                {f.name ?? "something"}
                {f.logged_by !== person && <span className="small faint"> · by {f.logged_by === meId ? "you" : nameOf(f.logged_by)}</span>}
              </span>
              <span className="small">{[f.kcal != null ? `${f.kcal} kcal` : null, f.protein != null ? `${Number(f.protein)}g` : null].filter(Boolean).join(" · ")}</span>
              <button
                className="btn-link small faint"
                aria-label="Remove"
                onClick={async () => {
                  await db.from("food_logs").delete().eq("id", f.id);
                  refreshAll();
                }}
              >
                ✕
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

function Reps({ person, day, profile, work }: { person: string; day: string; profile: FitProfile; work: WorkoutLog[] }) {
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
              <span className="grow">{w.kind === "hike" ? "🥾 hike" : w.name ?? w.kind}</span>
              <span className="small">
                {[w.sets && w.reps ? `${w.sets}×${w.reps}` : null, w.weight ? `${Number(w.weight)} ${profile.unit}` : null, w.minutes ? `${w.minutes} min` : null].filter(Boolean).join(" · ")}
              </span>
              <button
                className="btn-link small faint"
                aria-label="Remove"
                onClick={async () => {
                  await db.from("workout_logs").delete().eq("id", w.id);
                  refreshAll();
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─── both: weight ────────────────────────────────────────────────────── */

function Weight({ person, profile, weights, today }: { person: string; profile: FitProfile; weights: WeighIn[]; today: string }) {
  const { meId, toast } = useApp();
  const [draft, setDraft] = useState("");
  const latest = weights[weights.length - 1];
  const start = profile.start_weight ?? weights[0]?.weight ?? null;
  const change = latest && start != null ? Number(latest.weight) - Number(start) : null;
  const toGo = latest && profile.goal_weight != null ? Number(profile.goal_weight) - Number(latest.weight) : null;
  const daysLeft = profile.goal_date ? differenceInCalendarDays(parseISO(profile.goal_date), parseISO(today)) : null;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const w = Number(draft);
    if (!(w > 0)) return;
    const { error } = await supabaseBrowser().from("weigh_ins").insert({ user_id: person, logged_by: meId, day: today, weight: w });
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
            {change != null && change !== 0 ? <span className={change > 0 ? "fit-up" : "fit-down"}> {change > 0 ? "▲" : "▼"} {Math.abs(Math.round(change * 10) / 10)}</span> : null}
          </span>
        )}
      </div>
      {pts.length > 1 && (
        <svg className="fit-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Weight over time">
          {profile.goal_weight != null && <line x1={0} x2={W} y1={y(Number(profile.goal_weight))} y2={y(Number(profile.goal_weight))} className="fit-goal-line" />}
          <polyline points={pts.map((p, k) => `${x(k)},${y(Number(p.weight))}`).join(" ")} className="fit-line" />
          {pts.map((p, k) => (
            <circle key={p.id} cx={x(k)} cy={y(Number(p.weight))} r={2.5} className="fit-point" />
          ))}
        </svg>
      )}
      {(toGo != null || daysLeft != null) && (
        <span className="small faint">
          {toGo != null && toGo > 0 ? `${Math.round(toGo * 10) / 10} ${profile.unit} to goal` : toGo != null ? "goal reached 🎉" : ""}
          {daysLeft != null && daysLeft > 0 ? ` · ${daysLeft} days to ${format(parseISO(profile.goal_date!), "MMM d")}` : ""}
        </span>
      )}
      <form className="quick-add" onSubmit={add}>
        <input className="input input-sm grow" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))} placeholder={`today's weight (${profile.unit})`} aria-label="Weight" />
        <button className="btn btn-sm" disabled={!draft}>
          Log
        </button>
      </form>
    </section>
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
          <span className="small faint">{p.style === "simple" ? "Did you eat (no numbers) and a daily hike." : "Calories and protein vs goals, and reps vs goals."}</span>
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
