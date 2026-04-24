import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';

const WORKSPACE_CARDS = [
  {
    id: 'course-setup',
    title: 'Course Setup',
    description: 'Create and manage courses, batches, and pricing',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M12 6v4" />
        <path d="M12 14h.01" />
      </svg>
    ),
    color: '#2563eb',
    route: '/admin/course-workspace/setup'
  },
  {
    id: 'module-topic-upload',
    title: 'Module & Topic & Upload',
    description: 'Create modules, topics, and upload video content',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M12 18v-6" />
        <path d="M9 15l3 3 3-3" />
      </svg>
    ),
    color: '#0f766e',
    route: '/admin/course-workspace/module-topic'
  },
  {
    id: 'content-migration',
    title: 'Content Migration',
    description: 'Move or copy content between courses and batches',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" />
        <path d="M12 5l7 7-7 7" />
        <path d="M19 12v7" />
        <path d="M19 5H12" />
      </svg>
    ),
    color: '#d97706',
    route: '/admin/content-migration'
  }
];

export default function AdminCourseWorkspaceLandingPage() {
  const navigate = useNavigate();

  return (
    <AppShell
      title="Course Workspace"
      subtitle="Choose a focused workflow to manage courses and content"
      roleLabel="Admin"
      actions={(
        <div className="workspace-header-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/admin')}>
            Back to Dashboard
          </button>
        </div>
      )}
    >
      <div className="workspace-landing-container">
        <div className="workspace-landing-header">
          <p className="workspace-kicker">Course Management</p>
          <h1>Course Workspace</h1>
          <p>Select a workspace below to manage setup, content building, or migration tasks.</p>
        </div>

        <div className="workspace-landing-grid">
          {WORKSPACE_CARDS.map((card) => (
            <button
              key={card.id}
              type="button"
              className="workspace-landing-card"
              onClick={() => navigate(card.route)}
              style={{ '--card-accent': card.color }}
            >
              <div className="workspace-landing-icon" style={{ color: card.color }}>
                {card.icon}
              </div>
              <div className="workspace-landing-content">
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </div>
              <div className="workspace-landing-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        .workspace-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .workspace-landing-container {
          width: min(1160px, 100%);
          margin: 0 auto;
          padding: clamp(8px, 1.8vw, 18px);
        }

        .workspace-landing-header {
          margin-bottom: clamp(18px, 3vw, 28px);
        }

        .workspace-kicker {
          margin: 0 0 8px 0;
          font-size: 0.78rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-secondary, #6b7280);
          font-weight: 600;
        }

        .workspace-landing-header h1 {
          font-size: clamp(1.45rem, 2.4vw, 1.9rem);
          font-weight: 700;
          color: var(--text-primary, #111827);
          margin: 0 0 10px 0;
          line-height: 1.2;
        }

        .workspace-landing-header p {
          font-size: 0.95rem;
          color: var(--text-secondary, #6b7280);
          margin: 0;
          max-width: 720px;
          line-height: 1.5;
        }

        .workspace-landing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
          gap: clamp(14px, 2.2vw, 20px);
          align-items: stretch;
        }

        .workspace-landing-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: clamp(16px, 2.2vw, 20px);
          min-height: 122px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(249, 250, 251, 0.98) 100%);
          border: 1px solid color-mix(in srgb, var(--card-accent) 12%, var(--border-color, #e5e7eb));
          border-radius: 14px;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          text-align: left;
          width: 100%;
        }

        .workspace-landing-card:hover {
          border-color: var(--card-accent);
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
          transform: translateY(-2px);
        }

        .workspace-landing-card:focus-visible {
          outline: 2px solid var(--card-accent);
          outline-offset: 2px;
        }

        .workspace-landing-icon {
          flex-shrink: 0;
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--card-accent) 12%, #ffffff);
          border: 1px solid color-mix(in srgb, var(--card-accent) 20%, #ffffff);
          border-radius: 10px;
        }

        .workspace-landing-content {
          flex: 1;
          min-width: 0;
        }

        .workspace-landing-content h3 {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary, #111827);
          margin: 0 0 6px 0;
          line-height: 1.25;
        }

        .workspace-landing-content p {
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
          margin: 0;
          line-height: 1.4;
        }

        .workspace-landing-arrow {
          flex-shrink: 0;
          color: var(--text-secondary, #9ca3af);
          transition: transform 0.2s ease, color 0.2s ease;
        }

        .workspace-landing-card:hover .workspace-landing-arrow {
          color: var(--card-accent);
          transform: translateX(4px);
        }

        @media (max-width: 768px) {
          .workspace-landing-container {
            padding: 6px 2px;
          }

          .workspace-landing-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .workspace-landing-card {
            padding: 16px;
            min-height: 108px;
          }

          .workspace-landing-icon {
            width: 44px;
            height: 44px;
          }
        }

        @media (max-width: 480px) {
          .workspace-header-actions {
            width: 100%;
          }

          .workspace-header-actions .secondary-btn {
            width: 100%;
          }
        }
      `}</style>
    </AppShell>
  );
}