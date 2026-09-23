# Store listing (draft)

- **Name:** GoLah!
- **Package / bundle id:** `sg.golah.app`
- **Version:** 1.0.0 (versionCode 1)
- **Short description:** Find nearby campaign stalls in Singapore and navigate there.
- **Category:** Maps & Navigation / Lifestyle
- **Permissions:** Location (nearby stalls), Internet (campaigns and maps)

## Play Console

Upload `android/app/build/outputs/bundle/release/app-release.aab`.

Create `android/keystore.properties` from `android/keystore.properties.example` and a Play upload keystore:

```powershell
keytool -genkeypair -v -keystore android/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias golah
```

## App Store Connect

On a Mac: `npx cap open ios` → signing team → Archive → App Store Connect.

Privacy Nutrition Label: location used to show nearby addresses; not sold.
