const KEY = "golah-enabled-campaigns";

export function loadEnabledCampaigns(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveEnabledCampaigns(ids: Iterable<string>) {
  localStorage.setItem(KEY, JSON.stringify([...ids]));
}
