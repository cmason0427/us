"use client";

import {
  mealMatches,
  placeMatches,
  type FoodFilters,
  type FoodPlace,
  type HomeMeal,
} from "@/lib/food";
import { useMeals, usePantry, usePlaces } from "@/lib/foodData";
import { RatingBadge } from "./FoodRating";

export type FoodPick = { kind: "place"; item: FoodPlace } | { kind: "meal"; item: HomeMeal };

/** Everything matching the filters (and search), as tappable cards. */
export function useFoodMatches(filters: FoodFilters, search = "", opts: { takeoutOnly?: boolean } = {}) {
  const places = usePlaces();
  const meals = useMeals();
  const pantry = usePantry();
  const q = search.trim().toLowerCase();
  const byName = (n: string) => !q || n.toLowerCase().includes(q);
  if (filters.mode === "out") {
    const list = places.filter(
      (p) => byName(p.name) && placeMatches(p, filters) && (!opts.takeoutOnly || p.service.includes("takeout") || p.service.includes("drive_thru") || p.service.includes("delivery")),
    );
    return { picks: list.map((item) => ({ kind: "place", item }) as FoodPick), pantry, total: places.length };
  }
  const list = meals.filter((m) => byName(m.name) && mealMatches(m, filters, pantry));
  return { picks: list.map((item) => ({ kind: "meal", item }) as FoodPick), pantry, total: meals.length };
}

/** `selected` (ids) turns it into a multi-select: picked cards show a check. */
export function FoodResults({
  picks,
  onPick,
  empty,
  selected,
}: {
  picks: FoodPick[];
  /** Unused since cards went name-only; kept so callers don't churn. */
  pantry?: Map<string, boolean>;
  onPick: (p: FoodPick, el: HTMLElement) => void;
  empty: string;
  selected?: Set<string>;
}) {
  if (!picks.length) return <p className="muted">{empty}</p>;
  return (
    <div className="stack-sm">
      {picks.map((p) =>
        p.kind === "place" ? (
          <button key={p.item.id} className="card food-card" aria-pressed={selected?.has(p.item.id)} onClick={(e) => onPick(p, e.currentTarget)}>
            <span className="name">
              {selected?.has(p.item.id) && "✓ "}
              {p.item.name}
            </span>
            <RatingBadge kind="place" id={p.item.id} />
          </button>
        ) : (
          <MealCard key={p.item.id} meal={p.item} picked={selected?.has(p.item.id)} onClick={(el) => onPick(p, el)} />
        ),
      )}
    </div>
  );
}

function MealCard({ meal, picked, onClick }: { meal: HomeMeal; picked?: boolean; onClick: (el: HTMLElement) => void }) {
  return (
    <button className="card food-card" aria-pressed={picked} onClick={(e) => onClick(e.currentTarget)}>
      <span className="name">
        {picked && "✓ "}
        {meal.name}
      </span>
      <RatingBadge kind="meal" id={meal.id} />
    </button>
  );
}
