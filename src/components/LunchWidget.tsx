"use client";

import { useState } from "react";
import { format } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { celebrate } from "@/lib/celebrate";
import { describeFilters, type FoodFilters } from "@/lib/food";
import { useMeals, usePlaces } from "@/lib/foodData";
import { WORK_OWNER, needsTakeout, type LunchMsg, type LunchPlace, type LunchRef } from "@/lib/lunch";
import { useApp } from "./AppProvider";
import { Sheet } from "./Sheet";
import { FoodFilterPanel } from "./FoodFilterPanel";
import { FoodResults, useFoodMatches, type FoodPick } from "./FoodResults";

type Picker =
  | { kind: "suggest" }
  | { kind: "feeling" }
  | { kind: "options" }
  | { kind: "from"; filters: FoodFilters } // pick from the other person's filters
  | { kind: "choose"; refs: LunchRef[] } // pick from options they sent
  | null;

const toRef = (p: FoodPick): LunchRef => ({ kind: p.kind, id: p.item.id });

/** Lunch today: where, and a little back-and-forth until it's decided. */
export function LunchWidget() {
  const now = useNow();
  if (!now) return null; // the date is the phone's; wait for the client
  return <Lunch day={format(now, "yyyy-MM-dd")} />;
}

function Lunch({ day }: { day: string }) {
  const { meId, profiles, nameOf, toast } = useApp();
  const supabase = supabaseBrowser();
  const places = usePlaces();
  const meals = useMeals();
  const [picker, setPicker] = useState<Picker>(null);

  const { data: today } = useLive<{ place: LunchPlace | null; set_by: string | null } | null>(
    `lunch_day:${day}`,
    async () => {
      const { data } = await supabase.from("lunch_days").select("place, set_by").eq("day", day).maybeSingle();
      return data;
    },
    ["lunch_days"],
  );
  const { data: msgs = [] } = useLive<LunchMsg[]>(
    `lunch_msgs:${day}`,
    async () => {
      const { data, error } = await supabase.from("lunch_msgs").select("*").eq("day", day).order("created_at");
      if (error) throw error;
      return data as LunchMsg[];
    },
    ["lunch_msgs"],
  );

  const place = today?.place ?? null;
  const latest = msgs[msgs.length - 1];
  const theirTurn = latest && latest.author !== meId;
  const workOwner = profiles.find((p) => p.display_name.toLowerCase() === WORK_OWNER.toLowerCase());
  const workLabel = workOwner ? (workOwner.id === meId ? "My work" : `${workOwner.display_name}'s work`) : "Work";
  const refName = (r: LunchRef) => (r.kind === "place" ? places.find((p) => p.id === r.id)?.name : meals.find((m) => m.id === r.id)?.name) ?? "something";

  async function setPlace(p: LunchPlace) {
    const { error } = await supabase.from("lunch_days").upsert({ day, place: p, set_by: meId, updated_at: new Date().toISOString() });
    if (error) return toast(error.message);
    refreshAll();
  }

  async function send(kind: LunchMsg["kind"], body: { refs?: LunchRef[]; filters?: FoodFilters | null }, el?: HTMLElement | null) {
    const { data, error } = await supabase
      .from("lunch_msgs")
      .insert({ day, author: meId, kind, refs: body.refs ?? [], filters: body.filters ?? null })
      .select("id")
      .single();
    if (error) return toast(error.message);
    notify({ kind: "lunch", id: data.id });
    if (kind === "decided" && el) celebrate(el, ["🍽️", "✨", "💛"]);
    setPicker(null);
    refreshAll();
    toast(kind === "decided" ? "Lunch is decided 🍽️" : "Sent");
  }

  const choices: { v: LunchPlace; label: string }[] = [
    { v: "home", label: "🏡 Home" },
    { v: "work", label: `💼 ${workLabel}` },
    { v: "out", label: "🍽️ Out" },
  ];

  return (
    <section className="card lunch" style={{ marginTop: 16 }}>
      <div className="row-between">
        <strong>Lunch today</strong>
        {today?.set_by && <span className="small faint">set by {today.set_by === meId ? "you" : nameOf(today.set_by)}</span>}
      </div>
      <div className="seg" role="group" aria-label="Where's lunch" style={{ marginTop: 8 }}>
        {choices.map((c) => (
          <button key={c.v} aria-pressed={place === c.v} onClick={() => setPlace(c.v)}>
            {c.label}
          </button>
        ))}
      </div>

      {place && (
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <Thread latest={latest} theirTurn={!!theirTurn} refName={refName} nameOf={nameOf} />
          <div className="row wrap">
            {latest?.kind === "decided" ? (
              <button className="btn btn-sm" onClick={() => setPicker({ kind: "suggest" })}>
                Change it
              </button>
            ) : theirTurn && latest.kind === "propose" ? (
              <>
                <button className="btn btn-sm btn-primary" onClick={(e) => send("decided", { refs: latest.refs }, e.currentTarget)}>
                  Sounds good
                </button>
                <button className="btn btn-sm" onClick={() => setPicker({ kind: "suggest" })}>
                  Suggest something else
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setPicker({ kind: "feeling" })}>
                  Send what I&apos;m feeling
                </button>
              </>
            ) : theirTurn && latest.kind === "filters" && latest.filters ? (
              <>
                <button className="btn btn-sm btn-primary" onClick={() => setPicker({ kind: "from", filters: latest.filters! })}>
                  Pick from their list
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setPicker({ kind: "feeling" })}>
                  Send different filters
                </button>
              </>
            ) : theirTurn && latest.kind === "request" ? (
              <button className="btn btn-sm btn-primary" onClick={() => setPicker({ kind: "options" })}>
                Send some options
              </button>
            ) : theirTurn && latest.kind === "options" ? (
              <>
                <button className="btn btn-sm btn-primary" onClick={() => setPicker({ kind: "choose", refs: latest.refs })}>
                  Pick one
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => send("request", { filters: latest.filters })}>
                  Different options?
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-sm" onClick={() => setPicker({ kind: "suggest" })}>
                  {place === "out" ? "Suggest a place" : "Suggest something"}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setPicker({ kind: "feeling" })}>
                  What I&apos;m feeling
                </button>
                {needsTakeout(place) && (
                  <button className="btn btn-sm btn-ghost" onClick={() => send("request", {})}>
                    Send me options
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {picker && place && (
        <PickerSheet
          picker={picker}
          place={place}
          refName={refName}
          onClose={() => setPicker(null)}
          onSend={(kind, body, el) => send(kind, body, el)}
        />
      )}
    </section>
  );
}

function Thread({
  latest,
  theirTurn,
  refName,
  nameOf,
}: {
  latest: LunchMsg | undefined;
  theirTurn: boolean;
  refName: (r: LunchRef) => string;
  nameOf: (id: string) => string;
}) {
  if (!latest) return <p className="small muted">Nothing picked yet.</p>;
  const who = theirTurn ? nameOf(latest.author) : "You";
  const list = latest.refs.map(refName).join(", ");
  const text =
    latest.kind === "decided"
      ? `Lunch: ${list} ✅`
      : latest.kind === "propose"
        ? `${who} suggested ${list}`
        : latest.kind === "filters"
          ? `${who} ${theirTurn ? "is" : "are"} feeling: ${latest.filters ? describeFilters(latest.filters) : "anything"}`
          : latest.kind === "request"
            ? `${who} asked for some options`
            : `${who} sent options: ${list}`;
  return (
    <p className={latest.kind === "decided" ? "lunch-decided" : theirTurn ? "" : "muted"}>
      {text}
      {!theirTurn && latest.kind !== "decided" && <span className="small faint"> · waiting…</span>}
    </p>
  );
}

function PickerSheet({
  picker,
  place,
  refName,
  onClose,
  onSend,
}: {
  picker: NonNullable<Picker>;
  place: LunchPlace;
  refName: (r: LunchRef) => string;
  onClose: () => void;
  onSend: (kind: LunchMsg["kind"], body: { refs?: LunchRef[]; filters?: FoodFilters | null }, el?: HTMLElement | null) => void;
}) {
  const takeout = needsTakeout(place);
  const [filters, setFilters] = useState<FoodFilters>(picker.kind === "from" ? picker.filters : { mode: place === "out" ? "out" : "cook" });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, LunchRef>>(new Map());
  const { picks, pantry } = useFoodMatches(filters, search, { takeoutOnly: takeout });

  if (picker.kind === "choose") {
    return (
      <Sheet title="Pick one" onClose={onClose}>
        <div className="stack-sm">
          {picker.refs.map((r) => (
            <button key={r.id} className="card food-card" onClick={(e) => onSend("decided", { refs: [r] }, e.currentTarget)}>
              <span className="name">{refName(r)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    );
  }

  const title = { suggest: "Suggest something", feeling: "What are you feeling?", options: "Send a few options", from: "From their filters" }[picker.kind];
  const multi = picker.kind === "options";
  const onPick = (p: FoodPick, el: HTMLElement) => {
    if (picker.kind === "suggest") return onSend("propose", { refs: [toRef(p)] });
    if (picker.kind === "from") return onSend("decided", { refs: [toRef(p)] }, el);
    if (multi)
      setSelected((s) => {
        const n = new Map(s);
        if (n.has(p.item.id)) n.delete(p.item.id);
        else n.set(p.item.id, toRef(p));
        return n;
      });
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        {picker.kind === "from" ? (
          <p className="small muted">{describeFilters(picker.filters)}</p>
        ) : (
          <FoodFilterPanel value={filters} onChange={setFilters} lockMode={place === "out"} takeoutOnly={takeout} />
        )}
        {takeout && filters.mode === "out" && <p className="small muted">Only places with takeout, drive-thru or delivery.</p>}
        {picker.kind === "feeling" ? (
          <>
            <p className="small muted">{picks.length} match{picks.length === 1 ? "es" : ""} right now.</p>
            <button className="btn btn-primary btn-block" onClick={() => onSend("filters", { filters })}>
              Send these filters
            </button>
          </>
        ) : (
          <>
            <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" aria-label="Search" />
            <FoodResults
              picks={picks}
              pantry={pantry}
              selected={multi ? new Set(selected.keys()) : undefined}
              empty="Nothing matches. Add more in the Eat tab, or loosen a filter."
              onPick={onPick}
            />
            {multi && (
              <button className="btn btn-primary btn-block" disabled={!selected.size} onClick={() => onSend("options", { refs: [...selected.values()], filters })}>
                Send {selected.size || ""} option{selected.size === 1 ? "" : "s"}
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
