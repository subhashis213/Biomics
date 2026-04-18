import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchAdminUsers } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';

function formatJoinedDate(value) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export default function AdminRegisteredLearnersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [learners, setLearners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 18, totalPages: 1, total: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [banner, setBanner] = useState(null);

  useAutoDismissMessage(banner, setBanner);

  useEffect(() => {
    let ignore = false;

    async function loadLearners() {
      if (loading) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const result = await fetchAdminUsers({ page, limit: 18, search: searchQuery });
        if (ignore) return;
        setLearners(Array.isArray(result?.users) ? result.users : []);
        setPagination(result?.pagination || { page, limit: 18, totalPages: 1, total: 0 });
      } catch (error) {
        if (!ignore) {
          setBanner({ type: 'error', text: error.message || 'Failed to load registered learners.' });
        }
      } finally {
        if (!ignore) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadLearners();
    return () => {
      ignore = true;
    };
  }, [page, searchQuery]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    setPage(1);
    setSearchQuery(String(searchInput || '').trim());
  }

  function handleResetSearch() {
    setSearchInput('');
    setPage(1);
    setSearchQuery('');
  }

  const learnerStats = useMemo(() => {
    const uniqueCities = new Set(
      learners.map((learner) => String(learner.city || '').trim()).filter(Boolean)
    ).size;
    const withEmail = learners.filter((learner) => String(learner.email || '').trim()).length;
    const withPhone = learners.filter((learner) => String(learner.phone || '').trim()).length;
    return {
      uniqueCities,
      withEmail,
      withPhone
    };
  }, [learners]);

  return (
    <AppShell
      title="Registered Learners"
      subtitle="Dedicated admin page for viewing all enrolled learners"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <div className="registered-learners-topbar-actions">
          <button
            type="button"
            className={`secondary-btn workspace-refresh-btn${refreshing ? ' is-loading' : ''}`}
            onClick={() => {
              setPage(1);
              setSearchQuery((current) => current);
              setRefreshing(true);
              fetchAdminUsers({ page, limit: 18, search: searchQuery })
                .then((result) => {
                  setLearners(Array.isArray(result?.users) ? result.users : []);
                  setPagination(result?.pagination || { page, limit: 18, totalPages: 1, total: 0 });
                })
                .catch((error) => setBanner({ type: 'error', text: error.message || 'Failed to refresh learners.' }))
                .finally(() => setRefreshing(false));
            }}
            disabled={refreshing}
          >
            <span className="workspace-refresh-btn-icon" aria-hidden="true">↻</span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
      )}
    >
      <main className="admin-workspace-page registered-learners-page">
        <section className="workspace-hero registered-learners-hero">
          <div>
            <p className="eyebrow">Learner Directory</p>
            <h2>See every registered learner in one dedicated admin workspace</h2>
            <p className="subtitle">Search by username, city or email and review the full learner table in a cleaner dedicated admin page.</p>
          </div>
          <div className="workspace-hero-stats registered-learners-hero-stats">
            <StatCard label="Total Learners" value={pagination.total || learners.length} />
            <StatCard label="This Page" value={learners.length} />
            <StatCard label="Cities" value={learnerStats.uniqueCities} />
            <StatCard label="With Email" value={learnerStats.withEmail} />
          </div>
        </section>

        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        <section className="card workspace-panel registered-learners-search-panel">
          <div className="section-header compact registered-learners-section-header">
            <div>
              <p className="eyebrow">Search Learners</p>
              <h3>Filter the learner table</h3>
            </div>
            <StatCard label="With Phone" value={learnerStats.withPhone} />
          </div>

          <form className="registered-learners-search-row" onSubmit={handleSearchSubmit}>
            <label className="registered-learners-search-field">
              <span>Search</span>
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search username, city, or email"
              />
            </label>
            <button type="submit" className="primary-btn">Apply Search</button>
            <button type="button" className="secondary-btn" onClick={handleResetSearch}>Reset</button>
          </form>
        </section>

        <section className="card workspace-panel registered-learners-table-panel">
          <div className="section-header compact registered-learners-section-header">
            <div>
              <p className="eyebrow">Detailed Table</p>
              <h3>All learner data in readable columns</h3>
              <p className="subtitle">Registered On is the date when the learner account was created.</p>
            </div>
            <StatCard label="Page" value={`${pagination.page || 1}/${pagination.totalPages || 1}`} />
          </div>

          {!learners.length && !loading ? (
            <p className="empty-note">No learner data to display.</p>
          ) : (
            <>
              <div className="registered-learners-mobile-list">
                {learners.map((learner) => (
                  <article key={`${learner.username}-${learner.phone}-mobile`} className="registered-learners-mobile-item">
                    <div className="registered-learners-mobile-head">
                      <strong>{learner.username || 'Unnamed learner'}</strong>
                      {learner.class ? <span className="student-course-badge">{learner.class}</span> : null}
                    </div>
                    <div className="registered-learners-mobile-grid">
                      <div><span>Phone</span><strong>{learner.phone || 'Not available'}</strong></div>
                      <div><span>City</span><strong>{learner.city || 'Not available'}</strong></div>
                      <div><span>Email</span><strong>{learner.email || 'Not available'}</strong></div>
                      <div><span>Registered On</span><strong>{formatJoinedDate(learner.createdAt)}</strong></div>
                    </div>
                    <div className="registered-learners-mobile-actions">
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => navigate(`/admin/registered-learners/${encodeURIComponent(learner.username || '')}`, {
                          state: { from: `${location.pathname}${location.search}` }
                        })}
                      >
                        Open Insights
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="analytics-table-wrap registered-learners-table-wrap">
                <table className="analytics-table registered-learners-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Class</th>
                      <th>Phone</th>
                      <th>City</th>
                      <th>Email</th>
                      <th>Registered On</th>
                      <th>Insights</th>
                    </tr>
                  </thead>
                  <tbody>
                    {learners.map((learner) => (
                      <tr key={`${learner.username}-${learner.phone}-table`}>
                        <td><strong>{learner.username || 'Unnamed learner'}</strong></td>
                        <td>{learner.class || 'Not available'}</td>
                        <td>{learner.phone || 'Not available'}</td>
                        <td>{learner.city || 'Not available'}</td>
                        <td>{learner.email || 'Not available'}</td>
                        <td>{formatJoinedDate(learner.createdAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="secondary-btn registered-learners-open-btn"
                            onClick={() => navigate(`/admin/registered-learners/${encodeURIComponent(learner.username || '')}`, {
                              state: { from: `${location.pathname}${location.search}` }
                            })}
                          >
                            Open Insights
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="registered-learners-pagination">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={loading || page <= 1}
            >
              ← Previous
            </button>
            <span className="registered-learners-pagination-label">
              Page {pagination.page || 1} of {pagination.totalPages || 1}
            </span>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setPage((current) => Math.min(pagination.totalPages || current, current + 1))}
              disabled={loading || page >= (pagination.totalPages || 1)}
            >
              Next →
            </button>
          </div>
        </section>
      </main>
    </AppShell>
  );
}