import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { applyRecoveryActionAdmin, fetchRecoveryActionsAdmin } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';

export default function AdminRecoveryCenterPage() {
  const navigate = useNavigate();
  const [recoveryActions, setRecoveryActions] = useState([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryApplyingId, setRecoveryApplyingId] = useState('');
  const [recoveryFilter, setRecoveryFilter] = useState({ from: '', to: '' });
  const [banner, setBanner] = useState(null);

  useAutoDismissMessage(banner, setBanner);

  async function loadRecoveryActions(limit = 30, filter = recoveryFilter) {
    setRecoveryLoading(true);
    try {
      const res = await fetchRecoveryActionsAdmin({ limit, ...filter });
      setRecoveryActions(Array.isArray(res?.actions) ? res.actions : []);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load recovery actions.' });
    } finally {
      setRecoveryLoading(false);
    }
  }

  useEffect(() => {
    loadRecoveryActions(30, recoveryFilter);
  }, []);

  async function handleApplyRecoveryAction(log) {
    if (!log?._id || recoveryApplyingId) return;
    if (!log?.recovery?.supported) {
      setBanner({ type: 'error', text: log?.recovery?.reason || 'This action is not recoverable.' });
      return;
    }
    if (log?.recovery?.alreadyApplied) {
      setBanner({ type: 'error', text: 'This recovery action is already applied.' });
      return;
    }

    const label = log?.recovery?.label || 'Apply recovery action';
    const confirmed = window.confirm(`${label}? This will modify live data.`);
    if (!confirmed) return;

    setRecoveryApplyingId(log._id);
    try {
      const res = await applyRecoveryActionAdmin(log._id);
      setBanner({ type: 'success', text: res?.message || 'Recovery action applied.' });
      await loadRecoveryActions(30, recoveryFilter);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to apply recovery action.' });
    } finally {
      setRecoveryApplyingId('');
    }
  }

  return (
    <AppShell
      title="Recovery Center"
      subtitle="Rollback-ready workspace for recoverable admin actions"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
      )}
    >
      <main className="admin-workspace-page">
        <section className="workspace-hero workspace-hero-recovery">
          <div>
            <p className="eyebrow">Recovery Center</p>
            <h2>Search recoverable actions and restore safely</h2>
            <p className="subtitle">Dedicated colorful interface for action-level rollback and operational safety.</p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label="Recoverable Events" value={recoveryActions.length} />
            <StatCard label="Applying" value={recoveryApplyingId ? 1 : 0} />
          </div>
        </section>

        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        <section className="card analytics-card recovery-center-card workspace-panel">
          <div className="analytics-filters">
            <label className="recovery-date-filter" aria-label="Recovery from date">
              <span>From date</span>
              <input
                className="analytics-filter-input recovery-date-input"
                type="date"
                value={recoveryFilter.from}
                onChange={(event) => setRecoveryFilter((prev) => ({ ...prev, from: event.target.value }))}
              />
            </label>
            <label className="recovery-date-filter" aria-label="Recovery to date">
              <span>To date</span>
              <input
                className="analytics-filter-input recovery-date-input"
                type="date"
                value={recoveryFilter.to}
                onChange={(event) => setRecoveryFilter((prev) => ({ ...prev, to: event.target.value }))}
              />
            </label>
            <button
              className="primary-btn recovery-search-btn"
              type="button"
              onClick={() => loadRecoveryActions(30, recoveryFilter)}
              disabled={recoveryLoading}
            >
              {recoveryLoading ? 'Loading...' : 'Search'}
            </button>
            <button
              className="secondary-btn recovery-clear-btn"
              type="button"
              onClick={() => {
                const clearFilter = { from: '', to: '' };
                setRecoveryFilter(clearFilter);
                loadRecoveryActions(30, clearFilter);
              }}
              disabled={recoveryLoading}
            >
              Clear
            </button>
          </div>

          <div className="analytics-section-scroll">
            {!recoveryActions.length && !recoveryLoading ? (
              <p className="empty-note">No recovery actions found yet.</p>
            ) : (
              <div className="analytics-table-wrap">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Recovery</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recoveryActions.map((log) => {
                      const supported = Boolean(log?.recovery?.supported);
                      const alreadyApplied = Boolean(log?.recovery?.alreadyApplied);
                      const isApplying = recoveryApplyingId === log._id;

                      return (
                        <tr key={log._id}>
                          <td className="date-cell">{new Date(log.createdAt).toLocaleString()}</td>
                          <td><span className="action-badge">{log.action}</span></td>
                          <td>{log.targetType} {log.targetId ? `(${log.targetId})` : ''}</td>
                          <td>
                            {supported ? (
                              <button
                                type="button"
                                className="secondary-btn recovery-action-btn"
                                onClick={() => handleApplyRecoveryAction(log)}
                                disabled={alreadyApplied || isApplying || Boolean(recoveryApplyingId)}
                                aria-label={isApplying ? 'Applying recovery action' : (log?.recovery?.label || 'Apply recovery action')}
                                title={isApplying ? 'Applying...' : (log?.recovery?.label || 'Apply')}
                              >
                                <span className="recovery-action-btn-text">
                                  {isApplying ? 'Applying...' : (log?.recovery?.label || 'Apply')}
                                </span>
                                <span className="recovery-action-btn-icon" aria-hidden="true">
                                  {isApplying ? '…' : '↺'}
                                </span>
                              </button>
                            ) : (
                              <span className="optional-note recovery-action-note" title="Not supported" aria-label="Not supported">
                                <span className="recovery-action-note-text">Not supported</span>
                                <span className="recovery-action-note-icon" aria-hidden="true">⦸</span>
                              </span>
                            )}
                          </td>
                          <td>
                            {alreadyApplied
                              ? <span className="detail-chip">Applied</span>
                              : (supported ? <span className="detail-chip">Ready</span> : <span className="detail-chip">{log?.recovery?.reason || 'Unavailable'}</span>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
