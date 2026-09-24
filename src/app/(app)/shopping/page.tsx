"use client";

import { PageHead } from "@/components/PageHead";
import { ShoppingList } from "@/components/Shopping";
import { Wavy } from "@/components/Art";

/** Everything we need to buy. Groceries show here and in Food. */
export default function ShoppingPage() {
  return (
    <main className="page">
      <PageHead eyebrow="Things we need" title="Shopping" />
      <Wavy />
      <p className="small muted">Groceries from Food land here too. Drag ⠿ to reorder or move things between categories.</p>
      <ShoppingList />
    </main>
  );
}
