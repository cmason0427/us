"use client";

import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { shrinkImage } from "@/lib/image";
import { refreshAll } from "@/lib/useLive";
import { DOGS, type DogId } from "@/lib/dogs";
import { useApp } from "./AppProvider";
import { DogAvatar } from "./DogAvatar";

/** Tap a dog to set their profile photo. Either of you can change it. */
export function DogPhotos() {
  const { meId, toast, dogPhotos } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState<DogId | null>(null);
  const [busy, setBusy] = useState<DogId | null>(null);

  async function upload(dog: DogId, file: File) {
    setBusy(dog);
    const supabase = supabaseBrowser();
    try {
      const { blob, ext } = await shrinkImage(file, 512);
      // Storage rules only let you write under your own folder.
      const path = `${meId}/dogs/${dog}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
      if (upErr) throw upErr;
      const { data: old } = await supabase.from("dogs").select("photo_path").eq("id", dog).single();
      const { error } = await supabase.from("dogs").update({ photo_path: path, updated_at: new Date().toISOString() }).eq("id", dog);
      if (error) throw error;
      // Tidy up the previous photo if it's one we can delete (ours).
      if (old?.photo_path?.startsWith(`${meId}/`)) await supabase.storage.from("photos").remove([old.photo_path]);
      refreshAll();
      toast("Looking good 🐾");
    } catch (err) {
      toast((err as Error).message);
    }
    setBusy(null);
  }

  return (
    <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
      {DOGS.map((d) => (
        <button
          key={d.id}
          type="button"
          className="dog-pick"
          disabled={busy !== null}
          onClick={() => {
            setPicking(d.id);
            fileRef.current?.click();
          }}
        >
          <DogAvatar ids={[d.id]} size={72} photos={dogPhotos} />
          <span style={{ fontWeight: 800 }}>{d.name}</span>
          <span className="small muted">{busy === d.id ? "Uploading…" : dogPhotos[d.id] ? "Change photo" : "Add photo"}</span>
        </button>
      ))}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && picking) upload(picking, file);
        }}
      />
    </div>
  );
}
