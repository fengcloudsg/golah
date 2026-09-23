# Deploy GoLah!

## 1. Google Cloud Run (web)

Cloud Run in **Singapore (`asia-southeast1`)** serves the built web UI and API. Google terminates HTTPS; you do not upload Let’s Encrypt files.

```powershell
cd C:\Users\snow\gushen-poc\golah
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID

$env:GCLOUD_PROJECT = "YOUR_GCP_PROJECT_ID"
$env:VITE_GOOGLE_MAPS_API_KEY = "YOUR_MAPS_KEY"
$env:ADMIN_PIN = "a-strong-admin-pin"
.\deploy\deploy-cloud-run.ps1
```

Or one command after APIs and Artifact Registry exist:

```powershell
gcloud run deploy golah --source . --region asia-southeast1 --allow-unauthenticated --set-env-vars HTTPS=0,ADMIN_PIN=your-pin
```

Add the Cloud Run URL (`https://golah-xxxxx.a.run.app/*`) to the Maps API key HTTP referrers.

Campaign data is stored in the container filesystem and **resets when the revision is replaced**. Move `store.json` to Firestore before production scale.

## 2. Android Play Store (AAB)

On this Windows PC:

```powershell
cd C:\Users\snow\gushen-poc\golah
$env:VITE_API_BASE = "https://YOUR-CLOUD-RUN-URL"
$env:VITE_GOOGLE_MAPS_API_KEY = "YOUR_MAPS_KEY"
npm run build:mobile
npm run cap:sync
npm run android:bundle
```

Upload `android/app/build/outputs/bundle/release/app-release.aab` in [Play Console](https://play.google.com/console).

Create a Play upload keystore (once) and put the values in `android/keystore.properties` (not committed). See `android/keystore.properties.example`.

## 3. iOS App Store (IPA)

An IPA **cannot be compiled on Windows**. Copy this repo to a Mac with Xcode, then:

```bash
export VITE_API_BASE=https://YOUR-CLOUD-RUN-URL
export VITE_GOOGLE_MAPS_API_KEY=YOUR_MAPS_KEY
npm ci
npm run build:mobile
npx cap sync ios
npx cap open ios
```

In Xcode: set Team / signing, archive, Distribute App → App Store Connect.

The `ios/` folder is the Capacitor project scaffold generated on this machine. Open it on a Mac to produce the store IPA.
