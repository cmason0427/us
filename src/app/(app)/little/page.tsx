"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Sheet } from "@/components/Sheet";
import { Sticker } from "@/components/Sticker";
import { Wavy } from "@/components/Art";

interface Thing {
  id: string;
  about_user: string;
  author: string;
  kind: "fact" | "gift";
  label: string | null;
  text: string;
  created_at: string;
}

/**
 * A little profile for each of you, like the dogs have: sizes, favorites,
 * preferences, and whatever else. Shown first; the pencil on a section edits
 * it. Gift ideas are only ever visible to whoever wrote them (the database
 * enforces it).
 */
const SECTIONS: { key: string; title: string; emoji: string; tint: string; fields: { k: string; label: string; ph?: string }[] }[] = [
  {
    key: "sizes",
    title: "Sizes",
    emoji: "👕",
    tint: "pink",
    fields: [
      { k: "shirt", label: "Shirt", ph: "M" },
      { k: "pants", label: "Pants", ph: "32x30" },
      { k: "shoes", label: "Shoes", ph: "10" },
      { k: "ring", label: "Ring", ph: "7" },
      { k: "hat", label: "Hat" },
      { k: "jacket", label: "Hoodie / jacket" },
      { k: "other_size", label: "Other sizes" },
    ],
  },
  {
    key: "favorites",
    title: "Favorites",
    emoji: "💛",
    tint: "butter",
    fields: [
      { k: "color", label: "Color" },
      { k: "flower", label: "Flower" },
      { k: "snack", label: "Snack" },
      { k: "candy", label: "Candy", ph: "Tootsie rolls, apparently" },
      { k: "drink", label: "Drink" },
      { k: "coffee", label: "Coffee order" },
      { k: "takeout", label: "Takeout order" },
      { k: "scent", label: "Scent" },
      { k: "watch", label: "Show / movie" },
      { k: "music", label: "Music" },
    ],
  },
  {
    key: "prefs",
    title: "Preferences",
    emoji: "🌷",
    tint: "sage",
    fields: [
      { k: "loves", label: "Loves" },
      { k: "not_a_fan", label: "Not a fan of" },
      { k: "allergies", label: "Allergies" },
      { k: "when_sad", label: "When I'm down, I like…" },
      { k: "love_language", label: "Love language" },
      { k: "perfect_day", label: "Perfect lazy day" },
    ],
  },
];

const fieldLabel = (k: string) => `field:${k}`;

export default function LittleThingsPage() {
  const { meId, partner, profiles, toast } = useApp();
  const [about, setAbout] = useState<"them" | "me">("them");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<"misc" | "gift" | null>(null);
  const supabase = supabaseBrowser();
  const { data: things = [] } = useLive<Thing[]>(
    "little_things",
    async () => {
      const { data, error } = await supabase.from("little_things").select("*").order("created_at");
      if (error) throw error;
      return data as Thing[];
    },
    ["little_things"],
  );
  const whoId = about === "them" ? partner?.id : meId;
  const person = profiles.find((p) => p.id === whoId);
  if (!partner || !person) return <main className="page" />;

  const facts = things.filter((t) => t.kind === "fact" && t.about_user === person.id);
  const value = (k: string) => facts.find((f) => f.label === fieldLabel(k))?.text ?? "";
  const misc = facts.filter((f) => !f.label?.startsWith("field:"));
  const gifts = things.filter((t) => t.kind === "gift" && t.about_user === partner.id && t.author === meId);

  async function saveSection(fields: Record<string, string>) {
    for (const [k, v] of Object.entries(fields)) {
      const existing = facts.find((f) => f.label === fieldLabel(k));
      const text = v.trim();
      if (existing && !text) await supabase.from("little_things").delete().eq("id", existing.id);
      else if (existing && text !== existing.text) await supabase.from("little_things").update({ text }).eq("id", existing.id);
      else if (!existing && text) await supabase.from("little_things").insert({ about_user: person!.id, author: meId, kind: "fact", label: fieldLabel(k), text });
    }
    refreshAll();
    setEditing(null);
    toast("Saved 💝");
  }
  async function addNote(kind: "fact" | "gift", text: string) {
    const { error } = await supabase.from("little_things").insert({ about_user: kind === "gift" ? partner!.id : person!.id, author: meId, kind, label: kind === "fact" ? "misc" : null, text: text.trim() });
    if (error) return toast(error.message);
    refreshAll();
    setAdding(null);
  }
  async function remove(t: Thing) {
    if (!confirm(`Remove “${t.text}”?`)) return;
    await supabase.from("little_things").delete().eq("id", t.id);
    refreshAll();
  }

  const section = SECTIONS.find((s) => s.key === editing);

  return (
    <main className="page">
      <PageHead eyebrow="Worth remembering" title="Little things" art={<Sticker name="duo_cuddle" size={92} tilt={-2} />} />
      <Wavy />
      <div className="seg" role="group" aria-label="About who">
        <button aria-pressed={about === "them"} onClick={() => setAbout("them")}>
          {partner.display_name}
        </button>
        <button aria-pressed={about === "me"} onClick={() => setAbout("me")}>
          Me
        </button>
      </div>

      <div className="lt-hero">
        <div className="lt-polaroid">
          <PersonAvatar id={person.id} size={86} />
          <span className="lt-caption">{person.id === meId ? "me!" : person.display_name}</span>
        </div>
        <p className="small muted">
          {person.id === meId ? `What ${partner.display_name} should know. Either of you can fill it in.` : `The little stuff about ${partner.display_name}. You can both add to it.`}
        </p>
      </div>

      {SECTIONS.map((s) => {
        const filled = s.fields.filter((f) => value(f.k));
        return (
          <section key={s.key} className={`lt-card lt-${s.tint}`}>
            <div className="lt-card-head">
              <span className="lt-badge">{s.emoji}</span>
              <h2>{s.title}</h2>
              <button className="icon-btn lt-edit" onClick={() => setEditing(s.key)} aria-label={`Edit ${s.title}`}>
                ✏️
              </button>
            </div>
            {filled.length ? (
              <div className="lt-grid">
                {filled.map((f) => (
                  <div key={f.k} className="lt-tile">
                    <span className="lt-tile-label">{f.label}</span>
                    <span className="lt-tile-value">{value(f.k)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <button className="lt-empty" onClick={() => setEditing(s.key)}>
                Nothing yet. Tap to add ✏️
              </button>
            )}
          </section>
        );
      })}

      <section className="lt-card lt-lilac">
        <div className="lt-card-head">
          <span className="lt-badge">✨</span>
          <h2>Miscellaneous</h2>
          <button className="icon-btn lt-edit" onClick={() => setAdding("misc")} aria-label="Add something">
            ＋
          </button>
        </div>
        {misc.length ? (
          <ul className="lt-list">
            {misc.map((t) => (
              <li key={t.id}>
                <span className="grow">
                  {t.label && t.label !== "misc" ? <strong>{t.label}: </strong> : null}
                  {t.text}
                </span>
                <button className="icon-btn" onClick={() => remove(t)} aria-label={`Remove ${t.text}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <button className="lt-empty" onClick={() => setAdding("misc")}>
            Anything else worth knowing ✨
          </button>
        )}
      </section>

      {about === "them" && (
        <section className="lt-card lt-gift">
          <div className="lt-card-head">
            <span className="lt-badge">🎁</span>
            <h2>Gift ideas</h2>
            <button className="icon-btn lt-edit" onClick={() => setAdding("gift")} aria-label="Add a gift idea">
              ＋
            </button>
          </div>
          <p className="small muted" style={{ margin: "-4px 0 8px" }}>
            Just for you. {partner.display_name} will never see these.
          </p>
          {gifts.length ? (
            <ul className="lt-list">
              {gifts.map((t) => (
                <li key={t.id}>
                  <span className="grow">{t.text}</span>
                  <button className="icon-btn" onClick={() => remove(t)} aria-label={`Remove ${t.text}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <button className="lt-empty" onClick={() => setAdding("gift")}>
              That candle they smelled twice… 🕯️
            </button>
          )}
        </section>
      )}

      {section && (
        <Sheet title={`${section.emoji} ${section.title}`} onClose={() => setEditing(null)}>
          <SectionForm fields={section.fields} value={value} onSave={saveSection} />
        </Sheet>
      )}
      {adding && (
        <Sheet title={adding === "gift" ? "🎁 A gift idea" : "✨ Something to remember"} onClose={() => setAdding(null)}>
          <NoteForm placeholder={adding === "gift" ? "That candle they smelled twice…" : "Hates cilantro, loves the window seat…"} onSave={(t) => addNote(adding === "gift" ? "gift" : "fact", t)} />
        </Sheet>
      )}
    </main>
  );
}

function SectionForm({ fields, value, onSave }: { fields: { k: string; label: string; ph?: string }[]; value: (k: string) => string; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.k, value(f.k)])));
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <div className="lt-form">
        {fields.map((f) => (
          <label key={f.k} className="field">
            <span>{f.label}</span>
            <input className="input" value={v[f.k] ?? ""} placeholder={f.ph} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="small muted">Leave anything blank; only what&apos;s filled in shows.</p>
      <button className="btn btn-primary btn-block">Save</button>
    </form>
  );
}

function NoteForm({ placeholder, onSave }: { placeholder: string; onSave: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (t.trim()) onSave(t);
      }}
    >
      <textarea className="textarea" rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder={placeholder} autoFocus />
      <button className="btn btn-primary btn-block" disabled={!t.trim()}>
        Add
      </button>
    </form>
  );
}
