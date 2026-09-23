type Props = {
  client?: string;
  slot?: string;
  label?: string;
};

/** Web: Google AdSense. Mobile (later): swap this for AdMob banners via Capacitor. */
export function AdBanner({ client, slot, label = "Sponsored" }: Props) {
  if (client && slot) {
    return (
      <div className="ad-slot" aria-label={label}>
        <ins
          className="adsbygoogle"
          style={{ display: "block", width: "100%", minHeight: 72 }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format="horizontal"
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  return (
    <div className="ad-slot" aria-label={label}>
      {label} · Google Ads / Apple Search Ads slot
      <br />
      Set VITE_ADSENSE_CLIENT and VITE_ADSENSE_SLOT to serve live ads.
    </div>
  );
}
