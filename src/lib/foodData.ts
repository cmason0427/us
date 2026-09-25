"use client";

import { useMemo } from "react";
import { supabaseBrowser } from "./supabase/client";
import { useLive } from "./useLive";
import type { FoodPlace, HomeMeal } from "./food";

export function usePlaces() {
  const { data = [] } = useLive<FoodPlace[]>(
    "food_places",
    async () => {
      const { data, error } = await supabaseBrowser().from("food_places").select("*").order("name");
      if (error) throw error;
      return data as FoodPlace[];
    },
    ["food_places"],
  );
  return data;
}

export function useMeals() {
  const { data = [] } = useLive<HomeMeal[]>(
    "home_meals",
    async () => {
      const { data, error } = await supabaseBrowser().from("home_meals").select("*, meal_ingredients(id, name, position)").order("name");
      if (error) throw error;
      return data as HomeMeal[];
    },
    ["home_meals", "meal_ingredients"],
  );
  return data;
}

/** name (lowercased) → do we have it. Missing names count as "don't have". */
export function usePantry() {
  const { data = [] } = useLive<{ name: string; have: boolean }[]>(
    "pantry",
    async () => {
      const { data, error } = await supabaseBrowser().from("pantry").select("name, have");
      if (error) throw error;
      return data;
    },
    ["pantry"],
  );
  return useMemo(() => new Map(data.map((p) => [p.name, p.have])), [data]);
}

export async function setHave(name: string, have: boolean) {
  return supabaseBrowser()
    .from("pantry")
    // Restocked or used up either way, it's no longer "almost out".
    .upsert({ name: name.trim().toLowerCase(), have, low: false, updated_at: new Date().toISOString() });
}

export interface FoodRating {
  kind: "place" | "meal";
  ref_id: string;
  user_id: string;
  score: number;
}
/** Everyone's 1-10 scores, keyed "kind:id". */
export function useFoodRatings() {
  const { data = [] } = useLive<FoodRating[]>(
    "food_ratings",
    async () => {
      const { data, error } = await supabaseBrowser().from("food_ratings").select("kind, ref_id, user_id, score");
      if (error) throw error;
      return data as FoodRating[];
    },
    ["food_ratings"],
  );
  return useMemo(() => {
    const m = new Map<string, FoodRating[]>();
    for (const r of data) {
      const k = `${r.kind}:${r.ref_id}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  }, [data]);
}
