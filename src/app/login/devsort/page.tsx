"use client";
import { useState } from "react";
import { Sortable } from "@/components/Sortable";
type Row = { id: string; kind: "cat" | "item"; name: string };
export default function Dev() {
  const [rows, setRows] = useState<Row[]>([
    { id: "cat:a", kind: "cat", name: "Dogs" },
    { id: "i1", kind: "item", name: "Dog food" },
    { id: "i2", kind: "item", name: "Treats" },
    { id: "cat:", kind: "cat", name: "No category · drag things here" },
  ]);
  return (
    <main className="page">
      <div className="card" style={{ padding: "2px 12px" }}>
        <Sortable
          items={rows}
          getId={(r) => r.id}
          onReorder={(ids) => { console.log("ORDER", ids.join(",")); setRows(ids.map((id) => rows.find((r) => r.id === id)!)); }}
          render={(r, handle) => r.kind === "cat" ? <div className="section-title shop-cat">{r.name}</div> : <div className="task shop-row"><span className="grow">{r.name}</span>{handle}</div>}
        />
      </div>
    </main>
  );
}
