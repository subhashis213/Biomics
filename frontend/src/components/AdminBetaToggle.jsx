import { useAdminBetaStore } from '../stores/adminBetaStore';

export default function AdminBetaToggle({ compact = false }) {
  const { adminBetaEnabled, toggleAdminBeta } = useAdminBetaStore();

  return (
    <button
      type="button"
      className={`admin-beta-toggle${adminBetaEnabled ? ' admin-beta-toggle--on' : ''}${compact ? ' admin-beta-toggle--compact' : ''}`}
      role="switch"
      aria-checked={adminBetaEnabled}
      aria-label="Toggle beta admin UI"
      onClick={toggleAdminBeta}
    >
      <span className="admin-beta-toggle-copy">
        <strong>{compact ? 'Beta UI' : 'Beta Version'}</strong>
        {!compact ? (
          <small>Premium modern admin layout &amp; colors</small>
        ) : null}
      </span>
      <span className="admin-beta-toggle-track" aria-hidden="true">
        <span className="admin-beta-toggle-thumb" />
      </span>
    </button>
  );
}
