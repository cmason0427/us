"use client";

import { useRef, useState } from "react";
import { differenceInMonths, differenceInYears, format, parseISO } from "date-fns";
import { supabaseBrowser } from "@/lib/supabase/client";
import { removeOldAvatar, uploadAvatar } from "@/lib/avatarUpload";
import { useLive, refreshAll } from "@/lib/useLive";
import { useNow } from "@/lib/dates";
import { DOGS, dogName, type DogId } from "@/lib/dogs";
import { useApp } from "./AppProvider";
import { DogAvatar } from "./DogAvatar";
import { Sheet } from "./Sheet";
import { SquareCrop } from "./SquareCrop";

export interface DogProfile {
  id: string;
  photo_path: string | null;
  breed: string | null;
  birthday: string | null; // yyyy-MM-dd
  weight: string | null;
  sex: string | null;
  color: string | null;
  microchip: string | null;
  vet_name: string | null;
  vet_phone: string | null;
  vet_address: string | null;
  emergency_vet: string | null;
  meds: string | null;
  feeding: string | null;
  allergies: string | null;
  vaccines: string | null;
  insurance: string | null;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
}

type Field = keyof Omit<DogProfile, "id" | "photo_path" | "updated_at" | "updated_by">;

// In the order you'd want them at the vet's front desk.
const SECTIONS: { title: string; fields: { k: Field; label: string; multi?: boolean; placeholder?: string; type?: string }[] }[] = [
  {
    title: "About",
    fields: [
      { k: "breed", label: "Breed", placeholder: "Alaskan Malamute mix" },
      { k: "birthday", label: "Birthday", type: "date" },
      { k: "weight", label: "Weight", placeholder: "68 lb (Sept 2026)" },
      { k: "sex", label: "Sex / fixed", placeholder: "Male, neutered" },
      { k: "color", label: "Color / markings" },
      { k: "microchip", label: "Microchip #" },
    ],
  },
  {
    title: "Vet",
    fields: [
      { k: "vet_name", label: "Preferred vet", placeholder: "Dr. Lee, Maple Animal Hospital" },
      { k: "vet_phone", label: "Vet phone", type: "tel" },
      { k: "vet_address", label: "Vet address" },
      { k: "emergency_vet", label: "Emergency vet", multi: true, placeholder: "24h place, phone" },
      { k: "insurance", label: "Insurance", multi: true, placeholder: "Company, policy #" },
    ],
  },
  {
    title: "Care",
    fields: [
      { k: "meds", label: "Meds", multi: true, placeholder: "Heartgard, 1st of the month\nApoquel 16mg, 1 daily with food" },
      { k: "feeding", label: "Feeding", multi: true, placeholder: "2 cups breakfast + 2 cups dinner, fish oil pump on dinner" },
      { k: "allergies", label: "Allergies", multi: true },
      { k: "vaccines", label: "Vaccines", multi: true, placeholder: "Rabies until 2027-05, DHPP 2026-11" },
      { k: "notes", label: "Anything else", multi: true, placeholder: "Hates the nail grinder; muzzle in the car door" },
    ],
  },
];

export function useDogProfiles() {
  const { data = [] } = useLive<DogProfile[]>(
    "dog_profiles",
    async () => {
      const { data, error } = await supabaseBrowser().from("dogs").select("*");
      if (error) throw error;
      return data as DogProfile[];
    },
    ["dogs"],
  );
  return data;
}

function age(birthday: string, now: Date) {
  const b = parseISO(birthday);
  const y = differenceInYears(now, b);
  if (y >= 1) return `${y} yr${y === 1 ? "" : "s"}`;
  const m = differenceInMonths(now, b);
  return `${m} mo`;
}

/** One card per dog: photo, name, the basics. Tap for the whole profile. */
export function DogProfileCards() {
  const { dogPhotos } = useApp();
  const profiles = useDogProfiles();
  const now = useNow();
  const [open, setOpen] = useState<DogId | null>(null);
  return (
    <>
      <div className="dog-cards">
        {DOGS.map((d) => {
          const p = profiles.find((x) => x.id === d.id);
          const bits = [p?.breed, p?.birthday && now ? age(p.birthday, now) : null, p?.weight].filter(Boolean);
          return (
            <button key={d.id} className="card dog-card" onClick={() => setOpen(d.id)}>
              <DogAvatar ids={[d.id]} size={64} photos={dogPhotos} />
              <strong>{d.name}</strong>
              <span className="small muted">{bits.length ? bits.join(" · ") : "Tap to fill in"}</span>
            </button>
          );
        })}
      </div>
      {open && <DogProfileSheet dog={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Everything about one dog. Read first; "Edit" to change. Either of you can. */
export function DogProfileSheet({ dog, onClose }: { dog: DogId; onClose: () => void }) {
  const { meId, nameOf, toast, dogPhotos } = useApp();
  const profile = useDogProfiles().find((p) => p.id === dog);
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const val = (k: Field) => (k in draft ? draft[k] : (profile?.[k] ?? "")) ?? "";

  async function save() {
    setBusy(true);
    const patch: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(draft)) patch[k] = v?.trim() ? v.trim() : null;
    const { error } = await supabaseBrowser()
      .from("dogs")
      .update({ ...patch, updated_by: meId, updated_at: new Date().toISOString() })
      .eq("id", dog);
    setBusy(false);
    if (error) return toast(error.message);
    setDraft({});
    setEditing(false);
    refreshAll();
    toast(`${dogName(dog)}'s profile saved 🐾`);
  }

  async function upload(file: Blob) {
    setCropFile(null);
    const supabase = supabaseBrowser();
    try {
      const path = await uploadAvatar(meId, `dog-${dog}`, file);
      const { error } = await supabase.from("dogs").update({ photo_path: path, updated_at: new Date().toISOString() }).eq("id", dog);
      if (error) throw error;
      await removeOldAvatar(meId, profile?.photo_path);
      refreshAll();
      toast("Looking good 🐾");
    } catch (err) {
      toast((err as Error).message);
    }
  }

  const filled = SECTIONS.map((s) => ({ ...s, fields: s.fields.filter((f) => profile?.[f.k]) })).filter((s) => s.fields.length);

  const shown = (f: { k: Field; type?: string }) => {
    const v = profile?.[f.k] ?? "";
    if (f.type === "date" && v) return `${format(parseISO(v), "MMM d, yyyy")}${now ? ` (${age(v, now)})` : ""}`;
    if (f.type === "tel") return <a href={`tel:${v.replace(/[^\d+]/g, "")}`}>{v}</a>;
    if (f.k === "vet_address") return <a href={`https://maps.apple.com/?q=${encodeURIComponent(v)}`} target="_blank" rel="noreferrer">{v}</a>;
    return v;
  };

  return (
    <Sheet title={dogName(dog)} onClose={onClose}>
      <div className="stack">
        <div className="row" style={{ gap: 14 }}>
          <DogAvatar ids={[dog]} size={72} photos={dogPhotos} />
          <div className="stack-sm">
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
              {dogPhotos[dog] ? "Change photo" : "Add photo"}
            </button>
            {profile?.updated_by && (
              <span className="small faint">
                Updated by {profile.updated_by === meId ? "you" : nameOf(profile.updated_by)} · {format(parseISO(profile.updated_at), "MMM d")}
              </span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setCropFile(f);
            }}
          />
        </div>

        {editing ? (
          <>
            {SECTIONS.map((s) => (
              <div key={s.title} className="stack-sm">
                <div className="section-title" style={{ margin: "8px 0 0" }}>
                  {s.title}
                </div>
                {s.fields.map((f) => (
                  <label key={f.k} className="field">
                    <span>{f.label}</span>
                    {f.multi ? (
                      <textarea className="textarea" rows={2} value={val(f.k)} placeholder={f.placeholder} onChange={(e) => setDraft((d) => ({ ...d, [f.k]: e.target.value }))} />
                    ) : (
                      <input className="input" type={f.type ?? "text"} value={val(f.k)} placeholder={f.placeholder} onChange={(e) => setDraft((d) => ({ ...d, [f.k]: e.target.value }))} />
                    )}
                  </label>
                ))}
              </div>
            ))}
            <div className="row-between">
              <button className="btn btn-ghost" onClick={() => (setDraft({}), setEditing(false))}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={save}>
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            {filled.length === 0 ? (
              <p className="muted">Nothing filled in yet. Add the vet, meds and feeding so either of you has it when it counts.</p>
            ) : (
              filled.map((s) => (
                <div key={s.title} className="card dog-facts">
                  <div className="small muted" style={{ fontWeight: 700, marginBottom: 4 }}>
                    {s.title}
                  </div>
                  {s.fields.map((f) => (
                    <div key={f.k} className="dog-fact">
                      <span className="small muted">{f.label}</span>
                      <span style={{ whiteSpace: "pre-wrap" }}>{shown(f)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
            <button className="btn btn-primary btn-block" onClick={() => setEditing(true)}>
              Edit {dogName(dog)}&apos;s info
            </button>
          </>
        )}
      </div>
      {cropFile && (
        <Sheet title="Fit it in the circle" onClose={() => setCropFile(null)}>
          <SquareCrop file={cropFile} onDone={upload} onCancel={() => setCropFile(null)} />
        </Sheet>
      )}
    </Sheet>
  );
}
