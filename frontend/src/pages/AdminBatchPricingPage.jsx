import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fetchCoursesAdmin,
  fetchCourseBatchesAdmin,
  fetchModulePricingAdmin,
  saveBatchPricingAdmin,
  saveModulePricingAdmin,
  uploadCoursePricingThumbnailAdmin
} from '../api';
import AppShell from '../components/AppShell';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';
import { getSession } from '../session';
import { resolveApiAssetUrl } from '../api';

function rupeesToPaise(val) {
  return Math.round((Number(val || 0) || 0) * 100);
}

function paiseToRupees(paise) {
  return ((Number(paise || 0)) / 100).toFixed(2);
}

export default function AdminBatchPricingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [coursesData, setCoursesData] = useState([]);
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [editingBatch, setEditingBatch] = useState(null);
  const [editForm, setEditForm] = useState({
    proAmount: '0',
    eliteAmount: '0',
    proMrp: '0',
    eliteMrp: '0',
    proTenure: 1,
    eliteTenure: 3
  });
  const [savingBatch, setSavingBatch] = useState(null);
  const [uploadingBatchThumb, setUploadingBatchThumb] = useState(null);
  const [modulePricingByBatch, setModulePricingByBatch] = useState({});
  const [modulePricingLoadingKey, setModulePricingLoadingKey] = useState('');

  useAutoDismissMessage(banner, setBanner);
  const adminSession = getSession();
  const isAdmin = Boolean(adminSession?.token && adminSession?.role === 'admin');

  // Load all courses with their batch pricing
  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (!coursesData.length) return;
    const params = new URLSearchParams(location.search);
    const selectedCourse = String(params.get('course') || '').trim();
    const selectedBatch = String(params.get('batch') || '').trim();
    if (!selectedCourse) return;

    const matchedCourse = coursesData.find(
      (course) => String(course.courseName || '').trim().toLowerCase() === selectedCourse.toLowerCase()
    );
    if (!matchedCourse) return;

    setExpandedCourse(matchedCourse.courseName);

    if (!selectedBatch) return;
    const matchedBatch = (matchedCourse.batches || []).find(
      (batch) => String(batch.batchName || '').trim().toLowerCase() === selectedBatch.toLowerCase()
    );
    if (matchedBatch) {
      startEditBatch(matchedCourse, matchedBatch);
    }
  }, [coursesData, location.search]);

  async function loadAllData() {
    setLoading(true);
    try {
      const coursesResponse = await fetchCoursesAdmin();
      const coursesList = (Array.isArray(coursesResponse?.courses) ? coursesResponse.courses : [])
        .filter((course) => course?.active !== false);

      // Fetch batch pricing for each course
      const coursesWithBatches = await Promise.all(
        coursesList.map(async (course) => {
          try {
            const batchesResponse = await fetchCourseBatchesAdmin(course.name);
            const batches = Array.isArray(batchesResponse?.batches) ? batchesResponse.batches : [];
            
            // If API returns no batches, use course catalog batches
            let finalBatches = batches;
            if (!batches.length && Array.isArray(course.batches)) {
              finalBatches = course.batches
                .filter((b) => b.active !== false)
                .map((b) => ({
                  batchName: b.name,
                  proPriceInPaise: 0,
                  elitePriceInPaise: 0,
                  proMrpInPaise: 0,
                  eliteMrpInPaise: 0,
                  proTenureMonths: 1,
                  eliteTenureMonths: 3,
                  thumbnailUrl: '',
                  thumbnailName: ''
                }));
            }
            
            return {
              courseName: course.name,
              displayName: course.displayName || course.name,
              description: course.description,
              batches: finalBatches
            };
          } catch (err) {
            console.error(`Failed to fetch batches for ${course.name}:`, err);
            return {
              courseName: course.name,
              displayName: course.displayName || course.name,
              description: course.description,
              batches: Array.isArray(course.batches) ? course.batches.filter(b => b.active !== false).map(b => ({
                batchName: b.name,
                proPriceInPaise: 0,
                elitePriceInPaise: 0,
                proMrpInPaise: 0,
                eliteMrpInPaise: 0,
                thumbnailUrl: '',
                thumbnailName: ''
              })) : []
            };
          }
        })
      );

      setCoursesData(coursesWithBatches);
    } catch (err) {
      setBanner({ type: 'error', text: err.message || 'Failed to load courses' });
    } finally {
      setLoading(false);
    }
  }

  function startEditBatch(course, batch) {
    setEditingBatch({ course: course.courseName, batch: batch.batchName });
    setEditForm({
      proAmount: paiseToRupees(batch.proPriceInPaise),
      eliteAmount: paiseToRupees(batch.elitePriceInPaise),
      proMrp: paiseToRupees(batch.proMrpInPaise),
      eliteMrp: paiseToRupees(batch.eliteMrpInPaise),
      proTenure: batch.proTenureMonths || 1,
      eliteTenure: batch.eliteTenureMonths || 3,
      thumbnailUrl: String(batch.thumbnailUrl || '').trim(),
      thumbnailName: String(batch.thumbnailName || '').trim()
    });
  }

  function cancelEdit() {
    setEditingBatch(null);
    setEditForm({
      proAmount: '0',
      eliteAmount: '0',
      proMrp: '0',
      eliteMrp: '0',
      proTenure: 1,
      eliteTenure: 3,
      thumbnailUrl: '',
      thumbnailName: ''
    });
  }

  async function handleBatchThumbnailUpload(file) {
    if (!file || !editingBatch) return;
    const key = `${editingBatch.course}-${editingBatch.batch}`;
    setUploadingBatchThumb(key);
    try {
      const response = await uploadCoursePricingThumbnailAdmin(file);
      setEditForm((current) => ({
        ...current,
        thumbnailUrl: String(response?.thumbnailUrl || '').trim(),
        thumbnailName: String(response?.thumbnailName || file.name || '').trim()
      }));
      setBanner({ type: 'success', text: 'Batch thumbnail uploaded. Click Save to publish pricing + thumbnail.' });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to upload batch thumbnail.' });
    } finally {
      setUploadingBatchThumb(null);
    }
  }

  async function saveBatchPrice(course, batch) {
    if (!isAdmin) {
      setBanner({ type: 'error', text: 'Admin authentication required' });
      return;
    }

    setSavingBatch(`${course}-${batch}`);
    try {
      await saveBatchPricingAdmin(course, batch, {
        proPriceInPaise: rupeesToPaise(editForm.proAmount),
        elitePriceInPaise: rupeesToPaise(editForm.eliteAmount),
        proMrpInPaise: rupeesToPaise(editForm.proMrp),
        eliteMrpInPaise: rupeesToPaise(editForm.eliteMrp),
        proTenureMonths: editForm.proTenure || 1,
        eliteTenureMonths: editForm.eliteTenure || 3,
        thumbnailUrl: String(editForm.thumbnailUrl || '').trim(),
        thumbnailName: String(editForm.thumbnailName || '').trim(),
        currency: 'INR',
        active: true
      });
      setBanner({ type: 'success', text: `Saved pricing for ${batch}` });
      await loadAllData();
      cancelEdit();
    } catch (err) {
      setBanner({ type: 'error', text: err.message || 'Failed to save price' });
    } finally {
      setSavingBatch(null);
    }
  }

  async function loadModulePricingForBatch(course, batch) {
    const key = `${course}::${batch}`;
    setModulePricingLoadingKey(key);
    try {
      const response = await fetchModulePricingAdmin(course, batch);
      const modules = Array.isArray(response?.modules) ? response.modules.filter((entry) => !entry?.isBundle) : [];
      const form = {};
      modules.forEach((entry) => {
        form[entry.moduleName] = {
          proAmount: paiseToRupees(entry.proPriceInPaise),
          eliteAmount: paiseToRupees(entry.elitePriceInPaise),
          proTenure: entry.proTenureMonths || 1,
          eliteTenure: entry.eliteTenureMonths || 3
        };
      });
      setModulePricingByBatch((current) => ({
        ...current,
        [key]: { modules, form, open: true }
      }));
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load module pricing for batch.' });
    } finally {
      setModulePricingLoadingKey('');
    }
  }

  async function saveModulePricingForBatch(course, batch, moduleName) {
    const key = `${course}::${batch}`;
    const moduleState = modulePricingByBatch[key];
    const form = moduleState?.form?.[moduleName];
    if (!form) return;
    try {
      await saveModulePricingAdmin(course, moduleName, {
        proPriceInPaise: rupeesToPaise(form.proAmount),
        elitePriceInPaise: rupeesToPaise(form.eliteAmount),
        proTenureMonths: form.proTenure || 1,
        eliteTenureMonths: form.eliteTenure || 3,
        active: true,
        currency: 'INR'
      }, batch);
      setBanner({ type: 'success', text: `Saved ${moduleName} pricing for ${batch}.` });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to save module pricing.' });
    }
  }

  if (loading) {
    return (
      <AppShell title="Batch Pricing" roleLabel="Admin" showThemeSwitch>
        <main className="admin-workspace-page">
          <p style={{ textAlign: 'center', padding: '40px 20px' }}>Loading courses and batches...</p>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell 
      title="Batch Pricing" 
      subtitle="Set pricing for each course batch" 
      roleLabel="Admin" 
      showThemeSwitch 
      actions={<button type="button" className="secondary-btn" onClick={() => navigate(-1)}>← Back</button>}
    >
      <main className="admin-workspace-page">
        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        {coursesData.length === 0 ? (
          <section className="card">
            <p className="subtitle" style={{ textAlign: 'center', padding: '40px' }}>No courses found. Create a course first.</p>
          </section>
        ) : (
          coursesData.map((course) => (
            <section key={course.courseName} className="card" style={{ marginBottom: 20 }}>
              <div 
                className="section-header compact" 
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setExpandedCourse(expandedCourse === course.courseName ? null : course.courseName)}
              >
                <div>
                  <p className="eyebrow">{course.courseName}</p>
                  <h3>{course.displayName}</h3>
                  {course.description && <p className="subtitle">{course.description}</p>}
                </div>
                <div style={{ fontSize: '20px', color: '#999' }}>
                  {expandedCourse === course.courseName ? '▼' : '▶'}
                </div>
              </div>

              {expandedCourse === course.courseName && (
                <div style={{ paddingTop: 20, borderTop: '1px solid #eee' }}>
                  {course.batches.length === 0 ? (
                    <p className="subtitle" style={{ textAlign: 'center', padding: '20px' }}>No batches in this course.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #ddd' }}>
                          <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Batch Name</th>
                          <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600' }}>Pro Price (₹)</th>
                          <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600' }}>Pro Tenure</th>
                          <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600' }}>Pro MRP (₹)</th>
                          <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600' }}>Elite Price (₹)</th>
                          <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600' }}>Elite Tenure</th>
                          <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600' }}>Elite MRP (₹)</th>
                          <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Batch Thumbnail</th>
                          <th style={{ textAlign: 'center', padding: '12px', fontWeight: '600' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {course.batches.map((batch) => {
                          const isEditing = editingBatch?.course === course.courseName && editingBatch?.batch === batch.batchName;
                          const isSaving = savingBatch === `${course.courseName}-${batch.batchName}`;
                          const moduleKey = `${course.courseName}::${batch.batchName}`;
                          const moduleState = modulePricingByBatch[moduleKey];

                          return (
                            <tr key={batch.batchName} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '12px', fontWeight: '500' }}>{batch.batchName}</td>
                              <td style={{ textAlign: 'right', padding: '12px' }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    value={editForm.proAmount}
                                    onChange={(e) => setEditForm((p) => ({ ...p, proAmount: e.target.value }))}
                                    style={{ width: '100px', textAlign: 'right' }}
                                    placeholder="0"
                                  />
                                ) : (
                                  paiseToRupees(batch.proPriceInPaise)
                                )}
                              </td>
                              <td style={{ textAlign: 'right', padding: '12px' }}>
                                {isEditing ? (
                                  <select
                                    value={editForm.proTenure || 1}
                                    onChange={(e) => setEditForm((p) => ({ ...p, proTenure: parseInt(e.target.value) }))}
                                    style={{ width: '80px', textAlign: 'right' }}
                                  >
                                    {[1, 2, 3, 6, 12].map(months => (
                                      <option key={months} value={months}>
                                        {months} {months === 1 ? 'month' : 'months'}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  `${batch.proTenureMonths || 1} ${batch.proTenureMonths === 1 ? 'month' : 'months'}`
                                )}
                              </td>
                              <td style={{ textAlign: 'right', padding: '12px' }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    value={editForm.proMrp}
                                    onChange={(e) => setEditForm((p) => ({ ...p, proMrp: e.target.value }))}
                                    style={{ width: '100px', textAlign: 'right' }}
                                    placeholder="0"
                                  />
                                ) : (
                                  paiseToRupees(batch.proMrpInPaise)
                                )}
                              </td>
                              <td style={{ textAlign: 'right', padding: '12px' }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    value={editForm.eliteAmount}
                                    onChange={(e) => setEditForm((p) => ({ ...p, eliteAmount: e.target.value }))}
                                    style={{ width: '100px', textAlign: 'right' }}
                                    placeholder="0"
                                  />
                                ) : (
                                  paiseToRupees(batch.elitePriceInPaise)
                                )}
                              </td>
                              <td style={{ textAlign: 'right', padding: '12px' }}>
                                {isEditing ? (
                                  <select
                                    value={editForm.eliteTenure || 3}
                                    onChange={(e) => setEditForm((p) => ({ ...p, eliteTenure: parseInt(e.target.value) }))}
                                    style={{ width: '80px', textAlign: 'right' }}
                                  >
                                    {[1, 2, 3, 6, 12].map(months => (
                                      <option key={months} value={months}>
                                        {months} {months === 1 ? 'month' : 'months'}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  `${batch.eliteTenureMonths || 3} ${batch.eliteTenureMonths === 1 ? 'month' : 'months'}`
                                )}
                              </td>
                              <td style={{ textAlign: 'right', padding: '12px' }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    value={editForm.eliteMrp}
                                    onChange={(e) => setEditForm((p) => ({ ...p, eliteMrp: e.target.value }))}
                                    style={{ width: '100px', textAlign: 'right' }}
                                    placeholder="0"
                                  />
                                ) : (
                                  paiseToRupees(batch.eliteMrpInPaise)
                                )}
                              </td>
                              <td style={{ padding: '12px', minWidth: 240 }}>
                                {isEditing ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <label className="secondary-btn pricing-thumbnail-upload-btn" style={{ minWidth: 130, textAlign: 'center' }}>
                                      {uploadingBatchThumb === `${course.courseName}-${batch.batchName}` ? 'Uploading...' : 'Upload Thumbnail'}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        hidden
                                        disabled={uploadingBatchThumb === `${course.courseName}-${batch.batchName}`}
                                        onChange={(event) => {
                                          const file = event.target.files?.[0];
                                          handleBatchThumbnailUpload(file);
                                          event.target.value = '';
                                        }}
                                      />
                                    </label>
                                    <span className="pricing-thumbnail-name" style={{ maxWidth: 160 }}>
                                      {editForm.thumbnailName || 'No thumbnail'}
                                    </span>
                                    {editForm.thumbnailUrl ? (
                                      <img
                                        src={resolveApiAssetUrl(editForm.thumbnailUrl)}
                                        alt={`${batch.batchName} thumbnail`}
                                        className="batch-pricing-thumb-preview"
                                      />
                                    ) : null}
                                  </div>
                                ) : (
                                  batch.thumbnailUrl ? (
                                    <img
                                      src={resolveApiAssetUrl(batch.thumbnailUrl)}
                                      alt={`${batch.batchName} thumbnail`}
                                      className="batch-pricing-thumb-preview"
                                    />
                                  ) : (
                                    <span className="subtitle">No thumbnail</span>
                                  )
                                )}
                              </td>
                              <td style={{ textAlign: 'center', padding: '12px' }}>
                                {isEditing ? (
                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                    <button
                                      type="button"
                                      className="primary-btn"
                                      onClick={() => saveBatchPrice(course.courseName, batch.batchName)}
                                      disabled={isSaving}
                                      style={{ padding: '6px 12px', fontSize: '12px' }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary-btn"
                                      onClick={cancelEdit}
                                      disabled={isSaving}
                                      style={{ padding: '6px 12px', fontSize: '12px' }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      className="secondary-btn"
                                      onClick={() => startEditBatch(course, batch)}
                                      style={{ padding: '6px 12px', fontSize: '12px' }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary-btn"
                                      disabled={modulePricingLoadingKey === moduleKey}
                                      onClick={() => loadModulePricingForBatch(course.courseName, batch.batchName)}
                                      style={{ padding: '6px 12px', fontSize: '12px' }}
                                    >
                                      {modulePricingLoadingKey === moduleKey ? 'Loading...' : 'Module Pricing'}
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {course.batches.map((batch) => {
                    const moduleKey = `${course.courseName}::${batch.batchName}`;
                    const moduleState = modulePricingByBatch[moduleKey];
                    if (!moduleState?.open || !moduleState.modules?.length) return null;
                    return (
                      <div key={`module-pricing-${moduleKey}`} style={{ marginTop: 14, border: '1px solid #dbe2ef', borderRadius: 12, padding: 12 }}>
                        <h4 style={{ margin: '0 0 10px' }}>{batch.batchName} - Module Pricing</h4>
                        <div style={{ display: 'grid', gap: 10 }}>
                          {moduleState.modules.map((moduleEntry) => {
                            const form = moduleState.form[moduleEntry.moduleName] || {};
                            return (
                              <div key={`${moduleKey}-${moduleEntry.moduleName}`} style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(4, minmax(90px, 1fr)) auto', gap: 8, alignItems: 'center' }}>
                                <strong>{moduleEntry.moduleName}</strong>
                                <input type="number" value={form.proAmount || '0'} onChange={(e) => setModulePricingByBatch((cur) => ({ ...cur, [moduleKey]: { ...cur[moduleKey], form: { ...cur[moduleKey].form, [moduleEntry.moduleName]: { ...(cur[moduleKey].form[moduleEntry.moduleName] || {}), proAmount: e.target.value } } } }))} />
                                <select value={form.proTenure || 1} onChange={(e) => setModulePricingByBatch((cur) => ({ ...cur, [moduleKey]: { ...cur[moduleKey], form: { ...cur[moduleKey].form, [moduleEntry.moduleName]: { ...(cur[moduleKey].form[moduleEntry.moduleName] || {}), proTenure: parseInt(e.target.value, 10) } } } }))}>{[1, 2, 3, 6, 12].map((m) => <option key={`p-${m}`} value={m}>{m}m</option>)}</select>
                                <input type="number" value={form.eliteAmount || '0'} onChange={(e) => setModulePricingByBatch((cur) => ({ ...cur, [moduleKey]: { ...cur[moduleKey], form: { ...cur[moduleKey].form, [moduleEntry.moduleName]: { ...(cur[moduleKey].form[moduleEntry.moduleName] || {}), eliteAmount: e.target.value } } } }))} />
                                <select value={form.eliteTenure || 3} onChange={(e) => setModulePricingByBatch((cur) => ({ ...cur, [moduleKey]: { ...cur[moduleKey], form: { ...cur[moduleKey].form, [moduleEntry.moduleName]: { ...(cur[moduleKey].form[moduleEntry.moduleName] || {}), eliteTenure: parseInt(e.target.value, 10) } } } }))}>{[1, 2, 3, 6, 12].map((m) => <option key={`e-${m}`} value={m}>{m}m</option>)}</select>
                                <button type="button" className="primary-btn" onClick={() => saveModulePricingForBatch(course.courseName, batch.batchName, moduleEntry.moduleName)}>Save</button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))
        )}
      </main>
    </AppShell>
  );
}
