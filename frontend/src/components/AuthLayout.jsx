import { Link } from 'react-router-dom';

export default function AuthLayout({ title, subtitle, alternateText, alternateLink, children }) {
  return (
    <main className="auth-shell">
      <section className="brand-panel" aria-label="Smart Visa Tracker introduction">
        <Link className="brand" to="/">Smart Visa Tracker</Link>
        <div>
          <p className="eyebrow">Your documents, one secure place</p>
          <h1>Travel prepared.<br />Stay ahead.</h1>
          <p className="brand-copy">
            A focused home for passports, visas, travel documents, and the dates that matter.
          </p>
        </div>
        <p className="security-note">Protected account access</p>
      </section>

      <section className="form-panel">
        <div className="form-card">
          <p className="eyebrow">Account access</p>
          <h2>{title}</h2>
          <p className="form-subtitle">{subtitle}</p>
          {children}
          <p className="alternate-link">
            {alternateText} <Link to={alternateLink.to}>{alternateLink.label}</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

