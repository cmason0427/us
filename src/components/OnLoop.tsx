"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { findSpotify, lookupSpotify } from "@/lib/spotify";
import { useApp } from "./AppProvider";
import { SpotifyEmbed } from "./Spotify";

// "On loop": the song each of you has on repeat right now. It stays on Home
// until you change it or take it off; nothing clears it for you.

export interface Loop {
  user_id: string;
  url: string;
  title: string | null;
  thumb: string | null;
  updated_at: string;
}

export function useOnLoop() {
  const { data = [] } = useLive<Loop[]>(
    "on_loop",
    async () => {
      const { data, error } = await supabaseBrowser().from("on_loop").select("*");
      if (error) throw error;
      return data as Loop[];
    },
    ["on_loop"],
  );
  return data;
}

/** The one line on Home: whose song, what it is. */
export function loopLine(loops: Loop[], meId: string, nameOf: (id: string) => string) {
  const label = (l: Loop) => l.title ?? "a song";
  const mine = loops.find((l) => l.user_id === meId);
  const theirs = loops.filter((l) => l.user_id !== meId);
  return [...theirs.map((l) => `${nameOf(l.user_id)}: ${label(l)}`), ...(mine ? [`you: ${label(mine)}`] : [])].join(" · ");
}

export function OnLoopSheetBody() {
  const { meId, nameOf, toast } = useApp();
  const loops = useOnLoop();
  const mine = loops.find((l) => l.user_id === meId);
  const theirs = loops.filter((l) => l.user_id !== meId);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(!mine);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const found = findSpotify(draft);
    if (!found) return toast("Paste a Spotify link (Share → Copy link).");
    setBusy(true);
    const r = await lookupSpotify(found.url);
    setBusy(false);
    if ("error" in r) return toast(r.error);
    const { error } = await supabaseBrowser().from("on_loop").upsert({ user_id: meId, url: r.url, title: r.title, thumb: r.thumb, updated_at: new Date().toISOString() });
    if (error) return toast(error.message);
    setDraft("");
    setEditing(false);
    refreshAll();
    toast("On loop 🎧");
  }
  async function remove() {
    await supabaseBrowser().from("on_loop").delete().eq("user_id", meId);
    refreshAll();
    setEditing(true);
  }
  const player = (l: Loop) => {
    const r = findSpotify(l.url);
    return r && !r.short ? <SpotifyEmbed r={r} compact /> : null;
  };

  return (
    <div className="stack">
      {theirs.map((l) => (
        <div key={l.user_id} className="field">
          <span>{nameOf(l.user_id)} has on loop</span>
          {player(l)}
        </div>
      ))}
      <div className="field">
        <span>Yours</span>
        {mine && !editing ? (
          <>
            {player(mine)}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setEditing(true)}>
                Change it
              </button>
              <button className="btn btn-sm btn-ghost" onClick={remove}>
                Take it off
              </button>
            </div>
          </>
        ) : (
          <form className="stack-sm" onSubmit={save}>
            <div className="quick-add">
              <input className="input grow keep-case" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="paste a Spotify link" aria-label="Spotify link" autoFocus />
              <button className="btn btn-primary" disabled={!draft.trim() || busy}>
                {busy ? "…" : "Set"}
              </button>
            </div>
            <span className="small faint">In Spotify: ⋯ → Share → Copy link. It stays here until you change it or take it off.</span>
            {mine && (
              <button type="button" className="btn-link small" style={{ alignSelf: "flex-start" }} onClick={() => setEditing(false)}>
                keep the current one
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
