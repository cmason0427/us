"use client";

import { useState } from "react";
import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { Sheet } from "@/components/Sheet";
import { Wavy } from "@/components/Art";
import { DeckShelves, GameNight, MTG_ROOM, RoomForm, useNerd, type Room } from "@/components/Decks";

/**
 * The nerd dungeon. Each hobby is a room: MTG decks are built in, and "＋ Room"
 * makes another (D&D, board games…) with the same shelves, covers, tags and
 * wishlist. Nothing to code to add one.
 */
export default function NerdPage() {
  const { rooms } = useNerd();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [editing, setEditing] = useState(false);
  const all: Room[] = [MTG_ROOM, ...rooms];
  const room = all.find((r) => r.id === roomId) ?? MTG_ROOM;

  return (
    <main className="page">
      <PageHead eyebrow="Decks, dice & lore" title="Nerd dungeon" art={<Sticker name="kodo_back" size={80} tilt={3} />} />
      <Wavy />
      <div className="chips room-tabs" role="group" aria-label="Rooms">
        {all.map((r) => (
          <button key={r.id ?? "mtg"} className="chip" aria-pressed={r.id === room.id} onClick={() => setRoomId(r.id)}>
            {r.emoji ? `${r.emoji} ` : ""}
            {r.name}
          </button>
        ))}
        <button className="chip chip-sm" onClick={() => setMaking(true)}>
          ＋ Room
        </button>
      </div>
      <div style={{ marginTop: 14 }} className="stack">
        {room.id === null && <GameNight />}
        <DeckShelves key={room.id ?? "mtg"} room={room} />
        {room.id !== null && (
          <button className="btn-link small" style={{ alignSelf: "flex-start" }} onClick={() => setEditing(true)}>
            Room settings
          </button>
        )}
      </div>
      {making && (
        <Sheet title="New room" onClose={() => setMaking(false)}>
          <RoomForm
            onDone={(id) => {
              setMaking(false);
              if (id) setRoomId(id);
            }}
          />
        </Sheet>
      )}
      {editing && room.id !== null && (
        <Sheet title={`${room.name} settings`} onClose={() => setEditing(false)}>
          <RoomForm
            initial={room}
            onDone={(id) => {
              setEditing(false);
              if (!id) setRoomId(null);
            }}
          />
        </Sheet>
      )}
    </main>
  );
}
