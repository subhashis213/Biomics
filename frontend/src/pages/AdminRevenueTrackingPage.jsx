import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPaymentHistoryAdmin } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';

const COURSE_CATEGORIES = [
  '11th',
  '12th',
  'NEET',
  'IIT-JAM',
  'CSIR-NET Life Science',
  'GATE'
];

export default function AdminRevenueTrackingPage() {
  const navigate = useNavigate();
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [paymentHistoryPagination, setPaymentHistoryPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [paymentHistoryFilter, setPaymentHistoryFilter] = useState({ course: '', status: '', username: '' });
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [banner, setBanner] = useState(null);

  async function loadPaymentHistory(page = 1, filter = paymentHistoryFilter) {
    setPaymentHistoryLoading(true);
    try {
      const res = await fetchPaymentHistoryAdmin({ page, limit: 20, ...filter });
      const payments = Array.isArray(res?.payments) ? res.payments : [];
      const normalizedTotal = Number.isFinite(Number(res?.pagination?.total))
        ? Number(res.pagination.total)
        : Number.isFinite(Number(res?.total))
          ? Number(res.total)
          : payments.length;
      const total = Math.max(normalizedTotal, payments.length);
      const limit = Number.isFinite(Number(res?.pagination?.limit))
        ? Number(res.pagination.limit)
        : 20;
      const totalPages = Number.isFinite(Number(res?.pagination?.totalPages))
        ? Number(res.pagination.totalPages)
        : Math.max(1, Math.ceil(total / Math.max(1, limit)));
      const currentPage = Number.isFinite(Number(res?.pagination?.page))
        ? Number(res.pagination.page)
        : page;

      setPaymentHistory(payments);
      setPaymentHistoryPagination({ page: currentPage, totalPages, total });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load payment history.' });
    } finally {
      setPaymentHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadPaymentHistory(1, paymentHistoryFilter);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadPaymentHistory(paymentHistoryPagination.page, paymentHistoryFilter);
    }, 20000);
    return () => clearInterval(timer);
  }, [paymentHistoryPagination.page, paymentHistoryFilter]);

  return (
    <AppShell
      title="Revenue Tracking"
      subtitle="Analyze payments and transaction flow in a dedicated workspace"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => loadPaymentHistory(paymentHistoryPagination.page, paymentHistoryFilter)}
            disabled={paymentHistoryLoading}
          >
            {paymentHistoryLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
      )}
    >
      <main className="admin-workspace-page">
        <section className="workspace-hero workspace-hero-revenue">
          <div>
            <p className="eyebrow">Revenue Tracking</p>
            <h2>Payment history and transaction filters</h2>
            <p className="subtitle">Colorful analytics layout for faster payment insights and smoother admin workflow.</p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label="Transactions" value={paymentHistoryPagination.total} />
            <StatCard label="Current Page" value={paymentHistoryPagination.page} />
          </div>
        </section>

        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        <section className="card analytics-card workspace-panel">
          <div className="analytics-filters">
            <input
              className="analytics-filter-input"
              type="text"
              placeholder="Search by username..."
              value={paymentHistoryFilter.username}
              onChange={(event) => setPaymentHistoryFilter((f) => ({ ...f, username: event.target.value }))}
            />
            <select
              className="analytics-filter-select"
              value={paymentHistoryFilter.course}
              onChange={(event) => setPaymentHistoryFilter((f) => ({ ...f, course: event.target.value }))}
            >
              <option value="">All Courses</option>
              {COURSE_CATEGORIES.map((course) => <option key={course} value={course}>{course}</option>)}
            </select>
            <select
              className="analytics-filter-select"
              value={paymentHistoryFilter.status}
              onChange={(event) => setPaymentHistoryFilter((f) => ({ ...f, status: event.target.value }))}
            >
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="created">Created</option>
              <option value="failed">Failed</option>
            </select>
            <button
              className="primary-btn"
              type="button"
              onClick={() => loadPaymentHistory(1, paymentHistoryFilter)}
              disabled={paymentHistoryLoading}
            >
              {paymentHistoryLoading ? 'Loading...' : 'Search'}
            </button>
            <button
              className="secondary-btn"
              type="button"
              onClick={() => {
                const clearFilter = { course: '', status: '', username: '' };
                setPaymentHistoryFilter(clearFilter);
                loadPaymentHistory(1, clearFilter);
              }}
            >
              Clear
            </button>
          </div>

          <div className="analytics-section-scroll">
            {!paymentHistory.length && !paymentHistoryLoading ? (
              <p className="empty-note">No payment records found.</p>
            ) : (
              <div className="analytics-table-wrap">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Course</th>
                      <th>Module</th>
                      <th>Plan</th>
                      <th>Amount</th>
                      <th>Voucher</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((entry) => (
                      <tr key={entry._id}>
                        <td><strong>{entry.username}</strong></td>
                        <td>{entry.course}</td>
                        <td>{entry.moduleName || <span className="muted-text">-</span>}</td>
                        <td>{entry.planType || <span className="muted-text">-</span>}</td>
                        <td className="amount-cell">Rs {Math.round(Number(entry.amountInPaise || 0) / 100)}</td>
                        <td>{entry.voucherCode || <span className="muted-text">-</span>}</td>
                        <td><span className={`status-badge status-${entry.status}`}>{entry.status}</span></td>
                        <td className="date-cell">{new Date(entry.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {paymentHistoryPagination.totalPages > 1 ? (
            <div className="pagination-bar">
              <button
                className="secondary-btn pagination-btn"
                disabled={paymentHistoryPagination.page <= 1}
                onClick={() => loadPaymentHistory(paymentHistoryPagination.page - 1)}
              >
                ← Prev
              </button>
              <span className="pagination-info">
                Page {paymentHistoryPagination.page} of {paymentHistoryPagination.totalPages}
              </span>
              <button
                className="secondary-btn pagination-btn"
                disabled={paymentHistoryPagination.page >= paymentHistoryPagination.totalPages}
                onClick={() => loadPaymentHistory(paymentHistoryPagination.page + 1)}
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
