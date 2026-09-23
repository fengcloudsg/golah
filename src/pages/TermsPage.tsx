import { useEffect, useState } from "react";
import { fetchTerms } from "../lib/api";

export function TermsPage() {
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTerms()
      .then((data) => setHtml(data.html || ""))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="page">
      <h2>Terms &amp; Conditions</h2>
      {error && <div className="banner error">{error}</div>}
      <article className="card terms-html" dangerouslySetInnerHTML={{ __html: html || "<p>Loading…</p>" }} />
    </div>
  );
}
