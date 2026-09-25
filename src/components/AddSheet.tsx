"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useApp, type AddKind } from "./AppProvider";
import { Sheet } from "./Sheet";
import { PostComposer } from "./PostComposer";
import { EventForm, EventPresetForm } from "./EventForm";
import { ActivityForm, TaskForm } from "./QuickForms";
import { Sticker, type StickerName } from "./Sticker";
import { StarForm } from "./StarForm";
import { MealForm, PlaceForm } from "./FoodForms";
import { ActivityBatch, MealBatch, PlaceBatch } from "./Batches";
import { ShopAdd } from "./Shopping";
import { RequestsList } from "./Requests";
import { GoalForm } from "./Goals";
import { StatusPicker } from "./Status";
import { TaskPresetForm } from "./TaskForm";
import { MealStart } from "./MealThread";
import { VibeAsk } from "./Vibe";

type Entry = { kind: AddKind; emoji: string; label: string; art?: StickerName };

// Grouped so it stays scannable as it grows. New things to add go here.
const GROUPS: { title: string; items: Entry[] }[] = [
  {
    title: "Us",
    items: [
      { kind: "post", emoji: "🌼", label: "Update", art: "wiley_face" },
      { kind: "star", emoji: "⭐", label: "Send a star" },
      { kind: "vibe", emoji: "💭", label: "Vibe check" },
      { kind: "status", emoji: "🚗", label: "On my way" },
    ],
  },
  {
    title: "Calendar",
    items: [
      { kind: "event", emoji: "📅", label: "Event" },
      { kind: "requests", emoji: "💌", label: "Requests" },
      { kind: "event-preset", emoji: "☆", label: "Presets" },
    ],
  },
  {
    title: "Food",
    items: [
      { kind: "meal-suggest", emoji: "🍽️", label: "Meal suggestion" },
      { kind: "meal", emoji: "🍳", label: "Home meal" },
      { kind: "place", emoji: "📍", label: "Place to eat" },
    ],
  },
  {
    title: "Lists",
    items: [
      { kind: "task", emoji: "✅", label: "To-do" },
      { kind: "shop", emoji: "🛒", label: "Shopping" },
      { kind: "activity", emoji: "✨", label: "Activity idea", art: "kodo_walk" },
      { kind: "goal", emoji: "💰", label: "Savings goal" },
    ],
  },
  {
    title: "The dogs",
    items: [
      { kind: "dog-note", emoji: "🐾", label: "Dog note", art: "duo_faces" },
      { kind: "dog-task", emoji: "🦴", label: "Dog to-do", art: "kodo_sleep" },
      { kind: "dog-preset", emoji: "☆", label: "New dog preset", art: "wiley_down" },
    ],
  },
];

const TITLES: Record<AddKind, string> = {
  post: "A little update",
  event: "New plan",
  "dog-note": "Dog note",
  star: "Send a star",
  "dog-task": "Dog to-do",
  task: "To-do",
  household: "Household thing",
  activity: "Activity idea",
  meal: "Home meal",
  place: "Place to eat",
  shop: "Shopping list",
  "meal-suggest": "Suggest a meal",
  requests: "Requests",
  "event-preset": "New calendar preset",
  "dog-preset": "New dog preset",
  goal: "New goal",
  status: "Heads-up",
  little: "Little things",
  vibe: "Vibe check",
};

/** "Just one" or "Add several" for things that come in batches. */
function OneOrMany({ one, many }: { one: ReactNode; many: ReactNode }) {
  const [several, setSeveral] = useState(false);
  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="How many">
        <button type="button" aria-pressed={!several} onClick={() => setSeveral(false)}>
          Just one
        </button>
        <button type="button" aria-pressed={several} onClick={() => setSeveral(true)}>
          Add several
        </button>
      </div>
      {several ? many : one}
    </div>
  );
}

/** The fast-entry sheet behind the + button. Anything, in two taps. */
export function AddSheet() {
  const { addOpen, openAdd, closeAdd } = useApp();
  if (!addOpen) return null;

  if (addOpen === "menu") {
    return (
      <Sheet title="Add something" onClose={closeAdd}>
        <div className="stack">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <div className="small muted" style={{ fontWeight: 650, marginBottom: 6 }}>
                {g.title}
              </div>
              <div className="add-grid">
                {g.items.map((m) => (
                  <button key={m.kind} className="tile" onClick={() => openAdd(m.kind)}>
                    {m.art ? <Sticker name={m.art} size={48} /> : <span className="tile-emoji">{m.emoji}</span>}
                    {m.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={TITLES[addOpen]} onClose={closeAdd}>
      {addOpen === "post" && <PostComposer onDone={closeAdd} />}
      {addOpen === "event" && <EventForm onDone={closeAdd} />}
      {addOpen === "star" && <StarForm onDone={closeAdd} />}
      {addOpen === "dog-note" && <PostComposer dogNote onDone={closeAdd} />}
      {addOpen === "task" && <TaskForm listType="shared" onDone={closeAdd} />}
      {addOpen === "household" && <TaskForm listType="household" onDone={closeAdd} />}
      {addOpen === "dog-task" && <TaskForm listType="dogs" onDone={closeAdd} />}
      {addOpen === "shop" && <ShopAdd onDone={closeAdd} />}
      {addOpen === "status" && <StatusPicker onDone={closeAdd} />}
      {addOpen === "goal" && <GoalForm onDone={closeAdd} />}
      {addOpen === "requests" && <RequestsList onDone={closeAdd} />}
      {addOpen === "event-preset" && (
        <div className="stack">
          <Link href="/presets" className="btn btn-block" onClick={closeAdd}>
            See and edit all presets
          </Link>
          <EventPresetForm onDone={closeAdd} />
        </div>
      )}
      {addOpen === "dog-preset" && <TaskPresetForm listType="dogs" onDone={closeAdd} />}
      {addOpen === "activity" && <OneOrMany one={<ActivityForm onDone={closeAdd} />} many={<ActivityBatch onDone={closeAdd} />} />}
      {addOpen === "meal" && <OneOrMany one={<MealForm onDone={closeAdd} />} many={<MealBatch onDone={closeAdd} />} />}
      {addOpen === "meal-suggest" && <MealStart onDone={closeAdd} />}
      {addOpen === "vibe" && <VibeAsk onDone={closeAdd} />}
      {addOpen === "place" && <OneOrMany one={<PlaceForm onDone={closeAdd} />} many={<PlaceBatch onDone={closeAdd} />} />}
    </Sheet>
  );
}
