"use client";

import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { FitView } from "@/components/Fit";
import { Wavy } from "@/components/Art";

/** Fuel & move: eating and moving, tracked the way each of us likes. */
export default function FitPage() {
  return (
    <main className="page">
      <PageHead eyebrow="Getting strong" title="Fuel & move" art={<Sticker name="kodo_trot" size={84} tilt={-3} />} />
      <Wavy />
      <FitView />
    </main>
  );
}
