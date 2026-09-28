"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { BatchAdd, type BatchRow } from "./BatchAdd";

interface Watch {
  id: string;
  title: string;
  kind: "movie" | "show";
  tags: string[];
  notes: string | null;
  watched_at: string | null;
  /** Whose pick it is; null = either of us. */
  whose: string | null;
  added_by: string;
  created_at: string;
}

/** The "whose" slider: just mine, anything, just theirs. */
type Whose = 0 | 1 | 2;

/** Tags to start from; anything you type becomes a tag too. */
const SUGGESTED = ["Sad", "Not sad", "Nostalgic", "New to us", "Funny", "Cozy", "Scary", "Romantic", "Action", "Animated", "Documentary", "Rewatch"];
const KIND_ICON = { movie: "🎬", show: "📺" } as const;

/**
 * The theater: what we want to watch. Add one at a time (tags and notes are
 * optional), then search and filter by movie vs show and any tag.
 */
export function Theater() {
  const { nameOf, meId, partner, toast } = useApp();
  const supabase = supabaseBrowser();
  const { data: items = [] } = useLive<Watch[]>(
    "watchlist",
    async () => {
      const { data, error } = await supabase.from("watchlist").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Watch[];
    },
    ["watchlist"],
  );
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<Watch["kind"]>("movie");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<Watch["kind"] | null>(null);
  const [whose, setWhose] = useState<Whose>(1);
  const [watched, setWatched] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [several, setSeveral] = useState(false);

  const them = partner?.id ?? "";
  const theirName = partner?.display_name ?? "Them";
  const allTags = [...new Set([...SUGGESTED, ...items.flatMap((i) => i.tags)])];
  // Search covers titles, tags and notes, so there's no wall of tag buttons.
  const q = search.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      !!i.watched_at === watched &&
      (!kindFilter || i.kind === kindFilter) &&
      (whose === 1 || (whose === 0 ? i.whose !== them : i.whose !== meId)) &&
      (!q || i.title.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)) || (i.notes ?? "").toLowerCase().includes(q)),
  );
  const openItem = items.find((i) => i.id === open);
  const pickLabel = (i: Watch) => (i.whose === meId ? "mine" : i.whose ? `${nameOf(i.whose)}'s` : null);

  async function toggleWatched(i: Watch) {
    const { error } = await supabase.from("watchlist").update({ watched_at: i.watched_at ? null : new Date().toISOString() }).eq("id", i.id);
    if (error) return toast(error.message);
    refreshAll();
    toast(i.watched_at ? "Back on the list" : `Watched ✓ ${i.title}`);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const { error } = await supabase.from("watchlist").insert({ title: draft.trim(), kind, added_by: meId });
    if (error) return toast(error.message);
    setDraft("");
    refreshAll();
    toast(`Added. Tap it to tag it${kind === "show" ? " 📺" : " 🎬"}`);
  }

  return (
    <div className="stack">
      <form className="stack-sm" onSubmit={add}>
        <div className="quick-add">
          <input className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={kind === "show" ? "A show to watch…" : "A movie to watch…"} aria-label="Title" />
          <button className="btn btn-primary" disabled={!draft.trim()}>
            Add
          </button>
        </div>
        <div className="seg seg-sm" role="group" aria-label="Movie or show">
          <button type="button" aria-pressed={kind === "movie"} onClick={() => setKind("movie")}>
            🎬 Movie
          </button>
          <button type="button" aria-pressed={kind === "show"} onClick={() => setKind("show")}>
            📺 Show
          </button>
        </div>
        <button type="button" className="btn-link small" style={{ alignSelf: "flex-start" }} onClick={() => setSeveral(true)}>
          + Add several at once
        </button>
      </form>

      {/* Filters: a search, a whose-pick slider, and two small switches. */}
      <div className="card stack-sm theater-filters">
        <input className="input input-sm" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles, tags, notes…" aria-label="Search the list" />
        <label className="theater-whose">
          <input type="range" min={0} max={2} step={1} value={whose} onChange={(e) => setWhose(Number(e.target.value) as Whose)} aria-label="Whose pick" />
          <span className="theater-whose-labels small">
            <span data-on={whose === 0}>mine</span>
            <span data-on={whose === 1}>anything</span>
            <span data-on={whose === 2}>{theirName.toLowerCase()}&apos;s</span>
          </span>
        </label>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="seg seg-sm" role="group" aria-label="Movies or shows">
            <button aria-pressed={kindFilter === null} onClick={() => setKindFilter(null)}>
              All
            </button>
            <button aria-pressed={kindFilter === "movie"} onClick={() => setKindFilter("movie")}>
              🎬
            </button>
            <button aria-pressed={kindFilter === "show"} onClick={() => setKindFilter("show")}>
              📺
            </button>
          </div>
          <div className="seg seg-sm" role="group" aria-label="To watch or watched">
            <button aria-pressed={!watched} onClick={() => setWatched(false)}>
              To watch
            </button>
            <button aria-pressed={watched} onClick={() => setWatched(true)}>
              Watched
            </button>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="muted">{items.length ? "Nothing matches." : "Nothing on the list yet. Add the next thing you want to watch."}</p>
      ) : (
        <div className="theater-list">
          {shown.map((i) => (
            <div key={i.id} className="card theater-item">
              <button className="theater-open" onClick={() => setOpen(i.id)}>
                <span className="theater-kind" aria-label={i.kind}>
                  {KIND_ICON[i.kind]}
                </span>
                <span className="grow">
                  <strong>{i.title}</strong>
                  {(pickLabel(i) || i.tags.length > 0) && (
                    <span className="small faint" style={{ display: "block" }}>
                      {[pickLabel(i), ...i.tags].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </button>
              <button className={`theater-check${i.watched_at ? " on" : ""}`} onClick={() => toggleWatched(i)} aria-pressed={!!i.watched_at} aria-label={i.watched_at ? `Put ${i.title} back on the list` : `Mark ${i.title} watched`}>
                ✓
              </button>
            </div>
          ))}
        </div>
      )}

      {several && (
        <Sheet title="🍿 Add several" onClose={() => setSeveral(false)}>
          <BatchAdd
            placeholder="Title"
            noun="titles"
            columns={[
              { key: "kind", label: "Movie or show", options: [{ v: "movie", label: "🎬 Movie" }, { v: "show", label: "📺 Show" }], required: true, initial: kind },
              { key: "whose", label: "Whose pick", options: [{ v: "either", label: "Either" }, { v: "mine", label: "Mine" }, ...(partner ? [{ v: "theirs", label: `${partner.display_name}'s` }] : [])], initial: "either" },
              { key: "tags", label: "Tags (optional)", options: allTags.map((t) => ({ v: t, label: t })), multi: true },
            ]}
            onSave={async (rows: BatchRow[]) => {
              const whoseOf = (v: unknown) => (v === "mine" ? meId : v === "theirs" ? them || null : null);
              const { error } = await supabase
                .from("watchlist")
                .insert(rows.map((r) => ({ title: r.name, kind: r.values.kind as Watch["kind"], whose: whoseOf(r.values.whose), tags: (r.values.tags as string[]) ?? [], added_by: meId })));
              if (error) return error.message;
              refreshAll();
              toast(`Added ${rows.length} 🍿`);
              setSeveral(false);
              return null;
            }}
          />
        </Sheet>
      )}
      {openItem && <WatchSheet item={openItem} allTags={allTags} onClose={() => setOpen(null)} />}
    </div>
  );
}

function WatchSheet({ item, allTags, onClose }: { item: Watch; allTags: string[]; onClose: () => void }) {
  const { toast, meId, partner } = useApp();
  const supabase = supabaseBrowser();
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState(item.notes ?? "");
  async function patch(fields: Partial<Watch>) {
    const { error } = await supabase.from("watchlist").update(fields).eq("id", item.id);
    if (error) toast(error.message);
    refreshAll();
  }
  const toggleTag = (t: string) => patch({ tags: item.tags.includes(t) ? item.tags.filter((x) => x !== t) : [...item.tags, t] });
  return (
    <Sheet title={`${KIND_ICON[item.kind]} ${item.title}`} onClose={onClose}>
      <div className="stack">
        <div className="seg seg-sm" role="group" aria-label="Movie or show">
          <button aria-pressed={item.kind === "movie"} onClick={() => patch({ kind: "movie" })}>
            🎬 Movie
          </button>
          <button aria-pressed={item.kind === "show"} onClick={() => patch({ kind: "show" })}>
            📺 Show
          </button>
        </div>
        <div className="field">
          <span>Whose pick</span>
          <div className="seg seg-sm" role="group" aria-label="Whose pick">
            <button aria-pressed={item.whose === meId} onClick={() => patch({ whose: meId })}>
              Mine
            </button>
            <button aria-pressed={!item.whose} onClick={() => patch({ whose: null })}>
              Either
            </button>
            {partner && (
              <button aria-pressed={item.whose === partner.id} onClick={() => patch({ whose: partner.id })}>
                {partner.display_name}&apos;s
              </button>
            )}
          </div>
        </div>
        <div className="field">
          <span>Tags</span>
          <div className="chips">
            {[...new Set([...allTags, ...item.tags])].map((t) => (
              <button key={t} className="chip chip-sm" aria-pressed={item.tags.includes(t)} onClick={() => toggleTag(t)}>
                {t}
              </button>
            ))}
          </div>
          <form
            className="quick-add"
            onSubmit={(e) => {
              e.preventDefault();
              const t = newTag.trim();
              if (!t) return;
              if (!item.tags.includes(t)) patch({ tags: [...item.tags, t] });
              setNewTag("");
            }}
          >
            <input className="input grow" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="New tag" aria-label="New tag" />
            <button className="btn btn-sm" disabled={!newTag.trim()}>
              Add
            </button>
          </form>
        </div>
        <label className="field">
          <span>Notes (optional)</span>
          <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (item.notes ?? "") && patch({ notes: notes.trim() || null })} placeholder="Who recommended it, where it's streaming, why we want it…" />
        </label>
        <div className="row-between">
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              if (!confirm(`Take "${item.title}" off the list?`)) return;
              await supabase.from("watchlist").delete().eq("id", item.id);
              refreshAll();
              onClose();
            }}
          >
            Remove
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              await patch({ watched_at: item.watched_at ? null : new Date().toISOString() });
              toast(item.watched_at ? "Back on the list" : "Watched ✓");
              onClose();
            }}
          >
            {item.watched_at ? "Back on the list" : "We watched it ✓"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
