import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { createVoucherAdmin, deleteVoucherAdmin, fetchVouchersAdmin, updateVoucherAdmin, fetchCoursesAdmin } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';

// courses are loaded from server

export default function AdminVoucherWorkspacePage() {
  const navigate = useNavigate();
  const [voucherList, setVoucherList] = useState([]);
  const [isSavingVoucher, setIsSavingVoucher] = useState(false);
  const [isDeletingVoucher, setIsDeletingVoucher] = useState(false);
  const [banner, setBanner] = useState(null);
  const [courses, setCourses] = useState([]);
  const [voucherDeleteDialog, setVoucherDeleteDialog] = useState({ open: false, voucherId: '', code: '' });
  const [voucherForm, setVoucherForm] = useState({
    code: '',
    description: '',
    discountType: 'percent',
    discountValue: '',
    maxDiscountInPaise: '',
    usageLimit: '',
    validUntil: '',
    applicableCourses: [],
    applicableTestSeries: []
  });

  useAutoDismissMessage(banner, setBanner);

  useEffect(() => {
    if (!voucherDeleteDialog.open) return undefined;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;

    body.dataset.voucherModalScrollY = String(scrollY);
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    return () => {
      const y = Number(body.dataset.voucherModalScrollY || '0');
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      body.style.overflow = '';
      html.style.overflow = '';
      delete body.dataset.voucherModalScrollY;
      window.scrollTo(0, y);
    };
  }, [voucherDeleteDialog.open]);

  async function loadVouchers() {
    try {
      const res = await fetchVouchersAdmin();
      setVoucherList(Array.isArray(res?.vouchers) ? res.vouchers : []);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load vouchers.' });
    }
  }

  useEffect(() => {
    loadVouchers();
    let ignore = false;
    (async function loadCourses() {
      try {
        const res = await fetchCoursesAdmin();
        if (ignore) return;
        setCourses(Array.isArray(res?.courses) ? res.courses : []);
      } catch {
        if (!ignore) setCourses([]);
      }
    })();
    return () => { ignore = true; };
  }, []);

  async function handleCreateVoucher(event) {
    event.preventDefault();
    const code = String(voucherForm.code || '').trim().toUpperCase();
    const rawDiscountValue = Number(voucherForm.discountValue || 0);
    const discountValue = voucherForm.discountType === 'fixed'
      ? Math.round(rawDiscountValue * 100)
      : rawDiscountValue;

    if (!code || !discountValue) {
      setBanner({ type: 'error', text: 'Voucher code and discount value are required.' });
      return;
    }

    setIsSavingVoucher(true);
    try {
      await createVoucherAdmin({
        code,
        description: voucherForm.description,
        discountType: voucherForm.discountType,
        discountValue,
        maxDiscountInPaise: voucherForm.maxDiscountInPaise ? Math.round(Number(voucherForm.maxDiscountInPaise) * 100) : null,
        usageLimit: voucherForm.usageLimit ? Number(voucherForm.usageLimit) : null,
        validUntil: voucherForm.validUntil || null,
        applicableCourses: voucherForm.applicableCourses,
        applicableTestSeries: voucherForm.applicableTestSeries
      });

      setVoucherForm({
        code: '',
        description: '',
        discountType: 'percent',
        discountValue: '',
        maxDiscountInPaise: '',
        usageLimit: '',
        validUntil: '',
        applicableCourses: [],
        applicableTestSeries: []
      });
      await loadVouchers();
      setBanner({ type: 'success', text: 'Voucher created successfully.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to create voucher.' });
    } finally {
      setIsSavingVoucher(false);
    }
  }

  async function handleToggleVoucher(voucherId, active) {
    try {
      await updateVoucherAdmin(voucherId, { active });
      await loadVouchers();
      setBanner({ type: 'success', text: active ? 'Voucher enabled.' : 'Voucher disabled.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to update voucher.' });
    }
  }

  async function handleDeleteVoucher(voucherId, code) {
    setVoucherDeleteDialog({ open: true, voucherId, code });
  }

  function closeVoucherDeleteDialog() {
    if (isDeletingVoucher) return;
    setVoucherDeleteDialog({ open: false, voucherId: '', code: '' });
  }

  async function confirmDeleteVoucher() {
    if (!voucherDeleteDialog.voucherId || isDeletingVoucher) return;
    setIsDeletingVoucher(true);
    try {
      await deleteVoucherAdmin(voucherDeleteDialog.voucherId);
      await loadVouchers();
      setBanner({ type: 'success', text: 'Voucher deleted.' });
      setVoucherDeleteDialog({ open: false, voucherId: '', code: '' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to delete voucher.' });
    } finally {
      setIsDeletingVoucher(false);
    }
  }

  return (
    <AppShell
      title="Voucher Workspace"
      subtitle="Create and manage vouchers in a dedicated admin page"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
      )}
    >
      <main className="admin-workspace-page">
        <section className="workspace-hero workspace-hero-voucher">
          <div>
            <p className="eyebrow">Voucher Management</p>
            <h2>Create offers and control availability</h2>
            <p className="subtitle">Dedicated form flow for smoother voucher creation and quick management.</p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label="Total Vouchers" value={voucherList.length} />
            <StatCard label="Active" value={voucherList.filter((voucher) => voucher.active).length} />
          </div>
        </section>

        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        <section className="card payment-voucher-card workspace-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Create Voucher</p>
              <h3>Setup discount and rules</h3>
            </div>
          </div>

          <form className="quiz-builder-form" onSubmit={handleCreateVoucher}>
            <label>
              Voucher code
              <input
                value={voucherForm.code}
                onChange={(event) => setVoucherForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                placeholder="BIO10"
                maxLength={20}
                required
              />
            </label>
            <label>
              Description
              <input
                value={voucherForm.description}
                onChange={(event) => setVoucherForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Optional internal note"
              />
            </label>
            <label>
              Discount type
              <select
                value={voucherForm.discountType}
                onChange={(event) => setVoucherForm((current) => ({ ...current, discountType: event.target.value }))}
              >
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed (INR)</option>
              </select>
            </label>
            <label>
              Discount value
              <input
                type="number"
                min="1"
                step={voucherForm.discountType === 'percent' ? '1' : '0.01'}
                value={voucherForm.discountValue}
                onChange={(event) => setVoucherForm((current) => ({ ...current, discountValue: event.target.value }))}
                required
              />
            </label>
            <label>
              Max discount in INR (optional)
              <input
                type="number"
                min="0"
                step="0.01"
                value={voucherForm.maxDiscountInPaise}
                onChange={(event) => setVoucherForm((current) => ({ ...current, maxDiscountInPaise: event.target.value }))}
              />
            </label>
            <label>
              Usage limit (optional)
              <input
                type="number"
                min="1"
                step="1"
                value={voucherForm.usageLimit}
                onChange={(event) => setVoucherForm((current) => ({ ...current, usageLimit: event.target.value }))}
              />
            </label>
            <label>
              Valid until (optional)
              <input
                type="datetime-local"
                value={voucherForm.validUntil}
                onChange={(event) => setVoucherForm((current) => ({ ...current, validUntil: event.target.value }))}
              />
            </label>

            <div className="quiz-builder-header-checkbox">
              <span>Applicable courses</span>
              {(courses || []).map((c) => {
                const courseName = c.name || c;
                const label = c.displayName || courseName;
                const selected = voucherForm.applicableCourses.includes(courseName);
                return (
                  <label key={`voucher-course-${courseName}`} className="quiz-inline-checkbox">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setVoucherForm((current) => ({
                          ...current,
                          applicableCourses: checked
                            ? [...current.applicableCourses, courseName]
                            : current.applicableCourses.filter((entry) => entry !== courseName)
                        }));
                      }}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>

            <div className="quiz-builder-header-checkbox">
              <span>Applicable test series</span>
              {[{ value: 'topic_test', label: 'Topic Test Series' }, { value: 'full_mock', label: 'Full Mock Series' }].map((opt) => {
                const selected = voucherForm.applicableTestSeries.includes(opt.value);
                return (
                  <label key={`voucher-ts-${opt.value}`} className="quiz-inline-checkbox">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setVoucherForm((current) => ({
                          ...current,
                          applicableTestSeries: checked
                            ? [...current.applicableTestSeries, opt.value]
                            : current.applicableTestSeries.filter((v) => v !== opt.value)
                        }));
                      }}
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>

            <button className="primary-btn" type="submit" disabled={isSavingVoucher}>
              {isSavingVoucher ? 'Creating...' : 'Create Voucher'}
            </button>
          </form>

          <div className="quiz-admin-list">
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Voucher List</p>
                <h3>Manage special offers</h3>
              </div>
            </div>
            {voucherList.length ? (
              <div className="quiz-admin-items">
                {voucherList.map((voucher) => (
                  <article key={voucher._id} className="quiz-admin-item">
                    <div className="quiz-admin-item-body">
                      <div className="voucher-code-row">
                        <strong className="voucher-code-label">{voucher.code}</strong>
                        <span className={`status-badge status-${voucher.active ? 'paid' : 'failed'}`}>
                          {voucher.active ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <p className="voucher-desc">{voucher.description || 'No description'}</p>
                      <div className="quiz-admin-meta">
                        <span className="quiz-admin-meta-chip chip-discount">
                          {voucher.discountType === 'percent'
                            ? `${voucher.discountValue}% off`
                            : `Rs ${Math.round(Number(voucher.discountValue || 0) / 100)} off`}
                        </span>
                        {voucher.validUntil ? (
                          <span className="quiz-admin-meta-chip">
                            Expires: {new Date(voucher.validUntil).toLocaleDateString()}
                          </span>
                        ) : null}
                        {voucher.applicableCourses?.length > 0 ? (
                          <span className="quiz-admin-meta-chip chip-courses">
                            {voucher.applicableCourses.join(', ')}
                          </span>
                        ) : null}
                        {voucher.applicableTestSeries?.length > 0 ? (
                          <span className="quiz-admin-meta-chip chip-ts">
                            {voucher.applicableTestSeries.map((v) => (v === 'topic_test' ? 'Topic Tests' : 'Full Mocks')).join(', ')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="quiz-admin-item-actions">
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => handleToggleVoucher(voucher._id, !voucher.active)}
                      >
                        {voucher.active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        className="danger-btn"
                        onClick={() => handleDeleteVoucher(voucher._id, voucher.code)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-note">No vouchers created yet.</p>
            )}
          </div>
        </section>
      </main>

      {voucherDeleteDialog.open ? createPortal(
        <div
          className="confirm-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeVoucherDeleteDialog();
          }}
        >
          <section className="confirm-modal card voucher-confirm-modal" role="dialog" aria-modal="true" aria-label="Delete voucher confirmation">
            <p className="eyebrow">Delete Voucher</p>
            <h2>Delete {voucherDeleteDialog.code}?</h2>
            <p className="subtitle">This action cannot be undone. Students will no longer be able to use this voucher code.</p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  closeVoucherDeleteDialog();
                }}
                disabled={isDeletingVoucher}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  confirmDeleteVoucher();
                }}
                disabled={isDeletingVoucher}
              >
                {isDeletingVoucher ? 'Deleting...' : 'Delete Voucher'}
              </button>
            </div>
          </section>
        </div>,
        document.body
      ) : null}
    </AppShell>
  );
}
