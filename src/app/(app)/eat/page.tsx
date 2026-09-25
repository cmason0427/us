"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pantry } from "@/components/Pantry";
import { ShoppingList } from "@/components/Shopping";
import { type FoodFilters, type FoodPlace, type HomeMeal } from "@/lib/food";
import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { Sheet } from "@/components/Sheet";
import { MealBatch, PlaceBatch } from "@/components/Batches";
import { FoodFilterPanel } from "@/components/FoodFilterPanel";
import { PlaceDetail } from "@/components/FoodDetail";
import { FoodResults, useFoodMatches, type FoodPick } from "@/components/FoodResults";
import { MealDetail, MealForm, PlaceForm } from "@/components/FoodForms";
import { IconPlus, Wavy } from "@/components/Art";


type Sheetish = { kind: "place"; item?: FoodPlace } | { kind: "meal"; item?: HomeMeal } | { kind: "meal-detail"; item: HomeMeal } | { kind: "place-detail"; item: FoodPlace } | { kind: "batch" } | null;

type Section = "pick" | "pantry" | "groceries";

export default function EatPage() {
  const initial = useSearchParams().get("tab");
  const [section, setSection] = useState<Section>(initial === "pantry" || initial === "groceries" ? initial : "pick");
  const pick = (s: Section) => {
    setSection(s);
    window.history.replaceState(null, "", s === "pick" ? "/eat" : `/eat?tab=${s}`);
  };
  return (
    <main className="page">
      <PageHead eyebrow="What sounds good?" title="Eat" art={<Sticker name="wiley_sniff" size={84} tilt={-4} />} />
      <Wavy />
      <div className="seg" role="group" aria-label="Section" style={{ marginBottom: 14 }}>
        <button aria-pressed={section === "pick"} onClick={() => pick("pick")}>
          Pick food
        </button>
        <button aria-pressed={section === "pantry"} onClick={() => pick("pantry")}>
          Pantry
        </button>
        <button aria-pressed={section === "groceries"} onClick={() => pick("groceries")}>
          🛒 Groceries
        </button>
      </div>
      {section === "pick" && <PickFood />}
      {section === "pantry" && <Pantry />}
      {section === "groceries" && <ShoppingList groceries />}
    </main>
  );
}

function PickFood() {
  const [filters, setFilters] = useState<FoodFilters>({ mode: "out" });
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<Sheetish>(null);
  const [picked, setPicked] = useState<FoodPick | null>(null);
  const { picks, pantry, total } = useFoodMatches(filters, search);
  const activeFilters = Object.entries(filters).filter(([k, v]) => k !== "mode" && v != null && v !== false).length;
  const out = filters.mode === "out";

  function open(p: FoodPick) {
    setSheet(p.kind === "place" ? { kind: "place-detail", item: p.item } : { kind: "meal-detail", item: p.item });
  }

  function surprise() {
    if (!picks.length) return;
    setPicked(picks[Math.floor(Math.random() * picks.length)]);
  }


  return (
    <>
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
          <button className="btn btn-sm btn-ghost" onClick={() => setSheet({ kind: "batch" })}>
            Add several
          </button>
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
        <Sheet title={out ? "Add several places" : "Add several meals"} onClose={() => setSheet(null)}>
          {out ? <PlaceBatch onDone={() => setSheet(null)} /> : <MealBatch onDone={() => setSheet(null)} />}
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
      {sheet?.kind === "place-detail" && (
        <Sheet title={sheet.item.name} onClose={() => setSheet(null)}>
          <PlaceDetail place={sheet.item} onEdit={() => setSheet({ kind: "place", item: sheet.item })} />
        </Sheet>
      )}
      {sheet?.kind === "meal-detail" && (
        <Sheet title={sheet.item.name} onClose={() => setSheet(null)}>
          <MealDetail meal={sheet.item} pantry={pantry} onEdit={() => setSheet({ kind: "meal", item: sheet.item })} />
        </Sheet>
      )}
    </>
  );
}
