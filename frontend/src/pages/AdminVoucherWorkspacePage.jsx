import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createVoucherAdmin, deleteVoucherAdmin, fetchVouchersAdmin, updateVoucherAdmin } from '../api';
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

export default function AdminVoucherWorkspacePage() {
  const navigate = useNavigate();
  const [voucherList, setVoucherList] = useState([]);
  const [isSavingVoucher, setIsSavingVoucher] = useState(false);
  const [banner, setBanner] = useState(null);
  const [voucherForm, setVoucherForm] = useState({
    code: '',
    description: '',
    discountType: 'percent',
    discountValue: '',
    maxDiscountInPaise: '',
    usageLimit: '',
    validUntil: '',
    applicableCourses: []
  });

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
        applicableCourses: voucherForm.applicableCourses
      });

      setVoucherForm({
        code: '',
        description: '',
        discountType: 'percent',
        discountValue: '',
        maxDiscountInPaise: '',
        usageLimit: '',
        validUntil: '',
        applicableCourses: []
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
    const ok = window.confirm(`Delete voucher "${code}"? This cannot be undone.`);
    if (!ok) return;

    try {
      await deleteVoucherAdmin(voucherId);
      await loadVouchers();
      setBanner({ type: 'success', text: 'Voucher deleted.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to delete voucher.' });
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
              {COURSE_CATEGORIES.map((courseName) => {
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
                    <span>{courseName}</span>
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
    </AppShell>
  );
}
