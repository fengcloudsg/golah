import type { AppSettings, Campaign, FavoriteLocation, UserAccount, UserFavorites } from "../types";

const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const USER_TOKEN_KEY = "golah-user-token";

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

const json = (res: Response) => {
  if (!res.ok) {
    return res.json().then((body) => {
      throw new Error(body.error || res.statusText);
    });
  }
  return res.json();
};

export function getUserToken() {
  try {
    return localStorage.getItem(USER_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setUserToken(token: string | null) {
  try {
    if (token) localStorage.setItem(USER_TOKEN_KEY, token);
    else localStorage.removeItem(USER_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function userHeaders(): HeadersInit {
  const token = getUserToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function locateAddress(query: string): Promise<{ lat: number; lng: number; address: string; postalCode?: string }> {
  return fetch(apiUrl("/api/locate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  }).then(json);
}

export function fetchCampaigns(): Promise<{ campaigns: Campaign[]; settings: AppSettings }> {
  return fetch(apiUrl("/api/campaigns")).then(json);
}

export function adminLogin(pin: string) {
  return fetch(apiUrl("/api/admin/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  }).then(json);
}

function adminHeaders(pin: string): HeadersInit {
  return { "Content-Type": "application/json", "x-admin-pin": pin };
}

export function fetchAdminCampaigns(pin: string): Promise<{ campaigns: Campaign[]; settings?: AppSettings }> {
  return fetch(apiUrl("/api/admin/campaigns"), { headers: adminHeaders(pin) }).then(json);
}

export function createCampaign(
  pin: string,
  name: string,
  description: string,
  startsOn: string,
  endsOn: string,
) {
  return fetch(apiUrl("/api/admin/campaigns"), {
    method: "POST",
    headers: adminHeaders(pin),
    body: JSON.stringify({ name, description, startsOn, endsOn }),
  }).then(json);
}

export function patchCampaign(
  pin: string,
  id: string,
  body: Partial<Pick<Campaign, "name" | "description" | "active" | "startsOn" | "endsOn">>,
) {
  return fetch(apiUrl(`/api/admin/campaigns/${id}`), {
    method: "PATCH",
    headers: adminHeaders(pin),
    body: JSON.stringify(body),
  }).then(json);
}

export function deleteCampaign(pin: string, id: string) {
  return fetch(apiUrl(`/api/admin/campaigns/${id}`), {
    method: "DELETE",
    headers: adminHeaders(pin),
  }).then(json);
}

export function uploadLocations(
  pin: string,
  campaignId: string,
  locations: { stallName?: string; address: string; postalCode: string; lat?: number; lng?: number }[],
  replace: boolean,
) {
  return fetch(apiUrl(`/api/admin/campaigns/${campaignId}/locations`), {
    method: "POST",
    headers: adminHeaders(pin),
    body: JSON.stringify({ locations, replace }),
  }).then(json);
}

export function geocodeCampaign(pin: string, campaignId: string, limit = 50) {
  return fetch(apiUrl(`/api/admin/campaigns/${campaignId}/geocode`), {
    method: "POST",
    headers: adminHeaders(pin),
    body: JSON.stringify({ limit }),
  }).then(json);
}

export function reloadPostalMap(pin: string) {
  return fetch(apiUrl("/api/admin/postal-map/reload"), {
    method: "POST",
    headers: adminHeaders(pin),
  }).then(json);
}

export function notifyCampaign(pin: string, id: string, body?: string) {
  return fetch(apiUrl(`/api/admin/campaigns/${id}/notify`), {
    method: "POST",
    headers: adminHeaders(pin),
    body: JSON.stringify(body ? { body } : {}),
  }).then(json) as Promise<{ sent: number; failed: number; subscribers: number }>;
}

export function saveSettings(
  pin: string,
  settings: { ringsMeters: number[]; defaultRingMeters: number },
) {
  return fetch(apiUrl("/api/admin/settings"), {
    method: "PATCH",
    headers: adminHeaders(pin),
    body: JSON.stringify(settings),
  }).then(json) as Promise<{ settings: AppSettings }>;
}

export function fetchTerms(): Promise<{ html: string }> {
  return fetch(apiUrl("/api/terms")).then(json);
}

export function requestOtp(email: string, marketingConsent: boolean) {
  return fetch(apiUrl("/api/auth/otp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, marketingConsent }),
  }).then(json) as Promise<{ ok: boolean; isNew: boolean; delivered: boolean; devCode?: string }>;
}

export function verifyOtp(email: string, code: string) {
  return fetch(apiUrl("/api/auth/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  }).then(json) as Promise<{ token: string; user: UserAccount; favorites: UserFavorites }>;
}

export function fetchMe() {
  return fetch(apiUrl("/api/auth/me"), { headers: userHeaders() }).then(json) as Promise<{
    user: UserAccount;
    favorites: UserFavorites;
  }>;
}

export function logoutUser() {
  return fetch(apiUrl("/api/auth/logout"), { method: "POST", headers: userHeaders() }).then(json);
}

export function fetchMyFavorites() {
  return fetch(apiUrl("/api/me/favorites"), { headers: userHeaders() }).then(json) as Promise<UserFavorites>;
}

export function toggleFavoriteLocation(location: FavoriteLocation) {
  return fetch(apiUrl("/api/me/favorites/location"), {
    method: "POST",
    headers: userHeaders(),
    body: JSON.stringify({ location }),
  }).then(json) as Promise<UserFavorites & { saved: boolean }>;
}

export function toggleFavoriteCampaign(campaignId: string) {
  return fetch(apiUrl("/api/me/favorites/campaign"), {
    method: "POST",
    headers: userHeaders(),
    body: JSON.stringify({ campaignId }),
  }).then(json) as Promise<UserFavorites & { saved: boolean }>;
}

export function putMyFavorites(body: { locations: FavoriteLocation[]; campaignIds: string[] }) {
  return fetch(apiUrl("/api/me/favorites"), {
    method: "PUT",
    headers: userHeaders(),
    body: JSON.stringify(body),
  }).then(json) as Promise<UserFavorites>;
}

export function fetchAdminTerms(pin: string) {
  return fetch(apiUrl("/api/admin/terms"), { headers: adminHeaders(pin) }).then(json) as Promise<{ html: string }>;
}

export function saveAdminTerms(pin: string, html: string) {
  return fetch(apiUrl("/api/admin/terms"), {
    method: "PUT",
    headers: adminHeaders(pin),
    body: JSON.stringify({ html }),
  }).then(json) as Promise<{ html: string }>;
}

export function fetchAdminUsers(pin: string) {
  return fetch(apiUrl("/api/admin/users"), { headers: adminHeaders(pin) }).then(json) as Promise<{
    users: { id: string; email: string; createdAt: string; lastLoginAt: string; marketingConsent: boolean }[];
    count: number;
  }>;
}

export async function downloadAdminUsersCsv(pin: string) {
  const res = await fetch(apiUrl("/api/admin/users.csv"), { headers: { "x-admin-pin": pin } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "golah-user-emails.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
