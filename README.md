# GoLah!

Web app to find Singapore campaign addresses near you, navigate in Google Maps, save favourites, and run several campaigns at once. Built so it can later be wrapped for **iOS and Android** (Capacitor).

## Features

1. Reads the device GPS and shows a built-in **Google Map**
2. **Admin** creates campaigns and uploads CSV lists. **First column is the postcode**; remaining columns are the address, or stall name then stall address. On startup the app loads `data/postal-map.json` (postcode → address + lat/lng) and uses it to attach coordinates during import. Optional trailing `lat,lng` in the CSV overrides the map. **Geocode missing** can still fill gaps via [OneMap](https://www.onemap.gov.sg/)
3. Filters stops within admin-configured rings (100 m–50 km, plus custom ranges)
4. **Navigate** opens turn-by-turn directions in Google Maps
5. **Favourites** — signed-in users save campaigns and stall locations to their account
6. **Multiple campaigns** can be live; users toggle which ones to include. Admin sets an inclusive **start and end date** (Singapore calendar days); the public map only shows campaigns that are active and include today.
7. **Push notifications** on web, Android, and iOS: campaign start/last-day alerts, plus Admin **Notify users**
8. **Ads** slot for Google AdSense (web) and AdMob / Apple Search Ads (mobile later)
9. Email **OTP sign-in**, marketing consent, and Admin-managed **Terms & Conditions** (HTML)
10. Cloud advice: **Firebase / Google Cloud** in Singapore (`asia-southeast1`) — see in-app **Cloud** page

## Run locally

```bash
cd golah
npm install
```

Copy `.env.example` to `.env` and set:

- `VITE_GOOGLE_MAPS_API_KEY` — Maps JavaScript API key (HTTP referrer restriction for web)
- `ADMIN_PIN` — admin login (default `golah-admin`)
- Optional: `POSTAL_MAP_PATH` — JSON mapping file (default `data/postal-map.json`)
- Optional: `VITE_ADSENSE_CLIENT` / `VITE_ADSENSE_SLOT`
- Optional: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (otherwise generated in `data/vapid.json`)
- Optional: `FCM_SERVER_KEY` for Android/iOS remote push via Firebase Cloud Messaging
- Optional SMTP for login OTP email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Without SMTP the code is logged (and returned in the API for local testing).

```bash
npm run dev
```

On this PC: http://127.0.0.1:5174 (or **https://127.0.0.1/** if certificates are installed)

Admin is not shown in the main menu. Open it directly: `/admin` (example `https://YOUR-HOST/admin`).

### HTTPS (port 443)

Put your certificate files in `golah/certs/` and set in `.env`:

```env
SSL_CERT_PATH=certs/fullchain.pem
SSL_KEY_PATH=certs/privkey.pem
HTTPS_PORT=443
```

Then, **as Administrator** (port 443 needs elevation on Windows):

```bash
npm run build
npm start
```

Phones and PCs open **https://YOUR-DOMAIN/** (or `https://YOUR-LAN-IP/` with a local cert). HTTP port 80 redirects to HTTPS when TLS is on.

`npm run dev` uses the same certs on port 443 for the Vite UI (API stays on 4174 locally).

**Public certificate issuer:** use **Let’s Encrypt**. It is free, trusted by browsers and phones, and auto-renews. On Windows the easiest clients are:

1. **win-acme** (https://www.win-acme.com/) — ACME client for IIS/manual PEM export
2. **Caddy** as a reverse proxy — issues and renews Let’s Encrypt certs automatically
3. **Cloudflare** Universal SSL — if the domain is proxied through Cloudflare

Let’s Encrypt needs a **public hostname** (for example `golah.yourdomain.com`) pointing at this machine. It cannot issue a trusted cert for a raw LAN IP (`192.168.x.x`).

For LAN-only testing, **mkcert** (https://github.com/FiloSottile/mkcert) creates a local CA you install on each phone/PC. Paid CAs (DigiCert, Sectigo, GlobalSign) are only worth it if a company policy forbids Let’s Encrypt.

Add `https://YOUR-DOMAIN/*` to the Google Maps API key HTTP referrer list.

### Open from a phone or another PC

1. Put the other device on the **same Wi‑Fi** as this computer.
2. Run `npm run dev` or `npm start` with HTTPS as above.
3. On this PC, note the LAN IPv4 (Windows: `ipconfig`).
4. Open **https://YOUR-LAN-IP/** (port 443) or **http://YOUR-LAN-IP:5174** if you have no certs yet.

If the page does not load, allow **Node.js** through Windows Firewall (ports **443**, **80**, **5174**, **4174**).

Without HTTPS, phone browsers often block GPS. Use **Your location → Set location**, or enable TLS as above.

Debug (API inspector + CSV import logs):

```bash
npm run dev:debug
```

Then open `chrome://inspect` and attach to the Node process, or in Cursor/VS Code open the `golah` folder and run the **GoLah debug** launch config.

- App (this PC): http://127.0.0.1:5174 or https://127.0.0.1/ with certs
- API (this PC): http://127.0.0.1:4174
- Other devices: https://YOUR-LAN-IP/ or http://YOUR-LAN-IP:5174
- Admin (hidden from the menu): /admin

Allow location when the browser asks. Without a Maps key the GPS coordinates and list still work; the map panel explains how to add the key.

Sample CSV: `sample-campaign.csv`. Postal lookup JSON: `data/postal-map.json` (replace with your full SG postcode file; restart or use Admin **Reload JSON**).

## Campaign dates and push notifications

Admin `/admin` sets **Starts on** and **Ends on** for each campaign. Both dates are inclusive Singapore days. Pause/Activate still controls whether the campaign can go live; the public map only lists campaigns that are active *and* whose window includes today.

Users who allow notifications receive:

- start-day and last-day alerts (server hourly check, plus on-device local notifications on Android/iOS)
- Admin **Notify users** for a one-off message

**Web:** Web Push over HTTPS (localhost is allowed). The first visit asks for notification permission.

**Android / iOS:** Capacitor Push Notifications. For true remote push while the app is closed, add Firebase (`google-services.json` / `GoogleService-Info.plist`) and set `FCM_SERVER_KEY`. Without Firebase, campaign date reminders still fire as local notifications after the app has been opened.

## Accounts, favourites, and marketing emails

Users sign in from **Sign in** with an email address and a 6-digit OTP. New accounts must tick the disclaimer (Terms & Conditions + marketing use of the email). The public Terms page is `/terms`; Admin edits that HTML in `/admin`.

Signed-in users can favourite **campaigns** (☆ next to the campaign chip) and **stall locations**. Lists live on the Favourites page and follow the account.

Admin can view every login email and **Export CSV** for marketing. Set SMTP env vars so OTPs are emailed; without SMTP the code is printed in the API log (and shown in the app during local testing).

## Deploy (Cloud Run, Play Store, App Store)

See **[deploy/README.md](deploy/README.md)** for:

- Google Cloud Run in `asia-southeast1` (`Dockerfile` + `cloudbuild.yaml`)
- Android App Bundle (`npm run android:bundle` → Play Console)
- iOS archive on a Mac (`npx cap open ios` → App Store Connect)

App id: `sg.golah.app`. Native GPS uses Capacitor Geolocation; notifications use Capacitor Push + Local Notifications. Set `VITE_API_BASE` to your Cloud Run URL when building store binaries. For store remote push, add Firebase to the Android/iOS projects and set `FCM_SERVER_KEY` on Cloud Run.

## Production cloud (recommended)

**Firebase on Google Cloud**, region **Singapore (`asia-southeast1`)**.

| Need | Service |
| --- | --- |
| Web hosting | Firebase Hosting or Cloud Run |
| API | Cloud Run (this Express app) |
| Campaigns & addresses | Cloud Firestore |
| Admin / user login | Firebase Auth |
| CSV files | Cloud Storage |
| Maps & driving | Google Maps Platform |
| Web ads | AdSense |
| App ads | AdMob; user acquisition via Apple Search Ads / Google App campaigns |

Move off the local `data/store.json` file when you go live. For large radius queries, store lat/lng and add a geo index (geohash / S2), not a full table scan.

AWS Amplify or Azure are reasonable if the company is already locked to those clouds; you would still typically keep **Google Maps + AdMob**.
