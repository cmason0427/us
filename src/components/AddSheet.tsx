"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useApp, type AddKind } from "./AppProvider";
import { Sheet } from "./Sheet";
import { PostComposer } from "./PostComposer";
import { NewThread } from "./Threads";
import { OneOffForm, SpendForm } from "./Budget";
import { EventForm, EventPresetForm } from "./EventForm";
import { ActivityForm, TaskForm } from "./QuickForms";
import { type StickerName } from "./Sticker";
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
      { kind: "post", emoji: "🌼", label: "Update" },
      { kind: "star", emoji: "⭐", label: "Star" },
      { kind: "vibe", emoji: "💭", label: "Vibe check" },
      { kind: "status", emoji: "🚗", label: "On my way" },
      { kind: "thread", emoji: "🗒️", label: "Board" },
      { kind: "deck-update", emoji: "🃏", label: "Deck update" },
    ],
  },
  {
    title: "Calendar",
    items: [
      { kind: "event", emoji: "📅", label: "Event" },
      { kind: "requests", emoji: "💌", label: "Requests" },
      { kind: "event-preset", emoji: "📌", label: "Presets" },
    ],
  },
  {
    title: "Food",
    items: [
      { kind: "meal-suggest", emoji: "🍽️", label: "Suggest a meal" },
      { kind: "meal", emoji: "🍳", label: "Home meal" },
      { kind: "place", emoji: "📍", label: "Place" },
    ],
  },
  {
    title: "Lists",
    items: [
      { kind: "task", emoji: "✅", label: "To-do" },
      { kind: "shop", emoji: "🛒", label: "Shopping" },
      { kind: "activity", emoji: "✨", label: "Activity idea" },
      { kind: "goal", emoji: "🎯", label: "Savings goal" },
    ],
  },
  {
    title: "Dogs",
    items: [
      { kind: "dog-note", emoji: "🐾", label: "Dog note" },
      { kind: "dog-task", emoji: "🦴", label: "Dog to-do" },
      { kind: "dog-preset", emoji: "📌", label: "Dog preset" },
    ],
  },
  {
    title: "Money · just you",
    items: [
      { kind: "spend", emoji: "💸", label: "I spent" },
      { kind: "oneoff", emoji: "⚡", label: "Extra money / surprise bill" },
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
  "deck-update": "Deck update",
  thread: "New board",
  oneoff: "Something extra (just you)",
  spend: "I spent money (just you)",
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
      <Sheet title="Add" onClose={closeAdd}>
        <div className="add-menu">
          {GROUPS.map((g) => (
            <section key={g.title} className="add-group">
              <h3 className="add-group-title">{g.title}</h3>
              <div className="add-pills">
                {g.items.map((m) => (
                  <button key={m.kind} className="add-pill" onClick={() => openAdd(m.kind)}>
                    <span aria-hidden>{m.emoji}</span>
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
      {addOpen === "deck-update" && <PostComposer deckId="pick" onDone={closeAdd} />}
      {addOpen === "thread" && <NewThread bare onDone={closeAdd} />}
      {addOpen === "spend" && <SpendForm onDone={closeAdd} />}
      {addOpen === "oneoff" && <OneOffForm onDone={closeAdd} />}
      {addOpen === "oneoff" && <OneOffForm onDone={closeAdd} />}
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
