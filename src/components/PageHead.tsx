"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";
import { PersonAvatar } from "./PersonAvatar";

export function PageHead({ eyebrow, title, art }: { eyebrow?: string; title: ReactNode; art?: ReactNode }) {
  const { meId } = useApp();
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>
          {title}
          {art}
        </h1>
      </div>
      <div className="row" style={{ gap: 4 }}>
        <Link href="/saved" className="icon-btn" aria-label="Saved" style={{ textDecoration: "none", fontSize: "1.2rem" }}>
          🔖
        </Link>
        <Link href="/settings" aria-label="Settings" style={{ textDecoration: "none" }}>
          <PersonAvatar id={meId} size={40} />
        </Link>
      </div>
    </header>
  );
}
