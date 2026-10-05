"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHead } from "@/components/PageHead";
import { Wavy } from "@/components/Art";
import { NewThread, useThreads, type Thread } from "@/components/Threads";
import { useApp } from "@/components/AppProvider";
import { usePhotoUrls } from "@/lib/photos";
import { ago } from "@/lib/dates";
import { useUrlTab } from "@/lib/links";

/**
 * Every board, each with its cover: the whole board as it is right now (kept
 * up to date by itself), or a view someone picked in the board's ⋯ menu.
 */
export default function BoardsPage() {
  const { threads, isNew } = useThreads();
  const { nameOf } = useApp();
  const router = useRouter();
  const [look, setLook] = useUrlTab(["cards", "big"] as const, "cards", "view");
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const active = threads.filter((t) => !t.archived_at);
  const archived = threads.filter((t) => t.archived_at);
  const urls = usePhotoUrls(threads.flatMap((t) => (t.cover_path ? [t.cover_path] : [])));

  const card = (t: Thread) => (
    <Link key={t.id} href={`/threads/${t.id}`} className={`board-card${isNew(t) ? " is-new" : ""}`}>
      <span className="board-cover" style={{ background: t.bg ?? undefined }}>
        {t.cover_path && urls[t.cover_path] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urls[t.cover_path]} alt="" loading="lazy" />
        ) : (
          <span className="board-cover-empty" aria-hidden>
            {t.emoji ?? "🗒️"}
          </span>
        )}
        {isNew(t) && <span className="board-card-new">new from {nameOf(t.last_by)}</span>}
      </span>
      <span className="board-card-foot">
        <span className="board-card-title">
          {t.emoji ?? "🗒️"} {t.title}
        </span>
        <span className="small faint">{ago(t.last_at)}</span>
      </span>
    </Link>
  );

  return (
    <main className="page">
      <PageHead eyebrow="Ideas, plans & pretty things" title="Boards" />
      <Wavy />
      <div className="row-between" style={{ marginBottom: 12 }}>
        <div className="seg seg-sm" role="group" aria-label="How to show them">
          <button aria-pressed={look === "cards"} onClick={() => setLook("cards")}>
            ▦ Cards
          </button>
          <button aria-pressed={look === "big"} onClick={() => setLook("big")}>
            ▭ Big
          </button>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
          ＋ New board
        </button>
      </div>
      {!active.length && <p className="muted">No boards yet. Start one for a trip, a room, costumes, anything.</p>}
      <div className={`board-cards ${look}`}>{active.map(card)}</div>
      {archived.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <button className="btn-link small" onClick={() => setShowArchived((x) => !x)}>
            {showArchived ? "hide archived" : `archived boards (${archived.length})`}
          </button>
          {showArchived && <div className={`board-cards ${look} archived`}>{archived.map(card)}</div>}
        </section>
      )}
      <p className="small faint" style={{ marginTop: 16 }}>
        Covers keep themselves up to date. To pick your own, open a board and use ⋯ → cover, or 📸 → &ldquo;Make this the cover&rdquo;.
      </p>
      {creating && (
        <NewThread
          onDone={(id) => {
            setCreating(false);
            if (id) router.push(`/threads/${id}`);
          }}
        />
      )}
    </main>
  );
}
