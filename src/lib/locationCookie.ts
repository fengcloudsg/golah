import type { Gps } from "../hooks/useGeolocation";

const COOKIE = "golah_loc";
const MAX_AGE = 60 * 60 * 24 * 365;

export type SavedLocation = Gps & {
  source: "gps" | "address";
  query?: string;
};

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const parts = document.cookie.split("; ");
  const row = parts.find((item) => item.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : "";
}

export function loadSavedLocation(): SavedLocation | null {
  try {
    const raw = readCookie(COOKIE);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedLocation;
    if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return null;
    if (Math.abs(data.lat) > 90 || Math.abs(data.lng) > 180) return null;
    return {
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      label: data.label ? String(data.label).slice(0, 200) : undefined,
      source: data.source === "address" ? "address" : "gps",
      query: data.query ? String(data.query).slice(0, 200) : undefined,
    };
  } catch {
    return null;
  }
}

export function saveSavedLocation(loc: SavedLocation) {
  if (typeof document === "undefined") return;
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
  const payload = encodeURIComponent(
    JSON.stringify({
      lat: loc.lat,
      lng: loc.lng,
      accuracy: loc.accuracy,
      label: loc.label ? String(loc.label).slice(0, 200) : undefined,
      source: loc.source,
      query: loc.query ? String(loc.query).slice(0, 200) : undefined,
    }),
  );
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${payload}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
}

export function clearSavedLocation() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
