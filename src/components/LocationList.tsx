import { useEffect, useRef } from "react";
import type { NearbyLocation } from "../types";
import { formatKm, openGoogleMapsNav } from "../lib/geo";
import type { Gps } from "../hooks/useGeolocation";

type Props = {
  items: NearbyLocation[];
  selectedId: string | null;
  favorites: Set<string>;
  gps: Gps | null;
  onSelect: (id: string) => void;
  onToggleFav: (loc: NearbyLocation) => void;
};

export function LocationList({ items, selectedId, favorites, gps, onSelect, onToggleFav }: Props) {
  const selectedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    selectedRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId, items]);

  if (!items.length) {
    return (
      <div className="card">
        <h3>No addresses in this radius</h3>
        <p className="muted">Widen the distance filter or enable more campaigns.</p>
      </div>
    );
  }

  return (
    <div>
      {items.map((loc) => {
        const selected = selectedId === loc.id;
        return (
          <article
            key={loc.id}
            id={`stall-${loc.id}`}
            ref={selected ? selectedRef : undefined}
            className={`card${selected ? " card-selected" : ""}`}
            onClick={() => onSelect(loc.id)}
          >
            <h3>{loc.stallName || loc.address}</h3>
            <div className="loc-meta">
              <span>{formatKm(loc.distanceKm)}</span>
              <span>{loc.address}</span>
              <span>S{loc.postalCode}</span>
              <span>{loc.campaignName}</span>
            </div>
            <div className="actions">
              <button
                className="primary"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openGoogleMapsNav(loc, gps);
                }}
              >
                Navigate in Google Maps
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFav(loc);
                }}
              >
                {favorites.has(loc.id) ? "★ Saved" : "☆ Save favourite"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
