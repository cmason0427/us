"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { usePhotoUrls } from "@/lib/photos";
import { useFolders, useSaves } from "@/lib/saved";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { PostComposer } from "@/components/PostComposer";
import { SpicyGate } from "@/components/SpicyGate";
import { DogPic } from "@/components/DogPic";
import { Wavy } from "@/components/Art";

interface SpicyItem {
  id: string;
  author: string;
  kind: "fantasy" | "try" | "remember" | "worked" | "didnt";
  text: string;
  to_user: string | null;
  created_at: string;
}

const NOTE_KINDS = [
  { v: "remember", label: "📝 Remember this" },
  { v: "worked", label: "👍 Worked for me" },
  { v: "didnt", label: "👎 Didn't work for me" },
] as const;

type Section = "pics" | "ideas" | "notes";

export default function SpicyPage() {
  return (
    <main className="page">
      <PageHead eyebrow="Just us" title="Spicy" art={<DogPic name="kodo_wiley_cuddle" size={48} />} />
      <Wavy />
      <SpicyGate>
        <Spicy />
      </SpicyGate>
    </main>
  );
}

function useItems() {
  const { data = [] } = useLive<SpicyItem[]>(
    "spicy_items",
    async () => {
      const { data, error } = await supabaseBrowser().from("spicy_items").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as SpicyItem[];
    },
    ["spicy_items"],
  );
  return data;
}

function Spicy() {
  const { partner, toast } = useApp();
  const [section, setSection] = useState<Section>("pics");
  const [sentLunch, setSentLunch] = useState(false);

  async function lunch() {
    const res = await fetch("/api/spicy/lunch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send" }) }).catch(() => null);
    if (!res?.ok) return toast("Couldn't send. Try again?");
    setSentLunch(true);
    refreshAll();
    toast(`Sent to ${partner?.display_name ?? "them"} 😏`);
  }

  return (
    <div className="stack">
      <button className="btn btn-block spicy-lunch" onClick={lunch} disabled={sentLunch}>
        {sentLunch ? "Sent: lunch, you? 😏" : "🍽️ Lunch: you? 😏"}
      </button>
      <div className="seg" role="group" aria-label="Section">
        <button aria-pressed={section === "pics"} onClick={() => setSection("pics")}>
          Pics
        </button>
        <button aria-pressed={section === "ideas"} onClick={() => setSection("ideas")}>
          Ideas
        </button>
        <button aria-pressed={section === "notes"} onClick={() => setSection("notes")}>
          Notes
        </button>
      </div>
      {section === "pics" && <Pics />}
      {section === "ideas" && <Ideas />}
      {section === "notes" && <Notes />}
    </div>
  );
}

/* ─── Pics & videos: what they've added for you; add for them ─────────────── */

const isVideo = (path: string) => /\.(mp4|mov|m4v|webm|3gp)$/i.test(path);

function Pics() {
  const { meId, partner, nameOf } = useApp();
  const folder = useFolders().find((f) => f.is_spicy);
  const saves = useSaves(folder?.id ?? null);
  const urls = usePhotoUrls(saves.map((s) => s.storage_path));
  const [adding, setAdding] = useState(false);

  async function remove(id: string, path: string) {
    if (!confirm("Remove this?")) return;
    const supabase = supabaseBrowser();
    await supabase.from("saves").delete().eq("id", id);
    if (path.startsWith(`${meId}/`)) await supabase.storage.from("photos").remove([path]);
    refreshAll();
  }

  return (
    <div className="stack">
      {partner && (
        <button className="card composer-prompt" onClick={() => setAdding(true)}>
          <span style={{ fontSize: "1.6rem" }}>🌶️</span>
          <span>Add something for {partner.display_name} (photos or videos)…</span>
        </button>
      )}
      {saves.length === 0 ? (
        <div className="empty">
          <DogPic name="wiley_curled" size={90} />
          <p>Nothing here yet.</p>
        </div>
      ) : (
        <div className="saved-grid">
          {saves.map((s) => (
            <figure key={s.id} className="saved-item">
              {isVideo(s.storage_path) ? (
                urls[s.storage_path] && <video src={urls[s.storage_path]} controls playsInline preload="metadata" />
              ) : (
                <a href={urls[s.storage_path]} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {urls[s.storage_path] && <img src={urls[s.storage_path]} alt={s.caption ?? ""} loading="lazy" />}
                </a>
              )}
              <figcaption className="small">
                <span className="faint">
                  {s.caption ? `${s.caption} · ` : ""}from {nameOf(s.added_by)}
                </span>
                <button className="icon-btn" onClick={() => remove(s.id, s.storage_path)} aria-label="Remove">
                  ×
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {adding && (
        <Sheet title="🌶️ Something spicy" onClose={() => setAdding(false)}>
          <PostComposer initialSpicy onDone={() => setAdding(false)} />
        </Sheet>
      )}
    </div>
  );
}

/* ─── Ideas: private fantasies, and the want-to-try list ──────────────────── */

function Ideas() {
  const { meId, partner, nameOf, toast } = useApp();
  const items = useItems();
  const tryList = items.filter((i) => i.kind === "try");
  const mine = items.filter((i) => i.kind === "fantasy" && i.author === meId);
  const [tryDraft, setTryDraft] = useState("");
  const [fantasyDraft, setFantasyDraft] = useState("");
  const supabase = supabaseBrowser();

  async function add(kind: "try" | "fantasy", text: string) {
    const { data, error } = await supabase.from("spicy_items").insert({ author: meId, kind, text: text.trim() }).select("id").single();
    if (error) return toast(error.message);
    if (kind === "try") notify({ kind: "spicy_item", id: data.id });
    refreshAll();
  }

  async function share(f: SpicyItem) {
    if (!confirm(`Share this with ${partner?.display_name ?? "them"}? It moves to your want-to-try list.`)) return;
    const { data, error } = await supabase.from("spicy_items").insert({ author: meId, kind: "try", text: f.text }).select("id").single();
    if (error) return toast(error.message);
    await supabase.from("spicy_items").delete().eq("id", f.id);
    notify({ kind: "spicy_item", id: data.id });
    refreshAll();
    toast("Shared 😏");
  }

  async function remove(id: string) {
    await supabase.from("spicy_items").delete().eq("id", id);
    refreshAll();
  }

  return (
    <div className="stack">
      <section>
        <div className="section-title" style={{ margin: "4px 0 6px" }}>
          Want to try
        </div>
        <p className="small muted" style={{ marginBottom: 8 }}>
          Both of you see this. Add or take things off whenever.
        </p>
        <form
          className="quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (tryDraft.trim()) add("try", tryDraft).then(() => setTryDraft(""));
          }}
        >
          <input className="input grow" value={tryDraft} onChange={(e) => setTryDraft(e.target.value)} placeholder="Wanna try this?" aria-label="Add to want to try" />
          <button className="btn btn-primary" disabled={!tryDraft.trim()}>
            Add
          </button>
        </form>
        {tryList.length > 0 && (
          <div className="card" style={{ marginTop: 10, padding: "2px 12px" }}>
            {tryList.map((i) => (
              <div key={i.id} className="task">
                <span className="grow task-title" style={{ fontWeight: 500 }}>
                  {i.text}
                </span>
                <span className="small faint">{i.author === meId ? "you" : nameOf(i.author)}</span>
                <button className="icon-btn" onClick={() => remove(i.id)} aria-label="Take off the list">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-title" style={{ margin: "10px 0 6px" }}>
          🔒 Just mine
        </div>
        <p className="small muted" style={{ marginBottom: 8 }}>
          Private. {partner?.display_name ?? "They"} can&apos;t see these unless you share one.
        </p>
        <form
          className="quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (fantasyDraft.trim()) add("fantasy", fantasyDraft).then(() => setFantasyDraft(""));
          }}
        >
          <input className="input grow" value={fantasyDraft} onChange={(e) => setFantasyDraft(e.target.value)} placeholder="A private fantasy…" aria-label="Add a private fantasy" />
          <button className="btn" disabled={!fantasyDraft.trim()}>
            Keep
          </button>
        </form>
        {mine.length > 0 && (
          <div className="card" style={{ marginTop: 10, padding: "2px 12px" }}>
            {mine.map((f) => (
              <div key={f.id} className="task">
                <span className="grow task-title" style={{ fontWeight: 500 }}>
                  {f.text}
                </span>
                <button className="btn btn-sm btn-ghost" onClick={() => share(f)}>
                  Share?
                </button>
                <button className="icon-btn" onClick={() => remove(f.id)} aria-label="Delete">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ─── Notes: remember this / worked / didn't. They clear once seen. ──────── */

function Notes() {
  const { meId, partner, toast } = useApp();
  const items = useItems();
  const forMe = items.filter((i) => i.to_user === meId);
  const sent = items.filter((i) => i.author === meId && i.to_user && i.kind !== "try" && i.kind !== "fantasy");
  const [kind, setKind] = useState<(typeof NOTE_KINDS)[number]["v"]>("remember");
  const [draft, setDraft] = useState("");
  const supabase = supabaseBrowser();
  const label = (k: string) => NOTE_KINDS.find((n) => n.v === k)?.label ?? "";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !partner) return;
    const { data, error } = await supabase.from("spicy_items").insert({ author: meId, kind, text: draft.trim(), to_user: partner.id }).select("id").single();
    if (error) return toast(error.message);
    notify({ kind: "spicy_item", id: data.id });
    setDraft("");
    refreshAll();
    toast("Sent 💛");
  }

  async function clear(id: string) {
    await supabase.from("spicy_items").delete().eq("id", id);
    refreshAll();
  }

  return (
    <div className="stack">
      {forMe.length > 0 && (
        <section>
          <div className="section-title" style={{ margin: "4px 0 6px" }}>
            For you
          </div>
          <div className="stack-sm">
            {forMe.map((n) => (
              <div key={n.id} className="card spicy-note">
                <span className="small muted">{label(n.kind)}</span>
                <p>{n.text}</p>
                <button className="btn btn-sm" onClick={() => clear(n.id)} style={{ alignSelf: "flex-start" }}>
                  Seen ✓ clear
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <form className="card stack" onSubmit={send}>
        <strong>Tell {partner?.display_name ?? "them"}</strong>
        <div className="chips" role="radiogroup" aria-label="Kind of note">
          {NOTE_KINDS.map((k) => (
            <button key={k.v} type="button" role="radio" aria-checked={kind === k.v} className="chip chip-sm" onClick={() => setKind(k.v)}>
              {k.label}
            </button>
          ))}
        </div>
        <textarea className="textarea" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Super casual. They'll clear it once they've seen it." />
        <button className="btn btn-primary" disabled={!draft.trim()}>
          Send
        </button>
      </form>

      {sent.length > 0 && (
        <section>
          <div className="small muted" style={{ fontWeight: 650, margin: "4px 0 6px" }}>
            Waiting to be seen
          </div>
          {sent.map((n) => (
            <p key={n.id} className="small">
              {label(n.kind)}: {n.text}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
