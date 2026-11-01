import React from "react";
import { Link } from "react-router-dom";
import { useText } from "./text.js";
import { Icon, Reveal, SectionHead, useToast } from "./ui.jsx";

/* Payments are entered by the admin (Admin > Payment methods). There is no payment gateway here:
   each method is a name plus any of a link, a QR code and copyable details (account number, cashtag...). */

function CopyDetails({ value }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast("Copied");
    } catch {
      toast("Could not copy. Select the text and copy it by hand.", "bad");
    }
  };
  return (
    <div className="manual-detail">
      <span>{value}</span>
      <button type="button" onClick={copy} aria-label="Copy payment details" title="Copy">
        <Icon name="copy" size={16} />
      </button>
    </div>
  );
}

function MethodCard({ method, delay }) {
  const t = useText();
  return (
    <Reveal delay={delay}>
      <div className="card spot manual-card">
        <h3>{method.name}</h3>
        {method.qr ? (
          <div className="manual-qr"><img src={method.qr} alt={`${method.name} QR code`} /></div>
        ) : (
          <div className="pay-ico"><Icon name="wallet" size={26} /></div>
        )}
        {method.details ? <CopyDetails value={method.details} /> : null}
        {method.link ? (
          <a href={method.link} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-block">
            {t.openLinkBtn} <Icon name="external" size={16} />
          </a>
        ) : null}
      </div>
    </Reveal>
  );
}

export default function PaymentsPage({ payments, enabled }) {
  const t = useText();

  if (!enabled) {
    return (
      <div className="container page" style={{ paddingTop: 28 }}>
        <div className="card card-pad empty" style={{ maxWidth: 620, margin: "40px auto" }}>
          <div className="ico"><Icon name="lock" size={28} /></div>
          <SectionHead center as="h1" eyebrow={t.paymentsEyebrow} title={t.paymentsOffTitle} subtitle={t.paymentsOffText} />
          <Link to="/" className="btn btn-ghost">Back to games</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container page" style={{ paddingTop: 28 }}>
      <SectionHead as="h1" eyebrow={t.paymentsEyebrow} title={t.paymentsTitle} subtitle={t.paymentsSubtitle} />

      {t.paymentsNote ? (
        <div className="pay-note">
          <Icon name="message" size={18} />
          <span>{t.paymentsNote}</span>
        </div>
      ) : null}

      {payments.length === 0 ? (
        <div className="card empty">
          <div className="ico"><Icon name="wallet" size={28} /></div>
          {t.noPaymentsText}
        </div>
      ) : (
        <div className="manual-grid">
          {payments.map((p, i) => (
            <MethodCard key={p.id} method={p} delay={i * 70} />
          ))}
        </div>
      )}
    </div>
  );
}
