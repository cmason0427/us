"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { notify } from "@/lib/notify";
import { usePhotoUrls } from "@/lib/photos";
import { shrinkImage } from "@/lib/image";
import { useApp } from "@/components/AppProvider";
import { PageHead } from "@/components/PageHead";
import { Sheet } from "@/components/Sheet";
import { SpicyGate } from "@/components/SpicyGate";
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
      <PageHead eyebrow="Just us" title="Spicy" />
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
  const [section, setSection] = useState<Section>("pics");
  const [asking, setAsking] = useState(false);

  return (
    <div className="stack">
      <button className="btn btn-block spicy-lunch" onClick={() => setAsking(true)}>
        😏 In the mood?
      </button>
      {asking && <MoodAsk onClose={() => setAsking(false)} />}
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

/* ─── Pics & videos: one shared collection, tagged by who's in each ────── */

const isVideo = (path: string) => /\.(mp4|mov|m4v|webm|3gp)$/i.test(path);

interface SpicyMedia {
  id: string;
  storage_path: string;
  people: string[];
  caption: string | null;
  added_by: string;
  created_at: string;
}

type PeopleFilter = "all" | "me" | "them" | "both";

/** Who's in it: tap one of you, or both. */
function PeopleTags({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { profiles, meId } = useApp();
  const ordered = [...profiles].sort((a) => (a.id === meId ? -1 : 1));
  return (
    <div className="chips" role="group" aria-label="Who's in it">
      {ordered.map((p) => {
        const on = value.includes(p.id);
        return (
          <button key={p.id} type="button" className="chip chip-sm" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}>
            {p.id === meId ? "Me" : p.display_name}
          </button>
        );
      })}
    </div>
  );
}

function Pics() {
  const { meId, partner, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const [pending, setPending] = useState<{ file: File; url: string; people: string[] }[]>([]);
  const [open, setOpen] = useState<SpicyMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: media = [] } = useLive<SpicyMedia[]>(
    "spicy_media",
    async () => {
      const { data, error } = await supabase.from("spicy_media").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as SpicyMedia[];
    },
    ["spicy_media"],
  );
  const urls = usePhotoUrls(media.map((m) => m.storage_path));
  const them = partner?.id ?? "";
  const only = (m: SpicyMedia, id: string) => m.people.length === 1 && m.people[0] === id;
  const shown = media.filter((m) =>
    filter === "all" ? true : filter === "me" ? only(m, meId) : filter === "them" ? only(m, them) : m.people.includes(meId) && m.people.includes(them),
  );
  const untagged = media.filter((m) => m.people.length === 0).length;

  function pick(files: FileList | null) {
    const list = Array.from(files ?? []);
    setPending(list.map((file) => ({ file, url: URL.createObjectURL(file), people: [] })));
  }

  async function upload() {
    setBusy(true);
    const done: string[] = [];
    try {
      for (const p of pending) {
        const video = p.file.type.startsWith("video/");
        const { blob, ext } = video ? { blob: p.file as Blob, ext: p.file.name.split(".").pop()?.toLowerCase() || "mp4" } : await shrinkImage(p.file);
        const path = `${meId}/spicy/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("photos").upload(path, blob, { contentType: blob.type || (video ? "video/mp4" : "image/jpeg"), cacheControl: "31536000" });
        if (error) throw error;
        done.push(path);
        const { error: rowErr } = await supabase.from("spicy_media").insert({ storage_path: path, people: p.people, added_by: meId });
        if (rowErr) throw rowErr;
      }
      // The feed only hears that something's new; never what.
      const { data: post } = await supabase.from("posts").insert({ author: meId, text: "🌶️ Something new in Spicy", spicy: true }).select("id").single();
      if (post) notify({ kind: "spicy", id: post.id });
      pending.forEach((p) => URL.revokeObjectURL(p.url));
      setPending([]);
      refreshAll();
      toast(`Added ${done.length} 🌶️`);
    } catch (err) {
      toast((err as Error).message);
    }
    setBusy(false);
  }

  async function retag(m: SpicyMedia, people: string[]) {
    const { error } = await supabase.from("spicy_media").update({ people }).eq("id", m.id);
    if (error) return toast(error.message);
    setOpen({ ...m, people });
    refreshAll();
  }

  async function remove(m: SpicyMedia) {
    if (!confirm("Remove this for both of you?")) return;
    await supabase.from("spicy_media").delete().eq("id", m.id);
    if (m.storage_path.startsWith(`${meId}/`)) await supabase.storage.from("photos").remove([m.storage_path]);
    setOpen(null);
    refreshAll();
  }

  return (
    <div className="stack">
      <label className="card composer-prompt" style={{ cursor: "pointer" }}>
        <span style={{ fontSize: "1.6rem" }}>🌶️</span>
        <span>Add pics or videos…</span>
        <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
      </label>

      <div className="chips" role="group" aria-label="Show">
        {(
          [
            ["all", "All"],
            ["me", "Just me"],
            ["them", `Just ${partner?.display_name ?? "them"}`],
            ["both", "Both of us"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} className="chip chip-sm" aria-pressed={filter === v} onClick={() => setFilter(v)}>
            {label}
          </button>
        ))}
      </div>
      {untagged > 0 && filter === "all" && <p className="small muted">{untagged} not tagged yet. Tap one to tag who&apos;s in it.</p>}

      {shown.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: 48 }}>🌶️</div>
          <p>{media.length ? "None of those yet." : "Nothing here yet."}</p>
        </div>
      ) : (
        <div className="saved-grid">
          {shown.map((m) => (
            <button key={m.id} className="saved-item spicy-thumb" onClick={() => setOpen(m)}>
              {isVideo(m.storage_path) ? (
                urls[m.storage_path] && <video src={urls[m.storage_path]} muted playsInline preload="metadata" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                urls[m.storage_path] && <img src={urls[m.storage_path]} alt="" loading="lazy" />
              )}
              {isVideo(m.storage_path) && <span className="spicy-play">▶</span>}
            </button>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <Sheet title={`Tag who's in ${pending.length > 1 ? "each" : "it"}`} onClose={() => setPending([])}>
          <div className="stack">
            {pending.map((p, i) => (
              <div key={p.url} className="row" style={{ alignItems: "flex-start" }}>
                <div className="photo-pick">
                  {p.file.type.startsWith("video/") ? (
                    <video src={p.url} muted playsInline />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt="" />
                  )}
                </div>
                <PeopleTags value={p.people} onChange={(people) => setPending((ps) => ps.map((x, j) => (j === i ? { ...x, people } : x)))} />
              </div>
            ))}
            <p className="small muted">Videos up to about 50 MB each.</p>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={upload}>
              {busy ? "Adding…" : `Add ${pending.length}`}
            </button>
          </div>
        </Sheet>
      )}

      {open && (
        <Sheet title="🌶️" onClose={() => setOpen(null)}>
          <div className="stack">
            {isVideo(open.storage_path) ? (
              <video src={urls[open.storage_path]} controls playsInline style={{ width: "100%", borderRadius: 14 }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[open.storage_path]} alt="" style={{ width: "100%", borderRadius: 14 }} />
            )}
            <div className="field">
              <span>Who&apos;s in it</span>
              <PeopleTags value={open.people} onChange={(people) => retag(open, people)} />
            </div>
            <p className="small faint">Added by {open.added_by === meId ? "you" : nameOf(open.added_by)}</p>
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => remove(open)}>
              Remove for both of us
            </button>
          </div>
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

const MOOD_PRESETS = ["Lunch: you? 😏", "In the mood. Are you? 😏", "Tonight? 🌙", "Thinking about you 🔥"];
const COOLDOWN_MS = 3 * 60 * 60 * 1000;

/** How long ago I last sent a mood ask (answered or not), in ms. */
async function lastMoodAskAge(meId: string) {
  const { data: last } = await supabaseBrowser()
    .from("posts")
    .select("created_at")
    .eq("author", meId)
    .eq("kind", "lunch_you")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return last ? Date.now() - Date.parse(last.created_at) : Infinity;
}

/**
 * A mood ask: a preset or your own words. It lands in their feed; "not right
 * now" quietly takes it away. If you asked in the last 3 hours, it checks first.
 */
function MoodAsk({ onClose }: { onClose: () => void }) {
  const { meId, partner, toast } = useApp();
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ text: string; hours: string } | null>(null);
  const them = partner?.display_name ?? "them";

  async function send(text: string, force = false) {
    setBusy(true);
    if (!force) {
      const age = await lastMoodAskAge(meId);
      if (age < COOLDOWN_MS) {
        setBusy(false);
        const h = age / 3600000;
        return setConfirm({ text, hours: h < 1 ? "less than an hour" : `${Math.floor(h)} hour${Math.floor(h) === 1 ? "" : "s"}` });
      }
    }
    const res = await fetch("/api/spicy/lunch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", text }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast("Couldn't send. Try again?");
    refreshAll();
    toast(`Sent to ${them} 😏`);
    onClose();
  }

  return (
    <Sheet title="In the mood?" onClose={onClose}>
      {confirm ? (
        <div className="stack">
          <p>You sent a mood ask {confirm.hours} ago. Would you like to send another?</p>
          <div className="row-between">
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Not yet
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={() => send(confirm.text, true)}>
              Send another
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="stack-sm">
            {MOOD_PRESETS.map((p) => (
              <button key={p} className="btn btn-block" disabled={busy} onClick={() => send(p)}>
                {p}
              </button>
            ))}
          </div>
          <form
            className="quick-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) send(custom.trim());
            }}
          >
            <input className="input grow" value={custom} maxLength={140} onChange={(e) => setCustom(e.target.value)} placeholder="Or say it your way…" aria-label="Your own words" />
            <button className="btn btn-primary" disabled={busy || !custom.trim()}>
              Send
            </button>
          </form>
          <p className="small muted">It goes to {them}&apos;s feed. “Not right now” just makes it disappear, no hard feelings.</p>
        </div>
      )}
    </Sheet>
  );
}
