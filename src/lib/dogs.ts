/** The dogs. `id` is what's stored in `kodo_logs.dog`; never change one. */
export const DOGS = [
  { id: "kodo", name: "Kodo" },
  { id: "wiley", name: "Wiley" },
] as const;

export type DogId = (typeof DOGS)[number]["id"];

export function dogName(id: string) {
  return DOGS.find((d) => d.id === id)?.name ?? id;
}

/** Who a dog note is "from": one dog's name, or "The boys" when it's all of them. */
export function dogVoice(ids: string[]) {
  if (ids.length > 1 && DOGS.every((d) => ids.includes(d.id))) return "The boys";
  return ids.map(dogName).join(" & ");
}
