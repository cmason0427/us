"use client";

import {
  CUISINE_OPTIONS,
  DISTANCE_OPTIONS,
  METHOD_OPTIONS,
  PRICE_OPTIONS,
  SERVICE_OPTIONS,
  labelOf,
  mealMatches,
  missingFor,
  placeMatches,
  type FoodFilters,
  type FoodPlace,
  type HomeMeal,
} from "@/lib/food";
import { useMeals, usePantry, usePlaces } from "@/lib/foodData";

export type FoodPick = { kind: "place"; item: FoodPlace } | { kind: "meal"; item: HomeMeal };

function placeTags(p: FoodPlace) {
  return [
    labelOf(PRICE_OPTIONS, p.price),
    ...p.cuisines.map((c) => labelOf(CUISINE_OPTIONS, c)),
    labelOf(DISTANCE_OPTIONS, p.distance),
    ...p.service.map((s) => labelOf(SERVICE_OPTIONS, s)),
  ].filter(Boolean) as string[];
}

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
  pantry,
  onPick,
  empty,
  selected,
}: {
  picks: FoodPick[];
  pantry: Map<string, boolean>;
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
            <span className="chips">
              {placeTags(p.item).map((t) => (
                <span key={t} className="sticker">
                  {t}
                </span>
              ))}
            </span>
          </button>
        ) : (
          <MealCard key={p.item.id} meal={p.item} pantry={pantry} picked={selected?.has(p.item.id)} onClick={(el) => onPick(p, el)} />
        ),
      )}
    </div>
  );
}

function MealCard({ meal, pantry, picked, onClick }: { meal: HomeMeal; pantry: Map<string, boolean>; picked?: boolean; onClick: (el: HTMLElement) => void }) {
  const missing = missingFor(meal, pantry);
  const tags = [meal.safe ? "Safe food" : null, meal.fancy ? "✨ Fancy" : null, labelOf(METHOD_OPTIONS, meal.method), meal.size === "snack" ? "🍿 Snack" : null].filter(Boolean) as string[];
  return (
    <button className="card food-card" aria-pressed={picked} onClick={(e) => onClick(e.currentTarget)}>
      <span className="name">
        {picked && "✓ "}
        {meal.name}
      </span>
      <span className="chips">
        <span className={`sticker ${missing.length ? "butter" : "sage"}`}>
          {meal.meal_ingredients.length === 0 ? "no ingredients listed" : missing.length ? `missing ${missing.length}` : "have everything"}
        </span>
        {tags.map((t) => (
          <span key={t} className="sticker">
            {t}
          </span>
        ))}
      </span>
    </button>
  );
}
