import { Capacitor } from "@capacitor/core";

const API_BASE = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

type ScheduleItem = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
};

function alreadyShown(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markShown(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore quota */
  }
}

function notifyAt(ymd: string) {
  const at = new Date(`${ymd}T09:00:00+08:00`);
  if (at.getTime() > Date.now()) return at;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (ymd === today) return new Date(Date.now() + 4000);
  return null;
}

async function subscribeWeb() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;
  const vapidRes = await fetch(apiUrl("/api/push/vapid"));
  if (!vapidRes.ok) return;
  const { publicKey } = (await vapidRes.json()) as { publicKey?: string };
  if (!publicKey) return;
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const json = sub.toJSON();
  await fetch(apiUrl("/api/push/subscribe"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform: "web",
      endpoint: json.endpoint,
      keys: json.keys,
    }),
  });
}

async function scheduleLocal(items: ScheduleItem[], today: string) {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications });
  }
  const notifications: {
    id: number;
    title: string;
    body: string;
    schedule: { at: Date };
  }[] = [];
  let nid = 4100;
  for (const item of items) {
    const kinds: { kind: "start" | "end"; ymd: string; body: string }[] = [
      { kind: "start", ymd: item.startsOn, body: `${item.name} starts today.` },
      { kind: "end", ymd: item.endsOn, body: `Last day: ${item.name} ends today.` },
    ];
    for (const row of kinds) {
      if (row.ymd < today) continue;
      const key = `golah-n:${item.id}:${row.kind}:${row.ymd}`;
      if (alreadyShown(key)) continue;
      const at = notifyAt(row.ymd);
      if (!at) continue;
      if (at.getTime() <= Date.now() + 10_000) markShown(key);
      notifications.push({
        id: nid,
        title: "GoLah!",
        body: row.body,
        schedule: { at },
      });
      nid += 1;
    }
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

async function subscribeNative() {
  const platform = Capacitor.getPlatform();
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") {
      await PushNotifications.register();
      await PushNotifications.addListener("registration", async (token) => {
        await fetch(apiUrl("/api/push/subscribe"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform, token: token.value }),
        });
      });
    }
  } catch {
    /* FCM / APNs not configured — local notifications still work */
  }
  try {
    const data = (await fetch(apiUrl("/api/push/schedule")).then((r) => r.json())) as {
      today?: string;
      items?: ScheduleItem[];
    };
    await scheduleLocal(data.items || [], data.today || "");
  } catch {
    /* ignore */
  }
}

let started = false;

export async function enablePushNotifications() {
  if (started) return;
  started = true;
  try {
    if (Capacitor.isNativePlatform()) await subscribeNative();
    else await subscribeWeb();
  } catch {
    started = false;
  }
}
