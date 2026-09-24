"use client";

import { useEffect, useRef, useState } from "react";

const OUT = 512; // saved size, px
const MAX_ZOOM = 4;

/**
 * Fit a photo into a square before it becomes a profile pic: drag to move it,
 * slide to zoom. "Use it" saves exactly what's inside the frame (512×512).
 */
export function SquareCrop({ file, onDone, onCancel }: { file: File; onDone: (blob: Blob) => void; onCancel: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<{ el: HTMLImageElement; w: number; h: number; url: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 }); // image offset from centered, in frame px
  const [size, setSize] = useState(280);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => setImg({ el, w: el.naturalWidth, h: el.naturalHeight, url });
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const measure = () => frame.current && setSize(frame.current.clientWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [img]);

  if (!img) return <p className="muted">Loading…</p>;

  // "cover" scale fills the square; zoom multiplies it.
  const scale = Math.max(size / img.w, size / img.h) * zoom;
  const dw = img.w * scale;
  const dh = img.h * scale;
  // Keep the photo covering the frame: offsets can't reveal an edge.
  const clamp = (o: { x: number; y: number }) => ({
    x: Math.max(Math.min(o.x, (dw - size) / 2), -(dw - size) / 2),
    y: Math.max(Math.min(o.y, (dh - size) / 2), -(dh - size) / 2),
  });
  const pos = clamp(off);

  function save() {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    // Frame's top-left in image coordinates.
    const left = (dw - size) / 2 - pos.x;
    const top = (dh - size) / 2 - pos.y;
    const k = OUT / size;
    canvas.getContext("2d")!.drawImage(img.el, -left * k, -top * k, dw * k, dh * k);
    canvas.toBlob((b) => b && onDone(b), "image/jpeg", 0.88);
  }

  return (
    <div className="stack">
      <div
        ref={frame}
        className="crop-frame"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setOff(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.url}
          alt=""
          draggable={false}
          style={{ width: dw, height: dh, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
        />
        <span className="crop-ring" aria-hidden />
      </div>
      <label className="field">
        <span>Zoom</span>
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
      </label>
      <p className="small muted">Drag to move it. The circle is how it&apos;ll look.</p>
      <div className="row-between">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save}>
          Use it
        </button>
      </div>
    </div>
  );
}
