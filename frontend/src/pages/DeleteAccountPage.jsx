import { Link } from 'react-router-dom';
import logoImg from '../assets/biomics-logo.jpeg';

const LAST_UPDATED = 'June 5, 2026';
const SUPPORT_EMAIL = 'biomicshub@gmail.com';

const DELETED_DATA = [
  'Account profile (username, phone, email, city, course, date of birth, profile photo)',
  'Login credentials and Google Sign-In link to your account',
  'Course subscriptions, enrollments, and purchased access',
  'Test series purchases and unlocks',
  'Quiz, topic test, mock exam, and full mock attempt history',
  'Learning progress, completed videos, and favorites',
  'Community chat membership and push notification device tokens',
  'Feedback you submitted and in-app assistant chat history',
  'Payment and test-series payment records stored in Biomics Hub'
];

const KEPT_DATA = [
  'Aggregated, non-identifiable analytics that cannot be linked back to you',
  'Community chat messages may be anonymized or marked deleted on our chat provider; residual copies in backups may persist for a limited period',
  'Payment transaction records held by our payment processor (e.g. Razorpay) as required by their policies and applicable law — Biomics Hub does not store full card details',
  'Records we must retain to comply with legal, tax, or fraud-prevention obligations'
];

export default function DeleteAccountPage() {
  return (
    <div className="lp-root lp-legal-page">
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-nav-brand lp-legal-brand-link">
            <img src={logoImg} alt="Biomics Hub" className="lp-nav-logo" />
            <span className="lp-nav-name">Biomics Hub</span>
          </Link>
          <Link to="/" className="lp-btn-ghost lp-legal-back-btn">← Back to Home</Link>
        </div>
      </nav>

      <main className="lp-legal-main">
        <div className="lp-legal-inner">
          <header className="lp-legal-header">
            <p className="lp-eyebrow">BiomicsHub · Account deletion</p>
            <h1 className="lp-legal-title">Delete your Biomics Hub account</h1>
            <p className="lp-legal-updated">Last updated: {LAST_UPDATED}</p>
            <p className="lp-legal-intro">
              This page explains how users of <strong>BiomicsHub</strong> (Biomics Hub web app and Android app)
              can request permanent deletion of their account and associated personal data.
            </p>
          </header>

          <div className="lp-legal-content">
            <section className="lp-legal-section lp-delete-steps-card">
              <h2>How to delete your account (in the app)</h2>
              <p>You can delete your account yourself — no email required:</p>
              <ol className="lp-delete-steps">
                <li>Sign in to <strong>biomicshub.com</strong> with your student account.</li>
                <li>Open your <strong>Student Dashboard</strong>.</li>
                <li>Click your <strong>Profile</strong> icon (top area) to open <strong>Profile Settings</strong>.</li>
                <li>Scroll to the <strong>Danger zone</strong> section at the bottom.</li>
                <li>Click <strong>Delete Account</strong>.</li>
                <li>Read the warning, type <strong>DELETE</strong> in the confirmation box, and click <strong>Delete my account permanently</strong>.</li>
              </ol>
              <p>
                Your account and associated data listed below are removed immediately after confirmation.
                You will be signed out automatically.
              </p>
            </section>

            <section className="lp-legal-section">
              <h2>Request deletion by email</h2>
              <p>
                If you cannot sign in or need help, email us at{' '}
                <a href={`mailto:${SUPPORT_EMAIL}?subject=BiomicsHub%20Account%20Deletion%20Request`}>
                  {SUPPORT_EMAIL}
                </a>{' '}
                with the subject line <strong>BiomicsHub Account Deletion Request</strong> and include:
              </p>
              <ul className="lp-delete-bullet-list">
                <li>Your registered username</li>
                <li>Your registered phone number</li>
                <li>The email address linked to your account (if any)</li>
              </ul>
              <p>
                We will verify ownership and complete deletion within <strong>7 business days</strong>.
              </p>
            </section>

            <section className="lp-legal-section">
              <h2>Data that is deleted</h2>
              <p>When your Biomics Hub account is deleted, we permanently remove:</p>
              <ul className="lp-delete-bullet-list">
                {DELETED_DATA.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="lp-legal-section">
              <h2>Data that may be kept</h2>
              <ul className="lp-delete-bullet-list">
                {KEPT_DATA.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="lp-legal-section">
              <h2>Retention period</h2>
              <p>
                Most personal data is deleted immediately when you confirm account deletion in the app,
                or within <strong>7 business days</strong> of a verified email request.
              </p>
              <p>
                Encrypted server backups may retain deleted data for up to <strong>30 days</strong> before
                being overwritten. Data we are legally required to retain (for example tax or fraud-prevention
                records held by payment processors) may be kept for the period required by applicable law.
              </p>
            </section>

            <section className="lp-legal-section">
              <h2>Contact</h2>
              <p>
                Biomics Hub · Bhubaneswar, Khandagiri, Lane R7, Odisha, PIN 751030
                <br />
                Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                <br />
                Hours: Mon – Sat, 9:00 AM – 9:00 PM IST
              </p>
              <p>
                See also our <Link to="/privacy-policy">Privacy Policy</Link>.
              </p>
            </section>
          </div>
        </div>
      </main>

      <footer className="lp-legal-footer">
        <p>© {new Date().getFullYear()} Biomics Hub. All rights reserved.</p>
        <Link to="/">Return to Home</Link>
      </footer>
    </div>
  );
}
