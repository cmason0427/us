"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";

export function PageHead({ eyebrow, title, art }: { eyebrow?: string; title: ReactNode; art?: ReactNode }) {
  const { me } = useApp();
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>
          {title}
          {art}
        </h1>
      </div>
      <Link href="/settings" className="avatar-btn" aria-label="Settings">
        {me?.display_name?.[0]?.toUpperCase() ?? "·"}
      </Link>
    </header>
  );
}
