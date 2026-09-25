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
  added_by: string;
  created_at: string;
}

/** Tags to start from; anything you type becomes a tag too. */
const SUGGESTED = ["Sad", "Not sad", "Nostalgic", "New to us", "Funny", "Cozy", "Scary", "Romantic", "Action", "Animated", "Documentary", "Rewatch"];
const KIND_ICON = { movie: "🎬", show: "📺" } as const;

/**
 * The theater: what we want to watch. Add one at a time (tags and notes are
 * optional), then search and filter by movie vs show and any tag.
 */
export function Theater() {
  const { nameOf, meId, toast } = useApp();
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
  const [showFilters, setShowFilters] = useState(false);
  const [kindFilter, setKindFilter] = useState<Watch["kind"] | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [watched, setWatched] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [several, setSeveral] = useState(false);

  const allTags = [...new Set([...SUGGESTED, ...items.flatMap((i) => i.tags)])];
  const q = search.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      !!i.watched_at === watched &&
      (!kindFilter || i.kind === kindFilter) &&
      tagFilter.every((t) => i.tags.includes(t)) &&
      (!q || i.title.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)) || (i.notes ?? "").toLowerCase().includes(q)),
  );
  const filterCount = (kindFilter ? 1 : 0) + tagFilter.length + (watched ? 1 : 0);
  const openItem = items.find((i) => i.id === open);

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

      <div className="row">
        <input className="input grow" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" aria-label="Search the list" />
        <button className="btn btn-sm btn-ghost" aria-pressed={showFilters || filterCount > 0} onClick={() => setShowFilters((f) => !f)}>
          Filter{filterCount ? ` (${filterCount})` : ""}
        </button>
      </div>
      {showFilters && (
        <div className="card stack-sm" style={{ padding: "10px 12px" }}>
          <div className="chips">
            <button className="chip chip-sm" aria-pressed={!watched} onClick={() => setWatched(false)}>
              To watch
            </button>
            <button className="chip chip-sm" aria-pressed={watched} onClick={() => setWatched(true)}>
              Watched
            </button>
            <span className="small faint">·</span>
            <button className="chip chip-sm" aria-pressed={kindFilter === "movie"} onClick={() => setKindFilter(kindFilter === "movie" ? null : "movie")}>
              🎬 Movies
            </button>
            <button className="chip chip-sm" aria-pressed={kindFilter === "show"} onClick={() => setKindFilter(kindFilter === "show" ? null : "show")}>
              📺 Shows
            </button>
          </div>
          <div className="chips">
            {allTags.map((t) => (
              <button key={t} className="chip chip-sm" aria-pressed={tagFilter.includes(t)} onClick={() => setTagFilter(tagFilter.includes(t) ? tagFilter.filter((x) => x !== t) : [...tagFilter, t])}>
                {t}
              </button>
            ))}
          </div>
          {filterCount > 0 && (
            <button className="btn-link small" style={{ alignSelf: "flex-start" }} onClick={() => (setKindFilter(null), setTagFilter([]), setWatched(false))}>
              Clear
            </button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="muted">{items.length ? "Nothing matches." : "Nothing on the list yet. Add the next thing you want to watch."}</p>
      ) : (
        <div className="theater-list">
          {shown.map((i) => (
            <button key={i.id} className="card theater-item" onClick={() => setOpen(i.id)}>
              <span className="theater-kind" aria-label={i.kind}>
                {KIND_ICON[i.kind]}
              </span>
              <span className="grow">
                <strong>{i.title}</strong>
                {i.tags.length > 0 && (
                  <span className="chips" style={{ marginTop: 4 }}>
                    {i.tags.map((t) => (
                      <span key={t} className="sticker">
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="small faint">{i.added_by === meId ? "you" : nameOf(i.added_by)}</span>
            </button>
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
              { key: "tags", label: "Tags (optional)", options: allTags.map((t) => ({ v: t, label: t })), multi: true },
            ]}
            onSave={async (rows: BatchRow[]) => {
              const { error } = await supabase
                .from("watchlist")
                .insert(rows.map((r) => ({ title: r.name, kind: r.values.kind as Watch["kind"], tags: (r.values.tags as string[]) ?? [], added_by: meId })));
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
  const { toast } = useApp();
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
