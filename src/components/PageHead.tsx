"use client";

import type { ReactNode } from "react";
import { useApp } from "./AppProvider";
import { PersonAvatar } from "./PersonAvatar";
import { MenuButton } from "./SideMenu";

export function PageHead({ eyebrow, title, art }: { eyebrow?: string; title: ReactNode; art?: ReactNode }) {
  const { meId, openAdd } = useApp();
  return (
    <header className="page-head">
      <MenuButton />
      <div className="grow">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="head-title-row">
          <h1>{title}</h1>
          {art && <div className="head-art">{art}</div>}
        </div>
      </div>
      {/* Your picture is the + button: tap it for the add menu. */}
      <button className="avatar-add" onClick={() => openAdd("menu")} aria-label="Add something">
        <PersonAvatar id={meId} size={40} />
        <span className="avatar-plus" aria-hidden>
          +
        </span>
      </button>
    </header>
  );
}
