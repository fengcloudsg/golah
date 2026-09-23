export function sgTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function campaignWindowLabel(startsOn: string, endsOn: string, active: boolean) {
  const today = sgTodayYmd();
  if (!active) return `paused · ${startsOn} – ${endsOn}`;
  if (today < startsOn) return `starts ${startsOn} · until ${endsOn}`;
  if (today > endsOn) return `ended ${endsOn}`;
  return `live ${startsOn} – ${endsOn}`;
}
