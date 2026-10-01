"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { dogName } from "@/lib/dogs";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";

// A training map: concepts and plans as a tree you grow by adding branches,
// plus any two items connected with a labelled line (arrow optional). It lays
// itself out (no dragging): tap an item, then Branch / Connect / Edit.

type Status = "idea" | "trying" | "working" | "not_working" | "mastered";
interface Node {
  id: string;
  dog: string;
  parent_id: string | null;
  title: string;
  notes: string | null;
  status: Status;
  created_at: string;
}
interface Link {
  id: string;
  dog: string;
  from_id: string;
  to_id: string;
  label: string | null;
  arrow: "none" | "forward" | "both";
}

export const STATUS: Record<Status, { label: string; icon: string }> = {
  idea: { label: "Idea", icon: "💡" },
  trying: { label: "Trying", icon: "🧪" },
  working: { label: "Working", icon: "✅" },
  not_working: { label: "Not working", icon: "❌" },
  mastered: { label: "Mastered", icon: "⭐" },
};

const NW = 136;
const NH = 52;
const GX = 14;
const GY = 58;
const PAD = 16;

function useMap(dog: string) {
  const db = supabaseBrowser();
  const { data: nodes = [] } = useLive<Node[]>(
    `training_nodes:${dog}`,
    async () => {
      const { data, error } = await db.from("training_nodes").select("*").eq("dog", dog).order("created_at");
      if (error) throw error;
      return data as Node[];
    },
    ["training_nodes"],
  );
  const { data: links = [] } = useLive<Link[]>(
    `training_links:${dog}`,
    async () => {
      const { data, error } = await db.from("training_links").select("*").eq("dog", dog).order("created_at");
      if (error) throw error;
      return data as Link[];
    },
    ["training_links"],
  );
  return { nodes, links };
}

/** Tidy tree: leaves take one slot each, parents sit centred over their children. */
function layout(nodes: Node[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const kids = new Map<string, Node[]>();
  const roots: Node[] = [];
  for (const n of nodes) {
    if (n.parent_id && ids.has(n.parent_id) && n.parent_id !== n.id) kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n]);
    else roots.push(n);
  }
  const pos = new Map<string, { x: number; y: number }>();
  let slot = 0;
  let depthMax = 0;
  const seen = new Set<string>();
  const place = (n: Node, depth: number): number => {
    seen.add(n.id);
    depthMax = Math.max(depthMax, depth);
    const ch = (kids.get(n.id) ?? []).filter((c) => !seen.has(c.id));
    let cx: number;
    if (!ch.length) cx = slot++;
    else {
      const xs = ch.map((c) => place(c, depth + 1));
      cx = (xs[0] + xs[xs.length - 1]) / 2;
    }
    pos.set(n.id, { x: PAD + cx * (NW + GX), y: PAD + depth * (NH + GY) });
    return cx;
  };
  for (const r of roots) place(r, 0);
  return { pos, kids, width: PAD * 2 + Math.max(1, slot) * (NW + GX) - GX, height: PAD * 2 + (depthMax + 1) * (NH + GY) - GY };
}

/** Where the line from a box's centre toward (tx, ty) leaves the box. */
function edge(c: { x: number; y: number }, tx: number, ty: number) {
  const dx = tx - c.x;
  const dy = ty - c.y;
  const s = Math.min(Math.abs(NW / 2 / (dx || 1e-6)), Math.abs(NH / 2 / (dy || 1e-6)));
  return { x: c.x + dx * s, y: c.y + dy * s };
}

function wrap(title: string, max = 17): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + " " + w).trim().length <= max) lines[lines.length - 1] = (cur + " " + w).trim();
    else lines.push(w);
  }
  if (lines.length > 2) return [lines[0], lines[1].slice(0, max - 1) + "…"];
  return lines.map((l) => (l.length > max ? l.slice(0, max - 1) + "…" : l));
}

export function TrainingMap({ dog }: { dog: string }) {
  const { nodes, links } = useMap(dog);
  const [sel, setSel] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ kind: "node"; node: Node | null; parent: string | null } | { kind: "link"; link: Link | null; from: string; to: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const { pos, kids, width, height } = layout(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const centre = (id: string) => {
    const p = pos.get(id)!;
    return { x: p.x + NW / 2, y: p.y + NH / 2 };
  };

  function tapNode(id: string) {
    if (connectFrom) {
      if (id === connectFrom) return setConnectFrom(null);
      setSheet({ kind: "link", link: null, from: connectFrom, to: id });
      setConnectFrom(null);
      return;
    }
    setSel(sel === id ? null : id);
  }

  return (
    <div className="stack">
      <section className="card fit-card">
        <div className="row-between">
          <strong>{dogName(dog)}&apos;s training map</strong>
          <button className="btn btn-sm" onClick={() => setSheet({ kind: "node", node: null, parent: null })}>
            ＋ Starting point
          </button>
        </div>
        <div className="chips tm-legend" aria-label="Statuses">
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <span key={s} className={`chip chip-sm tm-st-${s}`}>
              {STATUS[s].icon} {STATUS[s].label}
            </span>
          ))}
        </div>
        {nodes.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            Start with a big concept (like &ldquo;loose-leash walking&rdquo; or &ldquo;reactivity at the door&rdquo;), then branch into what you&apos;re trying. Tap
            any two items to connect them: &ldquo;led to&rdquo;, &ldquo;replaced&rdquo;, &ldquo;helps with&rdquo;…
          </p>
        ) : (
          <>
            {connectFrom ? (
              <div className="tm-banner">
                🔗 Tap the item to connect <strong>{byId.get(connectFrom)?.title}</strong> to…
                <button className="btn-link small" onClick={() => setConnectFrom(null)}>
                  cancel
                </button>
              </div>
            ) : (
              <span className="small faint">Tap an item to branch, connect or edit it. Tap a line&apos;s label to change it.</span>
            )}
            <div className="tm-scroll">
              <svg width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} className="tm-svg" onClick={() => !connectFrom && setSel(null)}>
                <defs>
                  <marker id="tm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0 L10 5 L0 10 z" className="tm-arrowhead" />
                  </marker>
                </defs>
                {/* branches */}
                {nodes.map((n) =>
                  (kids.get(n.id) ?? []).map((c) => {
                    const a = pos.get(n.id)!;
                    const b = pos.get(c.id)!;
                    if (!a || !b) return null;
                    const x1 = a.x + NW / 2;
                    const y1 = a.y + NH;
                    const x2 = b.x + NW / 2;
                    const y2 = b.y;
                    return <path key={c.id} d={`M${x1} ${y1} C ${x1} ${y1 + GY / 2}, ${x2} ${y2 - GY / 2}, ${x2} ${y2}`} className="tm-branch" />;
                  }),
                )}
                {/* connections */}
                {links.map((l) => {
                  if (!pos.has(l.from_id) || !pos.has(l.to_id)) return null;
                  const A = centre(l.from_id);
                  const B = centre(l.to_id);
                  // Bow the line a little so it doesn't sit on top of a branch.
                  const mx = (A.x + B.x) / 2 + (B.y - A.y) * 0.18;
                  const my = (A.y + B.y) / 2 - (B.x - A.x) * 0.18;
                  const a = edge(A, mx, my);
                  const b = edge(B, mx, my);
                  const lx = (a.x + 2 * mx + b.x) / 4;
                  const ly = (a.y + 2 * my + b.y) / 4;
                  return (
                    <g key={l.id}>
                      <path
                        d={`M${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                        className="tm-link"
                        markerEnd={l.arrow !== "none" ? "url(#tm-arrow)" : undefined}
                        markerStart={l.arrow === "both" ? "url(#tm-arrow)" : undefined}
                      />
                      <g
                        className="tm-link-label"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSheet({ kind: "link", link: l, from: l.from_id, to: l.to_id });
                        }}
                      >
                        <rect x={lx - Math.max(14, (l.label?.length ?? 1) * 3.3 + 8)} y={ly - 10} width={Math.max(28, (l.label?.length ?? 1) * 6.6 + 16)} height={20} rx={10} />
                        <text x={lx} y={ly + 4} textAnchor="middle">
                          {l.label || "🔗"}
                        </text>
                      </g>
                    </g>
                  );
                })}
                {/* items */}
                {nodes.map((n) => {
                  const p = pos.get(n.id);
                  if (!p) return null;
                  const lines = wrap(n.title);
                  return (
                    <g
                      key={n.id}
                      className={`tm-node tm-st-${n.status}${sel === n.id ? " sel" : ""}${connectFrom === n.id ? " from" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        tapNode(n.id);
                      }}
                      role="button"
                      aria-label={`${n.title}, ${STATUS[n.status].label}`}
                    >
                      <rect x={p.x} y={p.y} width={NW} height={NH} rx={12} />
                      <text x={p.x + 10} y={p.y + (lines.length > 1 ? 21 : 30)}>
                        <tspan>{STATUS[n.status].icon} </tspan>
                        <tspan>{lines[0]}</tspan>
                        {lines[1] && (
                          <tspan x={p.x + 30} dy={16}>
                            {lines[1]}
                          </tspan>
                        )}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="row-between">
              <div className="row" style={{ gap: 4 }}>
                <button className="icon-btn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}>
                  −
                </button>
                <button className="icon-btn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}>
                  ＋
                </button>
              </div>
              <span className="small faint">
                {nodes.length} item{nodes.length === 1 ? "" : "s"} · {links.length} connection{links.length === 1 ? "" : "s"}
              </span>
            </div>
          </>
        )}
      </section>

      {sel && byId.get(sel) && !connectFrom && (
        <div className="tm-actions card">
          <strong className="grow small">
            {STATUS[byId.get(sel)!.status].icon} {byId.get(sel)!.title}
          </strong>
          <button className="btn btn-sm" onClick={() => setSheet({ kind: "node", node: null, parent: sel })}>
            ＋ Branch
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              setConnectFrom(sel);
              setSel(null);
            }}
          >
            🔗 Connect
          </button>
          <button className="btn btn-sm" onClick={() => setSheet({ kind: "node", node: byId.get(sel)!, parent: null })}>
            Edit
          </button>
        </div>
      )}

      {sheet?.kind === "node" && (
        <NodeSheet
          dog={dog}
          node={sheet.node}
          parent={sheet.parent ? byId.get(sheet.parent) ?? null : null}
          onClose={(newSel) => {
            setSheet(null);
            if (newSel !== undefined) setSel(newSel);
          }}
        />
      )}
      {sheet?.kind === "link" && <LinkSheet dog={dog} link={sheet.link} from={byId.get(sheet.from)} to={byId.get(sheet.to)} onClose={() => setSheet(null)} />}
    </div>
  );
}

function NodeSheet({ dog, node, parent, onClose }: { dog: string; node: Node | null; parent: Node | null; onClose: (sel?: string | null) => void }) {
  const { toast } = useApp();
  const [title, setTitle] = useState(node?.title ?? "");
  const [notes, setNotes] = useState(node?.notes ?? "");
  const [status, setStatus] = useState<Status>(node?.status ?? (parent ? "trying" : "idea"));
  const db = supabaseBrowser();
  async function save() {
    if (!title.trim()) return toast("Give it a name");
    const row = { title: title.trim(), notes: notes.trim() || null, status };
    if (node) {
      const { error } = await db.from("training_nodes").update(row).eq("id", node.id);
      if (error) return toast(error.message);
      refreshAll();
      return onClose();
    }
    const { data, error } = await db
      .from("training_nodes")
      .insert({ ...row, dog, parent_id: parent?.id ?? null })
      .select("id")
      .single();
    if (error) return toast(error.message);
    refreshAll();
    onClose(data.id);
  }
  return (
    <Sheet title={node ? "Edit" : parent ? `Branch off “${parent.title}”` : "New starting point"} onClose={() => onClose()}>
      <div className="stack">
        <label className="field">
          <span>{parent ? "What you're trying / the next step" : "Concept or goal"}</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!node} placeholder={parent ? "e.g. 2-second stand-still on tension" : "e.g. loose-leash walking"} />
        </label>
        <div className="field">
          <span>How it&apos;s going</span>
          <div className="chips">
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <button key={s} className={`chip chip-sm tm-st-${s}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
                {STATUS[s].icon} {STATUS[s].label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Notes</span>
          <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="what you did, what happened, what to tweak" />
        </label>
        <button className="btn btn-primary btn-block" onClick={save}>
          Save
        </button>
        {node && (
          <button
            className="btn-link small faint"
            onClick={async () => {
              const { error } = await db.from("training_nodes").delete().eq("id", node.id);
              if (error) return toast(error.message);
              refreshAll();
              onClose(null);
            }}
          >
            delete (its branches stay, moved to the top)
          </button>
        )}
      </div>
    </Sheet>
  );
}

function LinkSheet({ dog, link, from, to, onClose }: { dog: string; link: Link | null; from?: Node; to?: Node; onClose: () => void }) {
  const { toast } = useApp();
  const [label, setLabel] = useState(link?.label ?? "");
  const [arrow, setArrow] = useState<Link["arrow"]>(link?.arrow ?? "forward");
  const [flip, setFlip] = useState(false);
  const db = supabaseBrowser();
  const a = flip ? to : from;
  const b = flip ? from : to;
  if (!a || !b) return null;
  async function save() {
    const row = { label: label.trim() || null, arrow, from_id: a!.id, to_id: b!.id };
    const { error } = link ? await db.from("training_links").update(row).eq("id", link.id) : await db.from("training_links").insert({ ...row, dog });
    if (error) return toast(error.message);
    refreshAll();
    onClose();
  }
  return (
    <Sheet title={link ? "Connection" : "Connect"} onClose={onClose}>
      <div className="stack">
        <div className="tm-pair">
          <span>{a.title}</span>
          <span className="tm-pair-arrow">{arrow === "both" ? "↔" : arrow === "forward" ? "→" : "—"}</span>
          <span>{b.title}</span>
        </div>
        <label className="field">
          <span>Label (optional)</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="led to, replaced, helps with, didn't help…" autoFocus={!link} />
        </label>
        <div className="chips">
          {["led to", "replaced", "helps with", "didn't help", "needs first"].map((s) => (
            <button key={s} className="chip chip-sm" onClick={() => setLabel(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="field">
          <span>Arrow</span>
          <div className="seg seg-sm" role="group" aria-label="Arrow">
            <button aria-pressed={arrow === "none"} onClick={() => setArrow("none")}>
              — none
            </button>
            <button aria-pressed={arrow === "forward"} onClick={() => setArrow("forward")}>
              → one way
            </button>
            <button aria-pressed={arrow === "both"} onClick={() => setArrow("both")}>
              ↔ both
            </button>
          </div>
        </div>
        {arrow === "forward" && (
          <button className="btn btn-sm btn-ghost" onClick={() => setFlip((x) => !x)}>
            ⇄ Flip direction
          </button>
        )}
        <button className="btn btn-primary btn-block" onClick={save}>
          Save
        </button>
        {link && (
          <button
            className="btn-link small faint"
            onClick={async () => {
              const { error } = await db.from("training_links").delete().eq("id", link.id);
              if (error) return toast(error.message);
              refreshAll();
              onClose();
            }}
          >
            remove connection
          </button>
        )}
      </div>
    </Sheet>
  );
}
