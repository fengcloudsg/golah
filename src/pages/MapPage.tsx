import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMapView } from "../components/GoogleMapView";
import { LocationList } from "../components/LocationList";
import { useGeolocation } from "../hooks/useGeolocation";
import { fetchCampaigns, locateAddress } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatRing, hasCoords, haversineKm } from "../lib/geo";
import { loadSavedLocation, saveSavedLocation } from "../lib/locationCookie";
import type { Campaign, NearbyLocation } from "../types";
import { PRESET_RINGS_M } from "../types";
import type { Gps } from "../hooks/useGeolocation";

const HOLD_MS = 550;

function CampaignChip({
  campaign,
  enabled,
  favorited,
  onToggleEnabled,
  onToggleFavorite,
}: {
  campaign: Campaign;
  enabled: boolean;
  favorited: boolean;
  onToggleEnabled: () => void;
  onToggleFavorite: () => void;
}) {
  const timer = useRef<number | null>(null);
  const longPress = useRef(false);
  const [holding, setHolding] = useState(false);

  function clearTimer() {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longPress.current = false;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      longPress.current = true;
      setHolding(false);
      timer.current = null;
      onToggleFavorite();
    }, HOLD_MS);
  }

  function onPointerUp() {
    const wasLong = longPress.current;
    clearTimer();
    if (!wasLong) onToggleEnabled();
    longPress.current = false;
  }

  return (
    <button
      type="button"
      title={`${campaign.startsOn} – ${campaign.endsOn}. Press and hold to ${favorited ? "remove from" : "save to"} Favourites.`}
      className={`chip${enabled ? " active" : ""}${favorited ? " fav" : ""}${holding ? " holding" : ""}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={clearTimer}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") clearTimer();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {favorited ? "★ " : ""}
      {campaign.name} ({campaign.locations.length})
    </button>
  );
}

export function MapPage() {
  const { gps, error, loading } = useGeolocation();
  const { favLocationIds, favCampaignIds, toggleLocation, toggleCampaign } = useAuth();
  const saved = useMemo(() => loadSavedLocation(), []);
  const [override, setOverride] = useState<Gps | null>(() => (saved?.source === "address" ? saved : null));
  const [useSaved, setUseSaved] = useState(true);
  const [addressQuery, setAddressQuery] = useState(() => saved?.query || "");
  const [locateBusy, setLocateBusy] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [rings, setRings] = useState<number[]>([...PRESET_RINGS_M]);
  const [radiusM, setRadiusM] = useState(1000);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [favNote, setFavNote] = useState<string | null>(null);

  useEffect(() => {
    fetchCampaigns()
      .then(({ campaigns: list, settings }) => {
        setCampaigns(list);
        setEnabled(new Set(list.map((c) => c.id)));
        const nextRings = settings?.ringsMeters?.length ? settings.ringsMeters : [...PRESET_RINGS_M];
        setRings(nextRings);
        const def = settings?.defaultRingMeters;
        setRadiusM(nextRings.includes(def) ? def : nextRings[0] ?? 1000);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (override) {
      saveSavedLocation({
        lat: override.lat,
        lng: override.lng,
        label: override.label,
        source: "address",
        query: addressQuery.trim() || override.label,
      });
      return;
    }
    if (gps) {
      saveSavedLocation({
        lat: gps.lat,
        lng: gps.lng,
        accuracy: gps.accuracy,
        source: "gps",
      });
    }
  }, [override, gps, addressQuery]);

  const origin = override ?? gps ?? (useSaved ? saved : null);

  const nearby = useMemo<NearbyLocation[]>(() => {
    if (!origin) return [];
    const maxKm = radiusM / 1000;
    const rows: NearbyLocation[] = [];
    for (const campaign of campaigns) {
      if (!enabled.has(campaign.id)) continue;
      for (const loc of campaign.locations) {
        if (!hasCoords(loc)) continue;
        const distanceKm = haversineKm(origin.lat, origin.lng, loc.lat, loc.lng);
        if (distanceKm <= maxKm) {
          rows.push({
            ...loc,
            campaignId: campaign.id,
            campaignName: campaign.name,
            distanceKm,
          });
        }
      }
    }
    return rows.sort((a, b) => a.distanceKm - b.distanceKm);
  }, [campaigns, enabled, origin, radiusM]);

  async function onSetAddress(e: React.FormEvent) {
    e.preventDefault();
    const query = addressQuery.trim();
    if (!query) return;
    setLocateBusy(true);
    setLocateError(null);
    try {
      const found = await locateAddress(query);
      setOverride({
        lat: found.lat,
        lng: found.lng,
        label: found.address || query,
      });
    } catch (err) {
      setLocateError(err instanceof Error ? err.message : "Could not find that address");
    } finally {
      setLocateBusy(false);
    }
  }

  function note(message: string) {
    setFavNote(message);
    window.setTimeout(() => setFavNote((current) => (current === message ? null : current)), 2200);
  }

  async function onToggleFav(loc: NearbyLocation) {
    const savedNow = await toggleLocation(loc);
    note(savedNow ? `Saved ${loc.stallName || loc.address} to Favourites.` : `Removed from Favourites.`);
  }

  async function onToggleCampaignFav(campaign: Campaign) {
    const savedNow = await toggleCampaign(campaign);
    note(
      savedNow
        ? `Saved ${campaign.name} to Favourites.`
        : `Removed ${campaign.name} from Favourites.`,
    );
  }

  return (
    <div className="page">
      {loading && !origin && <div className="banner">Getting your GPS location…</div>}
      {error && !origin && (
        <div className="banner error">
          {error} Allow location access, or enter an address below to set your starting point.
        </div>
      )}
      {loadError && <div className="banner error">Could not load campaigns: {loadError}</div>}
      {locateError && <div className="banner error">{locateError}</div>}
      {favNote && <div className="banner">{favNote}</div>}

      <form className="card" onSubmit={(e) => void onSetAddress(e)}>
        <h3>Your location</h3>
        <p className="muted">
          {override
            ? `Using entered address: ${override.label}`
            : gps
              ? "Using GPS. Enter an address or postcode to search from somewhere else."
              : origin
                ? "Using your last saved location. Allow GPS, or enter an address to change it."
                : "Enter a Singapore address or 6-digit postcode to set your location."}
        </p>
        <div className="inline-fields">
          <label style={{ flex: 1, minWidth: 180 }}>
            Address or postcode
            <input
              value={addressQuery}
              onChange={(e) => setAddressQuery(e.target.value)}
              placeholder="e.g. ION Orchard or 238801"
            />
          </label>
          <button className="primary" type="submit" disabled={locateBusy || !addressQuery.trim()}>
            {locateBusy ? "Finding…" : "Set location"}
          </button>
          {override && (
            <button
              type="button"
              onClick={() => {
                setOverride(null);
                setUseSaved(false);
                setLocateError(null);
              }}
            >
              Use GPS
            </button>
          )}
        </div>
      </form>

      {origin && (
        <p className="muted">
          You: {origin.label ? `${origin.label} · ` : ""}
          {origin.lat.toFixed(5)}, {origin.lng.toFixed(5)}
          {!override && gps?.accuracy ? ` (±${Math.round(gps.accuracy)} m)` : ""} · {nearby.length} stop
          {nearby.length === 1 ? "" : "s"} within {formatRing(radiusM)}
        </p>
      )}

      <GoogleMapView gps={origin} locations={nearby} selectedId={selectedId} onSelect={setSelectedId} />
      <div className="legend">
        <span>
          <i className="you" /> You
        </span>
        <span>
          <i className="stall" /> Stall
        </span>
        <span>
          <i className="picked" /> Selected stall
        </span>
      </div>

      <div className="toolbar">
        <div className="chips" role="group" aria-label="Distance">
          {rings.map((meters) => (
            <button
              key={meters}
              type="button"
              className={radiusM === meters ? "chip active" : "chip"}
              onClick={() => setRadiusM(meters)}
            >
              {formatRing(meters)}
            </button>
          ))}
        </div>
      </div>

      <div className="chips" aria-label="Campaigns">
        {campaigns.map((c) => (
          <CampaignChip
            key={c.id}
            campaign={c}
            enabled={enabled.has(c.id)}
            favorited={favCampaignIds.has(c.id)}
            onToggleEnabled={() => {
              setEnabled((prev) => {
                const next = new Set(prev);
                if (next.has(c.id)) next.delete(c.id);
                else next.add(c.id);
                return next;
              });
            }}
            onToggleFavorite={() => void onToggleCampaignFav(c)}
          />
        ))}
        {!campaigns.length && (
          <span className="muted">No live campaigns today. The public map only shows campaigns whose dates include today.</span>
        )}
      </div>
      {campaigns.length > 0 && (
        <p className="muted">Press and hold a campaign to add or remove it from Favourites.</p>
      )}

      <LocationList
        items={nearby}
        selectedId={selectedId}
        favorites={favLocationIds}
        gps={origin}
        onSelect={setSelectedId}
        onToggleFav={(loc) => void onToggleFav(loc)}
      />
    </div>
  );
}
