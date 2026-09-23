import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { campaignWindowLabel } from "../lib/dates";
import { openGoogleMapsNav } from "../lib/geo";
import { useGeolocation } from "../hooks/useGeolocation";

export function FavoritesPage() {
  const { gps } = useGeolocation();
  const { user, ready, favoriteLocations, favoriteCampaigns, toggleLocation, toggleCampaign } = useAuth();
  const [status, setStatus] = useState<string | null>(null);

  if (!ready) {
    return (
      <div className="page">
        <h2>Your favourites</h2>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const empty = !favoriteCampaigns.length && !favoriteLocations.length;

  return (
    <div className="page">
      <h2>Your favourites</h2>
      {user ? (
        <p className="muted">Saved to {user.email}. These follow your account on any device.</p>
      ) : (
        <div className="card">
          <h3>Sign in to keep these</h3>
          <p className="muted">
            Favourites on this device stay here until you sign in. Email OTP login tags them to your
            account so you can open them later on another phone or browser.
          </p>
          <div className="actions">
            <Link className="btn primary" to="/account">
              Sign in
            </Link>
          </div>
        </div>
      )}
      {status && <div className="banner error">{status}</div>}

      {empty && (
        <div className="card">
          <h3>Nothing saved yet</h3>
          <p className="muted">
            On the map, press and hold a campaign to favourite it, or tap ☆ Save favourite on a stall.
          </p>
        </div>
      )}

      {favoriteCampaigns.length > 0 && <h3 className="section-title">Campaigns</h3>}
      {favoriteCampaigns.map((campaign) => (
        <article key={campaign.id} className="card">
          <h3>{campaign.name}</h3>
          <p className="muted">
            {campaign.description || "No description"} ·{" "}
            {campaignWindowLabel(campaign.startsOn, campaign.endsOn, campaign.active)}
          </p>
          <div className="actions">
            <Link className="btn primary" to="/">
              Show on map
            </Link>
            <button
              type="button"
              onClick={async () => {
                try {
                  await toggleCampaign(campaign);
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Could not update favourite");
                }
              }}
            >
              Remove
            </button>
          </div>
        </article>
      ))}

      {favoriteLocations.length > 0 && <h3 className="section-title">Locations</h3>}
      {favoriteLocations.map((loc) => (
        <article key={loc.id} className="card">
          <h3>{loc.stallName || loc.address}</h3>
          <p className="muted">
            {loc.address} · S{loc.postalCode}
            {loc.campaignName ? ` · ${loc.campaignName}` : ""}
          </p>
          <div className="actions">
            <button className="primary" type="button" onClick={() => openGoogleMapsNav(loc, gps)}>
              Navigate in Google Maps
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await toggleLocation(loc);
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Could not update favourite");
                }
              }}
            >
              Remove
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
