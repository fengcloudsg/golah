export function CloudPage() {
  return (
    <div className="page">
      <h2>Cloud platform recommendation</h2>
      <p>
        For GoLah!, start on <strong>Google Cloud / Firebase</strong>. You already depend on Google Maps, will likely
        use AdMob/AdSense, and you want a later iOS + Android wrap. One vendor covers maps, location, auth, database,
        file uploads, hosting, and mobile ads.
      </p>

      <div className="card">
        <h3>Primary: Firebase on Google Cloud</h3>
        <p className="muted">Best fit for this product and for growth</p>
        <ul>
          <li>Hosting + Cloud Run for this web API and later SSR if needed</li>
          <li>Firestore for campaigns, addresses, and (later) synced favourites</li>
          <li>Firebase Auth for admin and signed-in users</li>
          <li>Cloud Storage for CSV uploads</li>
          <li>Cloud Functions / Cloud Run for OneMap geocoding jobs</li>
          <li>Firebase Cloud Messaging for Android/iOS remote push</li>
          <li>AdMob (iOS/Android) and AdSense (web) in the same Google ads family</li>
          <li>Capacitor or Flutter wrapping this UI without changing cloud</li>
        </ul>
      </div>

      <div className="card">
        <h3>When to add more Google Cloud</h3>
        <ul>
          <li>BigQuery if you analyse visit / navigation funnel at scale</li>
          <li>Memorystore or Firestore indexes when radius queries get large (then consider GeoFirestore or S2 cells)</li>
          <li>Cloud CDN + Load Balancing when you go multi-region (SEA first: Singapore region <code>asia-southeast1</code>)</li>
        </ul>
      </div>

      <div className="card">
        <h3>Alternatives (only if you already standardised elsewhere)</h3>
        <ul>
          <li>
            <strong>AWS Amplify + Location Service</strong> — strong if the rest of your stack is already on AWS. Maps
            still tend to stay on Google Maps for user-facing nav in SG.
          </li>
          <li>
            <strong>Azure Static Web Apps + Cosmos DB</strong> — fine for enterprise Microsoft shops; more wiring for
            mobile ads and maps.
          </li>
          <li>
            <strong>Supabase</strong> — excellent Postgres + Auth for a small team; still host Maps/AdMob on Google.
          </li>
        </ul>
      </div>

      <div className="card">
        <h3>Suggested growth path</h3>
        <ol>
          <li>POC: this repo (local JSON store + Maps key)</li>
          <li>Launch: Firebase Hosting + Cloud Run + Firestore, region Singapore</li>
          <li>Mobile: Capacitor iOS/Android, same API, AdMob banners</li>
          <li>Scale: geo-indexed queries, CDN, BigQuery, Play/App Store ads (Apple Search Ads / UAC)</li>
        </ol>
      </div>
    </div>
  );
}
