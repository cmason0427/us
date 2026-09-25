"use client";

import { PageHead } from "@/components/PageHead";
import { MoneyView } from "@/components/Budget";

/** Personal money: yours only (the database won't show it to anyone else). */
export default function MoneyPage() {
  return (
    <main className="page">
      <PageHead eyebrow="Just yours · nobody else sees this" title="My money" />
      <div style={{ marginTop: 10 }}>
        <MoneyView />
      </div>
    </main>
  );
}
