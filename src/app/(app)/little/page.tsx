"use client";

import { useRef, useState } from "react";
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

type Editing =
  | { mode: "add"; kind: "fact" | "gift"; section: string; label?: string }
  | { mode: "section"; section: string; focus?: string }
  | { mode: "edit"; thing: Thing };

// Hints for the empty box under a heading.
const PH: Record<string, string> = { Shirt: "M", Pants: "32x30", Shoes: "10", Ring: "7", Candy: "Tootsie rolls, apparently", Movie: "Shrek" };

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

  async function insert(kind: "fact" | "gift", section: string, v: { label: string; text: string; note: string }) {
    const { error } = await supabase.from("little_things").insert({
      label: v.label.trim() || null,
      text: v.text.trim(),
      note: v.note.trim() || null,
      about_user: kind === "gift" ? partner!.id : person!.id,
      author: meId,
      kind,
      section: kind === "gift" ? null : section,
    });
    if (error) {
      toast(error.message);
      return false;
    }
    refreshAll();
    return true;
  }
  const add = (v: { label: string; text: string; note: string }) => (editing?.mode === "add" ? insert(editing.kind, editing.section, v) : Promise.resolve(false));
  async function updateText(t: Thing, text: string) {
    const { error } = await supabase.from("little_things").update({ text: text.trim() }).eq("id", t.id);
    if (error) toast(error.message);
    refreshAll();
  }
  async function saveEdit(v: { label: string; text: string; note: string }) {
    if (editing?.mode !== "edit") return;
    const { error } = await supabase
      .from("little_things")
      .update({ label: v.label.trim() || null, text: v.text.trim(), note: v.note.trim() || null })
      .eq("id", editing.thing.id);
    if (error) return toast(error.message);
    refreshAll();
    setEditing(null);
  }
  async function remove(t: Thing, close = true) {
    if (!confirm(`Remove “${t.text}”?`)) return;
    await supabase.from("little_things").delete().eq("id", t.id);
    refreshAll();
    if (close) setEditing(null);
  }

  // Things under the same heading share one tile ("Shoes: 10 · 10.5 in boots").
  const open = (kind: "fact" | "gift", section: string, label?: string) =>
    setEditing(kind === "fact" && SECTIONS.find((x) => x.key === section)?.labels.length ? { mode: "section", section, focus: label } : { mode: "add", kind, section, label });
  const tiles = (list: Thing[], kind: "fact" | "gift", section: string) => {
    const groups: { label: string | null; items: Thing[] }[] = [];
    for (const t of list) {
      const label = labelOf(t);
      const g = label ? groups.find((x) => x.label?.toLowerCase() === label.toLowerCase()) : undefined;
      if (g) g.items.push(t);
      else groups.push({ label, items: [t] });
    }
    return (
      <div className="lt-grid">
        {groups.map((g) => (
          <div key={g.label ?? g.items[0].id} className="lt-tile">
            {g.label && (
              <button className="lt-tile-label" onClick={() => open(kind, section, g.label!)} aria-label={`Edit ${g.label}`}>
                {g.label} <span aria-hidden>＋</span>
              </button>
            )}
            {g.items.map((t) => (
              <button key={t.id} className="lt-val" onClick={() => setEditing({ mode: "edit", thing: t })}>
                <span className="lt-tile-value">{t.text}</span>
                {t.note && <span className="lt-tile-note">{t.note}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const editSection = editing ? SECTIONS.find((s) => s.key === (editing.mode === "edit" ? (editing.thing.section ?? "misc") : editing.section)) : undefined;
  const isGift = editing?.mode === "add" ? editing.kind === "gift" : editing?.mode === "edit" && editing.thing.kind === "gift";

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
              <button className="icon-btn lt-edit" onClick={() => open("fact", s.key)} aria-label={`Edit ${s.title}`}>
                {s.labels.length ? "✏️" : "＋"}
              </button>
            </div>
            {list.length ? (
              tiles(list, "fact", s.key)
            ) : (
              <button className="lt-empty" onClick={() => open("fact", s.key)}>
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
            tiles(gifts, "gift", "gift")
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
          {editing.mode === "section" ? (
            <SectionForm
              labels={editSection?.labels ?? []}
              things={inSection(editing.section)}
              focus={editing.focus}
              onAdd={(label, text) => insert("fact", editing.section, { label, text, note: "" })}
              onUpdate={updateText}
              onRemove={(t) => remove(t, false)}
              onDone={() => setEditing(null)}
            />
          ) : editing.mode === "add" ? (
            <AddThings
              labels={isGift ? [] : (editSection?.labels ?? [])}
              placeholder={isGift ? "That candle they smelled twice…" : (editSection?.ph ?? "")}
              initialLabel={editing.label ?? ""}
              existing={editing.kind === "gift" ? gifts : inSection(editing.section)}
              onAdd={add}
              onRemove={(t) => remove(t, false)}
              onDone={() => setEditing(null)}
            />
          ) : (
            <ThingForm
              labels={isGift ? [] : (editSection?.labels ?? [])}
              placeholder={isGift ? "That candle they smelled twice…" : (editSection?.ph ?? "")}
              initial={editing.thing}
              onSave={saveEdit}
              onRemove={() => remove(editing.thing)}
            />
          )}
        </Sheet>
      )}
    </main>
  );
}

/**
 * The whole section on one screen, like a form: every heading with what's
 * under it. Type under a heading and hit enter to add it there (several
 * shirts is several enters); tap one to fix it, × to take it off.
 */
function SectionForm({
  labels,
  things,
  focus,
  onAdd,
  onUpdate,
  onRemove,
  onDone,
}: {
  labels: string[];
  things: Thing[];
  focus?: string;
  onAdd: (label: string, text: string) => Promise<boolean>;
  onUpdate: (t: Thing, text: string) => Promise<void>;
  onRemove: (t: Thing) => void;
  onDone: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fixing, setFixing] = useState<{ id: string; text: string } | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const under = (l: string) => things.filter((t) => (labelOf(t) ?? "").toLowerCase() === l.toLowerCase());
  const known = new Set(labels.map((l) => l.toLowerCase()));
  // Headings you made up (or older ones like "Show / movie") get a row too.
  const custom = [...new Set([...things.map(labelOf).filter((l): l is string => !!l), ...extra])].filter((l) => !known.has(l.toLowerCase()));
  const all = [...labels, ...custom];
  const loose = things.filter((t) => !labelOf(t));

  async function commit(label: string) {
    const text = (drafts[label] ?? "").trim();
    if (!text) return;
    setBusy(true);
    const ok = await onAdd(label, text);
    setBusy(false);
    if (ok) setDrafts((d) => ({ ...d, [label]: "" }));
  }
  async function saveFix(t: Thing) {
    if (!fixing) return;
    const text = fixing.text.trim();
    setFixing(null);
    if (!text) onRemove(t);
    else if (text !== t.text) await onUpdate(t, text);
  }
  async function done() {
    // Anything typed but not entered still counts.
    for (const l of all) await commit(l);
    onDone();
  }

  const chip = (t: Thing) =>
    fixing?.id === t.id ? (
      <input
        key={t.id}
        className="input"
        value={fixing.text}
        autoFocus
        onChange={(e) => setFixing({ id: t.id, text: e.target.value })}
        onBlur={() => saveFix(t)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), saveFix(t))}
        aria-label={`Fix ${t.text}`}
      />
    ) : (
      <span key={t.id} className="sticker lt-added">
        <button type="button" className="lt-fix" onClick={() => setFixing({ id: t.id, text: t.text })}>
          {t.text}
        </button>
        <button type="button" className="lt-x" onClick={() => onRemove(t)} aria-label={`Remove ${t.text}`}>
          ×
        </button>
      </span>
    );

  return (
    <div className="stack">
      <div className="lt-form">
        {all.map((l) => {
          const list = under(l);
          return (
            <div key={l} className="field lt-field">
              <span>{l}</span>
              {list.length > 0 && <div className="chips">{list.map(chip)}</div>}
              <input
                className="input"
                value={drafts[l] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [l]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  if (!busy) commit(l);
                }}
                placeholder={list.length ? "+ another" : (PH[l] ?? "")}
                autoFocus={l === focus}
                enterKeyHint="enter"
                aria-label={`Add a ${l}`}
              />
            </div>
          );
        })}
      </div>
      {loose.length > 0 && <div className="chips">{loose.map(chip)}</div>}
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          const l = newLabel.trim();
          if (l && !all.some((x) => x.toLowerCase() === l.toLowerCase())) setExtra((x) => [...x, l]);
          setNewLabel("");
        }}
      >
        <input className="input grow" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Another heading (Socks, Perfume…)" aria-label="New heading" />
        <button className="btn btn-sm" disabled={!newLabel.trim()}>
          Add
        </button>
      </form>
      <div className="row-between">
        <span className="small faint">Enter adds it under that heading.</span>
        <button type="button" className="btn btn-primary" onClick={done} disabled={busy}>
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * Add a run of things without leaving the sheet: pick a heading (Shirt), type
 * one, hit enter, it's added and the box clears for the next. The heading
 * sticks until you pick another, so three scents is three enters.
 */
function AddThings({
  labels,
  placeholder,
  initialLabel,
  existing,
  onAdd,
  onRemove,
  onDone,
}: {
  labels: string[];
  placeholder: string;
  initialLabel: string;
  existing: Thing[];
  onAdd: (v: { label: string; text: string; note: string }) => Promise<boolean>;
  onRemove: (t: Thing) => void;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const key = label.trim().toLowerCase();
  const already = existing.filter((t) => (labelOf(t) ?? "").toLowerCase() === key);
  const chips = [...new Set([...labels, ...existing.map(labelOf).filter((l): l is string => !!l)])];
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        setBusy(true);
        const ok = await onAdd({ label, text, note });
        setBusy(false);
        if (!ok) return;
        setText("");
        setNote("");
        setShowNote(false);
        input.current?.focus();
      }}
    >
      {chips.length > 0 && (
        <div className="chips">
          {chips.map((l) => (
            <button key={l} type="button" className="chip chip-sm" aria-pressed={key === l.toLowerCase()} onClick={() => (setLabel(key === l.toLowerCase() ? "" : l), input.current?.focus())}>
              {l}
            </button>
          ))}
        </div>
      )}
      <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Little heading (optional): Movie, Shoes…" aria-label="Heading" />
      {already.length > 0 && (
        <div className="chips" aria-label={label ? `Already under ${label}` : "Already here"}>
          {already.map((t) => (
            <span key={t.id} className="sticker lt-added">
              {t.text}
              <button type="button" className="lt-x" onClick={() => onRemove(t)} aria-label={`Remove ${t.text}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="quick-add">
        <input
          ref={input}
          className="input grow"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={already.length ? "Another one…" : placeholder}
          autoFocus
          enterKeyHint="enter"
          aria-label="The thing"
        />
        <button className="btn btn-primary" disabled={!text.trim() || busy}>
          Add
        </button>
      </div>
      {showNote ? (
        <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Longer note for this one (optional)" aria-label="Note" />
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowNote(true)}>
          + Longer note
        </button>
      )}
      <div className="row-between">
        <span className="small faint">Enter adds it. Keep going.</span>
        <button type="button" className="btn" onClick={onDone}>
          Done
        </button>
      </div>
    </form>
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
