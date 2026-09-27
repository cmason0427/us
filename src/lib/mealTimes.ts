"use client";

import { supabaseBrowser } from "./supabase/client";
import { useLive, refreshAll } from "./useLive";

// A meal with a set time ("dinner at 7") shows on the calendar at that time.

export type MealName = "breakfast" | "lunch" | "dinner";
export interface MealTime {
  day: string;
  meal: MealName;
  at: string; // HH:mm:ss
  set_by: string;
}

/** What a meal at this time is called: before 10:30 breakfast, before 3 lunch, then dinner. */
export function mealForTime(hhmm: string): MealName {
  if (hhmm < "10:30") return "breakfast";
  if (hhmm < "15:00") return "lunch";
  return "dinner";
}

export const MEAL_EMOJI: Record<MealName, string> = { breakfast: "🥞", lunch: "🥪", dinner: "🍝" };

export function useMealTimesRange(from: string, to: string) {
  const { data = [] } = useLive<MealTime[]>(
    `meal_times:${from}:${to}`,
    async () => {
      const { data, error } = await supabaseBrowser().from("meal_times").select("*").gte("day", from).lte("day", to).order("day").order("at");
      if (error) throw error;
      return data as MealTime[];
    },
    ["meal_times"],
  );
  return data;
}

export function useMealTime(day: string, meal: MealName) {
  return useMealTimesRange(day, day).find((m) => m.meal === meal) ?? null;
}

/** Set (or clear, with null) a meal's time. */
export async function setMealTime(day: string, meal: MealName, at: string | null, meId: string) {
  const db = supabaseBrowser();
  const { error } = at
    ? await db.from("meal_times").upsert({ day, meal, at, set_by: meId, updated_at: new Date().toISOString() })
    : await db.from("meal_times").delete().eq("day", day).eq("meal", meal);
  refreshAll();
  return error?.message ?? null;
}
