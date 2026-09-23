import { AdvancedMarker, APIProvider, Map, Pin } from "@vis.gl/react-google-maps";
import type { NearbyLocation } from "../types";
import { SG_CENTER } from "../types";
import type { Gps } from "../hooks/useGeolocation";
import { hasCoords } from "../lib/geo";

type Props = {
  gps: Gps | null;
  locations: NearbyLocation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function YouAreHerePin() {
  return (
    <div className="you-pin" title="You are here">
      <span className="you-pin-pulse" />
      <span className="you-pin-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <circle cx="12" cy="12" r="11" fill="#1a73e8" />
          <circle cx="12" cy="8" r="2.4" fill="#fff" />
          <path d="M7.5 18.2c.6-3 2.4-4.6 4.5-4.6s3.9 1.6 4.5 4.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    </div>
  );
}

export function GoogleMapView({ gps, locations, selectedId, onSelect }: Props) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const center = gps ?? SG_CENTER;
  const youTitle = gps?.label || "You are here";

  if (!apiKey) {
    return (
      <div className="map-wrap">
        <div className="map-missing">
          <div>
            <strong>Google Map needs an API key</strong>
            <p className="muted">
              Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>golah/.env</code> and restart.
              Enable Maps JavaScript API on Google Cloud.
            </p>
            {gps && (
              <p>
                GPS lock: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <APIProvider apiKey={apiKey}>
        <Map
          key={`${center.lat.toFixed(5)},${center.lng.toFixed(5)}`}
          defaultCenter={center}
          defaultZoom={gps ? 15 : 11}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapId="DEMO_MAP_ID"
          style={{ width: "100%", height: "100%" }}
        >
          {gps && (
            <AdvancedMarker position={gps} title={youTitle} zIndex={3000}>
              <YouAreHerePin />
            </AdvancedMarker>
          )}
          {locations.filter(hasCoords).map((loc) => {
            const selected = selectedId === loc.id;
            return (
              <AdvancedMarker
                key={loc.id}
                position={{ lat: Number(loc.lat), lng: Number(loc.lng) }}
                title={selected ? `★ ${loc.stallName || loc.address}` : loc.stallName || loc.address}
                zIndex={selected ? 2000 : 1000}
                onClick={() => onSelect(loc.id)}
              >
                <Pin
                  background={selected ? "#f9ab00" : "#d93025"}
                  borderColor={selected ? "#e37400" : "#8b0000"}
                  glyphColor="#fff"
                  scale={selected ? 1.35 : 1}
                />
              </AdvancedMarker>
            );
          })}
        </Map>
      </APIProvider>
    </div>
  );
}
