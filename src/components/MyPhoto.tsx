"use client";

import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { removeOldAvatar, uploadAvatar } from "@/lib/avatarUpload";
import { refreshAll } from "@/lib/useLive";
import { useApp } from "./AppProvider";
import { PersonAvatar } from "./PersonAvatar";
import { Sheet } from "./Sheet";
import { SquareCrop } from "./SquareCrop";

/** Set your own profile photo. */
export function MyPhoto() {
  const { meId, me, toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cropping, setCropping] = useState<File | null>(null);

  async function upload(file: Blob) {
    setCropping(null);
    setBusy(true);
    try {
      const path = await uploadAvatar(meId, "me", file);
      const { error } = await supabaseBrowser().from("profiles").update({ avatar_path: path }).eq("id", meId);
      if (error) throw error;
      await removeOldAvatar(meId, me?.avatar_path);
      refreshAll();
      toast("New pic saved");
    } catch (err) {
      toast((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" className="dog-pick" disabled={busy} onClick={() => fileRef.current?.click()}>
        <PersonAvatar id={meId} size={72} />
        <span className="small muted">{busy ? "Uploading…" : me?.avatar_path ? "Change photo" : "Add photo"}</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) setCropping(file);
        }}
      />
      {cropping && (
        <Sheet title="Fit it in the circle" onClose={() => setCropping(null)}>
          <SquareCrop file={cropping} onDone={upload} onCancel={() => setCropping(null)} />
        </Sheet>
      )}
    </>
  );
}
