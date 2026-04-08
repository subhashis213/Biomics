import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAuditLogsAdmin } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';

export default function AdminAuditLogPage() {
  const navigate = useNavigate();
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogPagination, setAuditLogPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [auditLogFilter, setAuditLogFilter] = useState({ action: '', actor: '' });
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const [refreshPulse, setRefreshPulse] = useState(false);
  const [banner, setBanner] = useState(null);

  useAutoDismissMessage(banner, setBanner);

  async function loadAuditLogs(page = 1, filter = auditLogFilter) {
    setAuditLogLoading(true);
    try {
      const res = await fetchAuditLogsAdmin({ page, limit: 20, ...filter });
      const logs = Array.isArray(res?.logs) ? res.logs : [];
      const normalizedTotal = Number.isFinite(Number(res?.pagination?.total))
        ? Number(res.pagination.total)
        : Number.isFinite(Number(res?.total))
          ? Number(res.total)
          : logs.length;
      const total = Math.max(normalizedTotal, logs.length);
      const limit = Number.isFinite(Number(res?.pagination?.limit))
        ? Number(res.pagination.limit)
        : 20;
      const totalPages = Number.isFinite(Number(res?.pagination?.totalPages))
        ? Number(res.pagination.totalPages)
        : Math.max(1, Math.ceil(total / Math.max(1, limit)));
      const currentPage = Number.isFinite(Number(res?.pagination?.page))
        ? Number(res.pagination.page)
        : page;

      setAuditLogs(logs);
      setAuditLogPagination({ page: currentPage, totalPages, total });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load audit logs.' });
    } finally {
      setAuditLogLoading(false);
    }
  }

  useEffect(() => {
    loadAuditLogs(1, auditLogFilter);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadAuditLogs(auditLogPagination.page, auditLogFilter);
    }, 20000);
    return () => clearInterval(timer);
  }, [auditLogPagination.page, auditLogFilter]);

  function triggerRefreshPulse() {
    setRefreshPulse(false);
    window.requestAnimationFrame(() => {
      setRefreshPulse(true);
      window.setTimeout(() => setRefreshPulse(false), 720);
    });
  }

  async function handleManualRefresh() {
    await loadAuditLogs(auditLogPagination.page, auditLogFilter);
    triggerRefreshPulse();
  }

  return (
    <AppShell
      title="Audit Log"
      subtitle="Security and admin action trail in a focused workspace"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`secondary-btn workspace-refresh-btn${auditLogLoading ? ' is-loading' : ''}${refreshPulse ? ' is-done' : ''}`}
            onClick={handleManualRefresh}
            disabled={auditLogLoading}
          >
            <span className="workspace-refresh-btn-icon" aria-hidden="true">↻</span>
            {auditLogLoading ? 'Refreshing...' : refreshPulse ? 'Updated' : 'Refresh'}
          </button>
          <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
      )}
    >
      <main className="admin-workspace-page">
        <section className="workspace-hero workspace-hero-audit">
          <div>
            <p className="eyebrow">Audit Logs</p>
            <h2>Track admin actions and target changes</h2>
            <p className="subtitle">Dedicated colorful table view for security tracing and compliance review.</p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label="Total Events" value={auditLogPagination.total} />
            <StatCard label="Current Page" value={auditLogPagination.page} />
          </div>
        </section>

        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        <section className="card analytics-card workspace-panel">
          <div className="analytics-filters">
            <input
              className="analytics-filter-input"
              type="text"
              placeholder="Filter by action (e.g. DELETE)..."
              value={auditLogFilter.action}
              onChange={(event) => setAuditLogFilter((f) => ({ ...f, action: event.target.value }))}
            />
            <input
              className="analytics-filter-input"
              type="text"
              placeholder="Filter by admin username..."
              value={auditLogFilter.actor}
              onChange={(event) => setAuditLogFilter((f) => ({ ...f, actor: event.target.value }))}
            />
            <button
              className="primary-btn"
              type="button"
              onClick={() => loadAuditLogs(1, auditLogFilter)}
              disabled={auditLogLoading}
            >
              {auditLogLoading ? 'Loading...' : 'Search'}
            </button>
            <button
              className="secondary-btn"
              type="button"
              onClick={() => {
                const clearFilter = { action: '', actor: '' };
                setAuditLogFilter(clearFilter);
                loadAuditLogs(1, clearFilter);
              }}
            >
              Clear
            </button>
          </div>

          <div className="analytics-section-scroll">
            {!auditLogs.length && !auditLogLoading ? (
              <p className="empty-note">No audit events found.</p>
            ) : (
              <div className="analytics-table-wrap">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Target Type</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log._id}>
                        <td className="date-cell">{new Date(log.createdAt).toLocaleString()}</td>
                        <td><strong>{log.actorUsername}</strong></td>
                        <td><span className="action-badge">{log.action}</span></td>
                        <td>{log.targetType}</td>
                        <td className="details-cell">
                          {Object.entries(log.details || {}).filter(([key]) => key !== 'snapshot').map(([key, value]) => (
                            <span key={key} className="detail-chip">{key}: {String(value)}</span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {auditLogPagination.totalPages > 1 ? (
            <div className="pagination-bar">
              <button
                className="secondary-btn pagination-btn"
                disabled={auditLogPagination.page <= 1}
                onClick={() => loadAuditLogs(auditLogPagination.page - 1)}
              >
                ← Prev
              </button>
              <span className="pagination-info">
                Page {auditLogPagination.page} of {auditLogPagination.totalPages}
              </span>
              <button
                className="secondary-btn pagination-btn"
                disabled={auditLogPagination.page >= auditLogPagination.totalPages}
                onClick={() => loadAuditLogs(auditLogPagination.page + 1)}
              >
                Next →
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </AppShell>
  );
}
