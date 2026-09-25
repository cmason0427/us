"use client";

import { useState } from "react";
import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { Wavy } from "@/components/Art";
import { Sheet } from "@/components/Sheet";
import { EventPresetForm, useTemplates, type EventTemplate } from "@/components/EventForm";
import { TaskPresetForm, presetLabel, useTaskPresets, type TaskPreset } from "@/components/TaskForm";
import { ColorNamer, Swatch } from "@/components/CalendarColors";
import { EVENT_TYPE_LABEL } from "@/lib/types";

const lengthText = (t: EventTemplate) =>
  t.all_day ? "All day" : t.duration_minutes ? (t.duration_minutes % 60 ? `${t.duration_minutes} min` : `${t.duration_minutes / 60} hr`) : "";

/** Every preset in one place: tap to edit, or add a new one. */
export default function PresetsPage() {
  const events = useTemplates();
  const tasks = useTaskPresets();
  const [editEvent, setEditEvent] = useState<EventTemplate | "new" | null>(null);
  const [editTask, setEditTask] = useState<TaskPreset | "new" | null>(null);
  const [naming, setNaming] = useState(false);

  return (
    <main className="page">
      <PageHead eyebrow="One-tap shortcuts" title="Presets" art={<Sticker name="wiley_back" size={80} tilt={3} />} />
      <Wavy />

      <div className="row-between">
        <div className="section-title">Calendar</div>
        <button className="btn btn-sm" onClick={() => setEditEvent("new")}>
          + New
        </button>
      </div>
      {events.length === 0 ? (
        <p className="small muted">None yet. Make one here, or add an event and tap “Save as a default”.</p>
      ) : (
        <div className="card" style={{ padding: "2px 12px" }}>
          {events.map((t) => (
            <button key={t.id} className="task task-edit preset-row" onClick={() => setEditEvent(t)}>
              <span className="grow">
                <strong>
                  {t.emoji ? `${t.emoji} ` : ""}
                  {t.name}
                </strong>
                <span className="small muted" style={{ display: "block" }}>
                  {[EVENT_TYPE_LABEL[t.type], lengthText(t), t.location].filter(Boolean).join(" · ")}
                </span>
              </span>
              {t.color && <Swatch color={t.color} size={14} />}
              <span aria-hidden>›</span>
            </button>
          ))}
        </div>
      )}
      <button className="btn-link small" style={{ marginTop: 8 }} onClick={() => setNaming((n) => !n)}>
        {naming ? "Done naming colors" : "Name the calendar colors"}
      </button>
      {naming && (
        <div style={{ marginTop: 8 }}>
          <ColorNamer />
        </div>
      )}

      <div className="row-between" style={{ marginTop: 18 }}>
        <div className="section-title">To-dos</div>
        <button className="btn btn-sm" onClick={() => setEditTask("new")}>
          + New
        </button>
      </div>
      {tasks.length === 0 ? (
        <p className="small muted">None yet. “Feed breakfast” for both dogs is a good first one.</p>
      ) : (
        <div className="card" style={{ padding: "2px 12px" }}>
          {tasks.map((t) => (
            <button key={t.id} className="task task-edit preset-row" onClick={() => setEditTask(t)}>
              <span className="grow">
                <strong>{presetLabel(t)}</strong>
                <span className="small muted" style={{ display: "block" }}>
                  {t.list_type === "dogs" ? "Dog to-dos" : "Ours"}
                  {t.urgency !== "low" ? ` · ${t.urgency}` : ""}
                </span>
              </span>
              <span aria-hidden>›</span>
            </button>
          ))}
        </div>
      )}

      {editEvent && (
        <Sheet title={editEvent === "new" ? "New calendar preset" : `Edit ${editEvent.name}`} onClose={() => setEditEvent(null)}>
          <EventPresetForm initial={editEvent === "new" ? undefined : editEvent} onDone={() => setEditEvent(null)} />
        </Sheet>
      )}
      {editTask && (
        <Sheet title={editTask === "new" ? "New to-do preset" : "Edit preset"} onClose={() => setEditTask(null)}>
          <TaskPresetForm initial={editTask === "new" ? undefined : editTask} onDone={() => setEditTask(null)} />
        </Sheet>
      )}
    </main>
  );
}
