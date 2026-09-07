import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchRecycleBinAdmin,
  restoreRecycleBinItemAdmin,
  deleteRecycleBinItemPermanentAdmin,
  emptyRecycleBinAdmin
} from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';

const TABS = [
  { id: 'All', label: 'All Items', collections: 'All' },
  { id: 'Users', label: 'Users', collections: 'User' },
  { id: 'TestSeries', label: 'Test Series', collections: 'TopicTest,MockExam,FullMockTest' },
  { id: 'Videos', label: 'Videos', collections: 'Video' },
  { id: 'Quizzes', label: 'Quizzes', collections: 'Quiz' },
  { id: 'FreeLibrary', label: 'Free Library', collections: 'FreeStudyResource' },
  { id: 'Structure', label: 'Modules & Topics', collections: 'Module,Topic' }
];

function getItemPath(item) {
  if (!item?.data) return '-';
  const d = item.data;
  const parts = [];
  
  if (item.originalCollection === 'User') {
    if (d.class) parts.push(`Class: ${d.class}`);
    if (d.city) parts.push(`City: ${d.city}`);
    return parts.join(' > ') || '-';
  }

  if (d.courseName || d.course) parts.push(d.courseName || d.course);
  if (d.batchName || d.batch) parts.push(d.batchName || d.batch);
  if (d.category) parts.push(d.category);
  if (d.moduleName || d.module) parts.push(d.moduleName || d.module);
  if (d.topicName || d.topic) parts.push(d.topicName || d.topic);
  
  if (item.originalCollection === 'FreeStudyResource' && d.resourceType) {
    parts.push(`Type: ${d.resourceType}`);
  }

  return parts.length > 0 ? parts.join(' > ') : '-';
}

export default function AdminRecycleBinPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filter, setFilter] = useState({ collection: 'All', search: '' });
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [banner, setBanner] = useState(null);

  useAutoDismissMessage(banner, setBanner);

  async function loadRecycleBin(page = 1, currentFilter = filter) {
    setLoading(true);
    try {
      const res = await fetchRecycleBinAdmin({ page, limit: 30, ...currentFilter });
      const list = Array.isArray(res?.items) ? res.items : [];
      const total = Number(res?.total || list.length);
      const totalPages = Number(res?.totalPages || 1);
      const currentPage = Number(res?.page || page);

      setItems(list);
      setPagination({ page: currentPage, totalPages, total });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load recycle bin.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecycleBin(1, filter);
  }, []);

  async function handleRestore(id, summary) {
    if (!window.confirm(`Restore "${summary}" back to active status?`)) return;
    setActionInProgress(id);
    try {
      const res = await restoreRecycleBinItemAdmin(id);
      setBanner({ type: 'success', text: res.message || 'Item restored successfully!' });
      loadRecycleBin(pagination.page, filter);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to restore item.' });
    } finally {
      setActionInProgress(null);
    }
  }

  async function handlePermanentDelete(id, summary) {
    if (!window.confirm(`PERMANENTLY delete "${summary}"? This action cannot be undone!`)) return;
    setActionInProgress(id);
    try {
      const res = await deleteRecycleBinItemPermanentAdmin(id);
      setBanner({ type: 'success', text: res.message || 'Item permanently deleted.' });
      loadRecycleBin(pagination.page, filter);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to delete item.' });
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleEmptyRecycleBin() {
    const targetText = filter.collection === 'All' ? 'ALL items in the Recycle Bin' : `all "${filter.collection}" items`;
    if (!window.confirm(`Are you absolutely sure you want to permanently delete ${targetText}? This action cannot be undone!`)) return;
    setLoading(true);
    try {
      const res = await emptyRecycleBinAdmin(filter.collection);
      setBanner({ type: 'success', text: res.message || 'Recycle bin emptied.' });
      loadRecycleBin(1, filter);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to empty recycle bin.' });
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="Admin Recycle Bin"
      subtitle="Safely recover deleted modules, topics, test series, videos, and quizzes"
      badges={[{ label: 'Safe Deletion Engine', type: 'admin' }]}
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate('/admin')}>
          ← Back to Dashboard
        </button>
      )}
    >
      <div className="workspace-grid">
        <section className="card workspace-hero-card">
          <div className="workspace-hero-text">
            <h2>Recycle Bin & Data Recovery</h2>
            <p className="subtitle">
              When an admin deletes content, it is safely preserved here instead of being permanently erased from MongoDB. Restore items with a single click.
            </p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label="Archived Items" value={pagination.total} />
            <StatCard label="Current Page" value={`${pagination.page} / ${pagination.totalPages}`} />
          </div>
        </section>

        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        <section className="card analytics-card workspace-panel">
          <div className="analytics-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {TABS.map((tab) => {
              const isActive = filter.collection === tab.collections;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    const newFilter = { ...filter, collection: tab.collections };
                    setFilter(newFilter);
                    loadRecycleBin(1, newFilter);
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: isActive ? '#f8fafc' : 'transparent',
                    color: isActive ? '#0284c7' : '#64748b',
                    border: '1px solid',
                    borderColor: isActive ? '#e0f2fe' : 'transparent',
                    borderRadius: '8px',
                    fontWeight: isActive ? '600' : '400',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="analytics-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <input
              className="analytics-filter-input"
              type="text"
              placeholder="Search title, category, or admin..."
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
              style={{ flex: '1 1 220px' }}
            />
            <button
              className="primary-btn"
              type="button"
              onClick={() => loadRecycleBin(1, filter)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Filter'}
            </button>
            <button
              className="secondary-btn"
              type="button"
              onClick={() => {
                const clearFilter = { collection: 'All', search: '' };
                setFilter(clearFilter);
                loadRecycleBin(1, clearFilter);
              }}
            >
              Clear
            </button>
            {items.length > 0 && (
              <button
                className="secondary-btn"
                type="button"
                onClick={handleEmptyRecycleBin}
                style={{ backgroundColor: '#fee2e2', color: '#b91c1c', borderColor: '#f87171', marginLeft: 'auto' }}
              >
                Empty {filter.collection === 'All' ? 'Bin' : filter.collection}
              </button>
            )}
          </div>

          <div className="analytics-section-scroll" style={{ marginTop: '15px' }}>
            {!items.length && !loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <p style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px 0' }}>🎉 The Recycle Bin is Empty!</p>
                <p style={{ margin: 0 }}>No deleted items found matching your filters.</p>
              </div>
            ) : (
              <div className="analytics-table-wrap">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Deleted Date</th>
                      <th>Deleted By</th>
                      <th>Type</th>
                      <th>Item Summary</th>
                      <th>Location / Path</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item._id}>
                        <td className="date-cell">{new Date(item.deletedAt).toLocaleString()}</td>
                        <td><strong>{item.deletedBy || 'admin'}</strong></td>
                        <td>
                          <span className="action-badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                            {item.originalCollection}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: '#0f172a', display: 'block' }}>{item.summary}</strong>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>ID: {String(item.originalId)}</span>
                        </td>
                        <td>
                          <span style={{ fontSize: '13px', color: '#475569', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
                            {getItemPath(item)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="primary-btn"
                            style={{ padding: '6px 12px', fontSize: '13px', marginRight: '8px' }}
                            onClick={() => handleRestore(item._id, item.summary)}
                            disabled={actionInProgress === item._id}
                          >
                            {actionInProgress === item._id ? '...' : '↻ Restore'}
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            style={{ padding: '6px 12px', fontSize: '13px', backgroundColor: '#fee2e2', color: '#b91c1c', borderColor: '#f87171' }}
                            onClick={() => handlePermanentDelete(item._id, item.summary)}
                            disabled={actionInProgress === item._id}
                          >
                            ✕ Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {pagination.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', padding: '10px 0', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className="secondary-btn"
                disabled={pagination.page <= 1 || loading}
                onClick={() => loadRecycleBin(pagination.page - 1, filter)}
              >
                ← Previous
              </button>
              <span style={{ fontWeight: 'bold', color: '#475569' }}>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                className="secondary-btn"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => loadRecycleBin(pagination.page + 1, filter)}
              >
                Next →
              </button>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
