"use client";

import { useApp, type AddKind } from "./AppProvider";
import { Sheet } from "./Sheet";
import { PostComposer } from "./PostComposer";
import { EventForm } from "./EventForm";
import { ActivityForm, KodoNoteForm, PottyForm, TaskForm } from "./QuickForms";

const MENU: { kind: AddKind; emoji: string; label: string }[] = [
  { kind: "post", emoji: "🌼", label: "Update" },
  { kind: "event", emoji: "📅", label: "Event" },
  { kind: "potty", emoji: "🐾", label: "Kodo potty" },
  { kind: "kodo-note", emoji: "📝", label: "Kodo note" },
  { kind: "task", emoji: "✅", label: "To-do" },
  { kind: "household", emoji: "🧺", label: "Household" },
  { kind: "activity", emoji: "✨", label: "Activity idea" },
];

const TITLES: Record<AddKind, string> = {
  post: "A little update",
  event: "New plan",
  potty: "Kodo went!",
  "kodo-note": "Kodo note",
  task: "To-do",
  household: "Household thing",
  activity: "Activity idea",
};

/** The fast-entry sheet behind the + button. Anything, in two taps. */
export function AddSheet() {
  const { addOpen, openAdd, closeAdd } = useApp();
  if (!addOpen) return null;

  if (addOpen === "menu") {
    return (
      <Sheet title="Add something" onClose={closeAdd}>
        <div className="add-grid">
          {MENU.map((m) => (
            <button key={m.kind} className="tile" onClick={() => openAdd(m.kind)}>
              <span className="tile-emoji">{m.emoji}</span>
              {m.label}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={TITLES[addOpen]} onClose={closeAdd}>
      {addOpen === "post" && <PostComposer onDone={closeAdd} />}
      {addOpen === "event" && <EventForm onDone={closeAdd} />}
      {addOpen === "potty" && <PottyForm onDone={closeAdd} />}
      {addOpen === "kodo-note" && <KodoNoteForm onDone={closeAdd} />}
      {addOpen === "task" && <TaskForm listType="shared" onDone={closeAdd} />}
      {addOpen === "household" && <TaskForm listType="household" onDone={closeAdd} />}
      {addOpen === "activity" && <ActivityForm onDone={closeAdd} />}
    </Sheet>
  );
}
