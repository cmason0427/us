"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { setHave, useMeals, usePantry } from "@/lib/foodData";
import { useApp } from "./AppProvider";
import { addToShopping, useShopping } from "./Shopping";

/**
 * What we have. Everything the pantry knows about, plus every ingredient your
 * home meals use (those start as "need"). Checking something counts for every
 * meal that uses it.
 */
export function Pantry() {
  const { meId, toast } = useApp();
  const pantry = usePantry();
  const meals = useMeals();
  const { items: shopping } = useShopping();
  const [draft, setDraft] = useState("");

  const names = new Map<string, string>(); // key → display name
  for (const k of pantry.keys()) names.set(k, k);
  for (const m of meals) for (const i of m.meal_ingredients) names.set(i.name.trim().toLowerCase(), i.name.trim());
  const all = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const need = all.filter(([k]) => !pantry.get(k));
  const have = all.filter(([k]) => pantry.get(k));
  const onList = new Set(shopping.filter((s) => !s.bought).map((s) => s.name.trim().toLowerCase()));

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

  async function shop(name: string) {
    const { error } = await addToShopping(meId, [{ name }]);
    if (error) return toast(error.message);
    refreshAll();
    toast(`${name} → grocery list 🛒`);
  }

  async function forget(key: string) {
    await supabaseBrowser().from("pantry").delete().eq("name", key);
    refreshAll();
  }

  const row = ([key, label]: [string, string], isHave: boolean) => (
    <div key={key} className="task">
      <input type="checkbox" className="check" checked={isHave} onChange={(e) => toggle(label, e.target.checked)} aria-label={`Have ${label}`} />
      <span className="grow task-title">{label}</span>
      {!isHave &&
        (onList.has(key) ? (
          <span className="small faint">on the list</span>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={() => shop(label)}>
            🛒 Add
          </button>
        ))}
      {pantry.has(key) && (
        <button className="icon-btn" onClick={() => forget(key)} aria-label={`Forget ${label}`}>
          ×
        </button>
      )}
    </div>
  );

  return (
    <div className="stack">
      <form className="quick-add" onSubmit={add}>
        <input className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="We have… (rice, eggs)" aria-label="Add to pantry" />
        <button className="btn btn-primary" disabled={!draft.trim()}>
          Add
        </button>
      </form>
      <div className="section-title" style={{ margin: "6px 0" }}>
        Need ({need.length})
      </div>
      {need.length ? <div className="card" style={{ padding: "2px 12px" }}>{need.map((n) => row(n, false))}</div> : <p className="small muted">Nothing missing that we know of.</p>}
      <div className="section-title" style={{ margin: "6px 0" }}>
        Have ({have.length})
      </div>
      {have.length ? <div className="card" style={{ padding: "2px 12px" }}>{have.map((n) => row(n, true))}</div> : <p className="small muted">Add what&apos;s in the kitchen.</p>}
    </div>
  );
}
