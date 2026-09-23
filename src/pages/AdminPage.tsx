import { useEffect, useState } from "react";
import {
  adminLogin,
  createCampaign,
  deleteCampaign,
  downloadAdminUsersCsv,
  fetchAdminCampaigns,
  fetchAdminTerms,
  fetchAdminUsers,
  geocodeCampaign,
  notifyCampaign,
  patchCampaign,
  reloadPostalMap,
  saveAdminTerms,
  saveSettings,
  uploadLocations,
} from "../lib/api";
import { addDaysYmd, campaignWindowLabel, sgTodayYmd } from "../lib/dates";
import { formatRing, hasCoords } from "../lib/geo";
import { getPostalMapStatus, loadPostalMapOnStartup } from "../lib/postalMap";
import { parseCampaignCsv } from "../lib/csv";
import { ADMIN_PIN_KEY } from "../lib/favorites";
import type { Campaign } from "../types";
import { PRESET_RINGS_M } from "../types";

export function AdminPage() {
  const [pin, setPin] = useState(() => sessionStorage.getItem(ADMIN_PIN_KEY) || "");
  const [authed, setAuthed] = useState(() => Boolean(sessionStorage.getItem(ADMIN_PIN_KEY)));
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsOn, setStartsOn] = useState(() => sgTodayYmd());
  const [endsOn, setEndsOn] = useState(() => addDaysYmd(sgTodayYmd(), 90));
  const [targetId, setTargetId] = useState("");
  const [replace, setReplace] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [postalStatus, setPostalStatus] = useState(() => getPostalMapStatus());
  const [rings, setRings] = useState<number[]>([...PRESET_RINGS_M]);
  const [defaultRing, setDefaultRing] = useState(1000);
  const [customRing, setCustomRing] = useState("");
  const [customUnit, setCustomUnit] = useState<"m" | "km">("m");
  const [termsHtml, setTermsHtml] = useState("");
  const [users, setUsers] = useState<
    { id: string; email: string; createdAt: string; lastLoginAt: string; marketingConsent: boolean }[]
  >([]);

  useEffect(() => {
    loadPostalMapOnStartup()
      .then(setPostalStatus)
      .catch(() => setPostalStatus(getPostalMapStatus()));
  }, []);

  useEffect(() => {
    if (!authed || !pin) return;
    refresh(pin).catch((err: Error) => setStatus(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  async function refresh(nextPin = pin, keepId?: string) {
    const [data, terms, userList] = await Promise.all([
      fetchAdminCampaigns(nextPin),
      fetchAdminTerms(nextPin),
      fetchAdminUsers(nextPin),
    ]);
    setCampaigns(data.campaigns);
    setTermsHtml(terms.html || "");
    setUsers(userList.users || []);
    if (data.settings) {
      setRings(data.settings.ringsMeters);
      setDefaultRing(data.settings.defaultRingMeters);
    }
    setTargetId((current) => {
      const preferred = keepId || current;
      if (preferred && data.campaigns.some((c) => c.id === preferred)) return preferred;
      return data.campaigns[0]?.id || "";
    });
  }

  function addCustomRing() {
    const raw = Number(customRing);
    if (!Number.isFinite(raw) || raw <= 0) {
      setStatus("Enter a positive distance for the custom ring.");
      return;
    }
    const meters = Math.round(customUnit === "km" ? raw * 1000 : raw);
    if (meters > 1_000_000) {
      setStatus("Custom ring is too large (max 1000 km).");
      return;
    }
    setRings((prev) => [...new Set([...prev, meters])].sort((a, b) => a - b));
    setCustomRing("");
  }

  async function persistRings(nextRings = rings, nextDefault = defaultRing) {
    const def = nextRings.includes(nextDefault) ? nextDefault : nextRings[0];
    const { settings } = await saveSettings(pin, { ringsMeters: nextRings, defaultRingMeters: def });
    setRings(settings.ringsMeters);
    setDefaultRing(settings.defaultRingMeters);
    setStatus(
      `Saved ${settings.ringsMeters.length} location rings. Default: ${formatRing(settings.defaultRingMeters)}.`,
    );
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await adminLogin(pin);
      sessionStorage.setItem(ADMIN_PIN_KEY, pin);
      setAuthed(true);
      await refresh(pin);
      setStatus("Signed in.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (endsOn < startsOn) {
      setStatus("End date must be on or after the start date.");
      return;
    }
    setBusy(true);
    try {
      const { campaign } = await createCampaign(pin, name, description, startsOn, endsOn);
      setName("");
      setDescription("");
      setStartsOn(sgTodayYmd());
      setEndsOn(addDaysYmd(sgTodayYmd(), 90));
      await refresh(pin, campaign.id);
      setStatus(`Created campaign “${campaign.name}”. It is selected below — upload the CSV next.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    if (!targetId) {
      setStatus("Create or select a campaign before uploading a CSV.");
      return;
    }
    const campaignName = campaigns.find((c) => c.id === targetId)?.name || "selected campaign";
    setBusy(true);
    setStatus(`Parsing CSV and importing into “${campaignName}”…`);
    try {
      const text = await file.text();
      const { locations, warnings } = parseCampaignCsv(text);
      if (!locations.length) {
        setStatus(
          `No stalls found in ${file.name}. First column must be the postcode. Remaining columns are the address, or stall name then stall address.`,
        );
        return;
      }
      const result = await uploadLocations(pin, targetId, locations, replace);
      await refresh(pin, targetId);
      const skipped = Array.isArray(result.errors) ? result.errors : [];
      const skipHint = skipped.length
        ? ` Skipped ${skipped.length}: ${skipped
            .slice(0, 5)
            .map(
              (err: { row?: number; stallName?: string; address?: string; error?: string }) =>
                `#${err.row ?? "?"} ${err.stallName || err.address || ""} (${err.error})`,
            )
            .join("; ")}`
        : "";
      const warnHint = warnings.length ? ` Parse notes: ${warnings.slice(0, 3).join("; ")}.` : "";
      const unmatched = result.unmatched ?? 0;
      const mapHint =
        unmatched > 0
          ? ` ${unmatched} postcode${unmatched === 1 ? "" : "s"} were not in the postal JSON map.`
          : "";
      setStatus(
        `Parsed ${locations.length} row${locations.length === 1 ? "" : "s"} from ${file.name}. Added ${result.added} to “${campaignName}”; ${result.matched ?? 0} got lat/lng from the postal map.${skipHint}${warnHint}${mapHint}`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setFileKey((k) => k + 1);
    }
  }

  if (!authed) {
    return (
      <div className="page">
        <h2>Admin</h2>
        <form className="card" onSubmit={login}>
          <label htmlFor="pin">Admin PIN</label>
          <input
            id="pin"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete="current-password"
          />
          <p className="muted">Default for local POC: golah-admin (change ADMIN_PIN in .env)</p>
          <div className="actions">
            <button className="primary" disabled={busy} type="submit">
              Sign in
            </button>
          </div>
          {status && <p className="muted">{status}</p>}
        </form>
      </div>
    );
  }

  const selected = campaigns.find((c) => c.id === targetId);

  return (
    <div className="page">
      <h2>Campaigns</h2>
      <p className="muted">
        CSV: first column is the <code>postcode</code>. Remaining columns are the address, or
        stall name then stall address. Lat/lng is filled from the postal JSON map loaded at
        startup (<code>data/postal-map.json</code>).
      </p>
      {status && <div className="banner">{status}</div>}

      <div className="card">
        <h3>Postal code map</h3>
        <p className="muted">
          {postalStatus?.error
            ? postalStatus.error
            : `${postalStatus?.count ?? 0} postcodes loaded${postalStatus?.path ? ` from ${postalStatus.path}` : ""}.`}
        </p>
        <div className="actions">
          <button
            type="button"
            disabled={busy || !authed}
            onClick={async () => {
              setBusy(true);
              try {
                const next = await reloadPostalMap(pin);
                setPostalStatus(next);
                setStatus(
                  next.error
                    ? `Postal map reload failed: ${next.error}`
                    : `Reloaded postal map: ${next.count} postcodes.`,
                );
              } catch (err) {
                setStatus(err instanceof Error ? err.message : "Reload failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Reload JSON
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Location rings</h3>
        <p className="muted">
          These distances appear on the map. Toggle presets, add a custom range, then save.
        </p>
        <div className="chips" role="group" aria-label="Preset rings">
          {PRESET_RINGS_M.map((meters) => {
            const on = rings.includes(meters);
            return (
              <button
                key={meters}
                type="button"
                className={on ? "chip active" : "chip"}
                onClick={() =>
                  setRings((prev) =>
                    on ? prev.filter((m) => m !== meters) : [...prev, meters].sort((a, b) => a - b),
                  )
                }
              >
                {formatRing(meters)}
              </button>
            );
          })}
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          {rings
            .filter((m) => !(PRESET_RINGS_M as readonly number[]).includes(m))
            .map((meters) => (
              <button
                key={meters}
                type="button"
                className="chip active"
                onClick={() => setRings((prev) => prev.filter((m) => m !== meters))}
              >
                {formatRing(meters)} ×
              </button>
            ))}
        </div>
        <div className="inline-fields" style={{ marginTop: 12 }}>
          <label>
            Custom
            <input
              type="number"
              min={1}
              step="any"
              value={customRing}
              onChange={(e) => setCustomRing(e.target.value)}
              placeholder="e.g. 750"
            />
          </label>
          <label>
            Unit
            <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as "m" | "km")}>
              <option value="m">metres</option>
              <option value="km">kilometres</option>
            </select>
          </label>
          <button type="button" onClick={addCustomRing}>
            Add ring
          </button>
        </div>
        <label htmlFor="default-ring">Default ring on the map</label>
        <select
          id="default-ring"
          value={defaultRing}
          onChange={(e) => setDefaultRing(Number(e.target.value))}
        >
          {rings.map((meters) => (
            <option key={meters} value={meters}>
              {formatRing(meters)}
            </option>
          ))}
        </select>
        <div className="actions">
          <button
            className="primary"
            type="button"
            disabled={busy || rings.length === 0}
            onClick={() => void persistRings()}
          >
            Save rings
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Terms &amp; Conditions</h3>
        <p className="muted">
          Shown to people creating an account. HTML is allowed (keep it simple: headings, paragraphs,
          lists, links).
        </p>
        <label htmlFor="terms-html">HTML</label>
        <textarea
          id="terms-html"
          rows={12}
          value={termsHtml}
          onChange={(e) => setTermsHtml(e.target.value)}
          spellCheck={false}
        />
        <div className="actions">
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const saved = await saveAdminTerms(pin, termsHtml);
                setTermsHtml(saved.html);
                setStatus("Saved Terms & Conditions.");
              } catch (err) {
                setStatus(err instanceof Error ? err.message : "Could not save terms");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save terms
          </button>
        </div>
        <p className="muted">Preview</p>
        <div className="terms-html terms-preview" dangerouslySetInnerHTML={{ __html: termsHtml }} />
      </div>

      <div className="card">
        <h3>User emails (marketing)</h3>
        <p className="muted">
          {users.length} signed-up user{users.length === 1 ? "" : "s"}. Export CSV for your marketing
          tools.
        </p>
        <div className="actions">
          <button
            type="button"
            disabled={busy || users.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                await downloadAdminUsersCsv(pin);
                setStatus(`Exported ${users.length} email${users.length === 1 ? "" : "s"}.`);
              } catch (err) {
                setStatus(err instanceof Error ? err.message : "Export failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Export CSV
          </button>
        </div>
        {users.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Created</th>
                  <th>Last login</th>
                  <th>Marketing</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => (
                  <tr key={row.id}>
                    <td>{row.email}</td>
                    <td>{row.createdAt ? row.createdAt.slice(0, 10) : "—"}</td>
                    <td>{row.lastLoginAt ? row.lastLoginAt.slice(0, 10) : "—"}</td>
                    <td>{row.marketingConsent ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form className="card" onSubmit={onCreate}>
        <h3>New campaign</h3>
        <label htmlFor="cname">Name</label>
        <input id="cname" value={name} onChange={(e) => setName(e.target.value)} required />
        <label htmlFor="cdesc">Description</label>
        <textarea id="cdesc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="inline-fields" style={{ marginTop: 8 }}>
          <label htmlFor="cstart">
            Starts on
            <input
              id="cstart"
              type="date"
              required
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </label>
          <label htmlFor="cend">
            Ends on
            <input
              id="cend"
              type="date"
              required
              min={startsOn}
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </label>
        </div>
        <p className="muted">Both dates are inclusive (Singapore calendar days).</p>
        <div className="actions">
          <button className="primary" disabled={busy} type="submit">
            Create campaign
          </button>
        </div>
      </form>

      <div className="card">
        <h3>Upload stalls</h3>
        <label htmlFor="camp">Target campaign</label>
        <select id="camp" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.locations.length} stalls)
              {c.active ? "" : " — paused"} · {c.startsOn} – {c.endsOn}
            </option>
          ))}
        </select>
        {selected && (
          <p className="muted">
            Uploading into <strong>{selected.name}</strong> ({selected.locations.length} stalls now).
          </p>
        )}
        <label className="row" style={{ fontWeight: 500 }}>
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Replace existing stalls instead of appending
        </label>
        <label htmlFor="csv">CSV file</label>
        <input
          key={fileKey}
          id="csv"
          type="file"
          accept=".csv,text/csv"
          disabled={busy || !targetId}
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {campaigns.map((c) => (
        <article key={c.id} className="card">
          <h3>{c.name}</h3>
          <p className="muted">
            {c.description || "No description"} · {c.locations.length} stalls ·{" "}
            {c.locations.filter(hasCoords).length} on map ·{" "}
            {campaignWindowLabel(c.startsOn, c.endsOn, c.active)}
          </p>
          <div className="inline-fields" style={{ marginTop: 8 }}>
            <label>
              Starts on
              <input
                type="date"
                value={c.startsOn}
                onChange={(e) => {
                  const next = e.target.value;
                  setCampaigns((prev) =>
                    prev.map((row) => (row.id === c.id ? { ...row, startsOn: next } : row)),
                  );
                }}
              />
            </label>
            <label>
              Ends on
              <input
                type="date"
                min={c.startsOn}
                value={c.endsOn}
                onChange={(e) => {
                  const next = e.target.value;
                  setCampaigns((prev) =>
                    prev.map((row) => (row.id === c.id ? { ...row, endsOn: next } : row)),
                  );
                }}
              />
            </label>
          </div>
          {c.locations.length > 0 && (
            <ul className="muted" style={{ paddingLeft: 18, margin: "8px 0 0" }}>
              {c.locations.slice(0, 8).map((loc) => (
                <li key={loc.id}>
                  {loc.stallName || loc.address} — {loc.address} (S{loc.postalCode})
                </li>
              ))}
              {c.locations.length > 8 && <li>…and {c.locations.length - 8} more</li>}
            </ul>
          )}
          <div className="actions">
            <button
              type="button"
              disabled={busy || !c.locations.some((loc) => !hasCoords(loc))}
              onClick={async () => {
                setBusy(true);
                try {
                  let remaining = 1;
                  let done = 0;
                  while (remaining > 0) {
                    const result = await geocodeCampaign(pin, c.id, 50);
                    done += result.geocoded;
                    remaining = result.remaining;
                    setStatus(
                      `OneMap geocode on “${c.name}”: ${done} updated, ${remaining} still pending…`,
                    );
                    if (!result.geocoded) break;
                  }
                  await refresh(pin, targetId);
                  setStatus(
                    remaining === 0
                      ? `Finished geocoding “${c.name}” (${done} updated).`
                      : `Stopped geocoding “${c.name}” after ${done} updates (${remaining} still pending).`,
                  );
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Geocode failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Geocode missing
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await patchCampaign(pin, c.id, { startsOn: c.startsOn, endsOn: c.endsOn });
                  await refresh(pin, targetId);
                  setStatus(
                    `Saved dates for “${c.name}”: ${c.startsOn} – ${c.endsOn} (both inclusive).`,
                  );
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Could not save dates");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save dates
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await patchCampaign(pin, c.id, { active: !c.active });
                await refresh();
              }}
            >
              {c.active ? "Pause" : "Activate"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await notifyCampaign(pin, c.id);
                  setStatus(
                    `Notified ${result.sent} device${result.sent === 1 ? "" : "s"} about “${c.name}” (${result.subscribers} subscribed).`,
                  );
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Notify failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Notify users
            </button>
            <button
              className="danger"
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!confirm(`Delete ${c.name}?`)) return;
                await deleteCampaign(pin, c.id);
                await refresh();
              }}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
