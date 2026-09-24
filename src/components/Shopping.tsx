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
  grocery: boolean;
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

/**
 * Put things on the shopping list. Anything from Food (meals' "add missing",
 * the pantry) is a grocery, so it shows in Food's grocery list too; other
 * things only show there if you say so.
 */
export async function addToShopping(meId: string, rows: { name: string; detail?: string | null; category_id?: string | null; grocery?: boolean }[]) {
  return supabaseBrowser()
    .from("shop_items")
    .insert(
      rows.map((r, i) => ({
        name: r.name,
        detail: r.detail ?? null,
        category_id: r.category_id ?? null,
        grocery: r.grocery ?? true,
        position: Date.now() % 1e9 + i,
        created_by: meId,
      })),
    );
}

/** Save a new order: position = index. */
async function savePositions(table: "shop_categories" | "shop_items", ids: string[]) {
  const supabase = supabaseBrowser();
  await Promise.all(ids.map((id, position) => supabase.from(table).update({ position }).eq("id", id)));
  refreshAll();
}

/** Add one item: name, optional brand/type, category. */
export function ShopItemForm({ initial, groceryDefault = false, onDone }: { initial?: ShopItem; groceryDefault?: boolean; onDone: () => void }) {
  const { meId, toast } = useApp();
  const { cats } = useShopping();
  const [name, setName] = useState(initial?.name ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [cat, setCat] = useState<string | null>(initial?.category_id ?? null);
  const [newCat, setNewCat] = useState("");
  const [grocery, setGrocery] = useState(initial?.grocery ?? groceryDefault);
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
      ? await supabase.from("shop_items").update({ name: name.trim(), detail: detail.trim() || null, category_id: cat, grocery }).eq("id", initial.id)
      : await addToShopping(meId, [{ name: name.trim(), detail: detail.trim() || null, category_id: cat, grocery }]);
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
      <label className="row small">
        <input type="checkbox" className="check" checked={grocery} onChange={(e) => setGrocery(e.target.checked)} />
        Also on the grocery list (Food)
      </label>
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

type Row = { kind: "cat"; id: string; name: string; count: number } | { kind: "item"; id: string; item: ShopItem };

/**
 * The shopping list: categories (drag to order), items (drag to reorder, or
 * drag into another category), claim, bought, select → to-dos.
 * `groceries` shows only the grocery items (Food's grocery list).
 */
export function ShoppingList({ groceries = false }: { groceries?: boolean }) {
  const { meId, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const { cats, items: all } = useShopping();
  const items = groceries ? all.filter((i) => i.grocery) : all;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ShopItem | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ordering, setOrdering] = useState(false);

  // One flat list, category headers included, so an item can be dragged
  // across a header into another category. Headers themselves don't move here.
  const groups = [...cats.map((c) => ({ id: c.id, name: c.name })), { id: "", name: "No category" }].map((g) => ({
    ...g,
    items: items.filter((i) => (i.category_id ?? "") === g.id),
  }));
  const rows: Row[] = groups.flatMap((g) => [
    { kind: "cat" as const, id: `cat:${g.id}`, name: g.name, count: g.items.length },
    ...g.items.map((item) => ({ kind: "item" as const, id: item.id, item })),
  ]);
  const bought = items.filter((i) => i.bought);

  async function moveRows(ids: string[]) {
    // Each item lands in the category of the header above it.
    let cat: string | null = cats[0]?.id ?? null;
    const updates: { id: string; category_id: string | null; position: number }[] = [];
    ids.forEach((id, position) => {
      if (id.startsWith("cat:")) cat = id.slice(4) || null;
      else updates.push({ id, category_id: cat, position });
    });
    const changed = updates.filter((u) => {
      const i = items.find((x) => x.id === u.id);
      return i && ((i.category_id ?? null) !== u.category_id || i.position !== u.position);
    });
    await Promise.all(changed.map((u) => supabase.from("shop_items").update({ category_id: u.category_id, position: u.position }).eq("id", u.id)));
    refreshAll();
  }

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

  const itemRow = (i: ShopItem, handle: React.ReactNode) => (
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
        <p className="muted">{groceries ? "No groceries needed. Nice." : "Nothing to buy. Nice."}</p>
      ) : (
        <div className="card" style={{ padding: "2px 12px" }}>
          <Sortable
            items={rows}
            getId={(r) => r.id}
            onReorder={moveRows}
            render={(r, handle) =>
              r.kind === "cat" ? (
                <div className="section-title shop-cat">
                  {r.name}
                  {r.count === 0 && <span className="faint"> · drag things here</span>}
                </div>
              ) : (
                itemRow(r.item, handle)
              )
            }
          />
        </div>
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
        <Sheet title={groceries ? "Grocery list" : "Shopping list"} onClose={() => setAdding(false)}>
          <ShopItemForm groceryDefault={groceries} onDone={() => setAdding(false)} />
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
