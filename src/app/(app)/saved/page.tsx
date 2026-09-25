"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { usePhotoUrls } from "@/lib/photos";
import { useFolders, useSaves, type Folder } from "@/lib/saved";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { Wavy } from "@/components/Art";
import { ArchivedThreads } from "@/components/Threads";

export default function SavedPage() {
  const { meId, toast } = useApp();
  // Spicy has its own tab now.
  const folders = useFolders().filter((f) => !f.is_spicy);
  const router = useRouter();
  const wanted = useSearchParams().get("folder");
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const open = folders.find((f) => f.id === openId);
  // Old links to the Spicy folder go to the Spicy tab.
  useEffect(() => {
    if (wanted === "spicy") router.replace("/spicy");
  }, [wanted, router]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const { error } = await supabaseBrowser().from("folders").insert({ owner: meId, name: name.trim() });
    if (error) return toast(error.message);
    setName("");
    refreshAll();
  }

  if (open) return <FolderView folder={open} onBack={() => setOpenId("")} />;

  return (
    <main className="page">
      <PageHead eyebrow="Just yours" title="Saved" art={<Sticker name="kodo_face" size={80} tilt={4} />} />
      <Wavy />
      <div className="folder-grid" style={{ marginTop: 16 }}>
        {folders.map((f) => (
          <button key={f.id} className="card folder" onClick={() => setOpenId(f.id)}>
            <span style={{ fontSize: "1.6rem" }}>📁</span>
            <strong>{f.name}</strong>
            <span className="small muted">{f.saves[0]?.count ?? 0}</span>
          </button>
        ))}
      </div>
      {folders.length === 0 && <p className="muted">Nothing saved yet. Tap 🔖 on a photo in the feed.</p>}
      <form className="quick-add" onSubmit={create} style={{ marginTop: 16 }}>
        <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder…" aria-label="New folder name" />
        <button className="btn" disabled={!name.trim()}>
          Make folder
        </button>
      </form>
      <ArchivedThreads />
    </main>
  );
}

function FolderView({ folder, onBack }: { folder: Folder; onBack: () => void }) {
  const { meId, nameOf, toast } = useApp();
  const saves = useSaves(folder.id);
  const urls = usePhotoUrls(saves.map((s) => s.storage_path));

  async function remove(id: string, path: string) {
    if (!confirm("Remove this from the folder?")) return;
    const supabase = supabaseBrowser();
    await supabase.from("saves").delete().eq("id", id);
    // Only copies in your own storage folder can be deleted (spicy ones are theirs).
    if (path.startsWith(`${meId}/`)) await supabase.storage.from("photos").remove([path]);
    refreshAll();
  }

  async function removeFolder() {
    if (!confirm(`Delete "${folder.name}" and everything in it?`)) return;
    const supabase = supabaseBrowser();
    const mine = saves.map((s) => s.storage_path).filter((p) => p.startsWith(`${meId}/`));
    if (mine.length) await supabase.storage.from("photos").remove(mine);
    const { error } = await supabase.from("folders").delete().eq("id", folder.id);
    if (error) return toast(error.message);
    refreshAll();
    onBack();
  }

  return (
    <main className="page">
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 6 }}>
        <Sticker name="kodo_back" size={40} /> Saved
      </button>
      <PageHead title={`${folder.is_spicy ? "🌶️ " : ""}${folder.name}`} />
      <Wavy />
      {saves.length === 0 ? (
        <div className="empty">
          <Sticker name="kodo_sleep" size={150} tilt={2} />
          <p>Empty for now.</p>
        </div>
      ) : (
        <div className="saved-grid">
          {saves.map((s) => (
            <figure key={s.id} className="saved-item">
              <a href={urls[s.storage_path]} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {urls[s.storage_path] && <img src={urls[s.storage_path]} alt={s.caption ?? ""} loading="lazy" />}
              </a>
              <figcaption className="small">
                {s.caption && <span>{s.caption} </span>}
                {folder.is_spicy && <span className="faint">from {nameOf(s.added_by)}</span>}
                <button className="icon-btn" onClick={() => remove(s.id, s.storage_path)} aria-label="Remove">
                  ×
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <button className="btn btn-ghost btn-sm" onClick={removeFolder} style={{ marginTop: 20 }}>
        Delete folder
      </button>
    </main>
  );
}
