"use client";

import { useState, type ReactNode } from "react";
import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { Wavy } from "@/components/Art";
import { DeckShelves, GameNight } from "@/components/Decks";
import { Theater } from "@/components/Theater";

/**
 * The nerd dungeon. Each hobby is one entry here: a tab and what it shows.
 * To add one later (D&D, board games…), build its component and add a line.
 */
const HOBBIES: { key: string; label: string; render: () => ReactNode }[] = [
  {
    key: "decks",
    label: "🃏 Decks",
    render: () => (
      <>
        <GameNight />
        <DeckShelves />
      </>
    ),
  },
  { key: "theater", label: "🎬 Theater", render: () => <Theater /> },
];

export default function NerdPage() {
  const [key, setKey] = useState(HOBBIES[0].key);
  const hobby = HOBBIES.find((h) => h.key === key) ?? HOBBIES[0];
  return (
    <main className="page">
      <PageHead eyebrow="Decks, dice & lore" title="Nerd dungeon" art={<Sticker name="kodo_back" size={80} tilt={3} />} />
      <Wavy />
      <div className="seg" role="group" aria-label="Hobby">
        {HOBBIES.map((h) => (
          <button key={h.key} aria-pressed={h.key === hobby.key} onClick={() => setKey(h.key)}>
            {h.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14 }} className="stack">
        {hobby.render()}
      </div>
    </main>
  );
}
