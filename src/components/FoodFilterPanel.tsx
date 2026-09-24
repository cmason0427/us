"use client";

import {
  CUISINE_OPTIONS,
  DISTANCE_OPTIONS,
  MEAL_OPTIONS,
  METHOD_OPTIONS,
  PRICE_OPTIONS,
  SERVICE_OPTIONS,
  SIZE_OPTIONS,
  TIME_OPTIONS,
  type FoodFilters,
} from "@/lib/food";

type Opt = { v: string; label: string };

function Row({ label, options, value, onChange }: { label: string; options: Opt[]; value: string | null | undefined; onChange: (v: string | null) => void }) {
  return (
    <div className="batch-field">
      <span className="small muted">{label}</span>
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

const boolOpt = (v: boolean | null | undefined) => (v === true ? "yes" : v === false ? "no" : null);
const optBool = (v: string | null) => (v === "yes" ? true : v === "no" ? false : null);

/**
 * "Going out or cooking?" first, then optional filters for that mode. Tap a
 * chip again to clear it. `lockMode` hides the first choice; `takeoutOnly`
 * drops the service row (the caller already restricts to takeout).
 */
export function FoodFilterPanel({
  value,
  onChange,
  lockMode = false,
  takeoutOnly = false,
}: {
  value: FoodFilters;
  onChange: (f: FoodFilters) => void;
  lockMode?: boolean;
  takeoutOnly?: boolean;
}) {
  const set = (patch: Partial<FoodFilters>) => onChange({ ...value, ...patch });
  const any = Object.entries(value).some(([k, v]) => k !== "mode" && v != null && v !== false);
  return (
    <div className="stack-sm">
      {!lockMode && (
        <div className="seg" role="group" aria-label="Going out or cooking">
          <button type="button" aria-pressed={value.mode === "out"} onClick={() => onChange({ mode: "out" })}>
            🍽️ Going out
          </button>
          <button type="button" aria-pressed={value.mode === "cook"} onClick={() => onChange({ mode: "cook" })}>
            🍳 Cooking
          </button>
        </div>
      )}
      {value.mode === "out" ? (
        <>
          <Row label="Price" options={PRICE_OPTIONS} value={value.price} onChange={(price) => set({ price })} />
          <Row label="Cuisine" options={CUISINE_OPTIONS} value={value.cuisine} onChange={(cuisine) => set({ cuisine })} />
          <Row label="Distance" options={DISTANCE_OPTIONS} value={value.distance} onChange={(distance) => set({ distance })} />
          {!takeoutOnly && <Row label="How" options={SERVICE_OPTIONS} value={value.service} onChange={(service) => set({ service })} />}
          <Row label="Meal" options={MEAL_OPTIONS} value={value.meal} onChange={(meal) => set({ meal })} />
        </>
      ) : (
        <>
          <Row label="Safe food" options={[{ v: "yes", label: "Safe food" }, { v: "no", label: "Not a safe food" }]} value={boolOpt(value.safe)} onChange={(v) => set({ safe: optBool(v) })} />
          <Row label="Fancy" options={[{ v: "yes", label: "✨ Fancy" }, { v: "no", label: "Simple" }]} value={boolOpt(value.fancy)} onChange={(v) => set({ fancy: optBool(v) })} />
          <Row label="How it's made" options={METHOD_OPTIONS} value={value.method} onChange={(method) => set({ method })} />
          <Row label="Size" options={SIZE_OPTIONS} value={value.size} onChange={(size) => set({ size })} />
          <Row label="Time" options={TIME_OPTIONS} value={value.time} onChange={(time) => set({ time })} />
          <label className="toggle-row">
            <span className="label">Only things we have everything for</span>
            <span className="switch">
              <input type="checkbox" checked={!!value.canMakeNow} onChange={(e) => set({ canMakeNow: e.target.checked })} />
              <span />
            </span>
          </label>
        </>
      )}
      {any && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => onChange({ mode: value.mode })}>
          Clear filters
        </button>
      )}
    </div>
  );
}
