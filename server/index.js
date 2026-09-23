import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { createPostalMapLoader } from "./postalMap.js";
import { loadTlsOptions } from "./tls.js";
import { addDays, createPushService, isCampaignLive, sgToday, ymd } from "./push.js";
import {
  consumeOtp,
  createOtpRecord,
  createSession,
  DEFAULT_TERMS_HTML,
  findSessionUser,
  findUserByEmail,
  normalizeEmail,
  pruneAuth,
  publicUser,
  readBearer,
  sanitizeTermsHtml,
  usersToCsv,
} from "./auth.js";
import { sendOtpEmail, smtpConfigured } from "./mail.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDotEnv() {
  const path = join(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadDotEnv();
const DATA_DIR = join(root, "data");
const STORE_PATH = join(DATA_DIR, "store.json");
const ADMIN_PIN = process.env.ADMIN_PIN || "golah-admin";
const PORT = Number(process.env.PORT || 4174);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 443);
const HTTP_REDIRECT_PORT = Number(process.env.HTTP_REDIRECT_PORT || 80);
const HOST = process.env.HOST || "0.0.0.0";

function lanAddresses() {
  const found = [];
  for (const rows of Object.values(networkInterfaces())) {
    for (const row of rows || []) {
      if (row.family === "IPv4" && !row.internal) found.push(row.address);
    }
  }
  return found;
}
const DEBUG =
  process.env.GOLAH_DEBUG === "1" || process.execArgv.some((arg) => arg.startsWith("--inspect"));

function logDebug(...args) {
  if (DEBUG) console.log("[golah]", ...args);
}

/** @typedef {{ id: string; stallName: string; address: string; postalCode: string; lat: number; lng: number }} Location */
/** @typedef {{ id: string; name: string; description: string; active: boolean; createdAt: string; startsOn: string; endsOn: string; locations: Location[] }} Campaign */
/** @typedef {{ campaigns: Campaign[] }} Store */

function defaultSettings() {
  return {
    ringsMeters: [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000],
    defaultRingMeters: 1000,
  };
}

function normalizeSettings(raw) {
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
  };
}

function defaultTermsHtml() {
  return DEFAULT_TERMS_HTML;
}

function emptyStore() {
  return {
    campaigns: [],
    settings: defaultSettings(),
    pushSubscriptions: [],
    users: [],
    sessions: [],
    otps: [],
    termsHtml: defaultTermsHtml(),
  };
}

function defaultCampaignDates(createdAt) {
  const start = ymd(createdAt) || sgToday();
  return { startsOn: start, endsOn: addDays(start, 90) };
}

function loadStore() {
  if (!existsSync(STORE_PATH)) return emptyStore();
  try {
    const store = JSON.parse(readFileSync(STORE_PATH, "utf8"));
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
    store.termsHtml = sanitizeTermsHtml(store.termsHtml || defaultTermsHtml()) || defaultTermsHtml();
    pruneAuth(store);
    return store;
  } catch {
    return emptyStore();
  }
}

function saveStore(store) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function extractPostal(text) {
  const value = String(text ?? "");
  const six = value.match(/\b(\d{6})\b/);
  if (six) return six[1];
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4 && digits.length <= 6) return digits.padStart(6, "0");
  return "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function onemapSearch(searchVal) {
  const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(searchVal)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  let lastError = new Error("OneMap request failed");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`OneMap ${res.status}`);
      logDebug("OneMap retry", { searchVal, status: res.status, attempt });
      await sleep(400 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`OneMap ${res.status}`);
    const data = await res.json();
    const first = data?.results?.[0];
    if (!first?.LATITUDE || !first?.LONGITUDE) return null;
    const code = extractPostal(first.POSTAL) || extractPostal(searchVal);
    return {
      lat: Number(first.LATITUDE),
      lng: Number(first.LONGITUDE),
      address:
        first.ADDRESS ||
        [first.BLK_NO, first.ROAD_NAME, code ? `Singapore ${code}` : ""].filter(Boolean).join(" "),
      postalCode: code,
    };
  }
  throw lastError;
}

async function geocodeRow(postalCode, address) {
  const code = extractPostal(postalCode) || extractPostal(address);
  if (code) {
    const byPostal = await onemapSearch(code);
    if (byPostal) return { ...byPostal, postalCode: code };
  }
  if (address) {
    const byAddress = await onemapSearch(address);
    if (byAddress) {
      return { ...byAddress, postalCode: byAddress.postalCode || code };
    }
  }
  return null;
}

function seedIfEmpty() {
  const store = loadStore();
  if (store.campaigns.length) return;
  store.campaigns = [
    {
      id: randomUUID(),
      name: "SG Landmarks",
      description: "Sample campaign - well-known Singapore spots",
      active: true,
      createdAt: new Date().toISOString(),
      startsOn: sgToday(),
      endsOn: addDays(sgToday(), 365),
      locations: [
        { id: randomUUID(), stallName: "Raffles Place MRT", address: "5 Raffles Place", postalCode: "048618", lat: 1.28413, lng: 103.85146 },
        { id: randomUUID(), stallName: "Marina Bay Sands", address: "10 Bayfront Avenue", postalCode: "018956", lat: 1.2834, lng: 103.8605 },
        { id: randomUUID(), stallName: "ION Orchard", address: "2 Orchard Turn", postalCode: "238801", lat: 1.304, lng: 103.8319 },
        { id: randomUUID(), stallName: "VivoCity", address: "1 HarbourFront Walk", postalCode: "098585", lat: 1.2644, lng: 103.822 },
        { id: randomUUID(), stallName: "Jewel Changi Airport", address: "78 Airport Boulevard", postalCode: "819663", lat: 1.3603, lng: 103.9896 },
        { id: randomUUID(), stallName: "Jurong East MRT", address: "10 Jurong East Street 12", postalCode: "609601", lat: 1.3332, lng: 103.7422 },
        { id: randomUUID(), stallName: "Tampines Mall", address: "4 Tampines Central 5", postalCode: "529510", lat: 1.3525, lng: 103.9447 },
        { id: randomUUID(), stallName: "Woodlands Civic Centre", address: "900 South Woodlands Drive", postalCode: "738964", lat: 1.435, lng: 103.7865 },
      ],
    },
    {
      id: randomUUID(),
      name: "Community Touchpoints",
      description: "Second concurrent sample campaign",
      active: true,
      createdAt: new Date().toISOString(),
      startsOn: sgToday(),
      endsOn: addDays(sgToday(), 365),
      locations: [
        { id: randomUUID(), stallName: "Toa Payoh Hub", address: "93 Toa Payoh Central", postalCode: "310193", lat: 1.3343, lng: 103.849 },
        { id: randomUUID(), stallName: "Our Tampines Hub", address: "1 Tampines Walk", postalCode: "528523", lat: 1.353, lng: 103.9406 },
        { id: randomUUID(), stallName: "Kampung Admiralty", address: "676 Woodlands Drive 71", postalCode: "730676", lat: 1.4398, lng: 103.8007 },
        { id: randomUUID(), stallName: "Punggol Waterway Point", address: "83 Punggol Central", postalCode: "828761", lat: 1.4066, lng: 103.9021 },
      ],
    },
  ];
  saveStore(store);
}

seedIfEmpty();

const postalMap = createPostalMapLoader(root);
const postalMapStatus = postalMap.load();
const push = createPushService(root, DATA_DIR);
console.log(
  postalMapStatus.error
    ? `Postal map: ${postalMapStatus.error}`
    : `Postal map: ${postalMapStatus.count} postcodes from ${postalMapStatus.path}`,
);

const app = express();
app.use(cors());
app.use(express.json({ limit: "16mb" }));

function requireUser(req, res, next) {
  const store = loadStore();
  const user = findSessionUser(store, readBearer(req));
  if (!user) return res.status(401).json({ error: "Please sign in" });
  req.userId = user.id;
  next();
}

function snapshotLocation(loc) {
  return {
    id: String(loc?.id || ""),
    stallName: String(loc?.stallName || loc?.address || "").trim(),
    address: String(loc?.address || "").trim(),
    postalCode: extractPostal(loc?.postalCode || loc?.address || ""),
    lat: Number.isFinite(Number(loc?.lat)) ? Number(loc.lat) : null,
    lng: Number.isFinite(Number(loc?.lng)) ? Number(loc.lng) : null,
    campaignId: loc?.campaignId ? String(loc.campaignId) : "",
    campaignName: String(loc?.campaignName || "").trim(),
  };
}

function favoritePayload(store, user) {
  const campaignById = new Map((store.campaigns || []).map((c) => [c.id, c]));
  const campaigns = (user.favoriteCampaignIds || [])
    .map((id) => campaignById.get(id))
    .filter(Boolean)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      startsOn: c.startsOn,
      endsOn: c.endsOn,
      active: c.active,
    }));
  return {
    locations: user.favoriteLocations || [],
    campaignIds: user.favoriteCampaignIds || [],
    campaigns,
  };
}

function requireAdmin(req, res, next) {
  const pin = req.headers["x-admin-pin"];
  if (pin !== ADMIN_PIN) {
    return res.status(401).json({ error: "Invalid admin PIN" });
  }
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "GoLah!", postalMap: postalMap.status() });
});

app.get("/api/postal-map", (_req, res) => {
  res.json(postalMap.status());
});

app.get("/api/campaigns", (_req, res) => {
  const store = loadStore();
  res.json({
    campaigns: store.campaigns.filter((c) => isCampaignLive(c)),
    settings: store.settings,
  });
});

app.get("/api/terms", (_req, res) => {
  const store = loadStore();
  res.json({ html: store.termsHtml || defaultTermsHtml() });
});

app.post("/api/auth/otp", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: "Enter a valid email address" });
  const store = loadStore();
  const existing = findUserByEmail(store, email);
  const isNew = !existing;
  const marketingConsent = Boolean(req.body?.marketingConsent);
  if (isNew && !marketingConsent) {
    return res.status(400).json({
      error: "Please agree to the Terms & Conditions and allow marketing use of your email to create an account.",
    });
  }
  try {
    const code = createOtpRecord(store, {
      email,
      marketingConsent: isNew ? marketingConsent : existing.marketingConsent,
      isNew,
    });
    const sent = await sendOtpEmail(email, code);
    saveStore(store);
    const payload = {
      ok: true,
      isNew,
      delivered: sent.delivered,
      expiresInSec: 600,
    };
    if (!sent.delivered) payload.devCode = code;
    res.json(payload);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Could not send code" });
  }
});

app.post("/api/auth/verify", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || "").replace(/\s/g, "");
  if (!email || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "Enter the 6-digit code from your email" });
  }
  const store = loadStore();
  try {
    const otp = consumeOtp(store, email, code);
    let user = findUserByEmail(store, email);
    if (!user) {
      user = {
        id: randomUUID(),
        email,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        marketingConsent: Boolean(otp.marketingConsent),
        favoriteLocations: [],
        favoriteCampaignIds: [],
      };
      store.users.push(user);
    } else {
      user.lastLoginAt = new Date().toISOString();
    }
    const token = createSession(store, user.id);
    saveStore(store);
    res.json({ token, user: publicUser(user), favorites: favoritePayload(store, user) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Could not verify code" });
  }
});

app.get("/api/auth/me", requireUser, (req, res) => {
  const store = loadStore();
  const user = store.users.find((row) => row.id === req.userId);
  if (!user) return res.status(401).json({ error: "Please sign in" });
  res.json({ user: publicUser(user), favorites: favoritePayload(store, user) });
});

app.post("/api/auth/logout", requireUser, (req, res) => {
  const store = loadStore();
  const token = readBearer(req);
  store.sessions = (store.sessions || []).filter((row) => row.token !== token);
  saveStore(store);
  res.json({ ok: true });
});

app.get("/api/me/favorites", requireUser, (req, res) => {
  const store = loadStore();
  const user = store.users.find((row) => row.id === req.userId);
  if (!user) return res.status(401).json({ error: "Please sign in" });
  res.json(favoritePayload(store, user));
});

app.post("/api/me/favorites/location", requireUser, (req, res) => {
  const snap = snapshotLocation(req.body?.location || req.body);
  if (!snap.id) return res.status(400).json({ error: "Location is required" });
  const store = loadStore();
  const user = store.users.find((row) => row.id === req.userId);
  if (!user) return res.status(401).json({ error: "Please sign in" });
  user.favoriteLocations = Array.isArray(user.favoriteLocations) ? user.favoriteLocations : [];
  const exists = user.favoriteLocations.some((row) => row.id === snap.id);
  user.favoriteLocations = exists
    ? user.favoriteLocations.filter((row) => row.id !== snap.id)
    : [...user.favoriteLocations, snap];
  saveStore(store);
  res.json({ ...favoritePayload(store, user), saved: !exists });
});

app.post("/api/me/favorites/campaign", requireUser, (req, res) => {
  const campaignId = String(req.body?.campaignId || req.body?.id || "").trim();
  if (!campaignId) return res.status(400).json({ error: "Campaign is required" });
  const store = loadStore();
  const user = store.users.find((row) => row.id === req.userId);
  if (!user) return res.status(401).json({ error: "Please sign in" });
  const campaign = store.campaigns.find((row) => row.id === campaignId);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  user.favoriteCampaignIds = Array.isArray(user.favoriteCampaignIds) ? user.favoriteCampaignIds : [];
  const exists = user.favoriteCampaignIds.includes(campaignId);
  user.favoriteCampaignIds = exists
    ? user.favoriteCampaignIds.filter((id) => id !== campaignId)
    : [...user.favoriteCampaignIds, campaignId];
  saveStore(store);
  res.json({ ...favoritePayload(store, user), saved: !exists });
});

app.put("/api/me/favorites", requireUser, (req, res) => {
  const store = loadStore();
  const user = store.users.find((row) => row.id === req.userId);
  if (!user) return res.status(401).json({ error: "Please sign in" });
  const locations = Array.isArray(req.body?.locations) ? req.body.locations.map(snapshotLocation).filter((row) => row.id) : [];
  const seen = new Set();
  user.favoriteLocations = locations.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  const campaignIds = Array.isArray(req.body?.campaignIds)
    ? req.body.campaignIds.map((id) => String(id)).filter(Boolean)
    : user.favoriteCampaignIds;
  user.favoriteCampaignIds = [...new Set(campaignIds)].filter((id) =>
    store.campaigns.some((c) => c.id === id),
  );
  saveStore(store);
  res.json(favoritePayload(store, user));
});

app.get("/api/admin/terms", requireAdmin, (_req, res) => {
  const store = loadStore();
  res.json({ html: store.termsHtml || defaultTermsHtml() });
});

app.put("/api/admin/terms", requireAdmin, (req, res) => {
  const html = sanitizeTermsHtml(req.body?.html);
  if (!html.trim()) return res.status(400).json({ error: "Terms HTML cannot be empty" });
  const store = loadStore();
  store.termsHtml = html;
  saveStore(store);
  res.json({ html: store.termsHtml });
});

app.get("/api/admin/users", requireAdmin, (_req, res) => {
  const store = loadStore();
  const users = (store.users || []).map((user) => ({
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || "",
    marketingConsent: Boolean(user.marketingConsent),
  }));
  users.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ users, count: users.length, smtp: smtpConfigured() });
});

app.get("/api/admin/users.csv", requireAdmin, (_req, res) => {
  const store = loadStore();
  const csv = usersToCsv(store.users || []);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"golah-user-emails.csv\"");
  res.send(csv);
});

app.post("/api/locate", async (req, res) => {
  const query = String(req.body?.query || req.body?.address || "").trim();
  if (!query) return res.status(400).json({ error: "Enter an address or postcode" });
  try {
    const postal = extractPostal(query);
    const mapped = postal ? postalMap.lookup(postal) : null;
    if (mapped) {
      return res.json({
        lat: mapped.lat,
        lng: mapped.lng,
        address: mapped.address || query,
        postalCode: mapped.postalCode || postal,
      });
    }
    const result = await geocodeRow(postal, query);
    if (!result) return res.status(404).json({ error: "Address not found. Try a Singapore street or 6-digit postcode." });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message || "Lookup failed" });
  }
});

app.get("/api/admin/campaigns", requireAdmin, (_req, res) => {
  const store = loadStore();
  res.json({ campaigns: store.campaigns, settings: store.settings });
});

app.post("/api/admin/login", (req, res) => {
  const pin = String(req.body?.pin || "");
  if (pin !== ADMIN_PIN) return res.status(401).json({ error: "Invalid admin PIN" });
  res.json({ ok: true });
});

app.post("/api/admin/campaigns", requireAdmin, (req, res) => {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  if (!name) return res.status(400).json({ error: "Campaign name is required" });
  const startsOn = ymd(req.body?.startsOn) || sgToday();
  const endsOn = ymd(req.body?.endsOn) || addDays(startsOn, 90);
  if (endsOn < startsOn) return res.status(400).json({ error: "End date must be on or after the start date" });
  const store = loadStore();
  const campaign = {
    id: randomUUID(),
    name,
    description,
    active: true,
    createdAt: new Date().toISOString(),
    startsOn,
    endsOn,
    startNotified: false,
    endNotified: false,
    locations: [],
  };
  store.campaigns.push(campaign);
  saveStore(store);
  res.status(201).json({ campaign });
});

app.patch("/api/admin/campaigns/:id", requireAdmin, (req, res) => {
  const store = loadStore();
  const campaign = store.campaigns.find((c) => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (typeof req.body?.name === "string") campaign.name = req.body.name.trim();
  if (typeof req.body?.description === "string") campaign.description = req.body.description.trim();
  if (typeof req.body?.active === "boolean") campaign.active = req.body.active;
  const prevStart = campaign.startsOn;
  const prevEnd = campaign.endsOn;
  if (req.body?.startsOn) campaign.startsOn = ymd(req.body.startsOn) || campaign.startsOn;
  if (req.body?.endsOn) campaign.endsOn = ymd(req.body.endsOn) || campaign.endsOn;
  if (campaign.endsOn < campaign.startsOn) {
    return res.status(400).json({ error: "End date must be on or after the start date" });
  }
  if (campaign.startsOn !== prevStart) campaign.startNotified = false;
  if (campaign.endsOn !== prevEnd) campaign.endNotified = false;
  saveStore(store);
  res.json({ campaign });
});

app.delete("/api/admin/campaigns/:id", requireAdmin, (req, res) => {
  const store = loadStore();
  store.campaigns = store.campaigns.filter((c) => c.id !== req.params.id);
  saveStore(store);
  res.json({ ok: true });
});

app.post("/api/geocode", requireAdmin, async (req, res) => {
  try {
    const result = await geocodeRow(req.body?.postalCode, req.body?.address);
    if (!result) return res.status(404).json({ error: "Postal code not found on OneMap" });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message || "Geocoding failed" });
  }
});

app.post("/api/admin/campaigns/:id/locations", requireAdmin, async (req, res) => {
  const store = loadStore();
  const campaign = store.campaigns.find((c) => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const rows = Array.isArray(req.body?.locations) ? req.body.locations : [];
  const replace = Boolean(req.body?.replace);
  const errors = [];
  const added = [];
  let matched = 0;

  logDebug("import start", { campaignId: req.params.id, rows: rows.length, replace });

  for (const [index, row] of rows.entries()) {
    const address = String(row.address || row.stallAddress || "").trim();
    const stallName = String(row.stallName || row.name || "").trim() || address;
    const postalCode = extractPostal(row.postalCode || row.postal || "") || extractPostal(address);
    if (!postalCode && !address && !stallName) {
      errors.push({ row: index + 1, error: "Empty row" });
      continue;
    }

    const mapped = postalCode ? postalMap.lookup(postalCode) : null;
    const latNum = Number(row.lat);
    const lngNum = Number(row.lng);
    const csvCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    const lat = csvCoords ? latNum : mapped ? mapped.lat : null;
    const lng = csvCoords ? lngNum : mapped ? mapped.lng : null;
    const fromMap = Boolean(mapped && !csvCoords);

    const record = {
      id: randomUUID(),
      stallName: stallName || address || mapped?.address || `Singapore ${postalCode}`,
      address: address || stallName || mapped?.address || `Singapore ${postalCode}`,
      postalCode: postalCode || "",
      lat,
      lng,
    };
    added.push(record);
    if (fromMap || csvCoords) matched += 1;
    logDebug("import ok", {
      row: index + 1,
      stallName: record.stallName,
      postalCode: record.postalCode,
      coords: fromMap ? "postal-map" : csvCoords ? "csv" : "none",
    });
  }

  logDebug("import done", { added: added.length, skipped: errors.length });

  campaign.locations = replace ? added : [...campaign.locations, ...added];
  saveStore(store);
  const withCoords = campaign.locations.filter(
    (loc) => Number.isFinite(loc.lat) && Number.isFinite(loc.lng),
  ).length;
  res.json({
    campaign,
    added: added.length,
    matched,
    unmatched: added.length - matched,
    errors,
    withCoords,
    pendingGeocode: campaign.locations.length - withCoords,
    postalMap: postalMap.status(),
  });
});

function hasCoords(loc) {
  return Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng) && !(loc.lat === 0 && loc.lng === 0);
}

app.post("/api/admin/campaigns/:id/geocode", requireAdmin, async (req, res) => {
  const store = loadStore();
  const campaign = store.campaigns.find((c) => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const limit = Math.min(200, Math.max(1, Number(req.body?.limit) || 50));
  const pending = campaign.locations.filter((loc) => !hasCoords(loc));
  const batch = pending.slice(0, limit);
  const errors = [];
  let geocoded = 0;

  for (const loc of batch) {
    try {
      const mapped = loc.postalCode ? postalMap.lookup(loc.postalCode) : null;
      if (mapped) {
        loc.lat = mapped.lat;
        loc.lng = mapped.lng;
        if (!loc.address && mapped.address) loc.address = mapped.address;
        geocoded += 1;
        continue;
      }
      const geo = await geocodeRow(loc.postalCode, loc.address || loc.stallName);
      if (!geo) {
        errors.push({ id: loc.id, stallName: loc.stallName, error: "Could not geocode" });
        continue;
      }
      loc.lat = geo.lat;
      loc.lng = geo.lng;
      if (!loc.postalCode && geo.postalCode) loc.postalCode = geo.postalCode;
      geocoded += 1;
      await sleep(50);
    } catch (err) {
      errors.push({ id: loc.id, stallName: loc.stallName, error: err.message });
    }
  }

  saveStore(store);
  const remaining = campaign.locations.filter((loc) => !hasCoords(loc)).length;
  res.json({ campaign, geocoded, remaining, errors });
});

const dist = join(root, "dist");
if (existsSync(join(dist, "index.html"))) {
  app.use(express.static(dist));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(join(dist, "index.html"));
  });
}

app.patch("/api/admin/settings", requireAdmin, (req, res) => {
  const store = loadStore();
  store.settings = normalizeSettings({
    ringsMeters: req.body?.ringsMeters ?? store.settings.ringsMeters,
    defaultRingMeters: req.body?.defaultRingMeters ?? store.settings.defaultRingMeters,
  });
  saveStore(store);
  res.json({ settings: store.settings });
});

app.get("/api/push/vapid", (_req, res) => {
  res.json({ publicKey: push.publicKey() });
});

app.get("/api/push/schedule", (_req, res) => {
  const today = sgToday();
  const store = loadStore();
  const items = (store.campaigns || [])
    .filter((c) => c.active && (ymd(c.endsOn) || "") >= today)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      startsOn: c.startsOn,
      endsOn: c.endsOn,
    }));
  res.json({ today, items });
});

app.post("/api/push/subscribe", (req, res) => {
  const platform = String(req.body?.platform || "web").toLowerCase();
  const endpoint = String(req.body?.endpoint || "").trim();
  const token = String(req.body?.token || "").trim();
  const p256dh = String(req.body?.keys?.p256dh || "").trim();
  const auth = String(req.body?.keys?.auth || "").trim();
  if (platform === "web") {
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: "Web push subscription is incomplete" });
    }
  } else if (!token) {
    return res.status(400).json({ error: "Device token is required" });
  }
  const store = loadStore();
  store.pushSubscriptions = Array.isArray(store.pushSubscriptions) ? store.pushSubscriptions : [];
  const existing = store.pushSubscriptions.find(
    (s) => (endpoint && s.endpoint === endpoint) || (token && s.token === token),
  );
  if (existing) {
    existing.platform = platform;
    existing.endpoint = endpoint || existing.endpoint;
    existing.token = token || existing.token;
    existing.keys = p256dh && auth ? { p256dh, auth } : existing.keys;
    existing.updatedAt = new Date().toISOString();
  } else {
    store.pushSubscriptions.push({
      id: randomUUID(),
      platform,
      endpoint: endpoint || undefined,
      token: token || undefined,
      keys: p256dh && auth ? { p256dh, auth } : undefined,
      createdAt: new Date().toISOString(),
    });
  }
  saveStore(store);
  res.json({ ok: true, count: store.pushSubscriptions.length });
});

app.post("/api/admin/campaigns/:id/notify", requireAdmin, async (req, res) => {
  const store = loadStore();
  const campaign = store.campaigns.find((c) => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  const title = String(req.body?.title || "GoLah!").trim() || "GoLah!";
  const body =
    String(
      req.body?.body ||
        `${campaign.name} is on now (${campaign.startsOn} – ${campaign.endsOn}, both days inclusive).`,
    ).trim() || `${campaign.name} is on now.`;
  const result = await push.broadcast(store.pushSubscriptions || [], {
    title,
    body,
    url: "/",
    campaignId: campaign.id,
  });
  store.pushSubscriptions = result.subscriptions;
  saveStore(store);
  res.json({
    sent: result.sent,
    failed: result.errors.length,
    subscribers: store.pushSubscriptions.length,
  });
});

async function notifyCampaignWindows() {
  const today = sgToday();
  const store = loadStore();
  let changed = false;
  for (const campaign of store.campaigns || []) {
    if (!campaign.active) continue;
    if (campaign.startsOn === today && !campaign.startNotified) {
      const result = await push.broadcast(store.pushSubscriptions || [], {
        title: "GoLah!",
        body: `${campaign.name} starts today and runs through ${campaign.endsOn}.`,
        url: "/",
        campaignId: campaign.id,
      });
      store.pushSubscriptions = result.subscriptions;
      campaign.startNotified = true;
      changed = true;
    }
    if (campaign.endsOn === today && !campaign.endNotified) {
      const result = await push.broadcast(store.pushSubscriptions || [], {
        title: "GoLah!",
        body: `Last day: ${campaign.name} ends today.`,
        url: "/",
        campaignId: campaign.id,
      });
      store.pushSubscriptions = result.subscriptions;
      campaign.endNotified = true;
      changed = true;
    }
  }
  if (changed) saveStore(store);
}

function startPushScheduler() {
  const tick = () =>
    notifyCampaignWindows().catch((err) => console.warn("Push scheduler:", err.message));
  tick();
  setInterval(tick, 60 * 60 * 1000);
}

function logUrls(scheme, port) {
  console.log(`GoLah! ${scheme.toUpperCase()} on ${scheme}://127.0.0.1:${port}${DEBUG ? " (debug)" : ""}`);
  for (const ip of lanAddresses()) {
    console.log(`GoLah! ${scheme.toUpperCase()} on LAN ${scheme}://${ip}:${port}`);
  }
}

const httpServer = createHttpServer(app);
httpServer.listen(PORT, HOST, () => {
  logUrls("http", PORT);
  startPushScheduler();
});

const tls = loadTlsOptions(root);
const serveHttps =
  Boolean(tls.options) && process.env.HTTPS !== "0" && !process.argv.includes("--no-https");
if (serveHttps) {
  const httpsServer = createHttpsServer(tls.options, app);
  httpsServer.listen(HTTPS_PORT, HOST, () => {
    console.log(`TLS cert: ${tls.certPath}`);
    logUrls("https", HTTPS_PORT);
  });
  httpsServer.on("error", (err) => {
    console.error(
      `HTTPS failed on port ${HTTPS_PORT}: ${err.message}. On Windows, port 443 usually needs an elevated terminal.`,
    );
  });

  if (process.env.HTTPS_REDIRECT !== "0") {
    const redirector = createHttpServer((req, res) => {
      const host = String(req.headers.host || "").replace(/:\d+$/, "");
      const location = `https://${host}${HTTPS_PORT === 443 ? "" : `:${HTTPS_PORT}`}${req.url}`;
      res.writeHead(301, { Location: location });
      res.end();
    });
    redirector.listen(HTTP_REDIRECT_PORT, HOST, () => {
      console.log(`HTTP ${HTTP_REDIRECT_PORT} redirects to HTTPS ${HTTPS_PORT}`);
    });
    redirector.on("error", (err) => {
      console.warn(`HTTP redirect port ${HTTP_REDIRECT_PORT} not bound: ${err.message}`);
    });
  }
} else if (!process.env.K_SERVICE && process.env.HTTPS !== "0") {
  console.warn(`HTTPS off: ${tls.error || "no certificates"}. See README (Let's Encrypt).`);
}
