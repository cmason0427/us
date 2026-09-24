"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useMeals, usePantry, usePlaces } from "@/lib/foodData";
import type { FoodPlace } from "@/lib/food";
import type { LunchRef } from "@/lib/lunch";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { MealDetail, MealForm, PlaceForm } from "./FoodForms";

type Order = { place_id: string; person_id: string; text: string };

/** "Our usual" at a place: a line for each of you, and either of you can fill in either. */
export function PlaceDetail({ place, onEdit }: { place: FoodPlace; onEdit: () => void }) {
  const { meId, profiles, toast } = useApp();
  const supabase = supabaseBrowser();
  const { data: orders = [] } = useLive<Order[]>(
    `place_orders:${place.id}`,
    async () => {
      const { data, error } = await supabase.from("place_orders").select("place_id, person_id, text").eq("place_id", place.id);
      if (error) throw error;
      return data as Order[];
    },
    ["place_orders"],
  );
  // Me first, then them.
  const people = [...profiles].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : 0));

  async function save(personId: string, text: string) {
    const t = text.trim();
    const had = orders.find((o) => o.person_id === personId)?.text ?? "";
    if (t === had) return;
    const { error } = t
      ? await supabase.from("place_orders").upsert({ place_id: place.id, person_id: personId, text: t, updated_by: meId, updated_at: new Date().toISOString() })
      : await supabase.from("place_orders").delete().eq("place_id", place.id).eq("person_id", personId);
    if (error) return toast(error.message);
    refreshAll();
    toast("Saved");
  }

  return (
    <div className="stack">
      <div className="field">
        <span>The usual</span>
        {people.map((p) => (
          <label key={p.id} className="field">
            <span className="small muted">{p.id === meId ? "Mine" : `${p.display_name}'s`}</span>
            <textarea
              key={orders.find((o) => o.person_id === p.id)?.text ?? ""}
              className="input"
              rows={2}
              defaultValue={orders.find((o) => o.person_id === p.id)?.text ?? ""}
              placeholder={p.id === meId ? "What you always get" : `What ${p.display_name} always gets`}
              onBlur={(e) => save(p.id, e.target.value)}
            />
          </label>
        ))}
      </div>
      {place.notes && <p className="card" style={{ whiteSpace: "pre-wrap" }}>{place.notes}</p>}
      <button className="btn btn-block" onClick={onEdit}>
        Edit place
      </button>
    </div>
  );
}

/** Tap a place or meal anywhere (lunch threads, the dashboard) to see it: usual orders or ingredients. */
export function FoodDetailSheet({ item, onClose }: { item: LunchRef; onClose: () => void }) {
  const places = usePlaces();
  const meals = useMeals();
  const pantry = usePantry();
  const [editing, setEditing] = useState(false);
  const place = item.kind === "place" ? places.find((p) => p.id === item.id) : undefined;
  const meal = item.kind === "meal" ? meals.find((m) => m.id === item.id) : undefined;
  const thing = place ?? meal;
  if (!thing) return null;
  return (
    <Sheet title={editing ? `Edit ${thing.name}` : thing.name} onClose={onClose}>
      {place ? (
        editing ? <PlaceForm initial={place} onDone={() => setEditing(false)} /> : <PlaceDetail place={place} onEdit={() => setEditing(true)} />
      ) : editing ? (
        <MealForm initial={meal} onDone={() => setEditing(false)} />
      ) : (
        <MealDetail meal={meal!} pantry={pantry} onEdit={() => setEditing(true)} />
      )}
    </Sheet>
  );
}
