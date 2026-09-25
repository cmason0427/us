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
import { BatchAdd, type BatchRow } from "@/components/BatchAdd";

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
  terps: string[];
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
  feel: Record<string, number>;
  good_for: string[];
  flavor: number | null;
  note: string | null;
}

const KINDS: { v: string; label: string }[] = [
  { v: "flower", label: "🌿 Flower" },
  { v: "preroll", label: "🚬 Pre-roll" },
  { v: "cart", label: "🔋 Cart" },
  { v: "dispo", label: "💨 Dispo" },
  { v: "dab", label: "🍯 Dab" },
  { v: "edible", label: "🍬 Edible" },
  { v: "other", label: "✨ Other" },
];
const STRAIN_TYPES: { v: string; label: string }[] = [
  { v: "indica", label: "Indica" },
  { v: "sativa", label: "Sativa" },
  { v: "hybrid", label: "Hybrid" },
  { v: "cbd", label: "CBD" },
];
const TERPS = ["Myrcene", "Limonene", "Caryophyllene", "Pinene", "Linalool", "Humulene", "Terpinolene", "Ocimene"];
/** "24%", "24.5", "10mg" → a number to sort by (percent or mg, whatever was typed). */
const thcNum = (t: string | null) => (t ? parseFloat(t.replace(/[^\d.]/g, "")) || 0 : 0);
/** What it's good for: shop by what you're in the mood for. */
const GOOD_FOR = ["Sleep", "Anxiety", "Pain", "Chilling", "Movie night", "Gaming", "Social", "Creative", "Cleaning", "Outdoors", "Sex", "Appetite", "Focus", "Laughing", "Music", "Daytime", "Just a little"];
const PRICES: { v: string; label: string; ok: (n: number) => boolean }[] = [
  { v: "u20", label: "Under $20", ok: (n) => n < 20 },
  { v: "20-40", label: "$20–40", ok: (n) => n >= 20 && n <= 40 },
  { v: "40-60", label: "$40–60", ok: (n) => n > 40 && n <= 60 },
  { v: "60+", label: "$60+", ok: (n) => n > 60 },
];
/** How it felt. Each picked one gets a 1–5 "how much". The last few are the not-so-fun ones. */
const EFFECTS = ["Relaxed", "Calm", "Sleepy", "Giggly", "Happy", "Euphoric", "Creative", "Focused", "Energized", "Chatty", "Social", "Horny", "Hungry", "Body high", "Head high", "Floaty", "Couch-lock", "Introspective", "Anxious", "Paranoid", "Foggy", "Dry mouth", "Headache"];
const BAD = new Set(["Anxious", "Paranoid", "Foggy", "Dry mouth", "Headache"]);
const LEVEL = ["", "a little", "some", "medium", "a lot", "all the way"];
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
  const [type, setType] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [terps, setTerps] = useState<string[]>([]);
  const [goodFor, setGoodFor] = useState<string[]>([]);
  const [felt, setFelt] = useState<string[]>([]);
  const [price, setPrice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"new" | "high" | "flavor" | "worth" | "thc" | "price">("new");
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
  const avgFlavor = (id: string) => {
    const fs = reviewsOf(id).flatMap((r) => (r.flavor ? [r.flavor] : []));
    return fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : 0;
  };
  const brands = [...new Set(items.map((i) => i.brand?.trim()).filter((b): b is string => !!b))].sort();
  const allTerps = [...new Set([...TERPS, ...items.flatMap((i) => i.terps ?? [])])];
  const q = search.trim().toLowerCase();
  const shown = items
    .filter(
      (i) =>
        (!kind || i.kind === kind) &&
        (!type || i.strain_type === type) &&
        (!brand || i.brand?.trim() === brand) &&
        terps.every((t) => (i.terps ?? []).includes(t)) &&
        goodFor.every((g) => reviewsOf(i.id).some((r) => (r.good_for ?? []).includes(g))) &&
        felt.every((f) => reviewsOf(i.id).some((r) => r.effects.includes(f))) &&
        (!price || (i.price != null && PRICES.find((p) => p.v === price)!.ok(Number(i.price)))) &&
        (!q ||
          [i.name, i.strain, i.brand, i.shop, i.notes, ...(i.terps ?? []), ...reviewsOf(i.id).flatMap((r) => [...r.effects, ...(r.good_for ?? []), r.note])].some((x) =>
            x?.toLowerCase().includes(q),
          )),
    )
    .sort((a, b) =>
      sort === "high"
        ? avgHigh(b.id) - avgHigh(a.id)
        : sort === "flavor"
          ? avgFlavor(b.id) - avgFlavor(a.id)
          : sort === "worth"
            ? worthScore(b.id) - worthScore(a.id)
            : sort === "thc"
              ? thcNum(b.thc) - thcNum(a.thc)
              : sort === "price"
                ? Number(a.price ?? 1e9) - Number(b.price ?? 1e9)
                : 0,
    );
  const filterCount = [kind, type, brand, price].filter(Boolean).length + terps.length + goodFor.length + felt.length;
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const openItem = items.find((i) => i.id === open);
  const [matching, setMatching] = useState(false);

  return (
    <main className="page">
      <PageHead eyebrow="What we grew fond of" title="Garden" art={<Sticker name="wiley_sniff" size={84} tilt={3} />} />
      <Wavy />
      <div className="row wrap">
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          ＋ Add
        </button>
        {reviews.length > 0 && (
          <button className="btn btn-sm" onClick={() => setMatching(true)}>
            🎯 Match a mood
          </button>
        )}
        {items.length > 1 && (
          <>
            <input className="input grow" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="sleepy, cheap, limonene…" aria-label="Search" style={{ minWidth: 120 }} />
            <button className="btn btn-sm btn-ghost" aria-pressed={showFilters || filterCount > 0} onClick={() => setShowFilters((f) => !f)}>
              Sort &amp; filter{filterCount ? ` (${filterCount})` : ""}
            </button>
          </>
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
                ["flavor", "Best flavor"],
                ["worth", "Most worth it"],
                ["thc", "Most THC"],
                ["price", "Cheapest"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className="chip chip-sm" aria-pressed={sort === k} onClick={() => setSort(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="chips">
            <span className="small muted">In the mood for</span>
            {GOOD_FOR.map((g) => (
              <button key={g} className="chip chip-sm" aria-pressed={goodFor.includes(g)} onClick={() => toggle(goodFor, setGoodFor, g)}>
                {g}
              </button>
            ))}
          </div>
          <div className="chips">
            <span className="small muted">Want to feel</span>
            {EFFECTS.map((e) => (
              <button key={e} className="chip chip-sm" aria-pressed={felt.includes(e)} onClick={() => toggle(felt, setFelt, e)}>
                {e}
              </button>
            ))}
          </div>
          <div className="chips">
            <span className="small muted">Price</span>
            {PRICES.map((p) => (
              <button key={p.v} className="chip chip-sm" aria-pressed={price === p.v} onClick={() => setPrice(price === p.v ? null : p.v)}>
                {p.label}
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
          <div className="chips">
            <span className="small muted">Type</span>
            {STRAIN_TYPES.map((t) => (
              <button key={t.v} className="chip chip-sm" aria-pressed={type === t.v} onClick={() => setType(type === t.v ? null : t.v)}>
                {t.label}
              </button>
            ))}
          </div>
          {brands.length > 0 && (
            <div className="chips">
              <span className="small muted">Brand</span>
              {brands.map((b) => (
                <button key={b} className="chip chip-sm" aria-pressed={brand === b} onClick={() => setBrand(brand === b ? null : b)}>
                  {b}
                </button>
              ))}
            </div>
          )}
          <div className="chips">
            <span className="small muted">Terps</span>
            {allTerps.map((t) => (
              <button key={t} className="chip chip-sm" aria-pressed={terps.includes(t)} onClick={() => setTerps(terps.includes(t) ? terps.filter((x) => x !== t) : [...terps, t])}>
                {t}
              </button>
            ))}
          </div>
          {filterCount > 0 && (
            <button className="btn-link small" style={{ alignSelf: "flex-start" }} onClick={() => (setKind(null), setType(null), setBrand(null), setTerps([]), setGoodFor([]), setFelt([]), setPrice(null))}>
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="garden-grid">
        {shown.length === 0 && <p className="muted">{items.length ? "Nothing matches." : "Nothing here yet. Next time you pick something up, add it."}</p>}
        {shown.map((i) => {
          const rs = reviewsOf(i.id);
          const h = avgHigh(i.id);
          return (
            <button key={i.id} className="card garden-card" onClick={() => setOpen(i.id)}>
              <span className="garden-kind">{label(KINDS, i.kind)?.split(" ")[0] ?? "🌿"}</span>
              <strong>{i.name}</strong>
              <span className="small muted">{[i.brand, i.strain, label(STRAIN_TYPES, i.strain_type), i.thc && `${i.thc}${/\d$/.test(i.thc) ? "%" : ""} THC`].filter(Boolean).join(" · ") || " "}</span>
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
        <Sheet title="🌿 Add to the garden" onClose={() => setAdding(false)}>
          <AddOneOrSeveral onDone={() => setAdding(false)} />
        </Sheet>
      )}
      {matching && (
        <MoodMatch
          items={items}
          reviewsOf={reviewsOf}
          onPick={(id) => (setMatching(false), setOpen(id))}
          onClose={() => setMatching(false)}
        />
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
    ["Terps", item.terps?.length ? item.terps.join(", ") : null],
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
              {r?.flavor ? <span className="small">Flavor {"★".repeat(r.flavor)}{"☆".repeat(5 - r.flavor)}</span> : null}
              {r?.worth && <span className="small">{WORTH[r.worth]}</span>}
              {r && (r.good_for ?? []).length > 0 && <span className="small">Good for: {r.good_for.join(", ")}</span>}
              {r && r.effects.length > 0 && (
                <div className="chips">
                  {r.effects.map((e) => (
                    <span key={e} className={`sticker ${BAD.has(e) ? "" : "sage"}`}>
                      {e}
                      {r.feel?.[e] ? ` ${"•".repeat(r.feel[e])}` : ""}
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
  const [flavor, setFlavor] = useState(initial?.flavor ?? 0);
  const [worth, setWorth] = useState<Review["worth"]>(initial?.worth ?? null);
  // Picked feelings and how strong (1–5); older ratings without levels start at "medium".
  const [feel, setFeel] = useState<Record<string, number>>(() => ({ ...Object.fromEntries((initial?.effects ?? []).map((e) => [e, 3])), ...(initial?.feel ?? {}) }));
  const effects = Object.keys(feel);
  const [goodFor, setGoodFor] = useState<string[]>(initial?.good_for ?? []);
  const [note, setNote] = useState(initial?.note ?? "");
  async function save() {
    const { error } = await supabaseBrowser()
      .from("garden_reviews")
      .upsert({ item_id: item.id, user_id: meId, high: high || null, flavor: flavor || null, worth, effects, feel, good_for: goodFor, note: note.trim() || null, updated_at: new Date().toISOString() });
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
        <span>The flavor</span>
        <div className="garden-star-pick" role="group" aria-label="Flavor">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={flavor >= n} onClick={() => setFlavor(flavor === n ? 0 : n)} aria-label={`Flavor ${n} stars`}>
              {flavor >= n ? "★" : "☆"}
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
            <button
              key={e}
              type="button"
              className={`chip chip-sm${BAD.has(e) ? " chip-bad" : ""}`}
              aria-pressed={e in feel}
              onClick={() => setFeel((f) => (e in f ? Object.fromEntries(Object.entries(f).filter(([k]) => k !== e)) : { ...f, [e]: 3 }))}
            >
              {e}
            </button>
          ))}
        </div>
        {effects.length > 0 && (
          <div className="feel-sliders">
            {effects.map((e) => (
              <label key={e} className="feel-row">
                <span className="feel-name">{e}</span>
                <input type="range" min={1} max={5} value={feel[e]} onChange={(ev) => setFeel({ ...feel, [e]: Number(ev.target.value) })} />
                <span className="feel-level small muted">{LEVEL[feel[e]]}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="field">
        <span>Good for</span>
        <div className="chips">
          {GOOD_FOR.map((g) => (
            <button key={g} type="button" className="chip chip-sm" aria-pressed={goodFor.includes(g)} onClick={() => setGoodFor(goodFor.includes(g) ? goodFor.filter((x) => x !== g) : [...goodFor, g])}>
              {g}
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

/** One with every detail, or a whole haul a line each. */
function AddOneOrSeveral({ onDone }: { onDone: () => void }) {
  const [several, setSeveral] = useState(false);
  return (
    <div className="stack">
      <div className="seg seg-sm" role="group" aria-label="How many">
        <button aria-pressed={!several} onClick={() => setSeveral(false)}>
          Just one
        </button>
        <button aria-pressed={several} onClick={() => setSeveral(true)}>
          Several
        </button>
      </div>
      {several ? <AddSeveral onDone={onDone} /> : <ItemForm onDone={onDone} />}
    </div>
  );
}

/**
 * A whole haul: a line per product (enter starts the next), with kind, type,
 * brand, THC, terps and price. Shop, amount and notes live on the item itself.
 */
function AddSeveral({ onDone }: { onDone: () => void }) {
  const { meId, toast } = useApp();
  async function save(rows: BatchRow[]) {
    const today = format(new Date(), "yyyy-MM-dd");
    const { error } = await supabaseBrowser()
      .from("garden_items")
      .insert(
        rows.map((r) => {
          const price = typeof r.values.price === "string" ? r.values.price.replace(/[^\d.]/g, "") : "";
          return {
            name: r.name,
            kind: (r.values.kind as string | null) ?? null,
            strain_type: (r.values.strain_type as string | null) ?? null,
            price: price ? Number(price) : null,
            brand: typeof r.values.brand === "string" ? r.values.brand.trim() || null : null,
            thc: typeof r.values.thc === "string" ? r.values.thc.trim() || null : null,
            terps: Array.isArray(r.values.terps) ? r.values.terps : [],
            bought_on: today,
            bought_by: meId,
            created_by: meId,
          };
        }),
      );
    if (error) return error.message;
    refreshAll();
    toast(rows.length > 1 ? `Added ${rows.length} 🌿 Tap one to add details` : "Added 🌿");
    onDone();
    return null;
  }
  return (
    <BatchAdd
      placeholder="Blue Dream 3.5g, gummies…"
      noun="things"
      columns={[
        { key: "kind", label: "Kind", options: KINDS },
        { key: "strain_type", label: "Type", options: STRAIN_TYPES },
        { key: "brand", label: "Brand", options: [], text: "Brand (optional)" },
        { key: "thc", label: "THC", options: [], text: "24%, 10mg (optional)" },
        { key: "terps", label: "Terps", options: TERPS.map((t) => ({ v: t, label: t })), multi: true },
        { key: "price", label: "Price", options: [], text: "$ (optional)" },
      ]}
      onSave={save}
    />
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
    terps: initial?.terps ?? ([] as string[]),
    bought_on: initial?.bought_on ?? format(new Date(), "yyyy-MM-dd"),
    notes: initial?.notes ?? "",
  });
  const [more, setMore] = useState(!!initial);
  const set = (k: keyof typeof f, v: string | null) => setF({ ...f, [k]: v });
  const [newTerp, setNewTerp] = useState("");
  const toggleTerp = (t: string) => setF({ ...f, terps: f.terps.includes(t) ? f.terps.filter((x) => x !== t) : [...f.terps, t] });
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
      terps: f.terps,
      bought_on: f.bought_on || null,
      notes: f.notes.trim() || null,
    };
    const supabase = supabaseBrowser();
    const { error } = initial ? await supabase.from("garden_items").update(row).eq("id", initial.id) : await supabase.from("garden_items").insert({ ...row, bought_by: meId, created_by: meId });
    if (error) return toast(error.message);
    refreshAll();
    toast(initial ? "Saved" : "Added 🌿");
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
      <div className="grid-2">
        <input className="input" value={f.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Brand" aria-label="Brand" />
        <input className="input" value={f.thc} onChange={(e) => set("thc", e.target.value)} placeholder="THC (24%, 10mg)" aria-label="THC" />
      </div>
      <div className="field">
        <span>Terps</span>
        <div className="chips">
          {[...new Set([...TERPS, ...f.terps])].map((t) => (
            <button key={t} type="button" className="chip chip-sm" aria-pressed={f.terps.includes(t)} onClick={() => toggleTerp(t)}>
              {t}
            </button>
          ))}
          <input
            className="input chip-input"
            value={newTerp}
            onChange={(e) => setNewTerp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const t = newTerp.trim();
              if (t && !f.terps.includes(t)) setF({ ...f, terps: [...f.terps, t] });
              setNewTerp("");
            }}
            placeholder="+ other"
            aria-label="Another terp"
          />
        </div>
      </div>
      {more ? (
        <>
          <div className="grid-2">
            <input className="input" value={f.shop} onChange={(e) => set("shop", e.target.value)} placeholder="Where from" aria-label="Where from" />
            <input className="input" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="Amount (3.5g, 10pk)" aria-label="Amount" />
          </div>
          <div className="field">
            <span>Bought</span>
            <WhenPicker mode="day" allowAllDay={false} value={f.bought_on ? { date: f.bought_on } : null} onChange={(w) => set("bought_on", w.date)} />
          </div>
          <textarea className="textarea" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes (optional)" aria-label="Notes" />
        </>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setMore(true)}>
          + Shop, amount, date, notes
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
          {initial ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

/**
 * "How do we want tonight to hit?" Pick feelings, slide how strong, and the
 * garden ranks what you've rated closest to that (the not-fun effects count
 * against). Optionally only one kind (flower, edibles…).
 */
function MoodMatch({ items, reviewsOf, onPick, onClose }: { items: Item[]; reviewsOf: (id: string) => Review[]; onPick: (id: string) => void; onClose: () => void }) {
  const [want, setWant] = useState<Record<string, number>>({ Relaxed: 3 });
  const [kinds, setKinds] = useState<string[]>([]);
  const [budget, setBudget] = useState<string | null>(null);
  // Average felt level per effect across both of your ratings (0 = never felt).
  const felt = (id: string) => {
    const rs = reviewsOf(id);
    const out: Record<string, number> = {};
    for (const e of EFFECTS) {
      const vals = rs.map((r) => r.feel?.[e] ?? (r.effects.includes(e) ? 3 : 0));
      out[e] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    return out;
  };
  const wanted = Object.keys(want);
  const ranked = items
    .filter((i) => reviewsOf(i.id).length > 0 && (!kinds.length || kinds.includes(i.kind ?? "")) && (!budget || (i.price != null && PRICES.find((p) => p.v === budget)!.ok(Number(i.price)))))
    .map((i) => {
      const f = felt(i.id);
      const miss = wanted.reduce((sum, e) => sum + Math.abs((want[e] ?? 0) - f[e]), 0);
      const bad = [...BAD].filter((e) => !(e in want)).reduce((sum, e) => sum + f[e] * 0.6, 0);
      const worst = wanted.length * 5 + 3;
      return { i, score: Math.max(0, Math.round(100 - ((miss + bad) / worst) * 100)), f };
    })
    .sort((a, b) => b.score - a.score);

  return (
    <Sheet title="🎯 Match a mood" onClose={onClose}>
      <div className="stack">
        <div className="chips">
          {EFFECTS.filter((e) => !BAD.has(e)).map((e) => (
            <button key={e} className="chip chip-sm" aria-pressed={e in want} onClick={() => setWant((w) => (e in w ? Object.fromEntries(Object.entries(w).filter(([k]) => k !== e)) : { ...w, [e]: 3 }))}>
              {e}
            </button>
          ))}
        </div>
        {wanted.length > 0 && (
          <div className="feel-sliders">
            {wanted.map((e) => (
              <label key={e} className="feel-row">
                <span className="feel-name">{e}</span>
                <input type="range" min={1} max={5} value={want[e]} onChange={(ev) => setWant({ ...want, [e]: Number(ev.target.value) })} />
                <span className="feel-level small muted">{LEVEL[want[e]]}</span>
              </label>
            ))}
          </div>
        )}
        <div className="chips">
          <span className="small muted">How</span>
          {KINDS.map((k) => (
            <button key={k.v} className="chip chip-sm" aria-pressed={kinds.includes(k.v)} onClick={() => setKinds(kinds.includes(k.v) ? kinds.filter((x) => x !== k.v) : [...kinds, k.v])}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="chips">
          <span className="small muted">Price</span>
          {PRICES.map((p) => (
            <button key={p.v} className="chip chip-sm" aria-pressed={budget === p.v} onClick={() => setBudget(budget === p.v ? null : p.v)}>
              {p.label}
            </button>
          ))}
        </div>
        {ranked.length === 0 ? (
          <p className="small muted">Nothing rated matches those. Rate a few things (tap one, then “Rate it”) and this gets smarter.</p>
        ) : (
          <ul className="mini-list">
            {ranked.map(({ i, score, f }) => (
              <li key={i.id}>
                <button onClick={() => onPick(i.id)} style={{ border: "1px solid var(--line)" }}>
                  <span className="mini-emoji">{label(KINDS, i.kind)?.split(" ")[0] ?? "🌿"}</span>
                  <span className="grow">
                    <strong>{i.name}</strong>
                    <span className="small faint">
                      {" "}
                      {wanted
                        .filter((e) => f[e] > 0)
                        .map((e) => `${e.toLowerCase()} ${f[e].toFixed(1)}`)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className={`small ${score >= 70 ? "soon" : "faint"}`}>{score}%</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
