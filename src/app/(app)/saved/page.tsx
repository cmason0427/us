"use client";

import { DogPic } from "@/components/DogPic";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { refreshAll } from "@/lib/useLive";
import { usePhotoUrls } from "@/lib/photos";
import { useFolders, useSaves, type Folder } from "@/lib/saved";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { PostComposer } from "@/components/PostComposer";
import { Wavy } from "@/components/Art";
import { PinPad } from "@/components/PinPad";

export default function SavedPage() {
  const { meId, partner, toast } = useApp();
  const folders = useFolders();
  const wanted = useSearchParams().get("folder");
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sendingSpicy, setSendingSpicy] = useState(false);
  // ?folder=spicy (from the 🌶️ note or push) opens your Spicy folder.
  const open = folders.find((f) => f.id === openId) ?? (wanted === "spicy" && openId === null ? folders.find((f) => f.is_spicy) : undefined);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const { error } = await supabaseBrowser().from("folders").insert({ owner: meId, name: name.trim() });
    if (error) return toast(error.message);
    setName("");
    refreshAll();
  }

  if (open) return open.is_spicy ? <SpicyGate folder={open} onBack={() => setOpenId("")} /> : <FolderView folder={open} onBack={() => setOpenId("")} />;

  return (
    <main className="page">
      <PageHead eyebrow="Just yours" title="Saved" art={<DogPic name="heart_red" size={30} />} />
      <Wavy />
      {partner && (
        <button className="card composer-prompt" onClick={() => setSendingSpicy(true)}>
          <span style={{ fontSize: "1.6rem" }}>🌶️</span>
          <span>Add something to {partner.display_name}&apos;s Spicy folder…</span>
        </button>
      )}
      <div className="folder-grid" style={{ marginTop: 16 }}>
        {folders.map((f) => (
          <button key={f.id} className="card folder" onClick={() => setOpenId(f.id)}>
            <span style={{ fontSize: "1.6rem" }}>{f.is_spicy ? "🌶️" : "📁"}</span>
            <strong>{f.name}</strong>
            <span className="small muted">{f.is_spicy ? "🔒 PIN to open" : (f.saves[0]?.count ?? 0)}</span>
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
      {sendingSpicy && (
        <Sheet title="🌶️ Something spicy" onClose={() => setSendingSpicy(false)}>
          <PostComposer initialSpicy onDone={() => setSendingSpicy(false)} />
        </Sheet>
      )}
    </main>
  );
}

/**
 * Spicy asks for your PIN every time it's opened. The server checks it, and the
 * database only returns Spicy saves for a few minutes after; leaving relocks.
 */
function SpicyGate({ folder, onBack }: { folder: Folder; onBack: () => void }) {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    return () => {
      fetch("/api/auth/pin/spicy", { method: "DELETE" }).catch(() => {});
    };
  }, [unlocked]);

  async function check(pin: string) {
    const res = await fetch("/api/auth/pin/spicy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    }).catch(() => null);
    if (res?.ok) {
      setUnlocked(true);
      refreshAll();
      return null;
    }
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? "Couldn't reach the server. Try again?";
  }

  if (unlocked) return <FolderView folder={folder} onBack={onBack} />;
  return (
    <main className="page">
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 6 }}>
        <DogPic name="kodo_back" size={26} /> Saved
      </button>
      <div className="card" style={{ textAlign: "center", marginTop: 12 }}>
        <DogPic name="heart_red" size={44} style={{ margin: "0 auto" }} />
        <h2>Spicy</h2>
        <p className="small muted">Enter your PIN to open.</p>
        <PinPad onComplete={check} />
      </div>
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
        <DogPic name="kodo_back" size={26} /> Saved
      </button>
      <PageHead title={`${folder.is_spicy ? "🌶️ " : ""}${folder.name}`} />
      <Wavy />
      {saves.length === 0 ? (
        <div className="empty">
          <DogPic name="wiley_curled" size={100} />
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
