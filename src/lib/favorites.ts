import type { Campaign, FavoriteLocation, Location } from "../types";

const KEY = "golah-favorites-v2";
const OLD_KEY = "golah-favorites-v1";

export type GuestCampaign = Pick<Campaign, "id" | "name" | "description" | "startsOn" | "endsOn" | "active">;

export type GuestFavorites = {
  locations: FavoriteLocation[];
  campaigns: GuestCampaign[];
};

function empty(): GuestFavorites {
  return { locations: [], campaigns: [] };
}

export function loadGuestFavorites(): GuestFavorites {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GuestFavorites;
      return {
        locations: Array.isArray(parsed.locations) ? parsed.locations : [],
        campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      };
    }
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const locations = JSON.parse(old) as Location[];
      const migrated = { locations: Array.isArray(locations) ? locations : [], campaigns: [] };
      saveGuestFavorites(migrated);
      localStorage.removeItem(OLD_KEY);
      return migrated;
    }
  } catch {
    /* ignore */
  }
  return empty();
}

export function saveGuestFavorites(items: GuestFavorites) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function loadFavorites(): Location[] {
  return loadGuestFavorites().locations;
}

export function saveFavorites(items: Location[]) {
  const current = loadGuestFavorites();
  saveGuestFavorites({ ...current, locations: items });
}

export function toggleFavorite(loc: Location): Location[] {
  const current = loadGuestFavorites();
  const exists = current.locations.some((row) => row.id === loc.id);
  const locations = exists
    ? current.locations.filter((row) => row.id !== loc.id)
    : [...current.locations, loc];
  saveGuestFavorites({ ...current, locations });
  return locations;
}

export function toggleGuestLocation(loc: FavoriteLocation): GuestFavorites {
  const current = loadGuestFavorites();
  const exists = current.locations.some((row) => row.id === loc.id);
  const next = {
    ...current,
    locations: exists ? current.locations.filter((row) => row.id !== loc.id) : [...current.locations, loc],
  };
  saveGuestFavorites(next);
  return next;
}

export function toggleGuestCampaign(campaign: GuestCampaign): GuestFavorites {
  const current = loadGuestFavorites();
  const exists = current.campaigns.some((row) => row.id === campaign.id);
  const next = {
    ...current,
    campaigns: exists
      ? current.campaigns.filter((row) => row.id !== campaign.id)
      : [...current.campaigns, campaign],
  };
  saveGuestFavorites(next);
  return next;
}

export const ADMIN_PIN_KEY = "golah-admin-pin";
