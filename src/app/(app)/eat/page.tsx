"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { CUISINE_OPTIONS, DISTANCE_OPTIONS, MEAL_OPTIONS, PRICE_OPTIONS, SERVICE_OPTIONS, type FoodFilters, type FoodPlace, type HomeMeal } from "@/lib/food";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { BatchAdd, type BatchColumn, type BatchRow } from "@/components/BatchAdd";
import { FoodFilterPanel } from "@/components/FoodFilterPanel";
import { FoodResults, useFoodMatches, type FoodPick } from "@/components/FoodResults";
import { MealDetail, MealForm, PlaceForm } from "@/components/FoodForms";
import { IconPlus, Wavy } from "@/components/Art";

const PLACE_COLUMNS: BatchColumn[] = [
  { key: "price", label: "Price", options: PRICE_OPTIONS },
  { key: "cuisines", label: "Cuisine", options: CUISINE_OPTIONS, multi: true },
  { key: "distance", label: "Distance", options: DISTANCE_OPTIONS },
  { key: "service", label: "How", options: SERVICE_OPTIONS, multi: true },
  { key: "meals", label: "Good for", options: MEAL_OPTIONS, multi: true },
];

type Sheetish = { kind: "place"; item?: FoodPlace } | { kind: "meal"; item?: HomeMeal } | { kind: "meal-detail"; item: HomeMeal } | { kind: "batch" } | null;

export default function EatPage() {
  const { meId, toast } = useApp();
  const [filters, setFilters] = useState<FoodFilters>({ mode: "out" });
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<Sheetish>(null);
  const [picked, setPicked] = useState<FoodPick | null>(null);
  const { picks, pantry, total } = useFoodMatches(filters, search);
  const activeFilters = Object.entries(filters).filter(([k, v]) => k !== "mode" && v != null && v !== false).length;
  const out = filters.mode === "out";

  function open(p: FoodPick) {
    setSheet(p.kind === "place" ? { kind: "place", item: p.item } : { kind: "meal-detail", item: p.item });
  }

  function surprise() {
    if (!picks.length) return;
    setPicked(picks[Math.floor(Math.random() * picks.length)]);
  }

  async function saveBatch(rows: BatchRow[]) {
    const { error } = await supabaseBrowser()
      .from("food_places")
      .insert(
        rows.map((r) => ({
          name: r.name,
          price: r.values.price,
          cuisines: r.values.cuisines ?? [],
          distance: r.values.distance,
          service: r.values.service ?? [],
          meals: r.values.meals ?? [],
          created_by: meId,
        })),
      );
    if (error) return error.message;
    refreshAll();
    toast(`Added ${rows.length} place${rows.length === 1 ? "" : "s"} 🍽️`);
    setSheet(null);
    return null;
  }

  return (
    <main className="page">
      <PageHead eyebrow="What sounds good?" title="Eat" />
      <Wavy />

      <div className="seg" role="group" aria-label="Going out or cooking" style={{ marginBottom: 12 }}>
        <button aria-pressed={out} onClick={() => setFilters({ mode: "out" })}>
          🍽️ Going out
        </button>
        <button aria-pressed={!out} onClick={() => setFilters({ mode: "cook" })}>
          🍳 Cooking
        </button>
      </div>

      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input grow" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={out ? "Search places…" : "Search meals…"} aria-label="Search" />
        <button className="btn" aria-pressed={showFilters} onClick={() => setShowFilters((s) => !s)}>
          Filters{activeFilters ? ` (${activeFilters})` : ""}
        </button>
      </div>
      {showFilters && (
        <div className="card" style={{ marginBottom: 12 }}>
          <FoodFilterPanel value={filters} onChange={setFilters} lockMode />
        </div>
      )}

      <div className="row-between" style={{ margin: "6px 0 10px" }}>
        <button className="btn btn-sm btn-sage" onClick={surprise} disabled={!picks.length}>
          🎲 Pick for us
        </button>
        <div className="row">
          {out && (
            <button className="btn btn-sm btn-ghost" onClick={() => setSheet({ kind: "batch" })}>
              Add several
            </button>
          )}
          <button className="btn btn-sm" onClick={() => setSheet(out ? { kind: "place" } : { kind: "meal" })}>
            <IconPlus width={16} height={16} /> {out ? "Place" : "Meal"}
          </button>
        </div>
      </div>

      {picked && (
        <div className="card pick-card" style={{ marginBottom: 12 }}>
          <span className="small muted">How about…</span>
          <strong style={{ fontSize: "1.3rem" }}>{picked.item.name}</strong>
          <div className="row">
            <button className="btn btn-sm" onClick={surprise}>
              Nah, again
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setPicked(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      <FoodResults
        picks={picks}
        pantry={pantry}
        onPick={open}
        empty={total === 0 ? (out ? "No places yet. Add your go-tos — \"Add several\" is fastest." : "No meals yet. Add what you make at home, with ingredients.") : "Nothing matches. Loosen a filter?"}
      />

      {sheet?.kind === "batch" && (
        <Sheet title="Add several places" onClose={() => setSheet(null)}>
          <BatchAdd columns={PLACE_COLUMNS} placeholder="Place name" noun="places" onSave={saveBatch} />
        </Sheet>
      )}
      {sheet?.kind === "place" && (
        <Sheet title={sheet.item ? sheet.item.name : "New place"} onClose={() => setSheet(null)}>
          <PlaceForm initial={sheet.item} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet?.kind === "meal" && (
        <Sheet title={sheet.item ? `Edit ${sheet.item.name}` : "New home meal"} onClose={() => setSheet(null)}>
          <MealForm initial={sheet.item} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet?.kind === "meal-detail" && (
        <Sheet title={sheet.item.name} onClose={() => setSheet(null)}>
          <MealDetail meal={sheet.item} pantry={pantry} onEdit={() => setSheet({ kind: "meal", item: sheet.item })} />
        </Sheet>
      )}
    </main>
  );
}
