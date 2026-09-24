"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { COST_OPTIONS, DURATION_OPTIONS, KEEP_OPTIONS, SETTING_OPTIONS } from "@/lib/activity";
import { CUISINE_OPTIONS, DISTANCE_OPTIONS, MEAL_OPTIONS, METHOD_OPTIONS, PRICE_OPTIONS, SERVICE_OPTIONS, SIZE_OPTIONS, TIME_OPTIONS } from "@/lib/food";
import { useApp } from "./AppProvider";
import { BatchAdd, type BatchColumn, type BatchRow } from "./BatchAdd";

// "Add several" for activities, places and home meals, shared by their pages
// and the ＋ menu.

const one = (v: unknown) => (typeof v === "string" ? v : null);
const many = (v: unknown) => (Array.isArray(v) ? v : []);
const yesNo = (v: unknown) => (v === "yes" ? true : v === "no" ? false : null);

export function ActivityBatch({ onDone }: { onDone: () => void }) {
  const { meId, profiles, toast } = useApp();
  const columns: BatchColumn[] = [
    { key: "energy", label: "Energy", required: true, initial: "low", options: [{ v: "low", label: "🛋️ Low" }, { v: "medium", label: "🚶 Medium" }, { v: "high", label: "⚡ High" }] },
    { key: "who", label: "Who", required: true, initial: "both", options: [{ v: "both", label: "Both" }, ...profiles.map((p) => ({ v: p.id, label: p.display_name })), { v: "anyone", label: "Either" }] },
    { key: "keep", label: "Keep it?", required: true, initial: "keep", options: KEEP_OPTIONS },
    { key: "setting", label: "Where", options: SETTING_OPTIONS },
    { key: "cost", label: "Cost", options: COST_OPTIONS },
    { key: "duration", label: "How long", options: DURATION_OPTIONS },
  ];
  async function save(rows: BatchRow[]) {
    const { error } = await supabaseBrowser()
      .from("activities")
      .insert(
        rows.map((r) => ({
          name: r.name,
          energy_level: one(r.values.energy),
          participant: r.values.who === "both" || r.values.who === "anyone" ? null : one(r.values.who),
          anyone: r.values.who === "anyone",
          recurring: r.values.keep !== "once",
          setting: one(r.values.setting),
          cost: one(r.values.cost),
          duration: one(r.values.duration),
          created_by: meId,
        })),
      );
    if (error) return error.message;
    refreshAll();
    toast(`Added ${rows.length} idea${rows.length === 1 ? "" : "s"} ✨`);
    onDone();
    return null;
  }
  return <BatchAdd columns={columns} placeholder="Farmers market, puzzle…" noun="ideas" onSave={save} />;
}

export function PlaceBatch({ onDone }: { onDone: () => void }) {
  const { meId, toast } = useApp();
  const columns: BatchColumn[] = [
    { key: "price", label: "Price", options: PRICE_OPTIONS },
    { key: "cuisines", label: "Cuisine", options: CUISINE_OPTIONS, multi: true },
    { key: "distance", label: "Distance", options: DISTANCE_OPTIONS },
    { key: "service", label: "How", options: SERVICE_OPTIONS, multi: true },
    { key: "meals", label: "Good for", options: MEAL_OPTIONS, multi: true },
  ];
  async function save(rows: BatchRow[]) {
    const { error } = await supabaseBrowser()
      .from("food_places")
      .insert(
        rows.map((r) => ({
          name: r.name,
          price: one(r.values.price),
          cuisines: many(r.values.cuisines),
          distance: one(r.values.distance),
          service: many(r.values.service),
          meals: many(r.values.meals),
          created_by: meId,
        })),
      );
    if (error) return error.message;
    refreshAll();
    toast(`Added ${rows.length} place${rows.length === 1 ? "" : "s"} 🍽️`);
    onDone();
    return null;
  }
  return <BatchAdd columns={columns} placeholder="Place name" noun="places" onSave={save} />;
}

export function MealBatch({ onDone }: { onDone: () => void }) {
  const { meId, toast } = useApp();
  const columns: BatchColumn[] = [
    { key: "ingredients", label: "Ingredients (commas between)", options: [], text: "Eggs, tortillas, cheese" },
    { key: "safe", label: "Safe food", options: [{ v: "yes", label: "Safe food" }, { v: "no", label: "Not a safe food" }] },
    { key: "fancy", label: "Fancy", options: [{ v: "yes", label: "✨ Fancy" }, { v: "no", label: "Simple" }] },
    { key: "method", label: "How it's made", options: METHOD_OPTIONS },
    { key: "size", label: "Size", options: SIZE_OPTIONS },
    { key: "time", label: "Time", options: TIME_OPTIONS },
  ];
  async function save(rows: BatchRow[]) {
    const supabase = supabaseBrowser();
    const { data, error } = await supabase
      .from("home_meals")
      .insert(
        rows.map((r) => ({
          name: r.name,
          safe: yesNo(r.values.safe),
          fancy: yesNo(r.values.fancy),
          method: one(r.values.method),
          size: one(r.values.size),
          time: one(r.values.time),
          created_by: meId,
        })),
      )
      .select("id");
    if (error) return error.message;
    const ingredients = (data ?? []).flatMap((m, i) =>
      (one(rows[i].values.ingredients) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name, position) => ({ meal_id: m.id, name, position })),
    );
    if (ingredients.length) {
      const { error: ingErr } = await supabase.from("meal_ingredients").insert(ingredients);
      if (ingErr) return ingErr.message;
    }
    refreshAll();
    toast(`Added ${rows.length} meal${rows.length === 1 ? "" : "s"} 🍳`);
    onDone();
    return null;
  }
  return <BatchAdd columns={columns} placeholder="Meal or snack name" noun="meals" onSave={save} />;
}
