"use client";

import { PageHead } from "@/components/PageHead";
import { DogPic } from "@/components/DogPic";
import { ShoppingList } from "@/components/Shopping";
import { Wavy } from "@/components/Art";

/** Everything we need to buy. Groceries show here and in Food. */
export default function ShoppingPage() {
  return (
    <main className="page">
      <PageHead eyebrow="Things we need" title="Shopping" art={<DogPic name="kodo_walk" size={48} />} />
      <Wavy />
      <p className="small muted">Groceries from Food land here too. Drag ⠿ to reorder or move things between categories.</p>
      <ShoppingList />
    </main>
  );
}
