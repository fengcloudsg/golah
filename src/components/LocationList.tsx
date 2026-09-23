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
      {items.map((loc) => (
        <article
          key={loc.id}
          className="card"
          style={{ outline: selectedId === loc.id ? "2px solid #f9ab00" : undefined }}
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
      ))}
    </div>
  );
}
