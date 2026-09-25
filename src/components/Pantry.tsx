"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useMeals } from "@/lib/foodData";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { addToShopping, useShopping } from "./Shopping";
import { Sortable } from "./Sortable";

type Row = { name: string; have: boolean; low: boolean; area: string | null; areas: string[]; type: string | null };

/** Where it lives. Anything you type becomes its own spot. */
export const AREAS = ["Fridge", "Freezer", "Pantry", "Lazy susan", "Counter", "Spice rack", "Cabinet"];
/** What kind of thing it is. */
export const TYPES = ["Fruit & veg", "Meat & fish", "Dairy & eggs", "Bread & bakery", "Pasta, rice & grains", "Canned & jarred", "Sauces & condiments", "Spices", "Baking", "Snacks", "Frozen meals", "Drinks", "Other"];
const rank = (list: string[], v: string) => list.indexOf(v) + 1 || 99;
/** Where to look, most likely first (older rows only have the one `area`). */
const spots = (r: Row) => (r.areas?.length ? r.areas : r.area ? [r.area] : []);

function usePantryRows() {
  const { data = [] } = useLive<Row[]>(
    "pantry_rows",
    async () => {
      const { data, error } = await supabaseBrowser().from("pantry").select("name, have, low, area, areas, type").order("name");
      if (error) throw error;
      return data as Row[];
    },
    ["pantry"],
  );
  return data;
}

const save = (name: string, patch: Partial<Row>) =>
  supabaseBrowser()
    .from("pantry")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("name", name);

/**
 * What we keep in the kitchen. Only things you add here (or check off as
 * "have" on a meal) are tracked, so it doesn't fill up with every ingredient
 * ever typed. Group it by where it lives or what it is.
 */
export function Pantry() {
  const { meId, toast } = useApp();
  const rows = usePantryRows();
  const meals = useMeals();
  const { items: shopping } = useShopping();
  const [draft, setDraft] = useState("");
  const [newArea, setNewArea] = useState<string>("");
  const [newType, setNewType] = useState<string>("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<"area" | "type" | "az">("area");
  const [showFilters, setShowFilters] = useState(false);
  const [areaF, setAreaF] = useState<string | null>(null);
  const [typeF, setTypeF] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const onList = new Set(shopping.filter((s) => !s.bought).map((s) => s.name.trim().toLowerCase()));
  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) => (!q || r.name.includes(q)) && (!areaF || spots(r).includes(areaF)) && (!typeF || r.type === typeF));
  const low = shown.filter((r) => r.have && r.low);
  const out = shown.filter((r) => !r.have);
  const have = shown.filter((r) => r.have && !r.low);
  const areas = [...new Set([...AREAS, ...rows.flatMap(spots)])];
  const types = [...new Set([...TYPES, ...rows.map((r) => r.type).filter((t): t is string => !!t)])];
  const filterCount = (areaF ? 1 : 0) + (typeF ? 1 : 0);

  const keyOf = (r: Row) => (group === "area" ? (spots(r)[0] ?? null) : group === "type" ? r.type : null);
  const order = group === "area" ? areas : types;
  const groups =
    group === "az"
      ? [{ name: null as string | null, list: have }]
      : [...new Set(have.map(keyOf))]
          .sort((a, b) => (a === null ? 1 : b === null ? -1 : rank(order, a) - rank(order, b) || a.localeCompare(b)))
          .map((name) => ({ name, list: have.filter((r) => keyOf(r) === name) }));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim().toLowerCase();
    if (!name) return;
    const { error } = await supabaseBrowser()
      .from("pantry")
      .upsert({ name, have: true, low: false, area: newArea || null, areas: newArea ? [newArea] : [], type: newType || null, updated_at: new Date().toISOString() });
    if (error) return toast(error.message);
    setDraft("");
    refreshAll();
  }
  async function patch(name: string, p: Partial<Row>) {
    const { error } = await save(name, p);
    if (error) toast(error.message);
    refreshAll();
  }
  async function shop(name: string) {
    const { error } = await addToShopping(meId, [{ name }]);
    if (error) return toast(error.message);
    refreshAll();
    toast(`${name} → grocery list 🛒`);
  }

  // In the grouped lists the heading already says the first spot; Out / Almost out show them all.
  const row = (r: Row, grouped = true) => {
    const where = spots(r);
    const meta = [group !== "area" || !grouped ? where.join(" › ") : where.slice(1).map((w) => `or ${w}`).join(" "), (group !== "type" || !grouped) && r.type].filter(Boolean).join(" · ");
    return (
      <li key={r.name} className={`pantry-row${r.low ? " is-low" : ""}${r.have ? "" : " is-out"}`}>
        <input type="checkbox" className="check check-sm" checked={r.have} onChange={(e) => patch(r.name, { have: e.target.checked, low: false })} aria-label={`Have ${r.name}`} />
        <button className="pantry-name" onClick={() => setEditing(r.name)}>
          {r.name}
          {meta && <span className="pantry-meta"> {meta}</span>}
        </button>
        {r.have && (
          <button className={`pantry-chip${r.low ? " on" : ""}`} onClick={() => patch(r.name, { low: !r.low })} title="Almost out">
            low
          </button>
        )}
        {(!r.have || r.low) &&
          (onList.has(r.name) ? (
            <span className="pantry-chip faint">listed</span>
          ) : (
            <button className="pantry-chip" onClick={() => shop(r.name)} aria-label={`Add ${r.name} to groceries`}>
              🛒
            </button>
          ))}
      </li>
    );
  };

  const editRow = rows.find((r) => r.name === editing);

  return (
    <div className="stack">
      <form className="stack-sm" onSubmit={add}>
        <div className="quick-add">
          <input className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="we have… (rice, eggs)" aria-label="Add to pantry" />
          <button className="btn btn-primary btn-sm" disabled={!draft.trim()}>
            Add
          </button>
        </div>
        <div className="row">
          <select className="select select-sm grow" value={newArea} onChange={(e) => setNewArea(e.target.value)} aria-label="Where it lives">
            <option value="">where? (optional)</option>
            {areas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select className="select select-sm grow" value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="What kind">
            <option value="">what kind? (optional)</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </form>

      <div className="row">
        <input className="input input-sm grow" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search…" aria-label="Search the pantry" />
        <button className="btn btn-sm btn-ghost" aria-pressed={showFilters || filterCount > 0} onClick={() => setShowFilters((f) => !f)}>
          Filter{filterCount ? ` (${filterCount})` : ""}
        </button>
      </div>
      {showFilters && (
        <div className="card stack-sm" style={{ padding: "8px 10px" }}>
          <div className="chips">
            <span className="small muted">Group</span>
            {(
              [
                ["area", "Where"],
                ["type", "Kind"],
                ["az", "A–Z"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className="chip chip-sm" aria-pressed={group === k} onClick={() => setGroup(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="chips">
            <span className="small muted">Where</span>
            {areas.map((a) => (
              <button key={a} className="chip chip-sm" aria-pressed={areaF === a} onClick={() => setAreaF(areaF === a ? null : a)}>
                {a}
              </button>
            ))}
          </div>
          <div className="chips">
            <span className="small muted">Kind</span>
            {types.map((t) => (
              <button key={t} className="chip chip-sm" aria-pressed={typeF === t} onClick={() => setTypeF(typeF === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 && <p className="small muted">Add what&apos;s in the kitchen. Only what you add here gets tracked.</p>}
      {low.length > 0 && (
        <div className="pantry-group">
          <h3 className="pantry-h">Almost out · {low.length}</h3>
          <ul className="pantry-list">{low.map((r) => row(r, false))}</ul>
        </div>
      )}
      {out.length > 0 && (
        <div className="pantry-group">
          <h3 className="pantry-h">Out · {out.length}</h3>
          <ul className="pantry-list">{out.map((r) => row(r, false))}</ul>
        </div>
      )}
      {groups.map((g) =>
        g.list.length ? (
          <div key={g.name ?? "none"} className="pantry-group">
            <h3 className="pantry-h">
              {group === "az" ? "Have" : (g.name ?? (group === "area" ? "Somewhere" : "Uncategorized"))} · {g.list.length}
            </h3>
            <ul className="pantry-list">{g.list.map((r) => row(r))}</ul>
          </div>
        ) : null,
      )}

      {editRow && (
        <PantryItemSheet
          row={editRow}
          areas={areas}
          types={types}
          usedIn={meals.filter((m) => m.meal_ingredients.some((i) => i.name.trim().toLowerCase() === editRow.name)).map((m) => m.name)}
          onPatch={(p) => patch(editRow.name, p)}
          onRemove={async () => {
            if (!confirm(`Stop tracking ${editRow.name}?`)) return;
            await supabaseBrowser().from("pantry").delete().eq("name", editRow.name);
            refreshAll();
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PantryItemSheet({
  row,
  areas,
  types,
  usedIn,
  onPatch,
  onRemove,
  onClose,
}: {
  row: Row;
  areas: string[];
  types: string[];
  usedIn: string[];
  onPatch: (p: Partial<Row>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [customArea, setCustomArea] = useState("");
  const [customType, setCustomType] = useState("");
  const picker = (label: string, list: string[], cur: string | null, key: "area" | "type", custom: string, setCustom: (v: string) => void, ph: string) => (
    <div className="field">
      <span>{label}</span>
      <div className="chips">
        {list.map((v) => (
          <button key={v} type="button" className="chip chip-sm" aria-pressed={cur === v} onClick={() => onPatch({ [key]: cur === v ? null : v })}>
            {v}
          </button>
        ))}
        <input
          className="input chip-input"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !custom.trim()) return;
            e.preventDefault();
            onPatch({ [key]: custom.trim() });
            setCustom("");
          }}
          placeholder={ph}
          aria-label={`New ${label.toLowerCase()}`}
        />
      </div>
    </div>
  );
  return (
    <Sheet title={row.name} onClose={onClose}>
      <div className="stack">
        <div className="field">
          <span>Where it might be (most likely first; drag to reorder)</span>
          {spots(row).length > 0 && (
            <div className="pantry-list" style={{ padding: "0 8px" }}>
              <Sortable
                items={spots(row)}
                getId={(a) => a}
                onReorder={(ids) => onPatch({ areas: ids, area: ids[0] ?? null })}
                render={(a, handle) => (
                  <div className="pantry-row">
                    <span className="batch-num">{spots(row).indexOf(a) + 1}</span>
                    <span className="grow">{a}</span>
                    <button className="lt-x" onClick={() => onPatch({ areas: spots(row).filter((x) => x !== a), area: spots(row).filter((x) => x !== a)[0] ?? null })} aria-label={`Not in ${a}`}>
                      ×
                    </button>
                    {handle}
                  </div>
                )}
              />
            </div>
          )}
          <div className="chips">
            {areas
              .filter((a) => !spots(row).includes(a))
              .map((a) => (
                <button key={a} type="button" className="chip chip-sm" onClick={() => onPatch({ areas: [...spots(row), a], area: spots(row)[0] ?? a })}>
                  + {a}
                </button>
              ))}
            <input
              className="input chip-input"
              value={customArea}
              onChange={(e) => setCustomArea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !customArea.trim()) return;
                e.preventDefault();
                onPatch({ areas: [...spots(row), customArea.trim()], area: spots(row)[0] ?? customArea.trim() });
                setCustomArea("");
              }}
              placeholder="+ other"
              aria-label="Another spot"
            />
          </div>
        </div>
        {picker("What kind", types, row.type, "type", customType, setCustomType, "+ other")}
        {usedIn.length > 0 && <p className="small muted">In: {usedIn.join(", ")}</p>}
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start", color: "var(--danger)" }} onClick={onRemove}>
          Stop tracking {row.name}
        </button>
      </div>
    </Sheet>
  );
}
