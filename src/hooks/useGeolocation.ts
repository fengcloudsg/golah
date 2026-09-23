import { useEffect, useState } from "react";

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

export function useGeolocation() {
  const [gps, setGps] = useState<Gps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
              setGps({
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
          setGps({
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
