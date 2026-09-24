"use client";

import { useApp, type AddKind } from "./AppProvider";
import { Sheet } from "./Sheet";
import { PostComposer } from "./PostComposer";
import { EventForm } from "./EventForm";
import { ActivityForm, TaskForm } from "./QuickForms";

const MENU: { kind: AddKind; emoji: string; label: string }[] = [
  { kind: "post", emoji: "🌼", label: "Update" },
  { kind: "event", emoji: "📅", label: "Event" },
  { kind: "dog-note", emoji: "🐾", label: "Dog note" },
  { kind: "dog-task", emoji: "🦴", label: "Dog to-do" },
  { kind: "task", emoji: "✅", label: "To-do" },
  { kind: "household", emoji: "🧺", label: "Household" },
  { kind: "activity", emoji: "✨", label: "Activity idea" },
];

const TITLES: Record<AddKind, string> = {
  post: "A little update",
  event: "New plan",
  "dog-note": "Dog note",
  "dog-task": "Dog to-do",
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
      {addOpen === "dog-note" && <PostComposer dogNote onDone={closeAdd} />}
      {addOpen === "task" && <TaskForm listType="shared" onDone={closeAdd} />}
      {addOpen === "household" && <TaskForm listType="household" onDone={closeAdd} />}
      {addOpen === "dog-task" && <TaskForm listType="dogs" onDone={closeAdd} />}
      {addOpen === "activity" && <ActivityForm onDone={closeAdd} />}
    </Sheet>
  );
}
