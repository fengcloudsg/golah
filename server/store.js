import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_TERMS_HTML, normalizeEmail, pruneAuth, sanitizeTermsHtml } from "./auth.js";
import { addDays, sgToday, ymd } from "./push.js";

/**
 * Durable app store.
 *
 * Local / Cloud Run: a JSON file. On Cloud Run set STORE_PATH=/var/golah/store.json
 * and mount a Cloud Storage bucket there so admin CSV imports survive revisions.
 *
 * Growth path: this module is the only I/O seam. When a single JSON blob is too
 * large (many concurrent writers or 100k+ stalls with geo queries), split
 * campaigns + locations into Firestore documents and add a geohash / S2 index.
 * Do not scan every stall in memory for nationwide radius search.
 */

const DATA_DIR = join(process.cwd(), "data");
export const STORE_PATH = process.env.STORE_PATH || join(DATA_DIR, "store.json");

let cache = null;

export function defaultAds() {
  return {
    googleAds: true,
    adsenseClient: String(process.env.ADSENSE_CLIENT || process.env.VITE_ADSENSE_CLIENT || "ca-pub-6244756659144944").trim(),
    adsenseSlot: String(process.env.ADSENSE_SLOT || process.env.VITE_ADSENSE_SLOT || "").trim(),
  };
}

export function sanitizeAdsenseClient(value) {
  const raw = String(value || "").trim();
  return /^ca-pub-\d{8,20}$/.test(raw) ? raw : "";
}

export function sanitizeAdsenseSlot(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 22 ? digits : "";
}

export function normalizeAds(raw) {
  const fallback = defaultAds();
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    googleAds: src.googleAds !== false,
    adsenseClient: sanitizeAdsenseClient(src.adsenseClient || fallback.adsenseClient),
    adsenseSlot: sanitizeAdsenseSlot(src.adsenseSlot || fallback.adsenseSlot),
  };
}

export function defaultSettings() {
  return {
    ringsMeters: [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000],
    defaultRingMeters: 1000,
    ads: defaultAds(),
  };
}

export function normalizeSettings(raw) {
  const fallback = defaultSettings();
  const rings = (Array.isArray(raw?.ringsMeters) ? raw.ringsMeters : fallback.ringsMeters)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 1_000_000)
    .map((n) => Math.round(n));
  const unique = [...new Set(rings)].sort((a, b) => a - b);
  const ringsMeters = unique.length ? unique : fallback.ringsMeters;
  const def = Number(raw?.defaultRingMeters);
  return {
    ringsMeters,
    defaultRingMeters: ringsMeters.includes(def) ? def : ringsMeters.includes(1000) ? 1000 : ringsMeters[0],
    ads: normalizeAds(raw?.ads ?? fallback.ads),
  };
}

export function extractPostal(text) {
  const value = String(text ?? "");
  const six = value.match(/\b(\d{6})\b/);
  if (six) return six[1];
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4 && digits.length <= 6) return digits.padStart(6, "0");
  return "";
}

export function emptyStore() {
  return {
    campaigns: [],
    settings: defaultSettings(),
    pushSubscriptions: [],
    users: [],
    sessions: [],
    otps: [],
    termsHtml: DEFAULT_TERMS_HTML,
  };
}

function defaultCampaignDates(createdAt) {
  const start = ymd(createdAt) || sgToday();
  return { startsOn: start, endsOn: addDays(start, 90) };
}

function normalizeStore(store, defaultTermsHtml) {
  store.campaigns = (store.campaigns || []).map((c) => {
    const dates = defaultCampaignDates(c.createdAt);
    return {
      ...c,
      startsOn: ymd(c.startsOn) || dates.startsOn,
      endsOn: ymd(c.endsOn) || dates.endsOn,
      startNotified: Boolean(c.startNotified),
      endNotified: Boolean(c.endNotified),
      locations: (c.locations || []).map((loc) => ({
        ...loc,
        stallName: String(loc.stallName || loc.address || "").trim(),
        address: String(loc.address || "").trim(),
        postalCode: extractPostal(loc.postalCode || loc.address || ""),
        lat: Number.isFinite(Number(loc.lat)) ? Number(loc.lat) : null,
        lng: Number.isFinite(Number(loc.lng)) ? Number(loc.lng) : null,
      })),
    };
  });
  store.settings = normalizeSettings(store.settings);
  store.pushSubscriptions = Array.isArray(store.pushSubscriptions) ? store.pushSubscriptions : [];
  store.users = Array.isArray(store.users)
    ? store.users.map((user) => ({
        ...user,
        email: normalizeEmail(user.email) || String(user.email || "").trim().toLowerCase(),
        marketingConsent: Boolean(user.marketingConsent),
        favoriteLocations: Array.isArray(user.favoriteLocations) ? user.favoriteLocations : [],
        favoriteCampaignIds: Array.isArray(user.favoriteCampaignIds) ? user.favoriteCampaignIds : [],
      }))
    : [];
  store.sessions = Array.isArray(store.sessions) ? store.sessions : [];
  store.otps = Array.isArray(store.otps) ? store.otps : [];
  store.termsHtml = sanitizeTermsHtml(store.termsHtml || defaultTermsHtml) || defaultTermsHtml;
  pruneAuth(store);
  return store;
}

function readDisk(defaultTermsHtml) {
  if (!existsSync(STORE_PATH)) return normalizeStore(emptyStore(), defaultTermsHtml);
  try {
    return normalizeStore(JSON.parse(readFileSync(STORE_PATH, "utf8")), defaultTermsHtml);
  } catch {
    return normalizeStore(emptyStore(), defaultTermsHtml);
  }
}

export function loadStore() {
  if (!cache) {
    cache = readDisk(DEFAULT_TERMS_HTML);
    console.log(`Store: ${cache.campaigns.length} campaigns from ${STORE_PATH}`);
  }
  return cache;
}

export function saveStore(store) {
  cache = store;
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store));
}
