"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { celebrate } from "@/lib/celebrate";
import { setHave } from "@/lib/foodData";
import { useApp } from "./AppProvider";
import { Sortable } from "./Sortable";
import { Sheet } from "./Sheet";

export interface ShopCategory {
  id: string;
  name: string;
  position: number;
}
export interface ShopItem {
  id: string;
  name: string;
  detail: string | null;
  category_id: string | null;
  position: number;
  claimed_by: string | null;
  bought: boolean;
  created_by: string;
}

export function useShopping() {
  const supabase = supabaseBrowser();
  const { data: cats = [] } = useLive<ShopCategory[]>(
    "shop_categories",
    async () => {
      const { data, error } = await supabase.from("shop_categories").select("*").order("position").order("created_at");
      if (error) throw error;
      return data as ShopCategory[];
    },
    ["shop_categories"],
  );
  const { data: items = [] } = useLive<ShopItem[]>(
    "shop_items",
    async () => {
      const { data, error } = await supabase.from("shop_items").select("*").order("position").order("created_at");
      if (error) throw error;
      return data as ShopItem[];
    },
    ["shop_items"],
  );
  return { cats, items };
}

/** Put things on the shopping list (used by meals' "add missing" and the ＋ menu). */
export async function addToShopping(meId: string, rows: { name: string; detail?: string | null; category_id?: string | null }[]) {
  return supabaseBrowser()
    .from("shop_items")
    .insert(rows.map((r, i) => ({ name: r.name, detail: r.detail ?? null, category_id: r.category_id ?? null, position: Date.now() % 1e9 + i, created_by: meId })));
}

/** Save a new order: position = index. */
async function savePositions(table: "shop_categories" | "shop_items", ids: string[]) {
  const supabase = supabaseBrowser();
  await Promise.all(ids.map((id, position) => supabase.from(table).update({ position }).eq("id", id)));
  refreshAll();
}

/** Add one item: name, optional brand/type, category. */
export function ShopItemForm({ initial, onDone }: { initial?: ShopItem; onDone: () => void }) {
  const { meId, toast } = useApp();
  const { cats } = useShopping();
  const [name, setName] = useState(initial?.name ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [cat, setCat] = useState<string | null>(initial?.category_id ?? null);
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);

  async function makeCategory() {
    if (!newCat.trim()) return;
    const { data, error } = await supabaseBrowser().from("shop_categories").insert({ name: newCat.trim(), position: cats.length, created_by: meId }).select("id").single();
    if (error) return toast(error.message);
    setCat(data.id);
    setNewCat("");
    refreshAll();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const supabase = supabaseBrowser();
    const { error } = initial
      ? await supabase.from("shop_items").update({ name: name.trim(), detail: detail.trim() || null, category_id: cat }).eq("id", initial.id)
      : await addToShopping(meId, [{ name: name.trim(), detail: detail.trim() || null, category_id: cat }]);
    setBusy(false);
    if (error) return toast(error.message);
    refreshAll();
    toast(initial ? "Saved" : "On the list 🛒");
    onDone();
  }

  async function remove() {
    if (!initial) return;
    await supabaseBrowser().from("shop_items").delete().eq("id", initial.id);
    refreshAll();
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Eggs, dog food, paper towels…" autoFocus={!initial} required />
      <input className="input" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Brand or type (optional)" aria-label="Brand or type" />
      <div className="field">
        <span>Category (optional)</span>
        <div className="chips">
          {cats.map((c) => (
            <button key={c.id} type="button" className="chip chip-sm" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="row">
          <input className="input grow" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category (Costco, fun stuff…)" aria-label="New category" />
          <button type="button" className="btn btn-sm" onClick={makeCategory} disabled={!newCat.trim()}>
            Add
          </button>
        </div>
      </div>
      <div className="row-between">
        {initial ? (
          <button type="button" className="btn btn-ghost" onClick={remove}>
            Remove
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          {initial ? "Save" : "Add to list"}
        </button>
      </div>
    </form>
  );
}

/** The shopping list: categories (drag to order), items (drag within a category), claim, bought, select → to-dos. */
export function ShoppingList() {
  const { meId, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const { cats, items } = useShopping();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ShopItem | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ordering, setOrdering] = useState(false);

  const groups = [...cats.map((c) => ({ id: c.id, name: c.name })), { id: "", name: "No category" }]
    .map((g) => ({ ...g, items: items.filter((i) => (i.category_id ?? "") === g.id) }))
    .filter((g) => g.items.length || g.id);
  const bought = items.filter((i) => i.bought);

  async function toggleBought(i: ShopItem, el: HTMLElement) {
    const now = !i.bought;
    if (now) celebrate(el, ["🛒", "✨"]);
    await supabase.from("shop_items").update({ bought: now }).eq("id", i.id);
    // Bought it → the pantry has it.
    if (now) await setHave(i.name, true);
    refreshAll();
  }

  async function claim(i: ShopItem) {
    await supabase.from("shop_items").update({ claimed_by: i.claimed_by === meId ? null : meId }).eq("id", i.id);
    refreshAll();
  }

  async function sendToTodos() {
    const chosen = items.filter((i) => picked.has(i.id));
    const { error } = await supabase
      .from("tasks")
      .insert(chosen.map((i) => ({ title: `Buy ${i.name}${i.detail ? ` (${i.detail})` : ""}`, list_type: "shared", created_by: meId, claimed_by: i.claimed_by })));
    if (error) return toast(error.message);
    await supabase.from("shop_items").delete().in("id", [...picked]);
    setPicked(new Set());
    setSelecting(false);
    refreshAll();
    toast(`Moved ${chosen.length} to our to-dos`);
  }

  async function clearBought() {
    await supabase.from("shop_items").delete().in("id", bought.map((i) => i.id));
    refreshAll();
  }

  const row = (i: ShopItem, handle: React.ReactNode) => (
    <div className={`task shop-row${i.bought ? " done" : ""}`}>
      {selecting ? (
        <input
          type="checkbox"
          className="check"
          checked={picked.has(i.id)}
          onChange={() =>
            setPicked((s) => {
              const n = new Set(s);
              if (n.has(i.id)) n.delete(i.id);
              else n.add(i.id);
              return n;
            })
          }
          aria-label={`Select ${i.name}`}
        />
      ) : (
        <input type="checkbox" className="check" checked={i.bought} onChange={(e) => toggleBought(i, e.currentTarget)} aria-label={`Bought ${i.name}`} />
      )}
      <div className="grow">
        <button className="task-title task-edit" onClick={() => setEditing(i)}>
          {i.name}
        </button>
        {i.detail && <div className="small muted">{i.detail}</div>}
        {!i.bought && !selecting && (
          <button className={`claim${i.claimed_by ? " claimed" : ""}`} onClick={() => claim(i)} aria-pressed={i.claimed_by === meId}>
            {i.claimed_by === meId ? "🙋 You've got this" : i.claimed_by ? `🙋 ${nameOf(i.claimed_by)}'s got this` : "🙋 I got this"}
          </button>
        )}
      </div>
      {!selecting && handle}
    </div>
  );

  return (
    <div className="stack">
      <div className="row wrap">
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          + Add item
        </button>
        {items.length > 0 && (
          <button className="btn btn-sm" aria-pressed={selecting} onClick={() => (setSelecting((s) => !s), setPicked(new Set()))}>
            {selecting ? "Cancel" : "Select → to-dos"}
          </button>
        )}
        {cats.length > 1 && !selecting && (
          <button className="btn btn-sm btn-ghost" aria-pressed={ordering} onClick={() => setOrdering((o) => !o)}>
            {ordering ? "Done ordering" : "Order categories"}
          </button>
        )}
      </div>

      {ordering ? (
        <div className="card" style={{ padding: "4px 12px" }}>
          <Sortable
            items={cats}
            getId={(c) => c.id}
            onReorder={(ids) => savePositions("shop_categories", ids)}
            render={(c, handle) => (
              <div className="task">
                <strong className="grow">{c.name}</strong>
                {handle}
              </div>
            )}
          />
        </div>
      ) : items.length === 0 ? (
        <p className="muted">Nothing to buy. Nice.</p>
      ) : (
        groups.map((g) => (
          <section key={g.id || "none"}>
            <div className="section-title" style={{ margin: "12px 0 6px" }}>
              {g.name}
            </div>
            {g.items.length === 0 ? (
              <p className="small faint">Nothing here.</p>
            ) : (
              <div className="card" style={{ padding: "2px 12px" }}>
                <Sortable items={g.items} getId={(i) => i.id} onReorder={(ids) => savePositions("shop_items", ids)} render={row} />
              </div>
            )}
          </section>
        ))
      )}

      {selecting && (
        <button className="btn btn-primary btn-block" disabled={!picked.size} onClick={sendToTodos}>
          Add {picked.size || ""} to our to-dos
        </button>
      )}
      {!selecting && bought.length > 0 && (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={clearBought}>
          Clear {bought.length} bought
        </button>
      )}

      {adding && (
        <Sheet title="Shopping list" onClose={() => setAdding(false)}>
          <ShopItemForm onDone={() => setAdding(false)} />
        </Sheet>
      )}
      {editing && (
        <Sheet title={editing.name} onClose={() => setEditing(null)}>
          <ShopItemForm initial={editing} onDone={() => setEditing(null)} />
        </Sheet>
      )}
    </div>
  );
}
