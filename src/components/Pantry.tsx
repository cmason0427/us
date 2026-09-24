"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { setHave, useMeals } from "@/lib/foodData";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { addToShopping, useShopping } from "./Shopping";

type Row = { name: string; have: boolean; low: boolean; tag: string | null };

/** Shelves for the Have list. Anything else you type becomes its own shelf. */
export const PANTRY_TAGS = ["Fridge", "Freezer", "Vegetables", "Fruit", "Sauces", "Spices", "Baking", "Grains & pasta", "Canned", "Snacks", "Drinks"];

function usePantryRows() {
  const { data = [] } = useLive<Row[]>(
    "pantry_rows",
    async () => {
      const { data, error } = await supabaseBrowser().from("pantry").select("name, have, low, tag");
      if (error) throw error;
      return data as Row[];
    },
    ["pantry"],
  );
  return data;
}

/**
 * What we have. Everything the pantry knows about, plus every ingredient your
 * home meals use (those start as "need"). Checking something counts for every
 * meal that uses it. Have is grouped by shelf; anything can be flagged
 * "almost out".
 */
export function Pantry() {
  const { meId, toast } = useApp();
  const rows = usePantryRows();
  const meals = useMeals();
  const { items: shopping } = useShopping();
  const [draft, setDraft] = useState("");
  const [shelf, setShelf] = useState<string | null>(null);
  const [sort, setSort] = useState<"shelf" | "az">("shelf");
  const [editing, setEditing] = useState<{ key: string; label: string } | null>(null);

  const byKey = new Map(rows.map((r) => [r.name, r]));
  const names = new Map<string, string>(); // key → display name
  for (const r of rows) names.set(r.name, r.name);
  for (const m of meals) for (const i of m.meal_ingredients) names.set(i.name.trim().toLowerCase(), i.name.trim());
  const all = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const need = all.filter(([k]) => !byKey.get(k)?.have);
  const have = all.filter(([k]) => byKey.get(k)?.have);
  const low = have.filter(([k]) => byKey.get(k)?.low);
  const onList = new Set(shopping.filter((s) => !s.bought).map((s) => s.name.trim().toLowerCase()));
  const tagOf = (k: string) => byKey.get(k)?.tag ?? null;

  const usedTags = [...new Set(have.map(([k]) => tagOf(k)).filter((t): t is string => !!t))].sort(
    (a, b) => (PANTRY_TAGS.indexOf(a) + 1 || 99) - (PANTRY_TAGS.indexOf(b) + 1 || 99) || a.localeCompare(b),
  );
  const shownHave = shelf ? have.filter(([k]) => (shelf === "none" ? !tagOf(k) : tagOf(k) === shelf)) : have;
  const groups =
    sort === "az"
      ? [{ tag: null as string | null, list: shownHave }]
      : [...usedTags, null].map((tag) => ({ tag, list: shownHave.filter(([k]) => tagOf(k) === tag) })).filter((g) => g.list.length);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const { error } = await setHave(draft, true);
    if (error) return toast(error.message);
    setDraft("");
    refreshAll();
  }

  async function toggle(name: string, v: boolean) {
    const { error } = await setHave(name, v);
    if (error) toast(error.message);
    refreshAll();
  }

  async function setLow(key: string, v: boolean) {
    const { error } = await supabaseBrowser().from("pantry").update({ low: v, updated_at: new Date().toISOString() }).eq("name", key);
    if (error) toast(error.message);
    refreshAll();
  }

  async function shop(name: string) {
    const { error } = await addToShopping(meId, [{ name }]);
    if (error) return toast(error.message);
    refreshAll();
    toast(`${name} → grocery list 🛒`);
  }

  // Gone for good: out of the pantry, and (if you say so) out of any meal that lists it.
  async function forget(key: string, label: string) {
    const supabase = supabaseBrowser();
    const usedIn = meals.filter((m) => m.meal_ingredients.some((i) => i.name.trim().toLowerCase() === key));
    if (usedIn.length) {
      const list = usedIn.map((m) => m.name).join(", ");
      if (!confirm(`${label} is an ingredient in ${list}. Remove it from ${usedIn.length === 1 ? "that meal" : "those meals"} too?`)) return;
      const ids = usedIn.flatMap((m) => m.meal_ingredients.filter((i) => i.name.trim().toLowerCase() === key).map((i) => i.id));
      const { error } = await supabase.from("meal_ingredients").delete().in("id", ids);
      if (error) return toast(error.message);
    }
    await supabase.from("pantry").delete().eq("name", key);
    refreshAll();
    toast(`Removed ${label}`);
  }

  const shopButton = (key: string, label: string) =>
    onList.has(key) ? (
      <span className="small faint">on the list</span>
    ) : (
      <button className="btn btn-sm btn-ghost" onClick={() => shop(label)}>
        🛒 Add
      </button>
    );

  const row = ([key, label]: [string, string], isHave: boolean) => {
    const r = byKey.get(key);
    return (
      <div key={key} className={`task${r?.low ? " pantry-low" : ""}`}>
        <input type="checkbox" className="check" checked={isHave} onChange={(e) => toggle(label, e.target.checked)} aria-label={`Have ${label}`} />
        <button className="grow task-title task-edit" onClick={() => setEditing({ key, label })}>
          {label}
          {r?.low && <span className="sticker butter" style={{ marginLeft: 6 }}>almost out</span>}
        </button>
        {(!isHave || r?.low) && shopButton(key, label)}
        {isHave && !r?.low && (
          <button className="btn btn-sm btn-ghost" onClick={() => setLow(key, true)} title="Mark almost out">
            Low?
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="stack">
      <form className="quick-add" onSubmit={add}>
        <input className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="We have… (rice, eggs)" aria-label="Add to pantry" />
        <button className="btn btn-primary" disabled={!draft.trim()}>
          Add
        </button>
      </form>

      {low.length > 0 && (
        <>
          <div className="section-title" style={{ margin: "6px 0" }}>
            Almost out ({low.length})
          </div>
          <div className="card" style={{ padding: "2px 12px" }}>{low.map((n) => row(n, true))}</div>
        </>
      )}

      <div className="section-title" style={{ margin: "6px 0" }}>
        Need ({need.length})
      </div>
      {need.length ? <div className="card" style={{ padding: "2px 12px" }}>{need.map((n) => row(n, false))}</div> : <p className="small muted">Nothing missing that we know of.</p>}

      <div className="row-between" style={{ marginTop: 6 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Have ({have.length})
        </div>
        <div className="seg seg-sm" role="group" aria-label="Sort">
          <button aria-pressed={sort === "shelf"} onClick={() => setSort("shelf")}>
            By shelf
          </button>
          <button aria-pressed={sort === "az"} onClick={() => setSort("az")}>
            A–Z
          </button>
        </div>
      </div>
      {usedTags.length > 0 && (
        <div className="chips" role="group" aria-label="Show one shelf">
          {usedTags.map((t) => (
            <button key={t} className="chip chip-sm" aria-pressed={shelf === t} onClick={() => setShelf(shelf === t ? null : t)}>
              {t}
            </button>
          ))}
          {have.some(([k]) => !tagOf(k)) && (
            <button className="chip chip-sm" aria-pressed={shelf === "none"} onClick={() => setShelf(shelf === "none" ? null : "none")}>
              No shelf
            </button>
          )}
        </div>
      )}
      {have.length === 0 ? (
        <p className="small muted">Add what&apos;s in the kitchen.</p>
      ) : (
        groups.map((g) => (
          <div key={g.tag ?? "none"} className="stack-sm">
            {sort === "shelf" && (usedTags.length > 0 || g.tag) && <span className="small muted pantry-shelf">{g.tag ?? "No shelf yet"}</span>}
            <div className="card" style={{ padding: "2px 12px" }}>{g.list.map((n) => row(n, true))}</div>
          </div>
        ))
      )}
      <p className="small faint">Tap an item to put it on a shelf, mark it almost out, or remove it.</p>

      {editing && (
        <PantryItemSheet
          label={editing.label}
          row={byKey.get(editing.key)}
          tags={[...new Set([...PANTRY_TAGS, ...usedTags])]}
          onTag={async (tag) => {
            const r = byKey.get(editing.key);
            const { error } = await supabaseBrowser()
              .from("pantry")
              .upsert({ name: editing.key, have: r?.have ?? false, low: r?.low ?? false, tag, updated_at: new Date().toISOString() });
            if (error) toast(error.message);
            refreshAll();
          }}
          onLow={(v) => setLow(editing.key, v)}
          onRemove={async () => {
            await forget(editing.key, editing.label);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PantryItemSheet({
  label,
  row,
  tags,
  onTag,
  onLow,
  onRemove,
  onClose,
}: {
  label: string;
  row: Row | undefined;
  tags: string[];
  onTag: (t: string | null) => void;
  onLow: (v: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  return (
    <Sheet title={label} onClose={onClose}>
      <div className="stack">
        <div className="field">
          <span>Shelf</span>
          <div className="chips">
            {tags.map((t) => (
              <button key={t} type="button" className="chip chip-sm" aria-pressed={row?.tag === t} onClick={() => onTag(row?.tag === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>
          <form
            className="quick-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) {
                onTag(custom.trim());
                setCustom("");
              }
            }}
          >
            <input className="input grow" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="New shelf (Tea, Dog food…)" aria-label="New shelf" />
            <button className="btn btn-sm" disabled={!custom.trim()}>
              Add
            </button>
          </form>
        </div>
        {row?.have && (
          <div className="toggle-row">
            <span className="label">Almost out</span>
            <label className="switch">
              <input type="checkbox" checked={!!row.low} onChange={(e) => onLow(e.target.checked)} />
              <span />
            </label>
          </div>
        )}
        <button className="btn btn-ghost" style={{ alignSelf: "flex-start", color: "var(--danger)" }} onClick={onRemove}>
          Remove {label}
        </button>
      </div>
    </Sheet>
  );
}
