"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { usePhotoUrls } from "@/lib/photos";
import { shrinkImage } from "@/lib/image";
import { useApp } from "./AppProvider";
import { filesFromPaste } from "./ImageSources";

// Stickers: saved by either of you, reusable on any board. Pictures keep a
// see-through background (paste a "lifted" photo from your camera roll), or
// just use a big emoji.

interface Sticker {
  id: string;
  path: string | null;
  emoji: string | null;
  created_by: string;
}
export type StickerPick = { emoji?: string; path?: string; ratio?: number };

const QUICK = ["🎃", "👻", "🦇", "🕸️", "💀", "🧛", "🧙‍♀️", "👑", "💄", "💅", "💇‍♀️", "✂️", "🎀", "✨", "⭐", "🔥", "💜", "💚", "🖤", "❤️", "🌈", "🪄", "📌", "✅", "❓", "💡", "🐾", "🐶"];

export function useStickers() {
  const { data = [] } = useLive<Sticker[]>(
    "board_stickers",
    async () => {
      const { data, error } = await supabaseBrowser().from("board_stickers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Sticker[];
    },
    ["board_stickers"],
  );
  return data;
}

/** Save a sticker for both of you (a picture already uploaded, or an emoji). */
export async function saveSticker(s: { path?: string; emoji?: string }, meId: string) {
  const { error } = await supabaseBrowser().from("board_stickers").insert({ path: s.path ?? null, emoji: s.emoji ?? null, created_by: meId });
  refreshAll();
  return error?.message ?? null;
}

async function uploadSticker(file: File, meId: string) {
  const { blob, ext } = await shrinkImage(file, 700, true);
  const path = `${meId}/stickers/${crypto.randomUUID().slice(0, 12)}.${ext}`;
  const { error } = await supabaseBrowser().storage.from("photos").upload(path, blob, { contentType: blob.type || "image/png", cacheControl: "31536000" });
  if (error) return error.message;
  return saveSticker({ path }, meId);
}

export function StickerTray({ onPick, onClose }: { onPick: (s: StickerPick) => void; onClose: () => void }) {
  const { meId, toast } = useApp();
  const stickers = useStickers();
  const urls = usePhotoUrls(stickers.flatMap((s) => (s.path ? [s.path] : [])));
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      const err = await uploadSticker(f, meId);
      if (err) toast(err);
    }
    setBusy(false);
    toast("Saved to stickers ✨");
  }
  async function remove(s: Sticker) {
    // The picture stays wherever it's already stuck; it just leaves the tray.
    await supabaseBrowser().from("board_stickers").delete().eq("id", s.id);
    refreshAll();
  }

  return (
    <div
      className="board-stickers board-ui"
      onPaste={(e) => {
        const fs = filesFromPaste(e);
        if (!fs.length) return;
        e.preventDefault();
        upload(fs);
      }}
    >
      <div className="row-between">
        <strong className="small">Stickers</strong>
        <span className="row" style={{ gap: 6 }}>
          {stickers.length > 0 && (
            <button className="btn-link small" onClick={() => setEditing((x) => !x)}>
              {editing ? "done" : "edit"}
            </button>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Close stickers">
            ×
          </button>
        </span>
      </div>
      {stickers.length > 0 && (
        <div className="sticker-grid">
          {stickers.map((s) => (
            <button key={s.id} className="sticker-cell" onClick={() => (editing ? remove(s) : onPick({ emoji: s.emoji ?? undefined, path: s.path ?? undefined, ratio: s.path ? ratios[s.id] : undefined }))} aria-label={editing ? "Remove sticker" : "Add sticker"}>
              {s.emoji ? (
                <span className="sticker-emoji">{s.emoji}</span>
              ) : s.path && urls[s.path] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[s.path]} alt="" onLoad={(e) => {
                    // Read the size now; the event is gone by the time state updates run.
                    const ratio = e.currentTarget.naturalHeight / Math.max(1, e.currentTarget.naturalWidth);
                    setRatios((r) => ({ ...r, [s.id]: ratio }));
                  }} />
              ) : null}
              {editing && <span className="sticker-x">×</span>}
            </button>
          ))}
        </div>
      )}
      <div className="sticker-quick">
        {QUICK.map((e) => (
          <button key={e} className="sticker-cell small-cell" onClick={() => onPick({ emoji: e })} aria-label={`Add ${e}`}>
            <span className="sticker-emoji">{e}</span>
          </button>
        ))}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <label className="btn btn-sm">
          {busy ? "Saving…" : "＋ Upload a sticker"}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => (upload(Array.from(e.target.files ?? [])), (e.target.value = ""))} />
        </label>
        <input
          className="input input-sm"
          style={{ width: 170 }}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onPaste={(e) => {
            const fs = filesFromPaste(e);
            if (!fs.length) return;
            e.preventDefault();
            upload(fs);
          }}
          placeholder="an emoji, or paste a cut-out"
          aria-label="An emoji, or paste a cut-out picture"
        />
        {custom.trim() && (
          <>
            <button className="btn btn-sm" onClick={() => (onPick({ emoji: custom.trim() }), setCustom(""))}>
              Stick it
            </button>
            <button className="btn btn-sm btn-ghost" onClick={async () => (toast((await saveSticker({ emoji: custom.trim() }, meId)) ?? "Saved"), setCustom(""))}>
              Save
            </button>
          </>
        )}
      </div>
      <p className="small faint" style={{ margin: 0 }}>Tip: in Photos, long-press the subject to lift it out, tap Copy, then paste it in the box above for a cut-out sticker.</p>
    </div>
  );
}
