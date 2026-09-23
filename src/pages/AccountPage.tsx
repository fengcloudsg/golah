import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function AccountPage() {
  const { user, requestCode, verifyCode, signOut } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<"email" | "code">("email");
  const [isNew, setIsNew] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const result = await requestCode(email, consent);
      setIsNew(result.isNew);
      setStep("code");
      if (result.delivered) {
        setStatus("We sent a 6-digit code to your email. It expires in 10 minutes.");
      } else if (result.devCode) {
        setStatus(
          `Email sending is not configured on this server. Use this code: ${result.devCode}`,
        );
      } else {
        setStatus("Code created. Check the server log if you did not get an email.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await verifyCode(email, code);
      setCode("");
      setStep("email");
      setStatus("Signed in. Favourites on this device are now saved to your email.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not verify code");
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return (
      <div className="page">
        <h2>Your account</h2>
        {status && <div className="banner">{status}</div>}
        <div className="card">
          <h3>{user.email}</h3>
          <p className="muted">
            Signed in with a one-time email code.
            {user.marketingConsent
              ? " You allowed GoLah! to use this email for marketing."
              : ""}
          </p>
          <div className="actions">
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
            <Link className="btn" to="/favorites">
              Open favourites
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Sign in</h2>
      <p className="muted">
        Create an account or log in with a one-time code sent to your email. Favourites already
        saved on this device will be attached to that email.
      </p>
      {status && <div className="banner">{status}</div>}

      {step === "email" ? (
        <form className="card" onSubmit={(e) => void onSend(e)}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I have read the{" "}
              <Link to="/terms" target="_blank" rel="noreferrer">
                Terms &amp; Conditions
              </Link>{" "}
              and I allow the app owner to use this email address for marketing purposes. Required to
              create a new account.
            </span>
          </label>
          <p className="muted">
            Returning users can request a code without ticking the box again. New accounts need the
            disclaimer checked.
          </p>
          <div className="actions">
            <button className="primary" type="submit" disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </div>
        </form>
      ) : (
        <form className="card" onSubmit={(e) => void onVerify(e)}>
          <p className="muted">
            {isNew ? "Creating your account for " : "Signing in as "}
            <strong>{email}</strong>
          </p>
          <label htmlFor="otp">6-digit code</label>
          <input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
          />
          <div className="actions">
            <button className="primary" type="submit" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Verify and sign in"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStep("email");
                setCode("");
                setStatus(null);
              }}
            >
              Use a different email
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
