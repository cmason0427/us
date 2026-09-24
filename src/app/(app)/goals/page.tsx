"use client";

import { PageHead } from "@/components/PageHead";
import { DogPic } from "@/components/DogPic";
import { GoalsView } from "@/components/Goals";
import { Wavy } from "@/components/Art";

/** Saving for things: plan what it costs, when, and how much to put away. */
export default function GoalsPage() {
  return (
    <main className="page">
      <PageHead eyebrow="Saving for" title="Goals" art={<DogPic name="wiley_jump" size={48} />} />
      <Wavy />
      <GoalsView />
    </main>
  );
}
