import { Link } from 'react-router-dom';
import logoImg from '../assets/biomics-logo.jpeg';

const LAST_UPDATED = 'May 29, 2026';

const SECTIONS = [
  {
    title: '1. Introduction',
    body: `Biomics Hub ("we", "us", or "our") operates the website biomicshub.com, our web application, and the Biomics Hub mobile app (collectively, the "Platform"). This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our Platform.

By creating an account, signing in, enrolling in courses, or otherwise using Biomics Hub, you agree to the practices described in this policy. If you do not agree, please do not use the Platform.`
  },
  {
    title: '2. Information We Collect',
    body: `We may collect the following categories of information:

• Account details: name, username, email address, phone number, date of birth, password (stored in hashed form), and profile information you provide during registration or Google Sign-In.

• Learning activity: course enrollments, lecture progress, quiz and test attempts, scores, mock exam results, study material downloads, and performance analytics.

• Communication data: messages sent in community chat, live class interactions, feedback submissions, and support requests.

• Payment-related information: transaction references, course purchases, and billing status. We do not store full debit/credit card numbers on our servers; payments are processed through secure third-party payment providers where applicable.

• Device and technical data: browser type, IP address, device identifiers, operating system, app version, push notification tokens, and usage logs used to keep the Platform secure and reliable.

• Files you upload: attachments shared in community chat (such as images or PDFs) when you choose to send them.`
  },
  {
    title: '3. How We Use Your Information',
    body: `We use your information to:

• Create and manage your account and authenticate your access.
• Deliver courses, live classes, quizzes, test series, study materials, and related learning features.
• Track your progress and provide insights, reports, and recommendations.
• Send service-related notifications, including class reminders, announcements, and push notifications (where enabled).
• Operate community chat and live learning features.
• Process enrollments, payments, and support requests.
• Improve Platform performance, fix bugs, and develop new features.
• Detect fraud, abuse, and unauthorized access.
• Comply with applicable laws and respond to lawful requests.`
  },
  {
    title: '4. Cookies & Local Storage',
    body: `Our web application may use cookies, local storage, or similar technologies to keep you signed in, remember preferences (such as theme settings), and maintain session security. You can control cookies through your browser settings, but disabling them may limit some Platform features.`
  },
  {
    title: '5. Third-Party Services',
    body: `We use trusted third-party providers to operate Biomics Hub. These may include:

• Google Sign-In / Firebase — authentication and mobile app services.
• Cloud hosting and infrastructure providers — application hosting and file storage.
• Stream Chat — real-time community messaging.
• Live video providers — live class streaming.
• Cloudinary or similar services — secure storage and delivery of study materials and attachments.
• Push notification services — mobile alerts for classes, announcements, and updates.

These providers process data only as needed to perform their services and are subject to their own privacy policies. We do not sell your personal information to advertisers.`
  },
  {
    title: '6. How We Share Information',
    body: `We do not sell or rent your personal data. We may share information only in these situations:

• With instructors and administrators, to deliver courses, review learner progress, and provide support.
• With service providers who help us operate the Platform under confidentiality obligations.
• When required by law, court order, or government request.
• To protect the rights, safety, and security of Biomics Hub, our users, or the public.
• With your consent or at your direction (for example, when you post in community chat visible to other members).`
  },
  {
    title: '7. Data Retention',
    body: `We retain your information for as long as your account is active or as needed to provide services, comply with legal obligations, resolve disputes, and enforce our agreements. When data is no longer required, we delete or anonymize it using reasonable security practices.`
  },
  {
    title: '8. Your Rights & Choices',
    body: `Depending on applicable law, you may have the right to:

• Access, update, or correct your profile information from your account settings.
• Delete your account and associated personal data at https://biomicshub.com/delete-account (in-app self-service or by email request).
• Opt out of non-essential push notifications through your device or app settings.
• Withdraw consent where processing is based on consent.

To exercise these rights, contact us at biomicshub@gmail.com. We will respond within a reasonable timeframe.`
  },
  {
    title: '9. Children\'s Privacy',
    body: `Biomics Hub is intended for students and exam aspirants. We do not knowingly collect personal information from children under 13 without appropriate parental consent. If you believe a child has provided us personal data without consent, please contact us and we will take appropriate steps to remove it.`
  },
  {
    title: '10. Data Security',
    body: `We implement administrative, technical, and organizational safeguards to protect your information, including encrypted connections (HTTPS), secure authentication, access controls, and monitoring for suspicious activity. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.`
  },
  {
    title: '11. International Users',
    body: `Biomics Hub is operated from India. If you access the Platform from outside India, your information may be processed and stored in India or in countries where our service providers operate, subject to applicable data protection laws.`
  },
  {
    title: '12. Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. When we make material changes, we will update the "Last updated" date on this page. Continued use of the Platform after changes are posted constitutes acceptance of the revised policy.`
  },
  {
    title: '13. Contact Us',
    body: `If you have questions, concerns, or requests regarding this Privacy Policy or your personal data, contact us:

Biomics Hub
Bhubaneswar, Khandagiri, Lane R7, Odisha, PIN 751030
Email: biomicshub@gmail.com
Hours: Mon – Sat, 9:00 AM – 9:00 PM`
  }
];

export default function PrivacyPolicyPage() {
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
            <p className="lp-eyebrow">Legal</p>
            <h1 className="lp-legal-title">Privacy Policy</h1>
            <p className="lp-legal-updated">Last updated: {LAST_UPDATED}</p>
            <p className="lp-legal-intro">
              This policy describes how Biomics Hub collects, uses, and protects your personal information
              when you use our website, web app, and mobile application.
            </p>
          </header>

          <div className="lp-legal-content">
            {SECTIONS.map((section) => (
              <section key={section.title} className="lp-legal-section">
                <h2>{section.title}</h2>
                {section.body.split('\n\n').map((paragraph) => (
                  <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                ))}
              </section>
            ))}
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
