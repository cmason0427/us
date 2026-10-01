"use client";

import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { PupView } from "@/components/Pup";
import { Wavy } from "@/components/Art";

/** Pup parenting: rules worth re-checking, e-collar honesty, training map, notes. */
export default function PupPage() {
  return (
    <main className="page">
      <PageHead eyebrow="Being a good dog mom" title="Pup parenting" art={<Sticker name="wiley_back" size={84} tilt={-3} />} />
      <Wavy />
      <PupView />
    </main>
  );
}
