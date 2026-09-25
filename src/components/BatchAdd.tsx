"use client";

import { useState } from "react";

/** One column of the "spreadsheet": a set of chips to pick from. */
export interface BatchColumn {
  key: string;
  label: string;
  /** Chips to pick from; leave empty with `text` for a free-text field. */
  options: { v: string; label: string }[];
  /** A text field instead of chips (placeholder shown). */
  text?: string;
  /** Required columns always have a value (start on `initial`); others can be left blank. */
  required?: boolean;
  initial?: string | null;
  /** Several values instead of one (e.g. service: drive-thru + takeout). */
  multi?: boolean;
}

export type BatchValue = string | string[] | null;
export interface BatchRow {
  name: string;
  values: Record<string, BatchValue>;
}

const blankValues = (cols: BatchColumn[]) => Object.fromEntries(cols.map((c) => [c.key, c.multi ? [] : (c.initial ?? null)]));
// Text columns are per line (ingredients differ); chip columns carry over to the next line.
const carryOver = (cols: BatchColumn[], v: Record<string, BatchValue>) => Object.fromEntries(cols.map((c) => [c.key, c.text !== undefined ? null : v[c.key]]));

/**
 * Add a bunch at once, like a spreadsheet laid out as a form: each line gets a
 * name and its options, "+ Another" starts the next line (copying the last
 * line's options, since lists tend to be similar), then "Add all".
 */
export function BatchAdd({
  columns,
  placeholder,
  onSave,
  noun = "items",
}: {
  columns: BatchColumn[];
  placeholder: string;
  onSave: (rows: BatchRow[]) => Promise<string | null>;
  noun?: string;
}) {
  const [rows, setRows] = useState<BatchRow[]>([{ name: "", values: blankValues(columns) }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = rows.filter((r) => r.name.trim());

  const update = (i: number, patch: Partial<BatchRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setValue = (i: number, col: BatchColumn, v: string) =>
    setRows((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const cur = r.values[col.key];
        let next: BatchValue;
        if (col.multi) {
          const list = Array.isArray(cur) ? cur : [];
          next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
        } else {
          next = cur === v && !col.required ? null : v;
        }
        return { ...r, values: { ...r.values, [col.key]: next } };
      }),
    );

  const addLine = () => setRows((rs) => [...rs, { name: "", values: rs.length ? carryOver(columns, rs[rs.length - 1].values) : blankValues(columns) }]);

  async function save() {
    setBusy(true);
    setError(null);
    const err = await onSave(ready.map((r) => ({ ...r, name: r.name.trim() })));
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="stack">
      {rows.map((r, i) => (
        <div key={i} className="batch-row stack-sm">
          <div className="row">
            <span className="batch-num">{i + 1}</span>
            <input
              className="input grow"
              value={r.name}
              onChange={(e) => update(i, { name: e.target.value })}
              onKeyDown={(e) => {
                // Enter on the last line starts the next one, so a list is type, enter, type, enter.
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (i === rows.length - 1 && r.name.trim()) addLine();
              }}
              enterKeyHint="next"
              placeholder={placeholder}
              aria-label={`Name ${i + 1}`}
              autoFocus={i === rows.length - 1 && i > 0}
            />
            {rows.length > 1 && (
              <button type="button" className="icon-btn" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>
                ×
              </button>
            )}
          </div>
          {columns.map((c) => {
            const cur = r.values[c.key];
            if (c.text !== undefined)
              return (
                <label key={c.key} className="batch-field">
                  <span className="small muted">{c.label}</span>
                  <input
                    className="input"
                    value={typeof cur === "string" ? cur : ""}
                    onChange={(e) => setRows((rs) => rs.map((row, j) => (j === i ? { ...row, values: { ...row.values, [c.key]: e.target.value } } : row)))}
                    placeholder={c.text}
                  />
                </label>
              );
            return (
              <div key={c.key} className="batch-field">
                <span className="small muted">{c.label}</span>
                <div className="chips">
                  {c.options.map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      className="chip chip-sm"
                      aria-pressed={Array.isArray(cur) ? cur.includes(o.v) : cur === o.v}
                      onClick={() => setValue(i, c, o.v)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <button
        type="button"
        className="btn btn-block"
        onClick={addLine}
      >
        + Another line
      </button>
      {error && <p className="error">{error}</p>}
      <button type="button" className="btn btn-primary btn-block" disabled={busy || !ready.length} onClick={save}>
        {busy ? "Adding…" : `Add all (${ready.length} ${noun})`}
      </button>
    </div>
  );
}
