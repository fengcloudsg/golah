import { useEffect, useRef, useState } from "react";
import { haversineKm } from "../lib/geo";

export type Gps = {
  lat: number;
  lng: number;
  accuracy?: number;
  label?: string;
};

function isNativeApp() {
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

const MOVE_METERS = 25;
const MIN_MS = 8_000;

export function useGeolocation() {
  const [gps, setGps] = useState<Gps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastFix = useRef<{ gps: Gps; at: number } | null>(null);

  function applyFix(next: Gps) {
    const now = Date.now();
    const prev = lastFix.current;
    if (prev) {
      const meters = haversineKm(prev.gps.lat, prev.gps.lng, next.lat, next.lng) * 1000;
      if (meters < MOVE_METERS && now - prev.at < MIN_MS) return;
    }
    lastFix.current = { gps: next, at: now };
    setGps(next);
  }

  useEffect(() => {
    let cancelled = false;
    let watchId: string | number | undefined;

    async function start() {
      if (isNativeApp()) {
        try {
          const { Geolocation } = await import("@capacitor/geolocation");
          const perm = await Geolocation.requestPermissions();
          if (perm.location === "denied") {
            throw new Error("Location permission denied");
          }
          watchId = await Geolocation.watchPosition(
            { enableHighAccuracy: true },
            (pos, err) => {
              if (cancelled) return;
              if (err || !pos) {
                setError(err?.message || "Unable to read GPS location.");
                setLoading(false);
                return;
              }
              applyFix({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
              setError(null);
              setLoading(false);
            },
          );
          return;
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Native GPS failed");
          setLoading(false);
          return;
        }
      }

      if (!navigator.geolocation) {
        setError("Geolocation is not supported in this browser.");
        setLoading(false);
        return;
      }

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          applyFix({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
          setError(null);
          setLoading(false);
        },
        (err) => {
          setError(err.message || "Unable to read GPS location.");
          setLoading(false);
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
      );
    }

    void start();

    return () => {
      cancelled = true;
      if (watchId == null) return;
      if (isNativeApp()) {
        void import("@capacitor/geolocation").then(({ Geolocation }) => {
          void Geolocation.clearWatch({ id: String(watchId) });
        });
      } else if (typeof watchId === "number") {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  return { gps, error, loading };
}
