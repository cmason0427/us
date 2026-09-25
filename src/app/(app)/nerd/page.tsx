"use client";

import { useState } from "react";
import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { Wavy } from "@/components/Art";
import { DeckShelves, GameNight } from "@/components/Decks";

type Room = "decks" | "dnd";

/** The nerd dungeon: MTG decks on shelves for now; D&D characters and sessions can move in later. */
export default function NerdPage() {
  const [room, setRoom] = useState<Room>("decks");
  return (
    <main className="page">
      <PageHead eyebrow="Decks, dice & lore" title="Nerd dungeon" art={<Sticker name="kodo_back" size={80} tilt={3} />} />
      <Wavy />
      <div className="seg" role="group" aria-label="Room">
        <button aria-pressed={room === "decks"} onClick={() => setRoom("decks")}>
          🃏 Decks
        </button>
        <button aria-pressed={room === "dnd"} onClick={() => setRoom("dnd")}>
          🐉 D&amp;D
        </button>
      </div>
      <div style={{ marginTop: 14 }} className="stack">
        {room === "decks" ? (
          <>
            <GameNight />
            <DeckShelves />
          </>
        ) : (
          <div className="card empty" style={{ padding: 22 }}>
            <p className="display">Coming soon 🐉</p>
            <p className="small muted">Characters, sessions, loot. Tell Claude what you want to track and it moves in here.</p>
          </div>
        )}
      </div>
    </main>
  );
}
