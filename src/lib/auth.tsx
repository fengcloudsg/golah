import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchMe,
  getUserToken,
  logoutUser,
  putMyFavorites,
  requestOtp,
  setUserToken,
  toggleFavoriteCampaign,
  toggleFavoriteLocation,
  verifyOtp,
} from "./api";
import {
  loadGuestFavorites,
  saveGuestFavorites,
  toggleGuestCampaign,
  toggleGuestLocation,
  type GuestCampaign,
  type GuestFavorites,
} from "./favorites";
import type { FavoriteLocation, Location, UserAccount, UserFavorites } from "../types";

type AuthContextValue = {
  ready: boolean;
  user: UserAccount | null;
  favLocationIds: Set<string>;
  favCampaignIds: Set<string>;
  favoriteLocations: FavoriteLocation[];
  favoriteCampaigns: UserFavorites["campaigns"];
  requestCode: (email: string, marketingConsent: boolean) => Promise<{ isNew: boolean; delivered: boolean; devCode?: string }>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  toggleLocation: (loc: Location & { campaignId?: string; campaignName?: string }) => Promise<boolean>;
  toggleCampaign: (campaign: GuestCampaign) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function emptyFavs(): UserFavorites {
  return { locations: [], campaignIds: [], campaigns: [] };
}

function fromGuest(guest: GuestFavorites): UserFavorites {
  return {
    locations: guest.locations,
    campaignIds: guest.campaigns.map((row) => row.id),
    campaigns: guest.campaigns,
  };
}

function toGuest(favs: UserFavorites): GuestFavorites {
  return {
    locations: favs.locations || [],
    campaigns: favs.campaigns || [],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [favorites, setFavorites] = useState<UserFavorites>(() => fromGuest(loadGuestFavorites()));

  const applyFavorites = useCallback((next: UserFavorites) => {
    const favs = {
      locations: next.locations || [],
      campaignIds: next.campaignIds || [],
      campaigns: next.campaigns || [],
    };
    setFavorites(favs);
    saveGuestFavorites(toGuest(favs));
  }, []);

  useEffect(() => {
    const token = getUserToken();
    if (!token) {
      applyFavorites(fromGuest(loadGuestFavorites()));
      setReady(true);
      return;
    }
    fetchMe()
      .then(({ user: nextUser, favorites: nextFavs }) => {
        setUser(nextUser);
        applyFavorites(nextFavs);
      })
      .catch(() => {
        setUserToken(null);
        setUser(null);
        applyFavorites(fromGuest(loadGuestFavorites()));
      })
      .finally(() => setReady(true));
  }, [applyFavorites]);

  const requestCode = useCallback(async (email: string, marketingConsent: boolean) => {
    return requestOtp(email, marketingConsent);
  }, []);

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      const local = loadGuestFavorites();
      const result = await verifyOtp(email, code);
      setUserToken(result.token);
      setUser(result.user);
      const remote = result.favorites || emptyFavs();
      const locations = [...remote.locations];
      const seenLoc = new Set(locations.map((row) => row.id));
      for (const loc of local.locations) {
        if (!seenLoc.has(loc.id)) {
          locations.push(loc);
          seenLoc.add(loc.id);
        }
      }
      const campaignIds = [...new Set([...remote.campaignIds, ...local.campaigns.map((row) => row.id)])];
      const next = await putMyFavorites({ locations, campaignIds });
      applyFavorites(next);
    },
    [applyFavorites],
  );

  const signOut = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      /* token already invalid */
    }
    setUserToken(null);
    setUser(null);
    applyFavorites(fromGuest(loadGuestFavorites()));
  }, [applyFavorites]);

  const toggleLocation = useCallback(
    async (loc: Location & { campaignId?: string; campaignName?: string }) => {
      if (!user) {
        const next = toggleGuestLocation(loc);
        applyFavorites(fromGuest(next));
        return next.locations.some((row) => row.id === loc.id);
      }
      const next = await toggleFavoriteLocation(loc);
      applyFavorites(next);
      return Boolean(next.saved);
    },
    [applyFavorites, user],
  );

  const toggleCampaign = useCallback(
    async (campaign: GuestCampaign) => {
      if (!user) {
        const next = toggleGuestCampaign(campaign);
        applyFavorites(fromGuest(next));
        return next.campaigns.some((row) => row.id === campaign.id);
      }
      const next = await toggleFavoriteCampaign(campaign.id);
      applyFavorites(next);
      return Boolean(next.saved);
    },
    [applyFavorites, user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      favLocationIds: new Set(favorites.locations.map((row) => row.id)),
      favCampaignIds: new Set(favorites.campaignIds),
      favoriteLocations: favorites.locations,
      favoriteCampaigns: favorites.campaigns,
      requestCode,
      verifyCode,
      signOut,
      toggleLocation,
      toggleCampaign,
    }),
    [ready, user, favorites, requestCode, verifyCode, signOut, toggleLocation, toggleCampaign],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
