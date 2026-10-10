import { useEffect, useRef } from "react";
import type { AdsSettings } from "../types";

type Props = {
  ads?: AdsSettings;
  label?: string;
};

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

function loadAdsense(client: string) {
  const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  if (document.querySelector(`script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]`)) {
    return;
  }
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = src;
  document.head.appendChild(script);
}

function GoogleAdsUnit({ client, slot }: { client: string; slot: string }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!client || pushed.current) return;
    loadAdsense(client);
    const timer = window.setTimeout(() => {
      try {
        if (slot) {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } else {
          (window.adsbygoogle = window.adsbygoogle || []).push({
            google_ad_client: client,
            enable_page_level_ads: true,
          });
        }
        pushed.current = true;
      } catch {
        /* ad blockers or double-push */
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [client, slot]);

  if (client && slot) {
    return (
      <div className="ad-unit ad-unit-google">
        <span className="ad-kicker">Ad · Google Ads</span>
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

  if (client) {
    return (
      <div className="ad-unit ad-unit-google" aria-label="Google Ads">
        <span className="ad-kicker">Ad · Google Ads</span>
        <ins
          className="adsbygoogle"
          style={{ display: "block", width: "100%", minHeight: 72 }}
          data-ad-client={client}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  return (
    <div className="ad-unit ad-unit-google ad-unit-house" aria-label="Google Ads">
      <span className="ad-kicker">Ad · Google Ads</span>
      <strong>Google Ads connecting</strong>
      <span>Add an AdSense publisher id to serve live ads.</span>
    </div>
  );
}

/** Web sponsored slot: Google Ads (AdSense). */
export function AdBanner({ ads, label = "Sponsored" }: Props) {
  if (ads?.googleAds === false) return null;

  return (
    <div className="ad-slot ad-slot-live" aria-label={label}>
      <GoogleAdsUnit client={ads?.adsenseClient || ""} slot={ads?.adsenseSlot || ""} />
    </div>
  );
}
