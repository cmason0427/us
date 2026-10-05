"use client";

import { findSpotify, lookupSpotify } from "@/lib/spotify";
import { SpotifyEmbed } from "./Spotify";

import { ManaPips, useDeckNames } from "./Decks";
import { ImageSources, filesFromPaste } from "./ImageSources";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { shrinkImage } from "@/lib/image";
import { refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { DOGS } from "@/lib/dogs";
import { useApp } from "./AppProvider";
import { DogAvatar } from "./DogAvatar";
import { IconCamera } from "./Art";

// Several photos post as one swipeable carousel.
const MAX_PHOTOS = 10;

/** Tap to tag which dog(s) something is about. */
export function DogChips({ value, onChange }: { value: string[]; onChange: (dogs: string[]) => void }) {
  const { dogPhotos } = useApp();
  return (
    <div className="chips" role="group" aria-label="Which dog">
      {DOGS.map((d) => {
        const on = value.includes(d.id);
        return (
          <button key={d.id} type="button" className="chip" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== d.id) : [...value, d.id])}>
            <DogAvatar ids={[d.id]} size={22} photos={dogPhotos} /> {d.name}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Updates for the feed. With `dogNote`, it's a note about the dogs: you pick
 * which dog(s) it's about and it lands in the feed and the Dogs tab. Plain
 * updates can be tagged with dogs too.
 */
/** How a hidden part opens. */
export const UNLOCKS = [
  { key: "tap", label: "Tap" },
  { key: "double", label: "Double-tap" },
  { key: "agree", label: "Yes / no question" },
  { key: "button", label: "Custom button" },
  { key: "twice", label: "Press twice" },
] as const;
type Unlock = (typeof UNLOCKS)[number]["key"];

export function PostComposer({
  onDone,
  dogNote = false,
  initialDogs = [],
  deckId,
}: {
  onDone: () => void;
  dogNote?: boolean;
  initialDogs?: string[];
  /** A deck update: the post says which deck ("pick" lets you choose). */
  deckId?: string | "pick";
}) {
  const { meId, toast } = useApp();
  const [dogs, setDogs] = useState<string[]>(initialDogs);
  const [deck, setDeck] = useState<string | null>(deckId && deckId !== "pick" ? deckId : null);
  const deckList = [...useDeckNames().values()];
  const [text, setText] = useState("");
  // Optional hidden part: a surprise, spoiler or heads-up they tap to open.
  const [hiding, setHiding] = useState(false);
  const [unlock, setUnlock] = useState<Unlock>("tap");
  const [hidden, setHidden] = useState("");
  const [ack, setAck] = useState("");
  const [why, setWhy] = useState("");
  const [boom, setBoom] = useState(false);
  const [veilPhotos, setVeilPhotos] = useState(false);
  const veil = hiding ? unlock : null;
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() && !files.length && !(veil && hidden.trim())) return;
    if (veil && !hidden.trim() && !(veilPhotos && files.length)) return setError("What's the hidden part?");
    if (dogNote && !dogs.length) return setError("Which dog is this about?");
    if (deckId === "pick" && !deck) return setError("Which deck is it about?");
    // Grab this now: React clears currentTarget once we await.
    const submitBtn = e.currentTarget.querySelector<HTMLElement>("button[type=submit]");
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    let postId: string | null = null;
    try {
      // A short Spotify share link can't be embedded: swap in the full one.
      let body = text.trim();
      const found = findSpotify(body);
      if (found?.short) {
        const r = await lookupSpotify(found.url);
        if ("url" in r) body = body.replace(found.url, r.url);
      }
      const { data: post, error: postErr } = await supabase
        .from("posts")
        .insert({
          author: meId,
          text: body || null,
          dogs,
          as_dog: dogNote,
          deck_id: deck,
          ...(veil
            ? {
                veil,
                hidden_text: hidden.trim() || null,
                veil_ack: veil === "agree" || veil === "button" || veil === "twice" ? ack.trim() || null : null,
                veil_note: why.trim() || null,
                veil_confetti: boom,
                veil_photos: veilPhotos && files.length > 0,
              }
            : {}),
        })
        .select("id")
        .single();
      if (postErr) throw postErr;
      postId = post.id;

      const rows = await Promise.all(
        files.map(async (f, i) => {
          const { blob, width, height, ext } = await shrinkImage(f);
          const path = `${meId}/${post.id}/${i}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
          const { error: upErr } = await supabase.storage.from("photos").upload(path, blob, {
            contentType: blob.type || "image/jpeg",
            cacheControl: "31536000",
          });
          if (upErr) throw upErr;
          return { post_id: post.id, storage_path: path, width, height, position: i };
        }),
      );
      if (rows.length) {
        const { error: phErr } = await supabase.from("post_photos").insert(rows);
        if (phErr) throw phErr;
      }
      notify({ kind: "post", id: post.id });
      refreshAll();
      celebrate(submitBtn);
      toast(dogs.length ? "Noted 🐾" : "Posted 🌼");
      onDone();
    } catch (err) {
      // Don't leave a half-made post behind if a photo failed.
      if (postId) await supabase.from("posts").delete().eq("id", postId);
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      className="stack"
      onSubmit={submit}
      onPaste={(e) => {
        // Pasting a copied photo into the box adds it.
        const fs = filesFromPaste(e);
        if (fs.length) {
          e.preventDefault();
          setFiles((cur) => [...cur, ...fs].slice(0, MAX_PHOTOS));
        }
      }}
    >
      {dogNote && <DogChips value={dogs} onChange={setDogs} />}
      {deckId === "pick" && (
        <div className="chips">
          {deckList
            .sort((a, b) => Number(b.owner === meId) - Number(a.owner === meId) || a.name.localeCompare(b.name))
            .map((d) => (
              <button key={d.id} type="button" className="chip chip-sm" aria-pressed={deck === d.id} onClick={() => setDeck(d.id)}>
                <ManaPips colors={d.colors ?? []} /> {d.name}
              </button>
            ))}
        </div>
      )}
      <textarea
        className="textarea"
        placeholder={dogNote ? "Kodo had a runny poop, Wiley didn't eat breakfast…" : deckId ? "Swapped in 3 cards, it won 2 games…" : "What's the little update?"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        rows={4}
      />
      {(() => {
        const song = findSpotify(text);
        if (!song) return <p className="small faint" style={{ margin: 0 }}>🎵 Paste a Spotify link and it becomes a player.</p>;
        return song.short ? <p className="small muted" style={{ margin: 0 }}>🎵 Spotify link: it becomes a player when you post.</p> : <SpotifyEmbed r={song} compact />;
      })()}
      {previews.length > 0 && (
        <div className="photo-picks">
          {previews.map((src, i) => (
            <div className="photo-pick" key={src}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" />
              <button type="button" aria-label="Remove photo" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          setFiles((fs) => [...fs, ...picked].slice(0, MAX_PHOTOS));
          e.target.value = "";
        }}
      />
      {!dogNote && !deckId && (
        <div className="veil-compose">
          <button type="button" className="chip chip-sm" aria-pressed={hiding} onClick={() => setHiding((h) => !h)} style={{ alignSelf: "flex-start" }}>
            🙈 {hiding ? "Hidden part on" : "Add a hidden part"}
          </button>
          {hiding && (
            <div className="stack-sm veil-opts">
              <textarea className="textarea" rows={3} value={hidden} onChange={(e) => setHidden(e.target.value)} placeholder="the hidden part (they open it to see)" aria-label="The hidden part" />
              <input className="input input-sm" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="why it's hidden (optional), e.g. spoilers for ep 5" aria-label="Why it's hidden" maxLength={80} />
              <div className="field">
                <span>How it opens</span>
                <div className="chips">
                  {UNLOCKS.map((u) => (
                    <button key={u.key} type="button" className="chip chip-sm" aria-pressed={unlock === u.key} onClick={() => setUnlock(u.key)}>
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>
              {unlock === "agree" && <input className="input input-sm" value={ack} onChange={(e) => setAck(e.target.value)} placeholder="the question, e.g. Are you home yet?" aria-label="Yes/no question" maxLength={120} />}
              {(unlock === "button" || unlock === "twice") && <input className="input input-sm" value={ack} onChange={(e) => setAck(e.target.value)} placeholder="button words, e.g. I'm ready" aria-label="Button words" maxLength={40} />}
              <label className="row small" style={{ gap: 8 }}>
                <input type="checkbox" checked={boom} onChange={(e) => setBoom(e.target.checked)} /> 🎉 Confetti when it opens
              </label>
              {files.length > 0 && (
                <label className="row small" style={{ gap: 8 }}>
                  <input type="checkbox" checked={veilPhotos} onChange={(e) => setVeilPhotos(e.target.checked)} /> Hide the photos too
                </label>
              )}
            </div>
          )}
        </div>
      )}
      {!dogNote && (
        <div className="field">
          <span>About the dogs?</span>
          <DogChips value={dogs} onChange={setDogs} />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row-between">
        <span className="row wrap" style={{ gap: 2 }}>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_PHOTOS}>
            <IconCamera width={22} height={22} /> Photo
          </button>
          <ImageSources onFiles={(fs) => setFiles((cur) => [...cur, ...fs].slice(0, MAX_PHOTOS))} />
        </span>
        <button type="submit" className="btn btn-primary" disabled={busy || (!text.trim() && !files.length && !(veil && hidden.trim()))}>
          {busy ? "Posting…" : dogNote ? "Save note" : "Share it"}
        </button>
      </div>
    </form>
  );
}
