export function hasCoords(loc: { lat?: number | null; lng?: number | null }): loc is {
  lat: number;
  lng: number;
} {
  return (
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng) &&
    !(loc.lat === 0 && loc.lng === 0)
  );
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatKm(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function formatRing(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return Number.isInteger(km) ? `${km} km` : `${parseFloat(km.toFixed(2))} km`;
}

export function openGoogleMapsNav(
  dest: { lat?: number | null; lng?: number | null; address?: string; postalCode?: string },
  origin?: { lat: number; lng: number } | null,
) {
  const destText = hasCoords(dest)
    ? `${dest.lat},${dest.lng}`
    : [dest.address, dest.postalCode ? `Singapore ${dest.postalCode}` : ""].filter(Boolean).join(", ");
  if (!destText) return;
  const originQ = origin ? `&origin=${origin.lat},${origin.lng}` : "";
  const url = `https://www.google.com/maps/dir/?api=1${originQ}&destination=${encodeURIComponent(destText)}&travelmode=driving`;
  window.open(url, "_blank", "noopener,noreferrer");
}
