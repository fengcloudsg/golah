import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdBanner } from "./components/AdBanner";
import { TopBar } from "./components/TopBar";
import { loadPostalMapOnStartup } from "./lib/postalMap";
import { enablePushNotifications } from "./lib/push";
import { AdminPage } from "./pages/AdminPage";
import { AccountPage } from "./pages/AccountPage";
import { CloudPage } from "./pages/CloudPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { MapPage } from "./pages/MapPage";
import { TermsPage } from "./pages/TermsPage";

export function App() {
  const adsClient = import.meta.env.VITE_ADSENSE_CLIENT;
  const adsSlot = import.meta.env.VITE_ADSENSE_SLOT;

  useEffect(() => {
    loadPostalMapOnStartup().catch(() => {
      /* API may still be starting; Admin will retry via /api/postal-map */
    });
    void enablePushNotifications();
  }, []);

  return (
    <div className="app-shell">
      <TopBar />
      <AdBanner client={adsClient} slot={adsSlot} />
      <main>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/cloud" element={<CloudPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
