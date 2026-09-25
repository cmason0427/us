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
  section: string | null;
  label: string | null;
  text: string;
  note: string | null;
  created_at: string;
}

/**
 * A little profile for each of you. Every section is a list you add to one
 * thing at a time ("Movie: Shrek"), with an optional longer note. Gift ideas
 * are only ever visible to whoever wrote them (the database enforces it).
 */
const SECTIONS: { key: string; title: string; emoji: string; tint: string; labels: string[]; ph: string }[] = [
  { key: "sizes", title: "Sizes", emoji: "👕", tint: "pink", labels: ["Shirt", "Pants", "Shoes", "Ring", "Hat", "Hoodie"], ph: "10" },
  { key: "favorites", title: "Favorites", emoji: "💛", tint: "butter", labels: ["Movie", "Show", "Song", "Color", "Flower", "Snack", "Candy", "Drink", "Coffee order", "Takeout order", "Scent"], ph: "Shrek" },
  { key: "prefs", title: "Preferences", emoji: "🌷", tint: "sage", labels: ["Loves", "Not a fan", "Allergy", "When I'm down", "Love language", "Perfect lazy day"], ph: "Being left alone for an hour, then snacks" },
  { key: "misc", title: "Miscellaneous", emoji: "✨", tint: "lilac", labels: [], ph: "Hates cilantro, loves the window seat…" },
];

// Older entries were fixed fields ("field:shoes"); show them with a friendly label.
const OLD_FIELD: Record<string, string> = {
  shirt: "Shirt", pants: "Pants", shoes: "Shoes", ring: "Ring", hat: "Hat", jacket: "Hoodie", other_size: "Other size",
  color: "Color", flower: "Flower", snack: "Snack", candy: "Candy", drink: "Drink", coffee: "Coffee order", takeout: "Takeout order", scent: "Scent", watch: "Show / movie", music: "Music",
  loves: "Loves", not_a_fan: "Not a fan", allergies: "Allergy", when_sad: "When I'm down", love_language: "Love language", perfect_day: "Perfect lazy day",
};
const labelOf = (t: Thing) => (t.label?.startsWith("field:") ? OLD_FIELD[t.label.slice(6)] ?? null : t.label && t.label !== "misc" ? t.label : null);

type Editing = { mode: "add"; kind: "fact" | "gift"; section: string } | { mode: "edit"; thing: Thing };

export default function LittleThingsPage() {
  const { meId, partner, profiles, toast } = useApp();
  const [about, setAbout] = useState<"them" | "me">("them");
  const [editing, setEditing] = useState<Editing | null>(null);
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
  const inSection = (key: string) => facts.filter((f) => (f.section ?? "misc") === key);
  const gifts = things.filter((t) => t.kind === "gift" && t.about_user === partner.id && t.author === meId);

  async function save(v: { label: string; text: string; note: string }) {
    if (!editing) return;
    const row = { label: v.label.trim() || null, text: v.text.trim(), note: v.note.trim() || null };
    const { error } =
      editing.mode === "edit"
        ? await supabase.from("little_things").update(row).eq("id", editing.thing.id)
        : await supabase
            .from("little_things")
            .insert({ ...row, about_user: editing.kind === "gift" ? partner!.id : person!.id, author: meId, kind: editing.kind, section: editing.kind === "gift" ? null : editing.section });
    if (error) return toast(error.message);
    refreshAll();
    setEditing(null);
  }
  async function remove(t: Thing) {
    if (!confirm(`Remove “${t.text}”?`)) return;
    await supabase.from("little_things").delete().eq("id", t.id);
    refreshAll();
    setEditing(null);
  }

  const tile = (t: Thing) => (
    <button key={t.id} className="lt-tile" onClick={() => setEditing({ mode: "edit", thing: t })}>
      {labelOf(t) && <span className="lt-tile-label">{labelOf(t)}</span>}
      <span className="lt-tile-value">{t.text}</span>
      {t.note && <span className="lt-tile-note">{t.note}</span>}
    </button>
  );

  const editSection = editing ? SECTIONS.find((s) => s.key === (editing.mode === "add" ? editing.section : (editing.thing.section ?? "misc"))) : undefined;
  const isGift = editing?.mode === "add" ? editing.kind === "gift" : editing?.thing.kind === "gift";

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
          {person.id === meId ? `What ${partner.display_name} should know. Either of you can add to it.` : `The little stuff about ${partner.display_name}. You can both add to it.`}
        </p>
      </div>

      {SECTIONS.map((s) => {
        const list = inSection(s.key);
        return (
          <section key={s.key} className={`lt-card lt-${s.tint}`}>
            <div className="lt-card-head">
              <span className="lt-badge">{s.emoji}</span>
              <h2>{s.title}</h2>
              <button className="icon-btn lt-edit" onClick={() => setEditing({ mode: "add", kind: "fact", section: s.key })} aria-label={`Add to ${s.title}`}>
                ＋
              </button>
            </div>
            {list.length ? (
              <div className="lt-grid">{list.map(tile)}</div>
            ) : (
              <button className="lt-empty" onClick={() => setEditing({ mode: "add", kind: "fact", section: s.key })}>
                Nothing yet. Tap to add one ✏️
              </button>
            )}
          </section>
        );
      })}

      {about === "them" && (
        <section className="lt-card lt-gift">
          <div className="lt-card-head">
            <span className="lt-badge">🎁</span>
            <h2>Gift ideas</h2>
            <button className="icon-btn lt-edit" onClick={() => setEditing({ mode: "add", kind: "gift", section: "gift" })} aria-label="Add a gift idea">
              ＋
            </button>
          </div>
          <p className="small muted" style={{ margin: "-4px 0 8px" }}>
            Just for you. {partner.display_name} will never see these.
          </p>
          {gifts.length ? (
            <div className="lt-grid">{gifts.map(tile)}</div>
          ) : (
            <button className="lt-empty" onClick={() => setEditing({ mode: "add", kind: "gift", section: "gift" })}>
              That candle they smelled twice… 🕯️
            </button>
          )}
        </section>
      )}

      {editing && (
        <Sheet
          title={isGift ? "🎁 Gift idea" : `${editSection?.emoji ?? "✨"} ${editSection?.title ?? "Something"}`}
          onClose={() => setEditing(null)}
        >
          <ThingForm
            labels={isGift ? [] : (editSection?.labels ?? [])}
            placeholder={isGift ? "That candle they smelled twice…" : (editSection?.ph ?? "")}
            initial={editing.mode === "edit" ? editing.thing : undefined}
            onSave={save}
            onRemove={editing.mode === "edit" ? () => remove(editing.thing) : undefined}
          />
        </Sheet>
      )}
    </main>
  );
}

/** One thing: an optional little heading, the thing itself, and an optional longer note. */
function ThingForm({
  labels,
  placeholder,
  initial,
  onSave,
  onRemove,
}: {
  labels: string[];
  placeholder: string;
  initial?: Thing;
  onSave: (v: { label: string; text: string; note: string }) => void;
  onRemove?: () => void;
}) {
  const [label, setLabel] = useState(initial ? (labelOf(initial) ?? "") : "");
  const [text, setText] = useState(initial?.text ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [showNote, setShowNote] = useState(!!initial?.note);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSave({ label, text, note });
      }}
    >
      {labels.length > 0 && (
        <div className="chips">
          {labels.map((l) => (
            <button key={l} type="button" className="chip chip-sm" aria-pressed={label === l} onClick={() => setLabel(label === l ? "" : l)}>
              {l}
            </button>
          ))}
        </div>
      )}
      <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Little heading (optional): Movie, Shoes…" aria-label="Heading" />
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} autoFocus={!initial} required aria-label="The thing" />
      {showNote ? (
        <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Longer note (optional)" aria-label="Note" />
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowNote(true)}>
          + Longer note
        </button>
      )}
      <div className="row-between">
        {onRemove ? (
          <button type="button" className="btn btn-ghost" onClick={onRemove}>
            Remove
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={!text.trim()}>
          {initial ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}
