"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * A vertical list you can reorder by dragging each row's ⠿ handle (touch or
 * mouse). Only the handle starts a drag, so scrolling the page still works.
 * `onReorder` gets the ids in their new order once you let go.
 */
export function Sortable<T>({
  items,
  getId,
  render,
  onReorder,
}: {
  items: T[];
  getId: (item: T) => string;
  render: (item: T, handle: ReactNode) => ReactNode;
  onReorder: (ids: string[]) => void;
}) {
  const rows = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<{ id: string; startY: number; startScroll: number; dy: number; over: number; h: number } | null>(null);
  const ids = items.map(getId);

  // Where the dragged row would land: compare its middle to the others' middles,
  // using layout positions (offsetTop), which ignore the shifting transforms.
  function targetIndex(id: string, dy: number) {
    const el = rows.current.get(id);
    if (!el) return ids.indexOf(id);
    const mid = el.offsetTop + el.offsetHeight / 2 + dy;
    let idx = 0;
    for (const other of ids) {
      if (other === id) continue;
      const o = rows.current.get(other);
      if (o && mid > o.offsetTop + o.offsetHeight / 2) idx++;
    }
    return idx;
  }

  function onDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, startY: e.clientY, startScroll: window.scrollY, dy: 0, over: ids.indexOf(id), h: rows.current.get(id)?.offsetHeight ?? 0 });
  }
  function onMove(e: React.PointerEvent) {
    if (!drag) return;
    // Near the top or bottom of the screen, scroll so far-off spots are reachable.
    const edge = 90;
    if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 14);
    else if (e.clientY < edge) window.scrollBy(0, -14);
    const dy = e.clientY - drag.startY + (window.scrollY - drag.startScroll);
    setDrag({ ...drag, dy, over: targetIndex(drag.id, dy) });
  }
  function onUp() {
    if (!drag) return;
    const from = ids.indexOf(drag.id);
    if (drag.over !== from) {
      const next = ids.filter((x) => x !== drag.id);
      next.splice(drag.over, 0, drag.id);
      onReorder(next);
    }
    setDrag(null);
  }

  // While dragging, rows between the old and new spot shift to make room.
  const from = drag ? ids.indexOf(drag.id) : -1;
  const draggedH = drag?.h ?? 0;
  const shiftFor = (i: number) => {
    if (!drag || i === from) return 0;
    if (from < drag.over && i > from && i <= drag.over) return -draggedH;
    if (from > drag.over && i >= drag.over && i < from) return draggedH;
    return 0;
  };

  return (
    <div className="sortable">
      {items.map((item, i) => {
        const id = getId(item);
        const dragging = drag?.id === id;
        const handle = (
          <span
            className="drag-handle"
            role="button"
            aria-label="Drag to reorder"
            onPointerDown={(e) => onDown(e, id)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDrag(null)}
          >
            ⠿
          </span>
        );
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) rows.current.set(id, el);
              else rows.current.delete(id);
            }}
            className={`sortable-row${dragging ? " dragging" : ""}`}
            style={{ transform: `translateY(${dragging ? drag!.dy : shiftFor(i)}px)` }}
          >
            {render(item, handle)}
          </div>
        );
      })}
    </div>
  );
}
