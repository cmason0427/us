import type { ReactNode } from "react";
import { linkify } from "@/components/Links";

// A tiny, safe formatter for sticky notes (no HTML is ever injected):
//   # Heading          ## Smaller heading
//   - bullet           [ ] to do / [x] done (tap to tick)
//   **bold**  *italic*      [label](/path) = a link to something in the app

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...linkify(text.slice(last, m.index), `${key}-a${n}`));
    const t = m[0];
    out.push(t.startsWith("**") ? <strong key={`${key}-${n++}`}>{t.slice(2, -2)}</strong> : <em key={`${key}-${n++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(...linkify(text.slice(last), `${key}-z`));
  return out;
}

export function renderMini(text: string): ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const k = `l${i}`;
    if (/^#\s/.test(line)) return <div key={k} className="md-h1"><span className="md-hl">{inline(line.slice(2), k)}</span></div>;
    if (/^##\s/.test(line)) return <div key={k} className="md-h2"><span className="md-hl">{inline(line.slice(3), k)}</span></div>;
    const box = /^\[( |x|X)\]\s?(.*)$/.exec(line);
    if (box)
      return (
        <div key={k} className={`md-check${box[1] !== " " ? " done" : ""}`}>
          <span className="md-box" data-check={i} aria-label={box[1] !== " " ? "Done" : "Not done"}>
            {box[1] !== " " ? "✓" : ""}
          </span>
          <span>{inline(box[2], k)}</span>
        </div>
      );
    if (/^[-•]\s/.test(line)) return <div key={k} className="md-li">{inline(line.slice(2), k)}</div>;
    if (!line.trim()) return <div key={k} className="md-gap" />;
    return (
      <div key={k}>
        <span className="md-hl">{inline(line, k)}</span>
      </div>
    );
  });
}

/** Tick or untick the checkbox on line `i`. */
export function toggleCheck(text: string, i: number) {
  const lines = text.split("\n");
  const l = lines[i] ?? "";
  lines[i] = /^\[ \]/.test(l) ? l.replace(/^\[ \]/, "[x]") : l.replace(/^\[(x|X)\]/, "[ ]");
  return lines.join("\n");
}

/** Toolbar helpers for the editor: toggle a line prefix, or wrap the selection. */
export function applyFormat(el: HTMLTextAreaElement, kind: "h1" | "h2" | "li" | "check" | "b" | "i") {
  const v = el.value;
  const s = el.selectionStart;
  const e = el.selectionEnd;
  let next = v;
  let cs = s;
  let ce = e;
  if (kind === "b" || kind === "i") {
    const mark = kind === "b" ? "**" : "*";
    const mid = v.slice(s, e) || (kind === "b" ? "bold" : "italic");
    next = v.slice(0, s) + mark + mid + mark + v.slice(e);
    cs = s + mark.length;
    ce = cs + mid.length;
  } else {
    const prefix = { h1: "# ", h2: "## ", li: "- ", check: "[ ] " }[kind];
    const ls = v.lastIndexOf("\n", s - 1) + 1;
    const line = v.slice(ls);
    // Replace any existing prefix; toggling the same one removes it.
    const cur = /^(#\s|##\s|[-•]\s|\[( |x|X)\]\s?)/.exec(line)?.[0] ?? "";
    const add = cur === prefix ? "" : prefix;
    next = v.slice(0, ls) + add + v.slice(ls + cur.length);
    cs = ce = s + add.length - cur.length;
  }
  el.value = next;
  el.focus();
  el.setSelectionRange(Math.max(0, cs), Math.max(0, ce));
}
