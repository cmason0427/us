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
/** Where to get something: a store, "Online", Costco… */
export interface ShopStore {
  id: string;
  name: string;
  position: number;
}
export interface ShopItem {
  id: string;
  name: string;
  /** Brand or type. */
  detail: string | null;
  /** A note to yourselves: "talk to your mom about this first". */
  note: string | null;
  category_id: string | null;
  /** Places you could get it (any number). */
  store_ids: string[];
  /** Where to order it, if it's online. */
  link: string | null;
  position: number;
  claimed_by: string | null;
  bought: boolean;
  grocery: boolean;
  /** On a to-do: that to-do can't be checked off until this is bought or moved back. */
  task_id: string | null;
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
  const { data: stores = [] } = useLive<ShopStore[]>(
    "shop_stores",
    async () => {
      const { data, error } = await supabase.from("shop_stores").select("*").order("position").order("created_at");
      if (error) throw error;
      return data as ShopStore[];
    },
    ["shop_stores"],
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
  return { cats, stores, items };
}

type NewItem = { name: string; detail?: string | null; note?: string | null; category_id?: string | null; store_ids?: string[]; link?: string | null; grocery?: boolean };

/**
 * Put things on the shopping list. Anything from Food (meals' "add missing",
 * the pantry) is a grocery, so it shows in Food's grocery list too; other
 * things only show there if you say so.
 */
export async function addToShopping(meId: string, rows: NewItem[]) {
  return supabaseBrowser()
    .from("shop_items")
    .insert(
      rows.map((r, i) => ({
        name: r.name,
        detail: r.detail ?? null,
        note: r.note ?? null,
        category_id: r.category_id ?? null,
        store_ids: r.store_ids ?? [],
        link: r.link ?? null,
        grocery: r.grocery ?? true,
        position: (Date.now() % 1e9) + i,
        created_by: meId,
      })),
    );
}

/** Save a new order: position = index. */
async function savePositions(table: "shop_categories" | "shop_stores" | "shop_items", ids: string[]) {
  const supabase = supabaseBrowser();
  await Promise.all(ids.map((id, position) => supabase.from(table).update({ position }).eq("id", id)));
  refreshAll();
}

/** A row of chips to pick one (tap again to clear), plus "make a new one". */
function PickOrMake({
  label,
  table,
  options,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  table: "shop_categories" | "shop_stores";
  options: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
}) {
  return <PickManyOrMake label={label} table={table} options={options} value={value ? [value] : []} onChange={(v) => onChange(v[v.length - 1] ?? null)} single placeholder={placeholder} />;
}

/** Chips to pick any number (or one, with `single`), plus "make a new one". */
function PickManyOrMake({
  label,
  table,
  options,
  value,
  onChange,
  placeholder,
  single = false,
}: {
  label: string;
  table: "shop_categories" | "shop_stores";
  options: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  single?: boolean;
}) {
  const { meId, toast } = useApp();
  const [draft, setDraft] = useState("");
  async function make() {
    if (!draft.trim()) return;
    const { data, error } = await supabaseBrowser().from(table).insert({ name: draft.trim(), position: options.length, created_by: meId }).select("id").single();
    if (error) return toast(error.message);
    onChange(single ? [data.id] : [...value, data.id]);
    setDraft("");
    refreshAll();
  }
  return (
    <div className="field">
      <span>{label}</span>
      {options.length > 0 && (
        <div className="chips">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="chip chip-sm"
              aria-pressed={value.includes(o.id)}
              onClick={() => onChange(value.includes(o.id) ? value.filter((x) => x !== o.id) : single ? [o.id] : [...value, o.id])}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <input
          className="input grow"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              make();
            }
          }}
          placeholder={placeholder}
          aria-label={`New ${label.toLowerCase()}`}
        />
        <button type="button" className="btn btn-sm" onClick={make} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

function GroceryToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row small">
      <input type="checkbox" className="check" checked={value} onChange={(e) => onChange(e.target.checked)} />
      Also on the grocery list (Food)
    </label>
  );
}

/** Add or edit one item: what, brand/type, a note, category, where to get it (and a link). */
export function ShopItemForm({ initial, groceryDefault = false, onDone }: { initial?: ShopItem; groceryDefault?: boolean; onDone: () => void }) {
  const { meId, toast } = useApp();
  const { cats, stores } = useShopping();
  const [name, setName] = useState(initial?.name ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [cat, setCat] = useState<string | null>(initial?.category_id ?? null);
  const [storeIds, setStoreIds] = useState<string[]>(initial?.store_ids ?? []);
  const [link, setLink] = useState(initial?.link ?? "");
  const [grocery, setGrocery] = useState(initial?.grocery ?? groceryDefault);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const fields = {
      name: name.trim(),
      detail: detail.trim() || null,
      note: note.trim() || null,
      category_id: cat,
      store_ids: storeIds,
      link: normalizeLink(link),
      grocery,
    };
    const { error } = initial ? await supabaseBrowser().from("shop_items").update(fields).eq("id", initial.id) : await addToShopping(meId, [fields]);
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
      <input className="input" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Brand, size or type (optional)" aria-label="Brand or type" />
      <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): remember to talk to your mom about this" aria-label="Note" />
      <PickOrMake label="Category (optional)" table="shop_categories" options={cats} value={cat} onChange={setCat} placeholder="New category (Dogs, house…)" />
      <PickManyOrMake label="Where to get it (pick any, optional)" table="shop_stores" options={stores} value={storeIds} onChange={setStoreIds} placeholder="New place (Costco, Online, pet store…)" />
      <input className="input" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Order link (optional)" aria-label="Order link" />
      <GroceryToggle value={grocery} onChange={setGrocery} />
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

/** Several at once: one per line, all sharing a category / place. */
export function ShopBatchForm({ groceryDefault = false, onDone }: { groceryDefault?: boolean; onDone: () => void }) {
  const { meId, toast } = useApp();
  const { cats, stores } = useShopping();
  const [text, setText] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [grocery, setGrocery] = useState(groceryDefault);
  const [busy, setBusy] = useState(false);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lines.length) return;
    setBusy(true);
    const { error } = await addToShopping(
      meId,
      lines.map((name) => ({ name, category_id: cat, store_ids: storeIds, grocery })),
    );
    setBusy(false);
    if (error) return toast(error.message);
    refreshAll();
    toast(`Added ${lines.length} 🛒`);
    onDone();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <textarea className="textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"One per line:\nPaper towels\nDog food\nBatteries"} autoFocus aria-label="Items, one per line" />
      <PickOrMake label="Category for all (optional)" table="shop_categories" options={cats} value={cat} onChange={setCat} placeholder="New category" />
      <PickManyOrMake label="Where to get them (pick any, optional)" table="shop_stores" options={stores} value={storeIds} onChange={setStoreIds} placeholder="New place" />
      <GroceryToggle value={grocery} onChange={setGrocery} />
      <p className="small muted">Add notes, links or brands later by tapping an item.</p>
      <button className="btn btn-primary btn-block" disabled={busy || !lines.length}>
        Add {lines.length || ""} item{lines.length === 1 ? "" : "s"}
      </button>
    </form>
  );
}

/** "Just one" or "Add several". */
export function ShopAdd({ groceryDefault = false, onDone }: { groceryDefault?: boolean; onDone: () => void }) {
  const [several, setSeveral] = useState(false);
  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="How many">
        <button type="button" aria-pressed={!several} onClick={() => setSeveral(false)}>
          Just one
        </button>
        <button type="button" aria-pressed={several} onClick={() => setSeveral(true)}>
          Add several
        </button>
      </div>
      {several ? <ShopBatchForm groceryDefault={groceryDefault} onDone={onDone} /> : <ShopItemForm groceryDefault={groceryDefault} onDone={onDone} />}
    </div>
  );
}

function normalizeLink(v: string) {
  const t = v.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

type Row = { kind: "cat"; id: string; name: string; count: number } | { kind: "item"; id: string; item: ShopItem };

/**
 * The shopping list: filter by category and/or where to get it; drag items to
 * reorder or into another category; claim, bought, select → to-dos.
 * `groceries` shows only the grocery items (Food's grocery list).
 */
export function ShoppingList({ groceries = false }: { groceries?: boolean }) {
  const { meId, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const { cats, stores, items: all } = useShopping();
  const listItems = groceries ? all.filter((i) => i.grocery) : all;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ShopItem | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ordering, setOrdering] = useState<"cats" | "stores" | null>(null);
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const filtering = !!catFilter || !!storeFilter;

  const items = listItems.filter((i) => (!catFilter || (i.category_id ?? "none") === catFilter) && (!storeFilter || i.store_ids.includes(storeFilter)));
  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name;

  // One flat list, category headers included, so an item can be dragged
  // across a header into another category. "No category" only shows when
  // something's in it; empty categories stay as drop targets.
  const groups = [...cats.map((c) => ({ id: c.id, name: c.name })), { id: "", name: "No category" }]
    .map((g) => ({ ...g, items: items.filter((i) => (i.category_id ?? "") === g.id) }))
    .filter((g) => g.id || g.items.length)
    .filter((g) => !catFilter || g.items.length);
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
    const results = await Promise.all(changed.map((u) => supabase.from("shop_items").update({ category_id: u.category_id, position: u.position }).eq("id", u.id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) toast(failed.error.message);
    refreshAll();
  }

  async function toggleBought(i: ShopItem, el: HTMLElement) {
    const now = !i.bought;
    if (now) celebrate(el, ["🛒", "✨"]);
    await supabase.from("shop_items").update({ bought: now }).eq("id", i.id);
    // Bought a grocery → the pantry has it. Items on a shopping to-do wait
    // until that to-do is checked off (see finishShoppingTask).
    if (now && i.grocery && !i.task_id) await setHave(i.name, true);
    refreshAll();
  }

  async function claim(i: ShopItem) {
    await supabase.from("shop_items").update({ claimed_by: i.claimed_by === meId ? null : meId }).eq("id", i.id);
    refreshAll();
  }

  // One to-do for the whole trip. The items stay here, linked; the to-do
  // finishes once each is bought or moved back.
  async function sendToTodos() {
    const chosen = items.filter((i) => picked.has(i.id));
    const names = chosen.map((i) => i.name);
    const title = names.length === 1 ? `Buy ${names[0]}` : `Shopping: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`;
    const { data: task, error } = await supabase.from("tasks").insert({ title, list_type: "shared", created_by: meId }).select("id").single();
    if (error) return toast(error.message);
    // They start unchecked on the to-do, and the to-do carries the "I got this".
    await supabase.from("shop_items").update({ task_id: task.id, bought: false, claimed_by: null }).in("id", [...picked]);
    setPicked(new Set());
    setSelecting(false);
    refreshAll();
    toast(`On our to-dos. Check them off here as you get them.`);
  }

  async function moveBack(i: ShopItem) {
    await supabase.from("shop_items").update({ task_id: null }).eq("id", i.id);
    refreshAll();
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
      {/* Just the essentials up front; details, notes and stores are one tap away. */}
      <button className="grow task-title task-edit shop-name" onClick={() => setEditing(i)}>
        {i.name}
        {i.task_id && !i.bought && <span className="shop-more"> 📋</span>}
      </button>
      {i.link && (
        <a href={i.link} target="_blank" rel="noreferrer" className="order-link" aria-label={`Order ${i.name} online`} title="Order online">
          🛍️
        </a>
      )}
      {!i.bought && !selecting && !i.task_id && (
        <button className={`claim claim-sm${i.claimed_by ? " claimed" : ""}`} onClick={() => claim(i)} aria-pressed={i.claimed_by === meId}>
          {i.claimed_by === meId ? "🙋 you" : i.claimed_by ? `🙋 ${nameOf(i.claimed_by)}` : "🙋 I got this"}
        </button>
      )}
      {!selecting && !filtering && handle}
    </div>
  );

  const usedStore = (id: string) => listItems.some((i) => i.store_ids.includes(id));
  const usedCat = (id: string) => listItems.some((i) => i.category_id === id);
  const shownStores = stores.filter((s) => usedStore(s.id));
  const shownCats = cats.filter((c) => usedCat(c.id));

  return (
    <div className="stack">
      <div className="row wrap">
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          + Add
        </button>
        {items.length > 0 && (
          <button className="btn btn-sm" aria-pressed={selecting} onClick={() => (setSelecting((s) => !s), setPicked(new Set()))}>
            {selecting ? "Cancel" : "Move selected to to-dos"}
          </button>
        )}
        {!selecting && (cats.length > 1 || stores.length > 1) && (
          <button className="btn btn-sm btn-ghost" aria-pressed={!!ordering} onClick={() => setOrdering((o) => (o ? null : cats.length > 1 ? "cats" : "stores"))}>
            {ordering ? "Done ordering" : "Order…"}
          </button>
        )}
      </div>

      {(shownCats.length > 0 || shownStores.length > 0) && !ordering && (
        <div className="stack-sm">
          {shownCats.length > 0 && (
            <div className="chips" role="group" aria-label="Filter by category">
              <span className="small muted">Category</span>
              {shownCats.map((c) => (
                <button key={c.id} className="chip chip-sm" aria-pressed={catFilter === c.id} onClick={() => setCatFilter(catFilter === c.id ? null : c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {shownStores.length > 0 && (
            <div className="chips" role="group" aria-label="Filter by where to get it">
              <span className="small muted">Where</span>
              {shownStores.map((s) => (
                <button key={s.id} className="chip chip-sm" aria-pressed={storeFilter === s.id} onClick={() => setStoreFilter(storeFilter === s.id ? null : s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {filtering && <p className="small faint">Clear the filters to drag things around.</p>}
        </div>
      )}

      {ordering ? (
        <div className="stack-sm">
          <div className="seg" role="group" aria-label="What to order">
            <button aria-pressed={ordering === "cats"} onClick={() => setOrdering("cats")} disabled={cats.length < 2}>
              Categories
            </button>
            <button aria-pressed={ordering === "stores"} onClick={() => setOrdering("stores")} disabled={stores.length < 2}>
              Places
            </button>
          </div>
          <div className="card" style={{ padding: "4px 12px" }}>
            <Sortable
              items={ordering === "cats" ? cats : stores}
              getId={(c) => c.id}
              onReorder={(ids) => savePositions(ordering === "cats" ? "shop_categories" : "shop_stores", ids)}
              render={(c, handle) => (
                <div className="task">
                  <strong className="grow">{c.name}</strong>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${c.name}`}
                    onClick={async () => {
                      if (!confirm(`Remove "${c.name}"? Items in it stay on the list.`)) return;
                      await supabase.from(ordering === "cats" ? "shop_categories" : "shop_stores").delete().eq("id", c.id);
                      refreshAll();
                    }}
                  >
                    ×
                  </button>
                  {handle}
                </div>
              )}
            />
          </div>
        </div>
      ) : items.length === 0 ? (
        <p className="muted">{filtering ? "Nothing matches." : groceries ? "No groceries needed. Nice." : "Nothing to buy. Nice."}</p>
      ) : (
        <div className="card" style={{ padding: "2px 12px" }}>
          <Sortable
            items={rows}
            getId={(r) => r.id}
            onReorder={moveRows}
            render={(r, handle) =>
              r.kind === "cat" ? (
                <div className={`section-title shop-cat${r.count === 0 ? " empty" : ""}`}>
                  {r.name}
                  {r.count === 0 && <span className="small faint"> · drag things here</span>}
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
          Make {picked.size ? `${picked.size} ` : ""}into one to-do
        </button>
      )}
      {!selecting && bought.length > 0 && (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={clearBought}>
          Clear {bought.length} bought
        </button>
      )}

      {adding && (
        <Sheet title={groceries ? "Grocery list" : "Shopping list"} onClose={() => setAdding(false)}>
          <ShopAdd groceryDefault={groceries} onDone={() => setAdding(false)} />
        </Sheet>
      )}
      {editing && (
        <Sheet title={editing.name} onClose={() => setEditing(null)}>
          <div className="stack">
            {(editing.detail || editing.store_ids.length > 0 || editing.note) && (
              <div className="small muted stack-sm">
                {editing.detail && <span>{editing.detail}</span>}
                {editing.store_ids.length > 0 && <span>{editing.store_ids.map(storeName).filter(Boolean).join(", ")}</span>}
                {editing.note && <span>📝 {editing.note}</span>}
              </div>
            )}
            {editing.task_id && !editing.bought && (
              <div className="small muted row" style={{ gap: 6 }}>
                📋 On a to-do
                <button className="btn-link small" onClick={() => (moveBack(editing), setEditing(null))}>
                  Move back
                </button>
              </div>
            )}
            <ShopItemForm initial={editing} onDone={() => setEditing(null)} />
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** Checking off a shopping to-do: bought groceries go to the pantry's Have, and the items leave the list. */
export async function finishShoppingTask(items: ShopItem[]) {
  const supabase = supabaseBrowser();
  await Promise.all(items.filter((i) => i.bought && i.grocery).map((i) => setHave(i.name, true)));
  const done = items.filter((i) => i.bought).map((i) => i.id);
  if (done.length) await supabase.from("shop_items").delete().in("id", done);
}

/** The items on a shopping to-do, in a popup: tick them off, or move one back to the list. */
export function ShoppingTaskSheet({ title, items, onClose }: { title: string; items: ShopItem[]; onClose: () => void }) {
  const supabase = supabaseBrowser();
  async function tick(i: ShopItem, el: HTMLElement) {
    if (!i.bought) celebrate(el, ["🛒", "✨"]);
    await supabase.from("shop_items").update({ bought: !i.bought }).eq("id", i.id);
    refreshAll();
  }
  async function moveBack(i: ShopItem) {
    await supabase.from("shop_items").update({ task_id: null, bought: false }).eq("id", i.id);
    refreshAll();
  }
  const left = items.filter((i) => !i.bought).length;
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        {items.length === 0 ? (
          <p className="muted">Nothing left on this one.</p>
        ) : (
          <div className="card" style={{ padding: "2px 12px" }}>
            {items.map((i) => (
              <div key={i.id} className={`task${i.bought ? " done" : ""}`}>
                <input type="checkbox" className="check" checked={i.bought} onChange={(e) => tick(i, e.currentTarget)} aria-label={`Got ${i.name}`} />
                <span className="grow">
                  <span className="task-title">{i.name}</span>
                  {i.detail && <span className="small muted"> · {i.detail}</span>}
                  {i.note && <div className="small shop-note">📝 {i.note}</div>}
                </span>
                {!i.bought && (
                  <button className="btn-link small" onClick={() => moveBack(i)}>
                    Move back
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="small muted">
          {left ? `${left} to go. ` : "All set. "}Check off the to-do when you&apos;re done; the groceries go into the pantry then. “Move back” puts one back on the shopping list.
        </p>
      </div>
    </Sheet>
  );
}
