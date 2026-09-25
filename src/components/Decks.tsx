"use client";

import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { usePhotoUrls } from "@/lib/photos";
import { uploadAvatar, removeOldAvatar } from "@/lib/avatarUpload";
import { notify } from "@/lib/notify";
import { ago, useNow } from "@/lib/dates";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

export interface Deck {
  id: string;
  owner: string;
  name: string;
  evil: number;
  color: string | null;
  cover_path: string | null;
  tags: string[];
  shelf_id: string | null;
  position: number;
  commander: string | null;
  notes: string | null;
}
interface Shelf {
  id: string;
  name: string;
  position: number;
}
interface Chase {
  id: string;
  deck_id: string;
  card: string;
  got: boolean;
  position: number;
}
interface Call {
  id: string;
  from_user: string;
  to_user: string;
  my_deck: string | null;
  their_deck: string | null;
  asking: boolean;
  note: string | null;
  answered_at: string | null;
  created_at: string;
}

/** Deck box colors: the mana colors, plus a few just because. */
export const DECK_COLORS: { v: string; label: string; hex: string }[] = [
  { v: "white", label: "White", hex: "#f4ecd6" },
  { v: "blue", label: "Blue", hex: "#6a9fd8" },
  { v: "black", label: "Black", hex: "#3d3540" },
  { v: "red", label: "Red", hex: "#d9644f" },
  { v: "green", label: "Green", hex: "#5e9e62" },
  { v: "gold", label: "Gold", hex: "#d6ac3e" },
  { v: "colorless", label: "Colorless", hex: "#a9a39a" },
  { v: "pink", label: "Pink", hex: "#e98bb0" },
  { v: "purple", label: "Purple", hex: "#8f6ccf" },
];
const hexOf = (c: string | null) => DECK_COLORS.find((x) => x.v === c)?.hex ?? "#b9a58f";

const EVIL_WORDS = ["", "Precious angel", "Wholesome", "Polite", "Mostly fair", "A little mean", "Spicy", "Rude", "Evil", "Truly evil", "Unforgivable"];

export function useNerd() {
  const supabase = supabaseBrowser();
  const { data: decks = [] } = useLive<Deck[]>(
    "decks",
    async () => {
      const { data, error } = await supabase.from("decks").select("*").order("position").order("created_at");
      if (error) throw error;
      return data as Deck[];
    },
    ["decks"],
  );
  const { data: shelves = [] } = useLive<Shelf[]>(
    "nerd_shelves",
    async () => {
      const { data, error } = await supabase.from("nerd_shelves").select("*").order("position").order("created_at");
      if (error) throw error;
      return data as Shelf[];
    },
    ["nerd_shelves"],
  );
  const { data: calls = [] } = useLive<Call[]>(
    "deck_calls",
    async () => {
      const { data, error } = await supabase.from("deck_calls").select("*").order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return data as Call[];
    },
    ["deck_calls"],
  );
  return { decks, shelves, calls };
}

/** 😈 7/10 as ten little pips. */
export function EvilMeter({ evil, big = false }: { evil: number; big?: boolean }) {
  return (
    <span className={`evil${big ? " evil-big" : ""}`} aria-label={`How evil: ${evil} of 10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={i < evil ? "on" : ""} style={{ ["--i" as string]: i }} />
      ))}
    </span>
  );
}

/* ─── the shelves ───────────────────────────────────────────────────────── */

export function DeckShelves() {
  const { meId, profiles, nameOf, toast } = useApp();
  const { decks, shelves } = useNerd();
  const covers = usePhotoUrls(decks.flatMap((d) => (d.cover_path ? [d.cover_path] : [])));
  const [open, setOpen] = useState<Deck | null>(null);
  const [adding, setAdding] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [owner, setOwner] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const supabase = supabaseBrowser();

  const allTags = [...new Set(decks.flatMap((d) => d.tags))].sort();
  const shown = decks.filter((d) => (!owner || d.owner === owner) && (!tag || d.tags.includes(tag)));
  const groups = [...shelves.map((s) => ({ id: s.id, name: s.name })), { id: "", name: shelves.length ? "Not on a shelf" : "Decks" }]
    .map((g) => ({ ...g, list: shown.filter((d) => (d.shelf_id ?? "") === g.id) }))
    .filter((g) => g.id || g.list.length || !shelves.length);
  const personColor = (id: string) => profiles.find((p) => p.id === id)?.cal_color;
  const openDeck = open ? decks.find((d) => d.id === open.id) ?? null : null;

  // Arrange mode: press a deck and drag it onto another deck (goes before it) or a shelf (goes at the end).
  function onDown(e: React.PointerEvent, d: Deck) {
    if (!arranging) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: d.id, x: e.clientX, y: e.clientY });
  }
  function onMove(e: React.PointerEvent) {
    if (drag) setDrag({ ...drag, x: e.clientX, y: e.clientY });
  }
  async function onUp(e: React.PointerEvent) {
    if (!drag) return;
    const moving = decks.find((d) => d.id === drag.id);
    setDrag(null);
    if (!moving) return;
    const hits = document.elementsFromPoint(e.clientX, e.clientY) as HTMLElement[];
    const onDeck = hits.find((h) => h.dataset.deckId && h.dataset.deckId !== moving.id);
    const onShelf = hits.find((h) => h.dataset.shelfId !== undefined);
    if (!onDeck && !onShelf) return;
    const target = onDeck ? decks.find((d) => d.id === onDeck.dataset.deckId) : null;
    const shelfId = target ? target.shelf_id : onShelf!.dataset.shelfId || null;
    const list = decks.filter((d) => d.shelf_id === shelfId && d.id !== moving.id);
    const at = target ? list.findIndex((d) => d.id === target.id) : list.length;
    list.splice(at < 0 ? list.length : at, 0, moving);
    await Promise.all(list.map((d, position) => (d.position !== position || d.shelf_id !== shelfId || d.id === moving.id ? supabase.from("decks").update({ position, shelf_id: shelfId }).eq("id", d.id) : null)));
    refreshAll();
  }

  async function addShelf() {
    const name = window.prompt("Name the shelf", "Commander");
    if (!name?.trim()) return;
    const { error } = await supabase.from("nerd_shelves").insert({ name: name.trim(), position: shelves.length, created_by: meId });
    if (error) return toast(error.message);
    refreshAll();
  }
  async function shelfMenu(s: { id: string; name: string }) {
    const name = window.prompt(`Rename "${s.name}" (leave empty to remove the shelf; its decks stay)`, s.name);
    if (name === null) return;
    if (!name.trim()) await supabase.from("nerd_shelves").delete().eq("id", s.id);
    else await supabase.from("nerd_shelves").update({ name: name.trim() }).eq("id", s.id);
    refreshAll();
  }

  const dragging = drag ? decks.find((d) => d.id === drag.id) : null;

  return (
    <div className="stack">
      <div className="row wrap">
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          ＋ Deck
        </button>
        <button className="btn btn-sm" aria-pressed={arranging} onClick={() => setArranging((a) => !a)}>
          {arranging ? "Done arranging" : "Arrange"}
        </button>
        <button className="btn btn-sm btn-ghost" aria-pressed={showFilters || !!owner || !!tag} onClick={() => setShowFilters((f) => !f)}>
          Filter{owner || tag ? " •" : ""}
        </button>
      </div>
      {arranging && (
        <p className="small muted">
          Drag a deck onto another to put it there, or onto a shelf to add it at the end.{" "}
          <button className="btn-link small" onClick={addShelf}>
            ＋ New shelf
          </button>
        </p>
      )}
      {showFilters && (
        <div className="card stack-sm" style={{ padding: "10px 12px" }}>
          <div className="chips">
            <span className="small muted">Whose</span>
            {profiles.map((p) => (
              <button key={p.id} className="chip chip-sm" aria-pressed={owner === p.id} onClick={() => setOwner(owner === p.id ? null : p.id)}>
                {p.id === meId ? "Mine" : `${p.display_name}'s`}
              </button>
            ))}
          </div>
          {allTags.length > 0 && (
            <div className="chips">
              <span className="small muted">Tag</span>
              {allTags.map((t) => (
                <button key={t} className="chip chip-sm" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {decks.length === 0 ? (
        <p className="muted">No decks yet. Add one and give it a cover.</p>
      ) : (
        groups.map((g) => (
          <section key={g.id || "none"} className="shelf" data-shelf-id={g.id}>
            <div className="shelf-head">
              <span>{g.name}</span>
              <span className="small faint">{g.list.length}</span>
              {g.id && arranging && (
                <button className="btn-link small" onClick={() => shelfMenu(g)}>
                  Rename
                </button>
              )}
            </div>
            <div className="shelf-row" data-shelf-id={g.id}>
              {g.list.map((d) => (
                <button
                  key={d.id}
                  data-deck-id={d.id}
                  className={`deck-box${arranging ? " arranging" : ""}${drag?.id === d.id ? " lifted" : ""}`}
                  style={{ ["--deck" as string]: hexOf(d.color) }}
                  onClick={() => !arranging && setOpen(d)}
                  onPointerDown={(e) => onDown(e, d)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={() => setDrag(null)}
                  aria-label={`${d.name}, ${nameOf(d.owner)}'s deck`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {d.cover_path && covers[d.cover_path] && <img src={covers[d.cover_path]} alt="" draggable={false} />}
                  <span className="deck-owner" data-person={personColor(d.owner)} />
                  <span className="deck-name">{d.name}</span>
                </button>
              ))}
              {g.list.length === 0 && <span className="small faint shelf-empty">{arranging ? "Drop decks here" : "Empty shelf"}</span>}
            </div>
          </section>
        ))
      )}
      {dragging && drag && (
        <div className="deck-box deck-ghost" style={{ ["--deck" as string]: hexOf(dragging.color), left: drag.x - 36, top: drag.y - 50 }}>
          <span className="deck-name">{dragging.name}</span>
        </div>
      )}

      {adding && (
        <Sheet title="New deck" onClose={() => setAdding(false)}>
          <DeckForm shelves={shelves} tags={allTags} onDone={() => setAdding(false)} />
        </Sheet>
      )}
      {openDeck && <DeckSheet deck={openDeck} cover={openDeck.cover_path ? covers[openDeck.cover_path] : undefined} shelves={shelves} tags={allTags} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ─── one deck ──────────────────────────────────────────────────────────── */

function DeckSheet({ deck, cover, shelves, tags, onClose }: { deck: Deck; cover?: string; shelves: Shelf[]; tags: string[]; onClose: () => void }) {
  const { meId, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const { data: chase = [] } = useLive<Chase[]>(
    `chase:${deck.id}`,
    async () => {
      const { data, error } = await supabase.from("deck_chase").select("*").eq("deck_id", deck.id).order("got").order("position").order("created_at");
      if (error) throw error;
      return data as Chase[];
    },
    ["deck_chase"],
  );
  const mine = deck.owner === meId;

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const { error } = await supabase.from("deck_chase").insert({ deck_id: deck.id, card: draft.trim(), position: chase.length });
    if (error) return toast(error.message);
    setDraft("");
    refreshAll();
  }

  if (editing) {
    return (
      <Sheet title={`Edit ${deck.name}`} onClose={() => setEditing(false)}>
        <DeckForm initial={deck} shelves={shelves} tags={tags} onDone={() => setEditing(false)} onDeleted={onClose} />
      </Sheet>
    );
  }

  return (
    <Sheet title={deck.name} onClose={onClose}>
      <div className="stack">
        <div className="deck-hero" style={{ ["--deck" as string]: hexOf(deck.color) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img src={cover} alt="" />}
        </div>
        <div className="row-between">
          <span className="small muted">
            {mine ? "Your deck" : `${nameOf(deck.owner)}'s deck`}
            {deck.commander ? ` · ${deck.commander}` : ""}
          </span>
        </div>
        <div className="stack-sm">
          <EvilMeter evil={deck.evil} big />
          <span className="small muted">
            😈 {deck.evil}/10 · {EVIL_WORDS[deck.evil]}
          </span>
        </div>
        {deck.tags.length > 0 && (
          <div className="chips">
            {deck.tags.map((t) => (
              <span key={t} className="sticker">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="field">
          <span>Chase list</span>
          {chase.length > 0 && (
            <div className="card" style={{ padding: "2px 12px" }}>
              {chase.map((c) => (
                <div key={c.id} className={`task${c.got ? " done" : ""}`}>
                  <input
                    type="checkbox"
                    className="check"
                    checked={c.got}
                    onChange={async () => {
                      await supabase.from("deck_chase").update({ got: !c.got }).eq("id", c.id);
                      refreshAll();
                    }}
                    aria-label={`Got ${c.card}`}
                  />
                  <span className="grow task-title">{c.card}</span>
                  <button
                    className="icon-btn"
                    onClick={async () => {
                      await supabase.from("deck_chase").delete().eq("id", c.id);
                      refreshAll();
                    }}
                    aria-label={`Remove ${c.card}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <form className="quick-add" onSubmit={addCard}>
            <input className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A card you're hunting…" aria-label="Add to chase list" />
            <button className="btn" disabled={!draft.trim()}>
              Add
            </button>
          </form>
        </div>
        {deck.notes && <p className="card" style={{ whiteSpace: "pre-wrap" }}>{deck.notes}</p>}
        <button className="btn btn-block" onClick={() => setEditing(true)}>
          Edit deck
        </button>
      </div>
    </Sheet>
  );
}

function DeckForm({ initial, shelves, tags, onDone, onDeleted }: { initial?: Deck; shelves: Shelf[]; tags: string[]; onDone: () => void; onDeleted?: () => void }) {
  const { meId, toast } = useApp();
  const [name, setName] = useState(initial?.name ?? "");
  const [commander, setCommander] = useState(initial?.commander ?? "");
  const [evil, setEvil] = useState(initial?.evil ?? 5);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [shelf, setShelf] = useState<string | null>(initial?.shelf_id ?? null);
  const [picked, setPicked] = useState<string[]>(initial?.tags ?? []);
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tagOptions = [...new Set([...tags, "baby deck", "work in progress", "identity crisis", ...picked])];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const supabase = supabaseBrowser();
    try {
      let cover_path = initial?.cover_path ?? null;
      if (file) {
        cover_path = await uploadAvatar(meId, "deck", file);
        await removeOldAvatar(meId, initial?.cover_path);
      }
      const row = { name: name.trim(), commander: commander.trim() || null, evil, color, shelf_id: shelf, tags: picked, notes: notes.trim() || null, cover_path };
      const { error } = initial ? await supabase.from("decks").update(row).eq("id", initial.id) : await supabase.from("decks").insert({ ...row, owner: meId, position: 999 });
      if (error) throw error;
      refreshAll();
      toast(initial ? "Saved" : "On the shelf 🃏");
      onDone();
    } catch (err) {
      toast((err as Error).message);
    }
    setBusy(false);
  }

  async function remove() {
    if (!initial || !confirm(`Delete "${initial.name}"? Its chase list goes too.`)) return;
    await supabaseBrowser().from("decks").delete().eq("id", initial.id);
    refreshAll();
    onDone();
    onDeleted?.();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Deck name" autoFocus={!initial} required />
      <input className="input" value={commander} onChange={(e) => setCommander(e.target.value)} placeholder="Commander (optional)" aria-label="Commander" />
      <div className="field">
        <span>
          How evil: 😈 {evil}/10 · {EVIL_WORDS[evil]}
        </span>
        <input type="range" min={1} max={10} value={evil} onChange={(e) => setEvil(Number(e.target.value))} className="evil-range" />
      </div>
      <div className="field">
        <span>Box color</span>
        <div className="chips">
          {DECK_COLORS.map((c) => (
            <button key={c.v} type="button" className="chip chip-sm" aria-pressed={color === c.v} onClick={() => setColor(color === c.v ? null : c.v)} aria-label={c.label}>
              <span className="cal-swatch" style={{ width: 16, height: 16, background: c.hex }} />
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Cover image (optional)</span>
        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            {file ? "Change picture" : initial?.cover_path ? "Replace cover" : "Choose a picture"}
          </button>
          {file && <span className="small muted">{file.name}</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      {shelves.length > 0 && (
        <div className="field">
          <span>Shelf</span>
          <div className="chips">
            {shelves.map((s) => (
              <button key={s.id} type="button" className="chip chip-sm" aria-pressed={shelf === s.id} onClick={() => setShelf(shelf === s.id ? null : s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <span>Tags</span>
        <div className="chips">
          {tagOptions.map((t) => (
            <button key={t} type="button" className="chip chip-sm" aria-pressed={picked.includes(t)} onClick={() => setPicked(picked.includes(t) ? picked.filter((x) => x !== t) : [...picked, t])}>
              {t}
            </button>
          ))}
        </div>
        <div className="row">
          <input className="input grow" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag" aria-label="New tag" />
          <button
            type="button"
            className="btn btn-sm"
            disabled={!newTag.trim()}
            onClick={() => {
              setPicked([...new Set([...picked, newTag.trim().toLowerCase()])]);
              setNewTag("");
            }}
          >
            Add
          </button>
        </div>
      </div>
      <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" aria-label="Notes" />
      <div className="row-between">
        {initial && initial.owner === meId ? (
          <button type="button" className="btn btn-ghost" onClick={remove}>
            Delete
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : initial ? "Save" : "Add deck"}
        </button>
      </div>
    </form>
  );
}

/* ─── game night ────────────────────────────────────────────────────────── */

/** "I'm bringing X, which are you bringing?" and the answer. Shows the latest one from the last two days. */
export function GameNight() {
  const { meId, partner, nameOf, toast } = useApp();
  const { decks, calls } = useNerd();
  const [sending, setSending] = useState(false);
  const [answering, setAnswering] = useState<Call | null>(null);
  const now = useNow()?.getTime() ?? 0;
  if (!partner) return null;
  const latest = calls.find((c) => now - Date.parse(c.created_at) < 2 * 86_400_000);
  const deckName = (id: string | null) => decks.find((d) => d.id === id)?.name;

  let body: React.ReactNode = <span className="muted">Nobody&apos;s called their deck yet.</span>;
  if (latest) {
    const fromMe = latest.from_user === meId;
    const who = fromMe ? "You're" : `${nameOf(latest.from_user)}'s`;
    const other = fromMe ? nameOf(latest.to_user) : "you";
    body = (
      <div className="stack-sm">
        {latest.my_deck && (
          <span>
            {who} bringing <strong>{deckName(latest.my_deck) ?? "a deck"}</strong>
          </span>
        )}
        {latest.asking && !latest.answered_at && (
          <span className="muted">
            {fromMe ? `Waiting on ${other}…` : `${nameOf(latest.from_user)} wants to know which you're bringing.`}
          </span>
        )}
        {latest.their_deck && (
          <span>
            {fromMe ? `${nameOf(latest.to_user)}'s` : "You're"} bringing <strong>{deckName(latest.their_deck) ?? "a deck"}</strong>
          </span>
        )}
        {latest.note && <span className="lunch-note">“{latest.note}”</span>}
        <span className="small faint">{ago(latest.created_at)}</span>
        {!fromMe && latest.asking && !latest.answered_at && (
          <button className="btn btn-sm btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => setAnswering(latest)}>
            Pick mine
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="card game-night">
      <div className="row-between">
        <strong>🎲 Game night</strong>
        <button className="btn btn-sm" onClick={() => setSending(true)}>
          Call my deck
        </button>
      </div>
      <div style={{ marginTop: 8 }}>{body}</div>
      {sending && (
        <Sheet title="🎲 Game night" onClose={() => setSending(false)}>
          <CallForm
            decks={decks.filter((d) => d.owner === meId)}
            onSend={async (deck, asking, note) => {
              const { data, error } = await supabaseBrowser()
                .from("deck_calls")
                .insert({ from_user: meId, to_user: partner.id, my_deck: deck, asking, note: note || null })
                .select("id")
                .single();
              if (error) return toast(error.message);
              notify({ kind: "deck", id: data.id });
              refreshAll();
              setSending(false);
              toast(asking ? `Asked ${partner.display_name} 🎲` : `${partner.display_name} will see it 🎲`);
            }}
          />
        </Sheet>
      )}
      {answering && (
        <Sheet title={`Which are you bringing?`} onClose={() => setAnswering(null)}>
          <div className="stack-sm">
            {decks
              .filter((d) => d.owner === meId)
              .map((d) => (
                <button
                  key={d.id}
                  className="btn btn-block"
                  onClick={async () => {
                    await supabaseBrowser().from("deck_calls").update({ their_deck: d.id, answered_at: new Date().toISOString() }).eq("id", answering.id);
                    notify({ kind: "deck", id: answering.id });
                    refreshAll();
                    setAnswering(null);
                  }}
                >
                  {d.name} · 😈 {d.evil}
                </button>
              ))}
            {decks.every((d) => d.owner !== meId) && <p className="muted">Add your decks first, then you can pick one.</p>}
          </div>
        </Sheet>
      )}
    </section>
  );
}

function CallForm({ decks, onSend }: { decks: Deck[]; onSend: (deck: string | null, asking: boolean, note: string) => void }) {
  const { partner } = useApp();
  const [deck, setDeck] = useState<string | null>(null);
  const [asking, setAsking] = useState(true);
  const [note, setNote] = useState("");
  return (
    <div className="stack">
      <div className="field">
        <span>I&apos;m bringing</span>
        {decks.length ? (
          <div className="chips">
            {decks.map((d) => (
              <button key={d.id} type="button" className="chip chip-sm" aria-pressed={deck === d.id} onClick={() => setDeck(deck === d.id ? null : d.id)}>
                {d.name} · 😈{d.evil}
              </button>
            ))}
          </div>
        ) : (
          <p className="small muted">You haven&apos;t added any decks yet (you can still ask).</p>
        )}
      </div>
      <div className="toggle-row">
        <span className="label">Ask which {partner?.display_name ?? "they"} is bringing</span>
        <label className="switch">
          <input type="checkbox" checked={asking} onChange={(e) => setAsking(e.target.checked)} />
          <span />
        </label>
      </div>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): bring your worst" />
      <button className="btn btn-primary btn-block" disabled={!deck && !asking} onClick={() => onSend(deck, asking, note.trim())}>
        Send
      </button>
    </div>
  );
}
