"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { Sticker } from "@/components/Sticker";
import { WhenPicker } from "@/components/WhenPicker";
import { Wavy } from "@/components/Art";

interface Item {
  id: string;
  name: string;
  kind: string | null;
  strain: string | null;
  strain_type: string | null;
  brand: string | null;
  shop: string | null;
  price: number | null;
  amount: string | null;
  thc: string | null;
  bought_on: string | null;
  bought_by: string | null;
  notes: string | null;
  created_at: string;
}
interface Review {
  item_id: string;
  user_id: string;
  high: number | null;
  worth: "yes" | "meh" | "no" | null;
  effects: string[];
  note: string | null;
}

const KINDS: { v: string; label: string }[] = [
  { v: "flower", label: "🌿 Flower" },
  { v: "preroll", label: "🚬 Pre-roll" },
  { v: "vape", label: "💨 Vape" },
  { v: "edible", label: "🍬 Edible" },
  { v: "concentrate", label: "🍯 Concentrate" },
  { v: "tincture", label: "💧 Tincture" },
  { v: "other", label: "✨ Other" },
];
const STRAIN_TYPES: { v: string; label: string }[] = [
  { v: "indica", label: "Indica" },
  { v: "sativa", label: "Sativa" },
  { v: "hybrid", label: "Hybrid" },
  { v: "cbd", label: "CBD" },
];
const EFFECTS = ["Relaxed", "Sleepy", "Giggly", "Creative", "Hungry", "Focused", "Euphoric", "Body high", "Couch-lock", "Social", "Anxious", "Dry mouth", "Headache"];
const WORTH: Record<string, string> = { yes: "💸 Worth it", meh: "😐 Meh", no: "🙅 Not worth it" };
const label = (list: { v: string; label: string }[], v: string | null) => list.find((x) => x.v === v)?.label;
const money = (n: number) => `$${n % 1 ? n.toFixed(2) : n}`;

/** The garden: what we bought, what it cost, and how it was (each of you rates it your way). */
export default function GardenPage() {
  const supabase = supabaseBrowser();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [kind, setKind] = useState<string | null>(null);
  const [sort, setSort] = useState<"new" | "high" | "worth">("new");
  const { data: items = [] } = useLive<Item[]>(
    "garden_items",
    async () => {
      const { data, error } = await supabase.from("garden_items").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
    ["garden_items"],
  );
  const { data: reviews = [] } = useLive<Review[]>(
    "garden_reviews",
    async () => {
      const { data, error } = await supabase.from("garden_reviews").select("*");
      if (error) throw error;
      return data as Review[];
    },
    ["garden_reviews"],
  );
  const reviewsOf = (id: string) => reviews.filter((r) => r.item_id === id);
  const avgHigh = (id: string) => {
    const hs = reviewsOf(id).flatMap((r) => (r.high ? [r.high] : []));
    return hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : 0;
  };
  const worthScore = (id: string) => reviewsOf(id).reduce((s, r) => s + (r.worth === "yes" ? 1 : r.worth === "no" ? -1 : 0), 0);
  const shown = items
    .filter((i) => !kind || i.kind === kind)
    .sort((a, b) => (sort === "high" ? avgHigh(b.id) - avgHigh(a.id) : sort === "worth" ? worthScore(b.id) - worthScore(a.id) : 0));
  const openItem = items.find((i) => i.id === open);

  return (
    <main className="page">
      <PageHead eyebrow="What we grew fond of" title="Garden" art={<Sticker name="wiley_sniff" size={84} tilt={3} />} />
      <Wavy />
      <div className="row wrap">
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          ＋ Log a buy
        </button>
        {items.length > 1 && (
          <button className="btn btn-sm btn-ghost" aria-pressed={showFilters || !!kind} onClick={() => setShowFilters((f) => !f)}>
            Sort &amp; filter{kind ? " •" : ""}
          </button>
        )}
      </div>
      {showFilters && (
        <div className="card stack-sm" style={{ padding: "10px 12px", marginTop: 10 }}>
          <div className="chips">
            <span className="small muted">Sort</span>
            {(
              [
                ["new", "Newest"],
                ["high", "Best high"],
                ["worth", "Most worth it"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className="chip chip-sm" aria-pressed={sort === k} onClick={() => setSort(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="chips">
            <span className="small muted">Kind</span>
            {KINDS.map((k) => (
              <button key={k.v} className="chip chip-sm" aria-pressed={kind === k.v} onClick={() => setKind(kind === k.v ? null : k.v)}>
                {k.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="garden-grid">
        {shown.length === 0 && <p className="muted">{items.length ? "Nothing matches." : "Nothing logged yet. Next time you pick something up, log it here."}</p>}
        {shown.map((i) => {
          const rs = reviewsOf(i.id);
          const h = avgHigh(i.id);
          return (
            <button key={i.id} className="card garden-card" onClick={() => setOpen(i.id)}>
              <span className="garden-kind">{label(KINDS, i.kind)?.split(" ")[0] ?? "🌿"}</span>
              <strong>{i.name}</strong>
              <span className="small muted">{[i.strain, label(STRAIN_TYPES, i.strain_type)].filter(Boolean).join(" · ") || " "}</span>
              <span className="garden-meta">
                {h > 0 && <span>{"★".repeat(Math.round(h))}</span>}
                {i.price != null && <span className="small">{money(Number(i.price))}</span>}
                {rs.map((r) => r.worth && <span key={r.user_id}>{WORTH[r.worth].split(" ")[0]}</span>)}
              </span>
            </button>
          );
        })}
      </div>

      {adding && (
        <Sheet title="🌿 Log a buy" onClose={() => setAdding(false)}>
          <ItemForm onDone={() => setAdding(false)} />
        </Sheet>
      )}
      {openItem && <ItemSheet item={openItem} reviews={reviewsOf(openItem.id)} onClose={() => setOpen(null)} />}
    </main>
  );
}

function ItemSheet({ item, reviews, onClose }: { item: Item; reviews: Review[]; onClose: () => void }) {
  const { meId, profiles, nameOf } = useApp();
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(false);
  const mine = reviews.find((r) => r.user_id === meId);
  if (editing)
    return (
      <Sheet title={`Edit ${item.name}`} onClose={() => setEditing(false)}>
        <ItemForm initial={item} onDone={() => setEditing(false)} onDeleted={onClose} />
      </Sheet>
    );
  if (rating)
    return (
      <Sheet title="How was it?" onClose={() => setRating(false)}>
        <ReviewForm item={item} initial={mine} onDone={() => setRating(false)} />
      </Sheet>
    );
  const facts = [
    ["Kind", label(KINDS, item.kind)],
    ["Strain", item.strain],
    ["Type", label(STRAIN_TYPES, item.strain_type)],
    ["Brand", item.brand],
    ["From", item.shop],
    ["Price", item.price != null ? money(Number(item.price)) : null],
    ["Amount", item.amount],
    ["THC", item.thc],
    ["Bought", item.bought_on ? `${format(parseISO(item.bought_on), "MMM d, yyyy")}${item.bought_by ? ` · ${nameOf(item.bought_by)}` : ""}` : null],
  ].filter(([, v]) => v) as [string, string][];
  return (
    <Sheet title={item.name} onClose={onClose}>
      <div className="stack">
        <div className="card dog-facts">
          {facts.map(([k, v]) => (
            <div key={k} className="dog-fact">
              <span className="small muted">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
        {profiles.map((p) => {
          const r = reviews.find((x) => x.user_id === p.id);
          return (
            <div key={p.id} className="card garden-review">
              <div className="row-between">
                <strong>{p.id === meId ? "You" : p.display_name}</strong>
                {r?.high ? <span className="garden-stars">{"★".repeat(r.high)}{"☆".repeat(5 - r.high)}</span> : <span className="small faint">not rated</span>}
              </div>
              {r?.worth && <span className="small">{WORTH[r.worth]}</span>}
              {r && r.effects.length > 0 && (
                <div className="chips">
                  {r.effects.map((e) => (
                    <span key={e} className="sticker sage">
                      {e}
                    </span>
                  ))}
                </div>
              )}
              {r?.note && <p className="small" style={{ whiteSpace: "pre-wrap" }}>{r.note}</p>}
            </div>
          );
        })}
        {item.notes && <p className="card" style={{ whiteSpace: "pre-wrap" }}>{item.notes}</p>}
        <div className="row wrap">
          <button className="btn btn-primary btn-sm" onClick={() => setRating(true)}>
            {mine ? "Change my rating" : "Rate it"}
          </button>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function ReviewForm({ item, initial, onDone }: { item: Item; initial?: Review; onDone: () => void }) {
  const { meId, toast } = useApp();
  const [high, setHigh] = useState(initial?.high ?? 0);
  const [worth, setWorth] = useState<Review["worth"]>(initial?.worth ?? null);
  const [effects, setEffects] = useState<string[]>(initial?.effects ?? []);
  const [note, setNote] = useState(initial?.note ?? "");
  async function save() {
    const { error } = await supabaseBrowser()
      .from("garden_reviews")
      .upsert({ item_id: item.id, user_id: meId, high: high || null, worth, effects, note: note.trim() || null, updated_at: new Date().toISOString() });
    if (error) return toast(error.message);
    refreshAll();
    onDone();
  }
  return (
    <div className="stack">
      <div className="field">
        <span>The high</span>
        <div className="garden-star-pick" role="group" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={high >= n} onClick={() => setHigh(high === n ? 0 : n)} aria-label={`${n} stars`}>
              {high >= n ? "★" : "☆"}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Worth the price?</span>
        <div className="seg" role="group">
          {(["yes", "meh", "no"] as const).map((w) => (
            <button key={w} type="button" aria-pressed={worth === w} onClick={() => setWorth(worth === w ? null : w)}>
              {WORTH[w]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>How it felt</span>
        <div className="chips">
          {EFFECTS.map((e) => (
            <button key={e} type="button" className="chip chip-sm" aria-pressed={effects.includes(e)} onClick={() => setEffects(effects.includes(e) ? effects.filter((x) => x !== e) : [...effects, e])}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes (optional): tasted like…" aria-label="Notes" />
      <button className="btn btn-primary btn-block" onClick={save}>
        Save
      </button>
    </div>
  );
}

function ItemForm({ initial, onDone, onDeleted }: { initial?: Item; onDone: () => void; onDeleted?: () => void }) {
  const { meId, toast } = useApp();
  const [f, setF] = useState({
    name: initial?.name ?? "",
    kind: initial?.kind ?? null,
    strain: initial?.strain ?? "",
    strain_type: initial?.strain_type ?? null,
    brand: initial?.brand ?? "",
    shop: initial?.shop ?? "",
    price: initial?.price != null ? String(initial.price) : "",
    amount: initial?.amount ?? "",
    thc: initial?.thc ?? "",
    bought_on: initial?.bought_on ?? format(new Date(), "yyyy-MM-dd"),
    notes: initial?.notes ?? "",
  });
  const [more, setMore] = useState(!!initial);
  const set = (k: keyof typeof f, v: string | null) => setF({ ...f, [k]: v });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return;
    const row = {
      name: f.name.trim(),
      kind: f.kind,
      strain: f.strain.trim() || null,
      strain_type: f.strain_type,
      brand: f.brand.trim() || null,
      shop: f.shop.trim() || null,
      price: f.price ? Number(f.price) : null,
      amount: f.amount.trim() || null,
      thc: f.thc.trim() || null,
      bought_on: f.bought_on || null,
      notes: f.notes.trim() || null,
    };
    const supabase = supabaseBrowser();
    const { error } = initial ? await supabase.from("garden_items").update(row).eq("id", initial.id) : await supabase.from("garden_items").insert({ ...row, bought_by: meId, created_by: meId });
    if (error) return toast(error.message);
    refreshAll();
    toast(initial ? "Saved" : "Logged 🌿");
    onDone();
  }
  async function remove() {
    if (!initial || !confirm(`Delete "${initial.name}" and its ratings?`)) return;
    await supabaseBrowser().from("garden_items").delete().eq("id", initial.id);
    refreshAll();
    onDone();
    onDeleted?.();
  }
  return (
    <form className="stack" onSubmit={submit}>
      <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="What is it? (Blue Dream 3.5g, gummies…)" autoFocus={!initial} required />
      <div className="chips">
        {KINDS.map((k) => (
          <button key={k.v} type="button" className="chip chip-sm" aria-pressed={f.kind === k.v} onClick={() => set("kind", f.kind === k.v ? null : k.v)}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <input className="input" value={f.strain} onChange={(e) => set("strain", e.target.value)} placeholder="Strain" aria-label="Strain" />
        <input className="input" inputMode="decimal" value={f.price} onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Price $" aria-label="Price" />
      </div>
      <div className="seg" role="group" aria-label="Strain type">
        {STRAIN_TYPES.map((t) => (
          <button key={t.v} type="button" aria-pressed={f.strain_type === t.v} onClick={() => set("strain_type", f.strain_type === t.v ? null : t.v)}>
            {t.label}
          </button>
        ))}
      </div>
      {more ? (
        <>
          <div className="grid-2">
            <input className="input" value={f.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Brand" aria-label="Brand" />
            <input className="input" value={f.shop} onChange={(e) => set("shop", e.target.value)} placeholder="Where from" aria-label="Where from" />
            <input className="input" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="Amount (3.5g, 10pk)" aria-label="Amount" />
            <input className="input" value={f.thc} onChange={(e) => set("thc", e.target.value)} placeholder="THC (24%, 10mg)" aria-label="THC" />
          </div>
          <div className="field">
            <span>Bought</span>
            <WhenPicker mode="day" allowAllDay={false} value={f.bought_on ? { date: f.bought_on } : null} onChange={(w) => set("bought_on", w.date)} />
          </div>
          <textarea className="textarea" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes (optional)" aria-label="Notes" />
        </>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setMore(true)}>
          + Brand, shop, amount, THC, date
        </button>
      )}
      <div className="row-between">
        {initial ? (
          <button type="button" className="btn btn-ghost" onClick={remove}>
            Delete
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={!f.name.trim()}>
          {initial ? "Save" : "Log it"}
        </button>
      </div>
    </form>
  );
}
