import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdBanner } from "./components/AdBanner";
import { TopBar } from "./components/TopBar";
import { fetchSettings } from "./lib/api";
import { loadPostalMapOnStartup } from "./lib/postalMap";
import { enablePushNotifications } from "./lib/push";
import { AdminPage } from "./pages/AdminPage";
import { AccountPage } from "./pages/AccountPage";
import { CloudPage } from "./pages/CloudPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { MapPage } from "./pages/MapPage";
import { TermsPage } from "./pages/TermsPage";
import { DEFAULT_ADS, type AdsSettings } from "./types";

function envAds(): AdsSettings {
  return {
    ...DEFAULT_ADS,
    adsenseClient: String(import.meta.env.VITE_ADSENSE_CLIENT || DEFAULT_ADS.adsenseClient).trim(),
    adsenseSlot: String(import.meta.env.VITE_ADSENSE_SLOT || "").trim(),
  };
}

export function App() {
  const [ads, setAds] = useState<AdsSettings>(envAds);

  useEffect(() => {
    loadPostalMapOnStartup().catch(() => {
      /* API may still be starting; Admin will retry via /api/postal-map */
    });
    void enablePushNotifications();
    fetchSettings()
      .then((data) => {
        if (data.settings?.ads) {
          setAds({
            ...DEFAULT_ADS,
            ...data.settings.ads,
            adsenseClient: data.settings.ads.adsenseClient || DEFAULT_ADS.adsenseClient,
          });
        }
      })
      .catch(() => {
        /* keep env defaults when the API is down */
      });
  }, []);

  return (
    <div className="app-shell">
      <TopBar />
      <AdBanner ads={ads} />
      <main>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/admin400326" element={<AdminPage />} />
          <Route path="/cloud" element={<CloudPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
