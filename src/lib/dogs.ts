/** The dogs. `id` is what's stored in `kodo_logs.dog`; never change one. */
export const DOGS = [
  { id: "kodo", name: "Kodo" },
  { id: "wiley", name: "Wiley" },
] as const;

export type DogId = (typeof DOGS)[number]["id"];

export function dogName(id: string) {
  return DOGS.find((d) => d.id === id)?.name ?? id;
}
