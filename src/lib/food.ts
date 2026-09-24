// Eat: places to go and meals to make. Every option is optional; an unset one
// passes any filter (same rule as activities). The filters are plain JSON so
// the lunch planner can send "here's what I'm feeling" to the other person.

export interface FoodPlace {
  id: string;
  name: string;
  price: "1" | "2" | "3" | null;
  cuisines: string[];
  distance: "close" | "medium" | "far" | null;
  service: string[];
  meals: string[];
  notes: string | null;
  created_by: string;
}

export interface HomeMeal {
  id: string;
  name: string;
  safe: boolean | null;
  fancy: boolean | null;
  method: "no_cook" | "microwave" | "stovetop" | "oven" | "air_fryer" | null;
  size: "snack" | "meal" | null;
  time: "quick" | "medium" | "long" | null;
  notes: string | null;
  created_by: string;
  meal_ingredients: { id: string; name: string; position: number }[];
}

type Opt = { v: string; label: string };

export const PRICE_OPTIONS: Opt[] = [
  { v: "1", label: "$" },
  { v: "2", label: "$$" },
  { v: "3", label: "$$$" },
];
export const CUISINE_OPTIONS: Opt[] = [
  { v: "american", label: "American" },
  { v: "burgers", label: "Burgers" },
  { v: "pizza", label: "Pizza" },
  { v: "mexican", label: "Mexican" },
  { v: "italian", label: "Italian" },
  { v: "chinese", label: "Chinese" },
  { v: "japanese", label: "Japanese / sushi" },
  { v: "thai", label: "Thai" },
  { v: "vietnamese", label: "Vietnamese / pho" },
  { v: "korean", label: "Korean" },
  { v: "indian", label: "Indian" },
  { v: "mediterranean", label: "Mediterranean" },
  { v: "sandwiches", label: "Sandwiches / deli" },
  { v: "chicken", label: "Chicken" },
  { v: "bbq", label: "BBQ" },
  { v: "seafood", label: "Seafood" },
  { v: "breakfast", label: "Breakfast / brunch" },
  { v: "healthy", label: "Salads / healthy" },
  { v: "coffee", label: "Coffee / bakery" },
  { v: "dessert", label: "Dessert" },
];
export const DISTANCE_OPTIONS: Opt[] = [
  { v: "close", label: "Close" },
  { v: "medium", label: "10–20 min" },
  { v: "far", label: "Worth the drive" },
];
export const SERVICE_OPTIONS: Opt[] = [
  { v: "drive_thru", label: "🚗 Drive-thru" },
  { v: "sit_down", label: "🍽️ Sit-down" },
  { v: "takeout", label: "🥡 Takeout" },
  { v: "delivery", label: "🛵 Delivery" },
];
export const MEAL_OPTIONS: Opt[] = [
  { v: "breakfast", label: "Breakfast" },
  { v: "lunch", label: "Lunch" },
  { v: "dinner", label: "Dinner" },
  { v: "late", label: "Late night" },
];
export const METHOD_OPTIONS: Opt[] = [
  { v: "no_cook", label: "No cooking" },
  { v: "microwave", label: "Microwave" },
  { v: "stovetop", label: "Stovetop" },
  { v: "oven", label: "Oven" },
  { v: "air_fryer", label: "Air fryer" },
];
export const SIZE_OPTIONS: Opt[] = [
  { v: "snack", label: "🍿 Snack" },
  { v: "meal", label: "🍝 Meal" },
];
export const TIME_OPTIONS: Opt[] = [
  { v: "quick", label: "Under 20 min" },
  { v: "medium", label: "20–45 min" },
  { v: "long", label: "A project" },
];
export const YES_NO: Opt[] = [
  { v: "yes", label: "Yes" },
  { v: "no", label: "No" },
];

export const labelOf = (opts: Opt[], v: string | null | undefined) => opts.find((o) => o.v === v)?.label;

/** What you're in the mood for. Everything optional; mode is the first choice. */
export interface FoodFilters {
  mode: "out" | "cook";
  // out
  price?: string | null;
  cuisine?: string | null;
  distance?: string | null;
  service?: string | null;
  meal?: string | null;
  // cook
  safe?: boolean | null;
  fancy?: boolean | null;
  method?: string | null;
  size?: string | null;
  time?: string | null;
  canMakeNow?: boolean;
}

const fits = (want: string | null | undefined, have: string | null) => !want || !have || want === have;
const fitsAny = (want: string | null | undefined, have: string[]) => !want || have.length === 0 || have.includes(want);
const fitsBool = (want: boolean | null | undefined, have: boolean | null) => want == null || have == null || want === have;

export const placeMatches = (p: FoodPlace, f: FoodFilters) =>
  fits(f.price, p.price) && fitsAny(f.cuisine, p.cuisines) && fits(f.distance, p.distance) && fitsAny(f.service, p.service) && fitsAny(f.meal, p.meals);

/** Ingredient names this meal needs that the pantry says we don't have. */
export const missingFor = (m: HomeMeal, pantry: Map<string, boolean>) =>
  m.meal_ingredients.filter((i) => !pantry.get(i.name.trim().toLowerCase())).map((i) => i.name);

export const mealMatches = (m: HomeMeal, f: FoodFilters, pantry: Map<string, boolean>) =>
  fitsBool(f.safe, m.safe) &&
  fitsBool(f.fancy, m.fancy) &&
  fits(f.method, m.method) &&
  fits(f.size, m.size) &&
  fits(f.time, m.time) &&
  (!f.canMakeNow || missingFor(m, pantry).length === 0);

/** "$$ · Mexican · takeout", for summaries (lunch plans, feed text). */
export function describeFilters(f: FoodFilters) {
  const parts =
    f.mode === "out"
      ? [
          labelOf(PRICE_OPTIONS, f.price),
          labelOf(CUISINE_OPTIONS, f.cuisine),
          labelOf(DISTANCE_OPTIONS, f.distance),
          labelOf(SERVICE_OPTIONS, f.service),
          labelOf(MEAL_OPTIONS, f.meal),
        ]
      : [
          f.safe === true ? "safe food" : f.safe === false ? "not a safe food" : null,
          f.fancy === true ? "fancy" : f.fancy === false ? "not fancy" : null,
          labelOf(METHOD_OPTIONS, f.method),
          labelOf(SIZE_OPTIONS, f.size),
          labelOf(TIME_OPTIONS, f.time),
          f.canMakeNow ? "have everything" : null,
        ];
  const rest = parts.filter(Boolean).join(" · ");
  return `${f.mode === "out" ? "Eating out" : "Cooking"}${rest ? ` · ${rest}` : ""}`;
}
