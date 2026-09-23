import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

/**
 * @typedef {{ address: string, lat: number, lng: number }} PostalEntry
 */

function extractPostal(text) {
  const value = String(text ?? "");
  const six = value.match(/\b(\d{6})\b/);
  if (six) return six[1];
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4 && digits.length <= 6) return digits.padStart(6, "0");
  return "";
}

function resolveMapPath(root, envPath) {
  const relative = envPath || "data/postal-map.json";
  return isAbsolute(relative) ? relative : join(root, relative);
}

function ingestEntry(map, postalRaw, entry) {
  const postalCode = extractPostal(postalRaw || entry?.postalCode || entry?.postal || "");
  const lat = Number(entry?.lat ?? entry?.latitude);
  const lng = Number(entry?.lng ?? entry?.lon ?? entry?.long ?? entry?.longitude);
  if (!postalCode || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  map.set(postalCode, {
    postalCode,
    address: String(entry?.address || entry?.stallAddress || "").trim(),
    lat,
    lng,
  });
  return true;
}

/** Accepts { "048618": { address, lat, lng } } or [{ postalCode, address, lat, lng }]. */
export function parsePostalMapJson(raw) {
  /** @type {Map<string, PostalEntry & { postalCode: string }>} */
  const map = new Map();
  if (Array.isArray(raw)) {
    for (const entry of raw) ingestEntry(map, entry?.postalCode, entry);
    return map;
  }
  if (raw && typeof raw === "object") {
    const list = raw.entries || raw.postals || raw.mapping;
    if (Array.isArray(list)) {
      for (const entry of list) ingestEntry(map, entry?.postalCode, entry);
      return map;
    }
    for (const [key, entry] of Object.entries(raw)) {
      ingestEntry(map, key, entry && typeof entry === "object" ? entry : { lat: entry });
    }
  }
  return map;
}

export function createPostalMapLoader(root) {
  let map = new Map();
  let path = resolveMapPath(root, process.env.POSTAL_MAP_PATH);
  let loadedAt = null;
  let error = null;

  function load() {
    path = resolveMapPath(root, process.env.POSTAL_MAP_PATH);
    error = null;
    if (!existsSync(path)) {
      map = new Map();
      loadedAt = new Date().toISOString();
      error = `Postal map not found: ${path}`;
      return status();
    }
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      map = parsePostalMapJson(raw);
      loadedAt = new Date().toISOString();
    } catch (err) {
      map = new Map();
      loadedAt = new Date().toISOString();
      error = err.message || "Failed to parse postal map JSON";
    }
    return status();
  }

  function lookup(postalCode) {
    const code = extractPostal(postalCode);
    return code ? map.get(code) || null : null;
  }

  function status() {
    return {
      path,
      count: map.size,
      loadedAt,
      error,
    };
  }

  return { load, lookup, status };
}
