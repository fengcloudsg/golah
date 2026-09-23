import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const DEFAULT_TERMS_HTML = `<h1>GoLah! Terms &amp; Conditions</h1>
<p>Welcome to GoLah!. These terms govern your use of the GoLah! website and mobile apps.</p>
<h2>Accounts</h2>
<p>You may create an account with a valid email address. We send a one-time passcode (OTP) to that address to sign you in. You are responsible for keeping access to that inbox secure.</p>
<h2>Favourites</h2>
<p>Signed-in users may save campaigns and stall locations to a personal favourites list stored with their account.</p>
<h2>Marketing email</h2>
<p>When you create an account you are asked to agree that the app owner may use your email address for marketing about campaigns, promotions, and related services. You may contact us if you want that consent recorded differently later.</p>
<h2>Location</h2>
<p>GoLah! uses your device location or an address you enter to show nearby stalls. Location is not required to browse, but distance results will be limited without it.</p>
<h2>Content</h2>
<p>Campaign names, stall lists, and dates are provided by administrators. Information may change; always confirm details with the merchant or campaign organiser before you visit.</p>
<h2>Changes</h2>
<p>We may update these terms. The current version is the one published in the app at the time you create an account or next sign in.</p>`;

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 45 * 1000;
const OTP_HOUR_MAX = 8;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return "";
  return email;
}

function pepper() {
  return process.env.OTP_PEPPER || "golah-otp";
}

export function hashOtp(email, code) {
  return createHash("sha256").update(`${pepper()}:${email}:${code}`).digest("hex");
}

export function hashesEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function newOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function newSessionToken() {
  return randomBytes(32).toString("hex");
}

export function sanitizeTermsHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=/gi, " data-dropped=");
}

export function pruneAuth(store, now = Date.now()) {
  store.otps = (store.otps || []).filter((row) => Number(row.expiresAt) > now);
  store.sessions = (store.sessions || []).filter((row) => Number(row.expiresAt) > now);
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    marketingConsent: Boolean(user.marketingConsent),
    createdAt: user.createdAt,
  };
}

export function findUserByEmail(store, email) {
  return (store.users || []).find((user) => user.email === email) || null;
}

export function readBearer(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  return String(req.headers["x-user-token"] || "").trim();
}

export function findSessionUser(store, token) {
  if (!token) return null;
  pruneAuth(store);
  const session = (store.sessions || []).find((row) => row.token === token);
  if (!session) return null;
  return (store.users || []).find((user) => user.id === session.userId) || null;
}

export function createOtpRecord(store, { email, marketingConsent, isNew }) {
  const now = Date.now();
  pruneAuth(store, now);
  const recent = (store.otps || []).filter((row) => row.email === email && now - Number(row.createdAt) < OTP_RESEND_MS);
  if (recent.length) {
    const err = new Error("Please wait a moment before requesting another code.");
    err.status = 429;
    throw err;
  }
  const hourCount = (store.otps || []).filter(
    (row) => row.email === email && now - Number(row.createdAt) < 60 * 60 * 1000,
  ).length;
  if (hourCount >= OTP_HOUR_MAX) {
    const err = new Error("Too many codes requested for this email. Try again later.");
    err.status = 429;
    throw err;
  }
  const code = newOtpCode();
  store.otps = store.otps || [];
  store.otps.push({
    email,
    codeHash: hashOtp(email, code),
    createdAt: now,
    expiresAt: now + OTP_TTL_MS,
    marketingConsent: Boolean(marketingConsent),
    isNew: Boolean(isNew),
  });
  return code;
}

export function consumeOtp(store, email, code) {
  const now = Date.now();
  pruneAuth(store, now);
  const row = (store.otps || [])
    .filter((item) => item.email === email)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0];
  if (!row || !hashesEqual(row.codeHash, hashOtp(email, code))) {
    const err = new Error("That code is invalid or has expired.");
    err.status = 400;
    throw err;
  }
  store.otps = store.otps.filter((item) => item.email !== email);
  return row;
}

export function createSession(store, userId) {
  const now = Date.now();
  const token = newSessionToken();
  store.sessions = store.sessions || [];
  store.sessions.push({
    token,
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + SESSION_TTL_MS,
  });
  return token;
}

export function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function usersToCsv(users) {
  const header = ["email", "createdAt", "lastLoginAt", "marketingConsent"];
  const lines = [header.join(",")];
  for (const user of users) {
    lines.push(
      [
        csvEscape(user.email),
        csvEscape(user.createdAt || ""),
        csvEscape(user.lastLoginAt || ""),
        user.marketingConsent ? "yes" : "no",
      ].join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
