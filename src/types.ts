export type Location = {
  id: string;
  stallName: string;
  address: string;
  postalCode: string;
  lat: number | null;
  lng: number | null;
};

export type Campaign = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  startsOn: string;
  endsOn: string;
  locations: Location[];
};

export type NearbyLocation = Location & {
  campaignId: string;
  campaignName: string;
  distanceKm: number;
};

export type FavoriteLocation = Location & {
  campaignId?: string;
  campaignName?: string;
};

export type UserAccount = {
  id: string;
  email: string;
  marketingConsent: boolean;
  createdAt?: string;
};

export type UserFavorites = {
  locations: FavoriteLocation[];
  campaignIds: string[];
  campaigns: Pick<Campaign, "id" | "name" | "description" | "startsOn" | "endsOn" | "active">[];
};

export type AdsSettings = {
  googleAds: boolean;
  adsenseClient: string;
  adsenseSlot: string;
};

export type AppSettings = {
  ringsMeters: number[];
  defaultRingMeters: number;
  ads?: AdsSettings;
};

export const DEFAULT_ADS: AdsSettings = {
  googleAds: true,
  adsenseClient: "ca-pub-6244756659144944",
  adsenseSlot: "",
};

export const PRESET_RINGS_M = [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000] as const;

export const SG_CENTER = { lat: 1.3521, lng: 103.8198 };
