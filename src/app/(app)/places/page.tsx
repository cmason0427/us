"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { AddressLinks } from "@/components/AddressLinks";

interface Place {
  id: string;
  name: string;
  address: string | null;
  kind: string | null;
  phone: string | null;
  notes: string | null;
}
const KINDS = ["Home", "Family", "Friends", "Work", "Vet", "Doctor", "Food", "Shopping", "Fun", "Other"];

/** Shared address book: tap to copy, or open in Apple / Google Maps. */
export default function PlacesPage() {
  const supabase = supabaseBrowser();
  const { data: places = [] } = useLive<Place[]>(
    "address_book",
    async () => {
      const { data, error } = await supabase.from("address_book").select("*").order("name");
      if (error) throw error;
      return data as Place[];
    },
    ["address_book"],
  );
  const [open, setOpen] = useState<Place | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const q = search.trim().toLowerCase();
  const shown = places.filter((p) => (!kind || p.kind === kind) && (!q || [p.name, p.address, p.notes, p.kind].some((x) => x?.toLowerCase().includes(q))));
  const kinds = [...new Set(places.map((p) => p.kind).filter((k): k is string => !!k))];

  return (
    <main className="page">
      <PageHead eyebrow="Where things are" title="Address book" />
      <div className="row" style={{ margin: "10px 0 6px" }}>
        <input className="input input-sm grow" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search…" aria-label="Search" />
        <button className="btn btn-sm btn-primary" onClick={() => setOpen("new")}>
          ＋ Add
        </button>
      </div>
      {kinds.length > 1 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {kinds.map((k) => (
            <button key={k} className="chip chip-sm" aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>
              {k}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 && <p className="small muted">{places.length ? "Nothing matches." : "Moms' houses, the vet, that taco place. Tap an address to copy it."}</p>}
      <ul className="book-list">
        {shown.map((p) => (
          <li key={p.id}>
            <div className="row-between">
              <button className="book-name" onClick={() => setOpen(p)}>
                {p.name}
                {p.kind && <span className="pantry-meta"> {p.kind}</span>}
              </button>
              {p.phone && (
                <a className="pantry-chip" href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>
                  call
                </a>
              )}
            </div>
            {p.address && <AddressLinks address={p.address} />}
            {p.notes && <span className="small muted">{p.notes}</span>}
          </li>
        ))}
      </ul>
      {open && (
        <Sheet title={open === "new" ? "📍 New place" : open.name} onClose={() => setOpen(null)}>
          <PlaceForm initial={open === "new" ? undefined : open} onDone={() => setOpen(null)} />
        </Sheet>
      )}
    </main>
  );
}

function PlaceForm({ initial, onDone }: { initial?: Place; onDone: () => void }) {
  const { meId, toast } = useApp();
  const [f, setF] = useState({ name: initial?.name ?? "", address: initial?.address ?? "", kind: initial?.kind ?? "", phone: initial?.phone ?? "", notes: initial?.notes ?? "" });
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const supabase = supabaseBrowser();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const row = { name: f.name.trim(), address: f.address.trim() || null, kind: f.kind || null, phone: f.phone.trim() || null, notes: f.notes.trim() || null };
    if (!row.name) return;
    const { error } = initial ? await supabase.from("address_book").update(row).eq("id", initial.id) : await supabase.from("address_book").insert({ ...row, created_by: meId });
    if (error) return toast(error.message);
    refreshAll();
    onDone();
  }
  return (
    <form className="stack" onSubmit={save}>
      <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Name (Parker's mom)" required autoFocus={!initial} aria-label="Name" />
      <textarea className="textarea" rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Address" aria-label="Address" style={{ minHeight: 56 }} />
      <div className="chips">
        {KINDS.map((k) => (
          <button key={k} type="button" className="chip chip-sm" aria-pressed={f.kind === k} onClick={() => set("kind", f.kind === k ? "" : k)}>
            {k}
          </button>
        ))}
      </div>
      <input className="input" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone (optional)" aria-label="Phone" />
      <input className="input" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes (gate code, park on the street…)" aria-label="Notes" />
      <div className="row-between">
        {initial ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              if (!confirm(`Remove ${initial.name}?`)) return;
              await supabase.from("address_book").delete().eq("id", initial.id);
              refreshAll();
              onDone();
            }}
          >
            Remove
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={!f.name.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}
