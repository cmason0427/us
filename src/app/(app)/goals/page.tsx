"use client";

import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { GoalsView } from "@/components/Goals";
import { Wavy } from "@/components/Art";

/** Saving for things: plan what it costs, when, and how much to put away. */
export default function GoalsPage() {
  return (
    <main className="page">
      <PageHead eyebrow="Saving for" title="Goals" art={<Sticker name="wiley_trot" size={84} tilt={4} />} />
      <Wavy />
      <GoalsView />
    </main>
  );
}
