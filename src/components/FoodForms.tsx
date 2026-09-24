"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import {
  CUISINE_OPTIONS,
  DISTANCE_OPTIONS,
  MEAL_OPTIONS,
  METHOD_OPTIONS,
  PRICE_OPTIONS,
  SERVICE_OPTIONS,
  SIZE_OPTIONS,
  TIME_OPTIONS,
  missingFor,
  type FoodPlace,
  type HomeMeal,
} from "@/lib/food";
import { setHave } from "@/lib/foodData";
import { useApp } from "./AppProvider";

type Opt = { v: string; label: string };

function Pick({ label, options, value, onChange }: { label: string; options: Opt[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="chips">
        {options.map((o) => (
          <button key={o.v} type="button" className="chip chip-sm" aria-pressed={value === o.v} onClick={() => onChange(value === o.v ? null : o.v)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PickMany({ label, options, value, onChange }: { label: string; options: Opt[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="chips">
        {options.map((o) => {
          const on = value.includes(o.v);
          return (
            <button key={o.v} type="button" className="chip chip-sm" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.v) : [...value, o.v])}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const boolOpt = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : null);
const optBool = (v: string | null) => (v === "yes" ? true : v === "no" ? false : null);

/* ─── Places ─────────────────────────────────────────────────────────────── */

export function PlaceForm({ initial, onDone }: { initial?: FoodPlace; onDone: () => void }) {
  const { meId, toast } = useApp();
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState<string | null>(initial?.price ?? null);
  const [cuisines, setCuisines] = useState<string[]>(initial?.cuisines ?? []);
  const [distance, setDistance] = useState<string | null>(initial?.distance ?? null);
  const [service, setService] = useState<string[]>(initial?.service ?? []);
  const [meals, setMeals] = useState<string[]>(initial?.meals ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const supabase = supabaseBrowser();
    const row = { name: name.trim(), price, cuisines, distance, service, meals, notes: notes.trim() || null };
    const { error } = initial ? await supabase.from("food_places").update(row).eq("id", initial.id) : await supabase.from("food_places").insert({ ...row, created_by: meId });
    setBusy(false);
    if (error) return toast(error.message);
    refreshAll();
    toast(initial ? "Saved" : "Added 🍽️");
    onDone();
  }

  async function remove() {
    if (!initial || !confirm(`Remove ${initial.name}?`)) return;
    await supabaseBrowser().from("food_places").delete().eq("id", initial.id);
    refreshAll();
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Place name" autoFocus={!initial} required />
      <p className="small muted">All optional. Tap again to clear.</p>
      <Pick label="Price" options={PRICE_OPTIONS} value={price} onChange={setPrice} />
      <PickMany label="Cuisine" options={CUISINE_OPTIONS} value={cuisines} onChange={setCuisines} />
      <Pick label="Distance" options={DISTANCE_OPTIONS} value={distance} onChange={setDistance} />
      <PickMany label="How" options={SERVICE_OPTIONS} value={service} onChange={setService} />
      <PickMany label="Good for" options={MEAL_OPTIONS} value={meals} onChange={setMeals} />
      <label className="field">
        <span>Notes</span>
        <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Get the spicy chicken, closed Mondays…" />
      </label>
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

/* ─── Home meals ─────────────────────────────────────────────────────────── */

export function MealForm({ initial, onDone }: { initial?: HomeMeal; onDone: () => void }) {
  const { meId, toast } = useApp();
  const [name, setName] = useState(initial?.name ?? "");
  const [safe, setSafe] = useState<boolean | null>(initial?.safe ?? null);
  const [fancy, setFancy] = useState<boolean | null>(initial?.fancy ?? null);
  const [method, setMethod] = useState<string | null>(initial?.method ?? null);
  const [size, setSize] = useState<string | null>(initial?.size ?? null);
  const [time, setTime] = useState<string | null>(initial?.time ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [ingredients, setIngredients] = useState<string[]>(
    initial ? [...initial.meal_ingredients].sort((a, b) => a.position - b.position).map((i) => i.name) : [""],
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const supabase = supabaseBrowser();
    const row = { name: name.trim(), safe, fancy, method, size, time, notes: notes.trim() || null };
    const res = initial
      ? await supabase.from("home_meals").update(row).eq("id", initial.id).select("id").single()
      : await supabase.from("home_meals").insert({ ...row, created_by: meId }).select("id").single();
    if (res.error) {
      setBusy(false);
      return toast(res.error.message);
    }
    // Ingredients: simplest correct thing for a short list is replace-all.
    const mealId = res.data.id;
    const list = ingredients.map((i) => i.trim()).filter(Boolean);
    if (initial) await supabase.from("meal_ingredients").delete().eq("meal_id", mealId);
    if (list.length) {
      const { error } = await supabase.from("meal_ingredients").insert(list.map((n, position) => ({ meal_id: mealId, name: n, position })));
      if (error) toast(error.message);
    }
    setBusy(false);
    refreshAll();
    toast(initial ? "Saved" : "Added 🍳");
    onDone();
  }

  async function remove() {
    if (!initial || !confirm(`Remove ${initial.name}?`)) return;
    await supabaseBrowser().from("home_meals").delete().eq("id", initial.id);
    refreshAll();
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Meal or snack name" autoFocus={!initial} required />
      <div className="field">
        <span>Ingredients</span>
        {ingredients.map((ing, i) => (
          <div key={i} className="row">
            <input
              className="input grow"
              value={ing}
              onChange={(e) => setIngredients((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setIngredients((l) => [...l, ""]);
                }
              }}
              placeholder={i === 0 ? "Eggs, tortillas, shredded cheese…" : "Another ingredient"}
              aria-label={`Ingredient ${i + 1}`}
              autoFocus={i > 0 && i === ingredients.length - 1 && !ing}
            />
            {ingredients.length > 1 && (
              <button type="button" className="icon-btn" onClick={() => setIngredients((l) => l.filter((_, j) => j !== i))} aria-label="Remove ingredient">
                ×
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setIngredients((l) => [...l, ""])}>
          + Ingredient
        </button>
      </div>
      <p className="small muted">The rest is optional. Tap again to clear.</p>
      <Pick label="Safe food" options={[{ v: "yes", label: "Safe food" }, { v: "no", label: "Not a safe food" }]} value={boolOpt(safe)} onChange={(v) => setSafe(optBool(v))} />
      <Pick label="Fancy" options={[{ v: "yes", label: "✨ Fancy" }, { v: "no", label: "Simple" }]} value={boolOpt(fancy)} onChange={(v) => setFancy(optBool(v))} />
      <Pick label="How it's made" options={METHOD_OPTIONS} value={method} onChange={setMethod} />
      <Pick label="Size" options={SIZE_OPTIONS} value={size} onChange={setSize} />
      <Pick label="Time" options={TIME_OPTIONS} value={time} onChange={setTime} />
      <label className="field">
        <span>How to make it</span>
        <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Recipe, link, or just 'the usual'" />
      </label>
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

/** A meal's ingredients with have/need checkboxes (shared pantry), plus "add missing to shopping". */
export function MealDetail({ meal, pantry, onEdit }: { meal: HomeMeal; pantry: Map<string, boolean>; onEdit: () => void }) {
  const { meId, toast } = useApp();
  const ings = [...meal.meal_ingredients].sort((a, b) => a.position - b.position);
  const missing = missingFor(meal, pantry);

  async function toggle(name: string, have: boolean) {
    const { error } = await setHave(name, have);
    if (error) toast(error.message);
    refreshAll();
  }

  async function addMissing() {
    const { error } = await supabaseBrowser()
      .from("tasks")
      .insert(missing.map((n) => ({ title: `Buy ${n}`, list_type: "household", created_by: meId })));
    if (error) return toast(error.message);
    refreshAll();
    toast(`Added ${missing.length} to Household 🛒`);
  }

  return (
    <div className="stack">
      {ings.length === 0 ? (
        <p className="muted">No ingredients listed.</p>
      ) : (
        <div className="card" style={{ padding: "4px 14px" }}>
          {ings.map((i) => {
            const have = !!pantry.get(i.name.trim().toLowerCase());
            return (
              <label key={i.id} className={`task${have ? "" : " need"}`} style={{ cursor: "pointer" }}>
                <input type="checkbox" className="check" checked={have} onChange={(e) => toggle(i.name, e.target.checked)} aria-label={`Have ${i.name}`} />
                <span className="grow task-title">{i.name}</span>
                <span className="small faint">{have ? "have it" : "need it"}</span>
              </label>
            );
          })}
        </div>
      )}
      <p className="small muted">Checking something off here counts for every meal that uses it.</p>
      {missing.length > 0 && (
        <button className="btn btn-sage" onClick={addMissing}>
          🛒 Add {missing.length} missing to shopping
        </button>
      )}
      {meal.notes && <p className="card" style={{ whiteSpace: "pre-wrap" }}>{meal.notes}</p>}
      <button className="btn btn-block" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}
