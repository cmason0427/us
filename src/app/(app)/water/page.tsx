"use client";

import { PageHead } from "@/components/PageHead";
import { Sticker } from "@/components/Sticker";
import { WaterView } from "@/components/Water";
import { Wavy } from "@/components/Art";

/** Water: today's glass, quick adds, and how the goal's been going. */
export default function WaterPage() {
  return (
    <main className="page">
      <PageHead eyebrow="Drink up" title="Water" art={<Sticker name="wiley_back" size={84} tilt={3} />} />
      <Wavy />
      <WaterView />
    </main>
  );
}
