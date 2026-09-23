import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import webpush from "web-push";

/**
 * @typedef {{ id: string, platform: string, endpoint?: string, keys?: { p256dh: string, auth: string }, token?: string, createdAt: string }} PushSub
 */

export function sgToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function ymd(value) {
  const m = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

export function addDays(ymdStr, days) {
  const [y, mo, d] = ymdStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function isCampaignLive(campaign, today = sgToday()) {
  if (!campaign?.active) return false;
  const start = ymd(campaign.startsOn) || "0000-01-01";
  const end = ymd(campaign.endsOn) || "9999-12-31";
  return start <= today && today <= end;
}

export function createPushService(_root, dataDir) {
  const vapidPath = join(dataDir, "vapid.json");
  let vapid = {
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    privateKey: process.env.VAPID_PRIVATE_KEY || "",
  };
  if (!vapid.publicKey || !vapid.privateKey) {
    if (existsSync(vapidPath)) {
      try {
        vapid = { ...vapid, ...JSON.parse(readFileSync(vapidPath, "utf8")) };
      } catch {
        /* ignore */
      }
    }
  }
  if (!vapid.publicKey || !vapid.privateKey) {
    vapid = webpush.generateVAPIDKeys();
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    writeFileSync(vapidPath, JSON.stringify(vapid, null, 2));
  }

  const mailto = process.env.VAPID_MAILTO || "mailto:golah@localhost";
  webpush.setVapidDetails(mailto, vapid.publicKey, vapid.privateKey);

  function publicKey() {
    return vapid.publicKey;
  }

  async function sendOne(sub, payload) {
    const body = JSON.stringify(payload);
    if (sub.platform === "web" && sub.endpoint && sub.keys?.p256dh && sub.keys?.auth) {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        body,
      );
      return "web";
    }
    if (sub.token && process.env.FCM_SERVER_KEY) {
      const res = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          Authorization: `key=${process.env.FCM_SERVER_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: sub.token,
          notification: { title: payload.title, body: payload.body },
          data: { url: payload.url || "/" },
        }),
      });
      if (!res.ok) throw new Error(`FCM ${res.status}`);
      return "fcm";
    }
    if (sub.token && !process.env.FCM_SERVER_KEY) {
      throw new Error("Native push needs FCM_SERVER_KEY");
    }
    throw new Error("Incomplete push subscription");
  }

  async function broadcast(subscriptions, payload) {
    let sent = 0;
    const errors = [];
    const keep = [];
    for (const sub of subscriptions) {
      try {
        await sendOne(sub, payload);
        sent += 1;
        keep.push(sub);
      } catch (err) {
        const gone = /404|410|unsubscribed/i.test(String(err.message));
        if (!gone) keep.push(sub);
        errors.push({ id: sub.id, platform: sub.platform, error: err.message });
      }
    }
    return { sent, errors, subscriptions: keep };
  }

  return { publicKey, sendOne, broadcast };
}
