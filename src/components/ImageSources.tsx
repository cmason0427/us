"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";

/** Turn an image link into a File, via the server (most sites block browsers from doing it directly). */
export async function fileFromLink(url: string): Promise<File> {
  const r = await fetch("/api/fetch-image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't load that link.");
  const blob = await r.blob();
  const ext = (blob.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
  return new File([blob], `link.${ext}`, { type: blob.type });
}

/** Images from a paste event (a copied photo), if any. */
export function filesFromPaste(e: React.ClipboardEvent | ClipboardEvent): File[] {
  const items = Array.from(e.clipboardData?.items ?? []);
  return items.flatMap((i) => (i.kind === "file" && i.type.startsWith("image/") ? [i.getAsFile()!].filter(Boolean) : []));
}

/**
 * "📋 Paste" and "🔗 Link" next to an upload button: add a copied picture or
 * one from a web link, not just from the camera roll.
 */
export function ImageSources({ onFiles, multiple = true }: { onFiles: (files: File[]) => void; multiple?: boolean }) {
  const { toast } = useApp();
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function paste() {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await it.getType(type);
          files.push(new File([blob], `pasted.${type.split("/")[1] ?? "png"}`, { type }));
        } else if (it.types.includes("text/plain")) {
          // A copied link to a picture works too.
          const text = (await (await it.getType("text/plain")).text()).trim();
          if (/^https?:\/\//.test(text)) files.push(await fileFromLink(text));
        }
      }
      if (!files.length) return toast("Nothing picture-y on the clipboard. Copy a photo first.");
      onFiles(multiple ? files : files.slice(0, 1));
    } catch (err) {
      toast((err as Error).message?.includes("denied") ? "Your phone blocked pasting. Long-press the box and tap Paste instead." : (err as Error).message || "Couldn't paste that.");
    }
  }

  async function fromLink(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      onFiles([await fileFromLink(url.trim())]);
      setUrl("");
      setLinking(false);
    } catch (err) {
      toast((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <span className="img-sources">
      <button type="button" className="btn btn-sm btn-ghost" onClick={paste}>
        📋 Paste
      </button>
      <button type="button" className="btn btn-sm btn-ghost" aria-pressed={linking} onClick={() => setLinking((l) => !l)}>
        🔗 Link
      </button>
      {linking && (
        <span className="quick-add img-link">
          <input className="input input-sm grow keep-case" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="image link (https://…)" autoFocus aria-label="Image link" onKeyDown={(e) => e.key === "Enter" && fromLink(e)} />
          <button type="button" className="btn btn-sm" disabled={busy || !url.trim()} onClick={fromLink}>
            {busy ? "…" : "Add"}
          </button>
        </span>
      )}
    </span>
  );
}
