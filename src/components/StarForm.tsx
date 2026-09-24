"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { STAR_COLORS } from "@/lib/stars";
import { useApp } from "./AppProvider";

/** Send a star: a color, what it's for, and (separately) an optional note. It lands in the feed. */
export function StarForm({ onDone }: { onDone: () => void }) {
  const { meId, partner, toast } = useApp();
  const [color, setColor] = useState("pink");
  const [what, setWhat] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!partner) return null;

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!what.trim()) return;
    const btn = e.currentTarget.querySelector<HTMLElement>("button[type=submit]");
    setBusy(true);
    const { data, error } = await supabaseBrowser()
      .from("posts")
      .insert({ author: meId, kind: "star", to_user: partner!.id, star_color: color, star_for: what.trim(), text: note.trim() || null })
      .select("id")
      .single();
    setBusy(false);
    if (error) return toast(error.message);
    notify({ kind: "star", id: data.id });
    refreshAll();
    celebrate(btn, ["⭐", "✨", "💛"]);
    toast(`Star sent to ${partner!.display_name} ⭐`);
    onDone();
  }

  const hex = STAR_COLORS.find((c) => c.v === color)!.hex;
  return (
    <form className="stack" onSubmit={send}>
      <div className="star-preview" style={{ color: hex }} aria-hidden>
        ★
      </div>
      <div className="chips" role="radiogroup" aria-label="Star color">
        {STAR_COLORS.map((c) => (
          <button key={c.v} type="button" role="radio" aria-checked={color === c.v} className="chip chip-sm" onClick={() => setColor(c.v)}>
            <span style={{ color: c.hex }}>★</span> {c.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>What for?</span>
        <input className="input" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Cleaning the house" autoFocus required />
      </label>
      <label className="field">
        <span>Add a note (optional)</span>
        <textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Good job baby, I'm so proud of you" />
      </label>
      <button className="btn btn-primary btn-block" disabled={busy || !what.trim()}>
        Send {partner.display_name} a star
      </button>
    </form>
  );
}
