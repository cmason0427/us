"use client";

import { appleMaps, googleMaps } from "@/lib/maps";
import { useApp } from "./AppProvider";

/** An address you can copy, or open in Apple or Google Maps. */
export function AddressLinks({ address }: { address: string }) {
  const { toast } = useApp();
  return (
    <span className="addr">
      <button type="button" className="addr-text" onClick={() => navigator.clipboard?.writeText(address).then(() => toast("Address copied"))} title="Copy">
        {address}
      </button>
      <span className="addr-actions">
        <button type="button" className="pantry-chip" onClick={() => navigator.clipboard?.writeText(address).then(() => toast("Address copied"))}>
          copy
        </button>
        <a className="pantry-chip" href={appleMaps(address)} target="_blank" rel="noreferrer">
          apple
        </a>
        <a className="pantry-chip" href={googleMaps(address)} target="_blank" rel="noreferrer">
          google
        </a>
      </span>
    </span>
  );
}
