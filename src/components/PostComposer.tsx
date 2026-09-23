"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { shrinkImage } from "@/lib/image";
import { refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { useApp } from "./AppProvider";
import { IconCamera } from "./Art";

const MAX_PHOTOS = 6;

export function PostComposer({ onDone }: { onDone: () => void }) {
  const { meId, toast } = useApp();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() && !files.length) return;
    // Grab this now: React clears currentTarget once we await.
    const submitBtn = e.currentTarget.querySelector<HTMLElement>("button[type=submit]");
    setBusy(true);
    setError(null);
    const supabase = supabaseBrowser();
    let postId: string | null = null;
    try {
      const { data: post, error: postErr } = await supabase
        .from("posts")
        .insert({ author: meId, text: text.trim() || null })
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
      toast("Posted 🌼");
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
      <textarea
        className="textarea"
        placeholder="What's the little update?"
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
      {error && <p className="error">{error}</p>}
      <div className="row-between">
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_PHOTOS}>
          <IconCamera width={22} height={22} /> Photo
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || (!text.trim() && !files.length)}>
          {busy ? "Posting…" : "Share it"}
        </button>
      </div>
    </form>
  );
}
