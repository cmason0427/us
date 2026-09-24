"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { shrinkImage } from "@/lib/image";
import { refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { DOGS } from "@/lib/dogs";
import { useApp } from "./AppProvider";
import { IconCamera } from "./Art";

const MAX_PHOTOS = 6;

/** Tap to tag which dog(s) something is about. */
export function DogChips({ value, onChange }: { value: string[]; onChange: (dogs: string[]) => void }) {
  return (
    <div className="chips" role="group" aria-label="Which dog">
      {DOGS.map((d) => {
        const on = value.includes(d.id);
        return (
          <button key={d.id} type="button" className="chip" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== d.id) : [...value, d.id])}>
            🐾 {d.name}
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
export function PostComposer({
  onDone,
  dogNote = false,
  initialDogs = [],
  initialSpicy = false,
}: {
  onDone: () => void;
  dogNote?: boolean;
  initialDogs?: string[];
  initialSpicy?: boolean;
}) {
  const { meId, partner, toast } = useApp();
  // 🌶️: photos skip the feed and go to the other person's Spicy folder.
  const [spicy, setSpicy] = useState(initialSpicy);
  const [dogs, setDogs] = useState<string[]>(initialDogs);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function sendSpicy(btn: HTMLElement | null) {
    if (!files.length) return setError("Add a photo for the spicy folder.");
    if (!partner) return;
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    const uploaded: string[] = [];
    try {
      for (const f of files) {
        const { blob, ext } = await shrinkImage(f);
        const path = `${meId}/spicy/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
        if (error) throw error;
        uploaded.push(path);
      }
      const { error: rpcErr } = await supabase.rpc("send_spicy", { recipient: partner.id, paths: uploaded, caption: text.trim() || null });
      if (rpcErr) throw rpcErr;
      // The feed only gets a note that something's waiting; never the photos.
      const { data: post } = await supabase.from("posts").insert({ author: meId, text: "🌶️ Added something for you", spicy: true }).select("id").single();
      if (post) notify({ kind: "spicy", id: post.id });
      refreshAll();
      celebrate(btn, ["🌶️", "🔥", "💋"]);
      toast(`Sent to ${partner.display_name}'s Spicy folder 🌶️`);
      onDone();
    } catch (err) {
      if (uploaded.length) await supabase.storage.from("photos").remove(uploaded);
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() && !files.length) return;
    if (dogNote && !dogs.length) return setError("Which dog is this about?");
    if (spicy) return sendSpicy(e.currentTarget.querySelector<HTMLElement>("button[type=submit]"));
    // Grab this now: React clears currentTarget once we await.
    const submitBtn = e.currentTarget.querySelector<HTMLElement>("button[type=submit]");
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    let postId: string | null = null;
    try {
      const { data: post, error: postErr } = await supabase
        .from("posts")
        .insert({ author: meId, text: text.trim() || null, dogs, as_dog: dogNote })
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
    <form className="stack" onSubmit={submit}>
      {dogNote && <DogChips value={dogs} onChange={setDogs} />}
      <textarea
        className="textarea"
        placeholder={dogNote ? "Kodo had a runny poop, Wiley didn't eat breakfast…" : "What's the little update?"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        rows={4}
      />
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
      {!dogNote && partner && (
        <label className="toggle-row">
          <span>
            <strong>🌶️ Spicy</strong>
            <br />
            <span className="small muted">
              {spicy ? `Goes straight to ${partner.display_name}'s Spicy folder. The feed just says you added something.` : "Off: a normal update in the feed."}
            </span>
          </span>
          <span className="switch">
            <input type="checkbox" checked={spicy} onChange={(e) => setSpicy(e.target.checked)} />
            <span />
          </span>
        </label>
      )}
      {!dogNote && !spicy && (
        <div className="field">
          <span>About the dogs?</span>
          <DogChips value={dogs} onChange={setDogs} />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row-between">
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_PHOTOS}>
          <IconCamera width={22} height={22} /> Photo
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || (!text.trim() && !files.length)}>
          {busy ? "Posting…" : spicy ? "Send 🌶️" : dogNote ? "Save note" : "Share it"}
        </button>
      </div>
    </form>
  );
}
