import React from "react";
import { Link } from "react-router-dom";
import { useText } from "./text.js";
import { SectionHead } from "./ui.jsx";

/* Terms and Privacy: plain text from Site Text. A blank line starts a new paragraph; a short line before a paragraph reads as a heading. */
export default function LegalPage({ kind }) {
  const t = useText();
  const title = kind === "privacy" ? t.privacyTitle : t.termsTitle;
  const body = String(kind === "privacy" ? t.privacyBody : t.termsBody) || "";
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="container page legal">
      <SectionHead as="h1" eyebrow="Legal" title={title} />
      <div className="card card-pad legal-body">
        {blocks.map((b, i) => {
          const [first, ...rest] = b.split("\n");
          return rest.length ? (
            <section key={i}>
              <h3>{first}</h3>
              <p>{rest.join(" ")}</p>
            </section>
          ) : (
            <p key={i}>{b}</p>
          );
        })}
      </div>
      <p style={{ marginTop: 22 }}><Link to="/" className="btn btn-ghost">Back to games</Link></p>
    </div>
  );
}
