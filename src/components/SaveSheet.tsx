"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { saveCopies, useFolders } from "@/lib/saved";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

/** "Save to…": pick one of your folders (or make one) for these photos. */
export function SaveSheet({ paths, onClose }: { paths: string[]; onClose: () => void }) {
  const { meId, toast } = useApp();
  const folders = useFolders().filter((f) => !f.is_spicy);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveTo(folderId: string, folderName: string) {
    setBusy(true);
    try {
      const { saved, skipped } = await saveCopies(meId, folderId, paths);
      refreshAll();
      toast(saved === 0 ? `Already in ${folderName}` : skipped ? `Saved ${saved} to ${folderName} 🔖 (${skipped} already there)` : `Saved to ${folderName} 🔖`);
      onClose();
    } catch (err) {
      toast((err as Error).message);
      setBusy(false);
    }
  }

  async function createAndSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const { data, error } = await supabaseBrowser().from("folders").insert({ owner: meId, name: name.trim() }).select("id, name").single();
    if (error) return toast(error.message);
    await saveTo(data.id, data.name);
  }

  return (
    <Sheet title={`Save ${paths.length > 1 ? `${paths.length} photos` : "photo"} to…`} onClose={onClose}>
      <div className="stack">
        {folders.map((f) => (
          <button key={f.id} className="card food-card" disabled={busy} onClick={() => saveTo(f.id, f.name)}>
            <span className="name">📁 {f.name}</span>
            <span className="small muted">{f.saves[0]?.count ?? 0} saved</span>
          </button>
        ))}
        <form className="quick-add" onSubmit={createAndSave}>
          <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder…" aria-label="New folder name" />
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            Create &amp; save
          </button>
        </form>
        <p className="small muted">Your folders are just yours.</p>
      </div>
    </Sheet>
  );
}
