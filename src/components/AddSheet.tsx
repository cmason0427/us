"use client";

import { useState, type ReactNode } from "react";
import { useApp, type AddKind } from "./AppProvider";
import { Sheet } from "./Sheet";
import { PostComposer } from "./PostComposer";
import { EventForm } from "./EventForm";
import { ActivityForm, TaskForm } from "./QuickForms";
import { DogPic, type ArtName } from "./DogPic";
import { StarForm } from "./StarForm";
import { MealForm, PlaceForm } from "./FoodForms";
import { ActivityBatch, MealBatch, PlaceBatch } from "./Batches";
import { ShopItemForm } from "./Shopping";
import { MealStart } from "./MealThread";
import { VibeAsk } from "./Vibe";

type Entry = { kind: AddKind; emoji: string; label: string; art?: ArtName };

// Grouped so it stays scannable as it grows. New things to add go here.
const GROUPS: { title: string; items: Entry[] }[] = [
  {
    title: "Us",
    items: [
      { kind: "post", emoji: "🌼", label: "Update" },
      { kind: "star", emoji: "⭐", label: "Send a star" },
      { kind: "vibe", emoji: "💭", label: "Vibe check" },
      { kind: "event", emoji: "📅", label: "Event" },
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
      { kind: "shop", emoji: "🛒", label: "Shopping item" },
      { kind: "activity", emoji: "✨", label: "Activity idea" },
    ],
  },
  {
    title: "The dogs",
    items: [{ kind: "dog-note", emoji: "🐾", label: "Dog note", art: "kodo_wiley_face" }],
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
                    {m.art ? <DogPic name={m.art} size={34} /> : <span className="tile-emoji">{m.emoji}</span>}
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
      {addOpen === "shop" && <ShopItemForm onDone={closeAdd} />}
      {addOpen === "activity" && <OneOrMany one={<ActivityForm onDone={closeAdd} />} many={<ActivityBatch onDone={closeAdd} />} />}
      {addOpen === "meal" && <OneOrMany one={<MealForm onDone={closeAdd} />} many={<MealBatch onDone={closeAdd} />} />}
      {addOpen === "meal-suggest" && <MealStart onDone={closeAdd} />}
      {addOpen === "vibe" && <VibeAsk onDone={closeAdd} />}
      {addOpen === "place" && <OneOrMany one={<PlaceForm onDone={closeAdd} />} many={<PlaceBatch onDone={closeAdd} />} />}
    </Sheet>
  );
}
