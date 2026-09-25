"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { DogPic } from "@/components/DogPic";
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

const LABELS = ["Sizes", "Favorites", "Allergies", "Not a fan", "Other"];

/**
 * Little things worth remembering about each other: sizes, favorites, what
 * they don't like. Plus gift ideas, which only the person who wrote them can
 * ever see (the database enforces it). No prompts, no streaks: add when it comes up.
 */
export default function LittleThingsPage() {
  const { meId, partner, nameOf, toast } = useApp();
  const [about, setAbout] = useState<"them" | "me">("them");
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
  if (!partner) return null;
  const who = about === "them" ? partner.id : meId;
  const facts = things.filter((t) => t.kind === "fact" && t.about_user === who);
  const gifts = things.filter((t) => t.kind === "gift" && t.about_user === partner.id && t.author === meId);
  const labels = [...LABELS, ...new Set(facts.map((f) => f.label).filter((l): l is string => !!l && !LABELS.includes(l)))];

  async function add(kind: Thing["kind"], text: string, label: string | null) {
    const { error } = await supabase.from("little_things").insert({ about_user: kind === "gift" ? partner!.id : who, author: meId, kind, label, text: text.trim() });
    if (error) return toast(error.message);
    refreshAll();
  }
  async function remove(t: Thing) {
    if (!confirm(`Remove “${t.text}”?`)) return;
    await supabase.from("little_things").delete().eq("id", t.id);
    refreshAll();
  }

  const item = (t: Thing) => (
    <div key={t.id} className="task">
      <span className="grow">
        {t.text}
        {t.author !== meId && t.kind === "fact" && <span className="small faint"> · from {nameOf(t.author)}</span>}
      </span>
      <button className="icon-btn" onClick={() => remove(t)} aria-label={`Remove ${t.text}`}>
        ×
      </button>
    </div>
  );

  return (
    <main className="page">
      <PageHead eyebrow="Worth remembering" title="Little things" art={<DogPic name="kodo_wiley_standing" size={46} />} />
      <Wavy />
      <div className="seg" role="group" aria-label="About who">
        <button aria-pressed={about === "them"} onClick={() => setAbout("them")}>
          About {partner.display_name}
        </button>
        <button aria-pressed={about === "me"} onClick={() => setAbout("me")}>
          About me
        </button>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        {about === "them" ? `Sizes, favorites, the little stuff. ${partner.display_name} can see and add to this too.` : `What ${partner.display_name} should know. Either of you can add.`}
      </p>

      {labels
        .map((l) => ({ l, list: facts.filter((f) => (f.label ?? "Other") === l) }))
        .filter((g) => g.list.length)
        .map((g) => (
          <section key={g.l} style={{ marginTop: 12 }}>
            <span className="small muted pantry-shelf">{g.l}</span>
            <div className="card" style={{ padding: "2px 12px" }}>{g.list.map(item)}</div>
          </section>
        ))}
      <AddThing labels={LABELS} placeholder={about === "them" ? "Shoe size 10, loves sour candy…" : "Allergic to…, favorite flowers…"} onAdd={(text, label) => add("fact", text, label)} />

      {about === "them" && (
        <section style={{ marginTop: 22 }}>
          <div className="section-title">🎁 Gift ideas</div>
          <p className="small muted" style={{ marginTop: -6 }}>
            Only you can see these. {partner.display_name} never will.
          </p>
          {gifts.length > 0 && <div className="card" style={{ padding: "2px 12px", marginTop: 8 }}>{gifts.map(item)}</div>}
          <AddThing placeholder="That candle they smelled twice…" onAdd={(text) => add("gift", text, null)} />
        </section>
      )}
    </main>
  );
}

function AddThing({ labels, placeholder, onAdd }: { labels?: string[]; placeholder: string; onAdd: (text: string, label: string | null) => void }) {
  const [text, setText] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  return (
    <form
      className="stack-sm"
      style={{ marginTop: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onAdd(text, label);
        setText("");
      }}
    >
      {labels && (
        <div className="chips">
          {labels.map((l) => (
            <button key={l} type="button" className="chip chip-sm" aria-pressed={label === l} onClick={() => setLabel(label === l ? null : l)}>
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="quick-add">
        <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Add" />
        <button className="btn" disabled={!text.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}
