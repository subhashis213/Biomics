import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchCoursePricingAdmin,
  fetchModulePricingAdmin,
  fetchCourseBatchesAdmin,
  saveCoursePricingAdmin,
  saveModulePricingAdmin,
  saveBatchPricingAdmin,
  uploadCoursePricingThumbnailAdmin,
  fetchCoursesAdmin
} from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';
import { getSession } from '../session';

const COURSE_META = {
  '11th':                  { icon: '📖' },
  '12th':                  { icon: '🎓' },
  'NEET':                  { icon: '🧬' },
  'GAT-B':                 { icon: '🧪' },
  'IIT-JAM':               { icon: '⚗️' },
  'CSIR-NET Life Science': { icon: '🔬' },
  'GATE':                  { icon: '💻' }
};

function getStatusKey(courseName, moduleName = 'ALL_MODULES') {
  return `${courseName}::${moduleName}`;
}

export default function AdminPricingWorkspacePage() {
  const navigate = useNavigate();
  const [coursePricing, setCoursePricing] = useState([]);
  const [coursesList, setCoursesList] = useState([]);
  const [priceFormByCourse, setPriceFormByCourse] = useState({});
  const [modulePricingByCourse, setModulePricingByCourse] = useState({});
  const [batchPricingByCourse, setBatchPricingByCourse] = useState({});
  const [batchFetchErrorByCourse, setBatchFetchErrorByCourse] = useState({});
  const [expandedPricingCourse, setExpandedPricingCourse] = useState(null);
  const [expandedBatchCourse, setExpandedBatchCourse] = useState(null);
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [isSavingModulePrice, setIsSavingModulePrice] = useState(false);
  const [uploadingThumbnailForCourse, setUploadingThumbnailForCourse] = useState('');
  const [pricingSaveStatus, setPricingSaveStatus] = useState({});
  const [banner, setBanner] = useState(null);

  useAutoDismissMessage(banner, setBanner);

  const adminSession = getSession();
  const isAdminAuthenticated = Boolean(adminSession?.role === 'admin' && adminSession?.token);
  const visibleCourses = Array.from(new Set(coursesList.filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const configuredVisibleCourseCount = visibleCourses.filter((courseName) =>
    coursePricing.some((entry) => String(entry?.category || '').trim() === courseName)
  ).length;

  function setPricingInlineStatus(key, type, text) {
    setPricingSaveStatus((current) => ({
      ...current,
      [key]: { type, text }
    }));
  }

  function clearPricingSaveStatus(key) {
    setPricingSaveStatus((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function loadPaymentSettings() {
    try {
      let activeCourseNames = [];
      try {
        const coursesRes = await fetchCoursesAdmin();
        activeCourseNames = (Array.isArray(coursesRes?.courses) ? coursesRes.courses : [])
          .filter((entry) => entry?.active !== false)
          .map((entry) => String(entry?.name || '').trim())
          .filter(Boolean);
      } catch {
        activeCourseNames = [];
      }
      setCoursesList(activeCourseNames);

      const pricingResponse = await fetchCoursePricingAdmin();
      const pricing = Array.isArray(pricingResponse?.pricing) ? pricingResponse.pricing : [];
      const bundlePricing = pricing.filter((entry) => String(entry?.moduleName || '') === 'ALL_MODULES');
      setCoursePricing(bundlePricing);

      const nextPriceForm = {};
      bundlePricing.forEach((entry) => {
        const category = String(entry?.category || '').trim();
        if (!category) return;
        nextPriceForm[category] = {
          proAmountRupees: String(Number(entry.proPriceInPaise || 0) / 100),
          eliteAmountRupees: String(Number(entry.elitePriceInPaise || 0) / 100),
          proMrpAmountRupees: String(Number(entry.proMrpInPaise || 0) / 100),
          eliteMrpAmountRupees: String(Number(entry.eliteMrpInPaise || 0) / 100),
          thumbnailUrl: String(entry.thumbnailUrl || '').trim(),
          thumbnailName: String(entry.thumbnailName || '').trim(),
          active: entry.active !== false
        };
      });

      activeCourseNames.forEach((courseName) => {
        if (!nextPriceForm[courseName]) {
          nextPriceForm[courseName] = {
            proAmountRupees: '0',
            eliteAmountRupees: '0',
            proMrpAmountRupees: '0',
            eliteMrpAmountRupees: '0',
            thumbnailUrl: '',
            thumbnailName: '',
            active: true
          };
        }
      });

      setPriceFormByCourse(nextPriceForm);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load pricing settings.' });
    }
  }

  async function loadModulePricing(courseName) {
    try {
      const res = await fetchModulePricingAdmin(courseName);
      const modules = res?.modules || [];
      const priceFormByModule = {};
      modules.forEach((moduleItem) => {
        priceFormByModule[moduleItem.moduleName] = {
          proAmountRupees: String(Number(moduleItem.proPriceInPaise || 0) / 100),
          eliteAmountRupees: String(Number(moduleItem.elitePriceInPaise || 0) / 100),
          proTenure: moduleItem.proTenureMonths || 1,
          eliteTenure: moduleItem.eliteTenureMonths || 3,
          active: moduleItem.active !== false
        };
      });
      setModulePricingByCourse((prev) => ({
        ...prev,
        [courseName]: { modules, priceFormByModule }
      }));
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load module pricing.' });
    }
  }

  async function loadBatchPricing(courseName) {
    try {
      const res = await fetchCourseBatchesAdmin(courseName);
      setBatchFetchErrorByCourse((p) => {
        const next = { ...(p || {}) };
        delete next[courseName];
        return next;
      });
      let batches = Array.isArray(res?.batches) ? res.batches : []; // Ensure batches created under the course (course catalog) appear even if pricing API hasn't returned them yet
      // Ensure batches created under the course (course catalog) appear even if pricing API hasn't returned them yet
      // If pricing API returned no batches, try to pull batches from course catalog as a fallback.
      if (!batches.length) {
        try {
          const coursesRes = await fetchCoursesAdmin();
          const courseEntries = Array.isArray(coursesRes?.courses) ? coursesRes.courses : [];
          // Case-insensitive match for course name
          const courseEntry = courseEntries.find((c) => String(c.name || '').trim().toLowerCase() === String(courseName || '').trim().toLowerCase());
          if (courseEntry && Array.isArray(courseEntry.batches) && courseEntry.batches.length) {
            batches = courseEntry.batches
              .filter((b) => b?.active !== false)
              .map((b) => ({ batchName: String(b.name || '').trim() }));
          }
        } catch (err) {
          // ignore
        }
      } else {
        // also attempt to include any newly created course batches not yet present in pricing API
        try {
          const coursesRes = await fetchCoursesAdmin();
          const courseEntries = Array.isArray(coursesRes?.courses) ? coursesRes.courses : [];
          const courseEntry = courseEntries.find((c) => String(c.name || '').trim().toLowerCase() === String(courseName || '').trim().toLowerCase());
          const courseBatches = Array.isArray(courseEntry?.batches)
            ? courseEntry.batches.filter((b) => b?.active !== false)
            : [];
          const existingNames = new Set((batches || []).map((b) => String(b.batchName || '').trim().toLowerCase()));
          courseBatches.forEach((cb) => {
            const nm = String(cb?.name || '').trim();
            if (nm && !existingNames.has(nm.toLowerCase())) {
              batches.push({ batchName: nm });
            }
          });
        } catch (err) {
          // ignore
        }
      }
      const priceFormByBatch = {};
      batches.forEach((b) => {
        priceFormByBatch[b.batchName] = {
          proAmountRupees: String(Number(b.proPriceInPaise || 0) / 100),
          eliteAmountRupees: String(Number(b.elitePriceInPaise || 0) / 100),
          proMrpAmountRupees: String(Number(b.proMrpInPaise || 0) / 100),
          eliteMrpAmountRupees: String(Number(b.eliteMrpInPaise || 0) / 100),
          proTenure: b.proTenureMonths || 1,
          eliteTenure: b.eliteTenureMonths || 3,
          thumbnailUrl: String(b.thumbnailUrl || '').trim(),
          thumbnailName: String(b.thumbnailName || '').trim(),
          active: b.active !== false
        };
      });
      setBatchPricingByCourse((prev) => ({ ...prev, [courseName]: { batches, priceFormByBatch } }));
    } catch (error) {
      setBatchFetchErrorByCourse((prev) => ({ ...(prev || {}), [courseName]: String(error?.message || 'Failed to load batch pricing') }));
      setBanner({ type: 'error', text: error.message || 'Failed to load batch pricing.' });
      // Ensure UI doesn't stay in perpetual "Loading batches..." state
      setBatchPricingByCourse((prev) => ({
        ...prev,
        [courseName]: { batches: [], priceFormByBatch: {} }
      }));
    }
  }

  function updateBatchPriceForm(courseName, batchName, field, value) {
    setBatchPricingByCourse((prev) => {
      const courseData = prev[courseName] || { batches: [], priceFormByBatch: {} };
      return {
        ...prev,
        [courseName]: {
          ...courseData,
          priceFormByBatch: {
            ...courseData.priceFormByBatch,
            [batchName]: {
              ...(courseData.priceFormByBatch[batchName] || {}),
              [field]: value
            }
          }
        }
      };
    });
  }

  async function handleSaveBatchPrice(courseName, batchName) {
    const courseData = batchPricingByCourse[courseName] || { priceFormByBatch: {} };
    const form = courseData.priceFormByBatch[batchName] || { proAmountRupees: '0', eliteAmountRupees: '0', proMrpAmountRupees: '0', eliteMrpAmountRupees: '0', proTenure: 1, eliteTenure: 3, active: true };
    const proRupees = Number(form.proAmountRupees || 0);
    const eliteRupees = Number(form.eliteAmountRupees || 0);
    const proMrpRupees = Number(form.proMrpAmountRupees || 0);
    const eliteMrpRupees = Number(form.eliteMrpAmountRupees || 0);
    if (!Number.isFinite(proRupees) || proRupees < 0 || !Number.isFinite(eliteRupees) || eliteRupees < 0) {
      setBanner({ type: 'error', text: 'Invalid amount' });
      return;
    }
    setIsSavingPricing(true);
    try {
      await saveBatchPricingAdmin(courseName, batchName, {
        proPriceInPaise: Math.round(proRupees * 100),
        elitePriceInPaise: Math.round(eliteRupees * 100),
        proMrpInPaise: Math.round(proMrpRupees * 100),
        eliteMrpInPaise: Math.round(eliteMrpRupees * 100),
        proTenureMonths: form.proTenure || 1,
        eliteTenureMonths: form.eliteTenure || 3,
        thumbnailUrl: String(form.thumbnailUrl || '').trim(),
        thumbnailName: String(form.thumbnailName || '').trim(),
        currency: 'INR',
        active: form.active !== false
      });
      setBanner({ type: 'success', text: `Saved batch pricing for ${batchName}.` });
      await loadBatchPricing(courseName);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to save batch pricing.' });
    } finally {
      setIsSavingPricing(false);
    }
  }

  useEffect(() => {
    loadPaymentSettings();
  }, []);

  async function handleSaveCoursePrice(courseName) {
    const key = getStatusKey(courseName);
    const form = priceFormByCourse[courseName] || {
      proAmountRupees: '0',
      eliteAmountRupees: '0',
      proMrpAmountRupees: '0',
      eliteMrpAmountRupees: '0',
      thumbnailUrl: '',
      thumbnailName: '',
      active: true
    };
    const proRupees = Number(form.proAmountRupees || 0);
    const eliteRupees = Number(form.eliteAmountRupees || 0);
    const proMrpRupees = Number(form.proMrpAmountRupees || 0);
    const eliteMrpRupees = Number(form.eliteMrpAmountRupees || 0);
    if (!Number.isFinite(proRupees) || proRupees < 0 || !Number.isFinite(eliteRupees) || eliteRupees < 0) {
      setPricingInlineStatus(key, 'error', 'Invalid amount');
      return;
    }
    if (!Number.isFinite(proMrpRupees) || proMrpRupees < 0 || !Number.isFinite(eliteMrpRupees) || eliteMrpRupees < 0) {
      setPricingInlineStatus(key, 'error', 'Invalid MRP');
      return;
    }
    if (proMrpRupees > 0 && proMrpRupees < proRupees) {
      setPricingInlineStatus(key, 'error', 'Pro MRP must be >= selling price');
      return;
    }
    if (eliteMrpRupees > 0 && eliteMrpRupees < eliteRupees) {
      setPricingInlineStatus(key, 'error', 'Elite MRP must be >= selling price');
      return;
    }

    setIsSavingPricing(true);
    try {
      await saveCoursePricingAdmin(courseName, {
        proPriceInPaise: Math.round(proRupees * 100),
        elitePriceInPaise: Math.round(eliteRupees * 100),
        proMrpInPaise: Math.round(proMrpRupees * 100),
        eliteMrpInPaise: Math.round(eliteMrpRupees * 100),
        thumbnailUrl: String(form.thumbnailUrl || '').trim(),
        thumbnailName: String(form.thumbnailName || '').trim(),
        currency: 'INR',
        active: form.active !== false
      });
      await loadPaymentSettings();
      if (expandedPricingCourse === courseName) {
        await loadModulePricing(courseName);
      }
      setPricingInlineStatus(key, 'success', 'Saved');
      setBanner({ type: 'success', text: `Bundle pricing saved for ${courseName}.` });
    } catch (error) {
      setPricingInlineStatus(key, 'error', error.message || 'Save failed');
      setBanner({ type: 'error', text: error.message || 'Failed to save bundle pricing.' });
    } finally {
      setIsSavingPricing(false);
    }
  }

  async function handleUploadCourseThumbnail(courseName, file) {
    if (!file) return;

    setUploadingThumbnailForCourse(courseName);
    clearPricingSaveStatus(getStatusKey(courseName));
    try {
      const response = await uploadCoursePricingThumbnailAdmin(file);
      const thumbUrl = String(response?.thumbnailUrl || '').trim();
      const thumbName = String(response?.thumbnailName || file.name || '').trim();
      setPriceFormByCourse((current) => ({
        ...current,
        [courseName]: {
          ...(current[courseName] || {}),
          thumbnailUrl: thumbUrl,
          thumbnailName: thumbName
        }
      }));

      // Persist thumbnail to course bundle pricing so it's saved server-side
      try {
        const form = priceFormByCourse[courseName] || {};
        await saveCoursePricingAdmin(courseName, {
          proPriceInPaise: Math.round((Number(form.proAmountRupees || 0) || 0) * 100),
          elitePriceInPaise: Math.round((Number(form.eliteAmountRupees || 0) || 0) * 100),
          proMrpInPaise: Math.round((Number(form.proMrpAmountRupees || 0) || 0) * 100),
          eliteMrpInPaise: Math.round((Number(form.eliteMrpAmountRupees || 0) || 0) * 100),
          thumbnailUrl: thumbUrl,
          thumbnailName: thumbName,
          currency: 'INR',
          active: form.active !== false
        });
        setPricingInlineStatus(getStatusKey(courseName), 'success', 'Thumbnail uploaded');
        await loadPaymentSettings();
      } catch (err) {
        // If saving fails, still keep the uploaded preview but show error
        setPricingInlineStatus(getStatusKey(courseName), 'error', err.message || 'Failed to save thumbnail');
      }
    } catch (error) {
      setPricingInlineStatus(getStatusKey(courseName), 'error', error.message || 'Thumbnail upload failed');
    } finally {
      setUploadingThumbnailForCourse('');
    }
  }

  function updateModulePriceForm(courseName, moduleName, field, value) {
    clearPricingSaveStatus(getStatusKey(courseName, moduleName));
    setModulePricingByCourse((prev) => {
      const courseData = prev[courseName] || { modules: [], priceFormByModule: {} };
      return {
        ...prev,
        [courseName]: {
          ...courseData,
          priceFormByModule: {
            ...courseData.priceFormByModule,
            [moduleName]: {
              ...(courseData.priceFormByModule[moduleName] || {}),
              [field]: value
            }
          }
        }
      };
    });
  }

  async function handleSaveAllModulePrices(courseName) {
    const courseData = modulePricingByCourse[courseName];
    const modulesToSave = (courseData?.modules || []).filter((mod) => !mod.isBundle);
    if (!modulesToSave.length) {
      setBanner({ type: 'error', text: `No modules available for ${courseName}.` });
      return;
    }

    setIsSavingModulePrice(true);
    try {
      await Promise.all(modulesToSave.map((mod) => {
        const form = courseData?.priceFormByModule?.[mod.moduleName] || { proAmountRupees: '0', eliteAmountRupees: '0', proTenure: 1, eliteTenure: 3, active: true };
        return saveModulePricingAdmin(courseName, mod.moduleName, {
          proPriceInPaise: Math.round(Number(form.proAmountRupees || 0) * 100),
          elitePriceInPaise: Math.round(Number(form.eliteAmountRupees || 0) * 100),
          proTenureMonths: form.proTenure || 1,
          eliteTenureMonths: form.eliteTenure || 3,
          currency: 'INR',
          active: form.active !== false
        });
      }));
      await loadModulePricing(courseName);
      setBanner({ type: 'success', text: `Saved module prices for ${courseName}.` });
    } catch (error) {
      setBanner({ type: 'error', text: error.message || `Failed saving module prices for ${courseName}.` });
    } finally {
      setIsSavingModulePrice(false);
    }
  }

  return (
    <AppShell
      title="Pricing Workspace"
      subtitle="Set bundle and module prices with a focused admin flow"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <div className="workspace-shell-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
      )}
    >
      <main className="admin-workspace-page pricing-workspace-shell">
        <section className="workspace-hero workspace-hero-pricing">
          <div>
            <p className="eyebrow">Pricing Settings</p>
            <h2>Course bundle and module pricing</h2>
            <p className="subtitle">Configure Pro and Elite pricing with separate controls per course.</p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label="Courses" value={visibleCourses.length} />
            <StatCard label="Configured" value={configuredVisibleCourseCount} />
          </div>
        </section>

        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        <section className="card payment-pricing-card workspace-panel pricing-workspace-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Course & Module Pricing</p>
              <h3>Set Pro and Elite prices per course or module</h3>
            </div>
          </div>

          <div className="quiz-admin-items pricing-workspace-list">
            {visibleCourses.map((courseName) => {
              const meta = COURSE_META[courseName] || {};
              const form = priceFormByCourse[courseName] || {
                proAmountRupees: '0',
                eliteAmountRupees: '0',
                proMrpAmountRupees: '0',
                eliteMrpAmountRupees: '0',
                thumbnailUrl: '',
                thumbnailName: '',
                active: true
              };
              const isExpanded = expandedPricingCourse === courseName;
              const courseModuleData = modulePricingByCourse[courseName];
              const bundleStatus = pricingSaveStatus[getStatusKey(courseName)] || null;

              return (
                <article key={courseName} className="quiz-admin-item pricing-course-item">
                  <div className="quiz-admin-item-body">
                    <div className="pricing-course-header">
                      <span className="pricing-course-icon">{meta.icon || '📚'}</span>
                      <div>
                        <strong>{courseName}</strong>
                        <p className="pricing-course-sub">All modules bundle - Pro (1 mo) and Elite (3 mo)</p>
                      </div>
                    </div>
                    <div className="pricing-course-thumbnail-row pricing-course-thumbnail-row-compact">
                      <div className="pricing-course-thumbnail-preview pricing-course-thumbnail-preview-compact">
                        {form.thumbnailUrl ? <img src={form.thumbnailUrl} alt={`${courseName} thumbnail`} className="pricing-course-thumbnail-image" /> : <span className="pricing-course-thumbnail-icon">{meta.icon || '📚'}</span>}
                      </div>
                      <div className="pricing-course-thumbnail-actions">
                        <div className="pricing-course-thumbnail-controls">
                          <label className="secondary-btn pricing-thumbnail-upload-btn">
                            {uploadingThumbnailForCourse === courseName ? 'Uploading...' : 'Upload Course Thumbnail'}
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              disabled={uploadingThumbnailForCourse === courseName}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                handleUploadCourseThumbnail(courseName, file);
                                event.target.value = '';
                              }}
                            />
                          </label>
                          <span className="pricing-thumbnail-name">{form.thumbnailName || 'No thumbnail uploaded yet'}</span>
                          {form.thumbnailUrl ? (
                            <button
                              type="button"
                              className="danger-btn"
                              disabled={!isAdminAuthenticated}
                              title={!isAdminAuthenticated ? 'Admin not authenticated — please login' : 'Delete thumbnail'}
                              onClick={async () => {
                                if (!isAdminAuthenticated) {
                                  setBanner({ type: 'error', text: 'Admin authentication required. Please login and retry.' });
                                  return;
                                }
                                const key = getStatusKey(courseName);
                                setPricingInlineStatus(key, 'info', 'Removing thumbnail...');
                                try {
                                  await saveCoursePricingAdmin(courseName, {
                                    proPriceInPaise: Math.round((Number(form.proAmountRupees || 0) || 0) * 100),
                                    elitePriceInPaise: Math.round((Number(form.eliteAmountRupees || 0) || 0) * 100),
                                    proMrpInPaise: Math.round((Number(form.proMrpAmountRupees || 0) || 0) * 100),
                                    eliteMrpInPaise: Math.round((Number(form.eliteMrpAmountRupees || 0) || 0) * 100),
                                    thumbnailUrl: '',
                                    thumbnailName: '',
                                    currency: 'INR',
                                    active: form.active !== false
                                  });
                                  setPricingInlineStatus(key, 'success', 'Thumbnail removed');
                                  await loadPaymentSettings();
                                } catch (err) {
                                  setPricingInlineStatus(key, 'error', err.message || 'Failed to remove thumbnail');
                                }
                              }}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                        <p className="subtitle pricing-course-thumbnail-note">Course-level bundle pricing has been moved to the Batch Editor. Open the Batch Editor below to configure Pro/Elite prices per batch.</p>
                      </div>
                    </div>
                  </div>

                    <div className="quiz-admin-item-actions pricing-actions-col">
                    {bundleStatus ? (
                      <span className={`pricing-inline-status pricing-inline-status-${bundleStatus.type}`}>{bundleStatus.text}</span>
                    ) : null}
                    <button
                      type="button"
                      className="primary-btn module-price-toggle-btn pricing-set-batch-btn"
                      disabled={!isAdminAuthenticated}
                      title={!isAdminAuthenticated ? 'Admin not authenticated — please login' : ''}
                      onClick={() => {
                        if (!isAdminAuthenticated) {
                          setBanner({ type: 'error', text: 'Admin authentication required. Please login and retry.' });
                          return;
                        }
                        navigate(`/admin/batch-pricing?course=${encodeURIComponent(courseName)}`);
                      }}
                    >
                      Open Batch Editor
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="module-pricing-panel">
                      {!courseModuleData ? (
                        <p className="empty-note">Loading modules...</p>
                      ) : courseModuleData.modules.length === 0 ? (
                        <p className="empty-note">No modules found for {courseName}. Upload videos with module names first.</p>
                      ) : (
                        <>
                          <div className="module-pricing-toolbar">
                            <button
                              type="button"
                              className="primary-btn module-pricing-save-all-btn"
                              disabled={isSavingModulePrice}
                              onClick={() => handleSaveAllModulePrices(courseName)}
                            >
                              {isSavingModulePrice ? 'Saving Module Prices...' : 'Save All Module Prices'}
                            </button>
                          </div>

                          <div className="module-pricing-scroll module-pricing-scroll-desktop" role="region" aria-label={`Module pricing for ${courseName}`}>
                            <table className="module-pricing-table">
                              <thead>
                                <tr>
                                  <th>Module</th>
                                  <th>Pro Price</th>
                                  <th>Pro Tenure</th>
                                  <th>Elite Price</th>
                                  <th>Elite Tenure</th>
                                  <th>Active</th>
                                </tr>
                              </thead>
                              <tbody>
                                {courseModuleData.modules.filter((mod) => !mod.isBundle).map((mod) => {
                                  const mf = courseModuleData.priceFormByModule[mod.moduleName] || { proAmountRupees: '0', eliteAmountRupees: '0', proTenure: 1, eliteTenure: 3, active: true };
                                  return (
                                    <tr key={mod.moduleName}>
                                      <td>{mod.label}</td>
                                      <td>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          className="module-pricing-input"
                                          value={mf.proAmountRupees}
                                          onChange={(event) => updateModulePriceForm(courseName, mod.moduleName, 'proAmountRupees', event.target.value)}
                                        />
                                      </td>
                                      <td>
                                        <select
                                          className="module-pricing-select"
                                          value={mf.proTenure}
                                          onChange={(event) => updateModulePriceForm(courseName, mod.moduleName, 'proTenure', parseInt(event.target.value))}
                                        >
                                          <option value={1}>1 month</option>
                                          <option value={2}>2 months</option>
                                          <option value={3}>3 months</option>
                                          <option value={6}>6 months</option>
                                          <option value={12}>12 months</option>
                                        </select>
                                      </td>
                                      <td>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          className="module-pricing-input"
                                          value={mf.eliteAmountRupees}
                                          onChange={(event) => updateModulePriceForm(courseName, mod.moduleName, 'eliteAmountRupees', event.target.value)}
                                        />
                                      </td>
                                      <td>
                                        <select
                                          className="module-pricing-select"
                                          value={mf.eliteTenure}
                                          onChange={(event) => updateModulePriceForm(courseName, mod.moduleName, 'eliteTenure', parseInt(event.target.value))}
                                        >
                                          <option value={1}>1 month</option>
                                          <option value={2}>2 months</option>
                                          <option value={3}>3 months</option>
                                          <option value={6}>6 months</option>
                                          <option value={12}>12 months</option>
                                        </select>
                                      </td>
                                      <td>
                                        <input
                                          type="checkbox"
                                          checked={mf.active !== false}
                                          onChange={(event) => updateModulePriceForm(courseName, mod.moduleName, 'active', event.target.checked)}
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          <div className="module-pricing-mobile-list" role="region" aria-label={`Module pricing cards for ${courseName}`}>
                            {courseModuleData.modules.filter((mod) => !mod.isBundle).map((mod) => {
                              const mf = courseModuleData.priceFormByModule[mod.moduleName] || { proAmountRupees: '0', eliteAmountRupees: '0', proTenure: 1, eliteTenure: 3, active: true };
                              return (
                                <article key={`${mod.moduleName}-mobile`} className="module-pricing-mobile-card">
                                  <div className="module-pricing-mobile-head">
                                    <strong className="module-pricing-name">{mod.label}</strong>
                                  </div>
                                  <div className="module-pricing-mobile-fields">
                                    <label className="module-pricing-mobile-field">
                                      <span>Pro Price (Rs/mo)</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="module-pricing-input"
                                        value={mf.proAmountRupees}
                                        onChange={(event) => updateModulePriceForm(courseName, mod.moduleName, 'proAmountRupees', event.target.value)}
                                      />
                                    </label>
                                    <label className="module-pricing-mobile-field">
                                      <span>Pro Tenure</span>
                                      <select
                                        className="module-pricing-select"
                                        value={mf.proTenure}
                                        onChange={(event) => updateModulePriceForm(courseName, mod.moduleName, 'proTenure', parseInt(event.target.value))}
                                      >
                                        <option value={1}>1 month</option>
                                        <option value={2}>2 months</option>
                                        <option value={3}>3 months</option>
                                        <option value={6}>6 months</option>
                                        <option value={12}>12 months</option>
                                      </select>
                                    </label>
                                    <label className="module-pricing-mobile-field">
                                      <span>Elite Price (Rs/mo)</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="module-pricing-input"
                                        value={mf.eliteAmountRupees}
                                        onChange={(event) => updateModulePriceForm(courseName, mod.moduleName, 'eliteAmountRupees', event.target.value)}
                                      />
                                    </label>
                                    <label className="module-pricing-mobile-field">
                                      <span>Elite Tenure</span>
                                      <select
                                        className="module-pricing-select"
                                        value={mf.eliteTenure}
                                        onChange={(event) => updateModulePriceForm(courseName, mod.moduleName, 'eliteTenure', parseInt(event.target.value))}
                                      >
                                        <option value={1}>1 month</option>
                                        <option value={2}>2 months</option>
                                        <option value={3}>3 months</option>
                                        <option value={6}>6 months</option>
                                        <option value={12}>12 months</option>
                                      </select>
                                    </label>
                                  </div>
                                  <label className="module-pricing-mobile-active">
                                    <input
                                      type="checkbox"
                                      checked={mf.active !== false}
                                      onChange={(event) => updateModulePriceForm(courseName, mod.moduleName, 'active', event.target.checked)}
                                    />
                                    Active module
                                  </label>
                                </article>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                    {expandedBatchCourse === courseName ? (
                    <div className="module-pricing-panel">
                      {!batchPricingByCourse[courseName] ? (
                        <p className="empty-note">Loading batches...</p>
                      ) : batchFetchErrorByCourse[courseName] ? (
                        <div>
                          <p className="empty-note">Failed to load batches: {batchFetchErrorByCourse[courseName]}</p>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              className="primary-btn"
                              onClick={async () => {
                                setBatchFetchErrorByCourse((p) => { const next = { ...(p || {}) }; delete next[courseName]; return next; });
                                try { await loadBatchPricing(courseName); } catch (e) { }
                              }}
                            >
                              Retry
                            </button>
                            <button type="button" className="secondary-btn" onClick={() => window.location.reload()}>Refresh / Re-login</button>
                          </div>
                          <p className="subtitle" style={{ marginTop: 8 }}>If you see "Authentication required", please re-login as an admin.</p>
                        </div>
                      ) : batchPricingByCourse[courseName].batches.length === 0 ? (
                        <p className="empty-note">No batches found for {courseName}.</p>
                      ) : (
                        <div className="module-pricing-mobile-list" role="region" aria-label={`Batch pricing cards for ${courseName}`}>
                          {batchPricingByCourse[courseName].batches.map((b) => {
                            const bf = batchPricingByCourse[courseName].priceFormByBatch[b.batchName] || { proAmountRupees: '0', eliteAmountRupees: '0', proMrpAmountRupees: '0', eliteMrpAmountRupees: '0', proTenure: 1, eliteTenure: 3, active: true };
                            return (
                              <article key={`batch-${b.batchName}`} className="module-pricing-mobile-card">
                                <div className="module-pricing-mobile-head">
                                  <strong className="module-pricing-name">{b.batchName}</strong>
                                </div>
                                <div className="module-pricing-mobile-fields">
                                  <label className="module-pricing-mobile-field">
                                    <span>Pro Price (Rs/mo)</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="module-pricing-input"
                                      value={bf.proAmountRupees}
                                      onChange={(event) => updateBatchPriceForm(courseName, b.batchName, 'proAmountRupees', event.target.value)}
                                    />
                                  </label>
                                  <label className="module-pricing-mobile-field">
                                    <span>Pro MRP</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="module-pricing-input"
                                      value={bf.proMrpAmountRupees}
                                      onChange={(event) => updateBatchPriceForm(courseName, b.batchName, 'proMrpAmountRupees', event.target.value)}
                                    />
                                  </label>
                                  <label className="module-pricing-mobile-field">
                                    <span>Pro Tenure</span>
                                    <select
                                      className="module-pricing-select"
                                      value={bf.proTenure}
                                      onChange={(event) => updateBatchPriceForm(courseName, b.batchName, 'proTenure', parseInt(event.target.value))}
                                    >
                                      <option value={1}>1 month</option>
                                      <option value={2}>2 months</option>
                                      <option value={3}>3 months</option>
                                      <option value={6}>6 months</option>
                                      <option value={12}>12 months</option>
                                    </select>
                                  </label>
                                  <label className="module-pricing-mobile-field">
                                    <span>Elite Price (Rs/mo)</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="module-pricing-input"
                                      value={bf.eliteAmountRupees}
                                      onChange={(event) => updateBatchPriceForm(courseName, b.batchName, 'eliteAmountRupees', event.target.value)}
                                    />
                                  </label>
                                  <label className="module-pricing-mobile-field">
                                    <span>Elite MRP</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="module-pricing-input"
                                      value={bf.eliteMrpAmountRupees}
                                      onChange={(event) => updateBatchPriceForm(courseName, b.batchName, 'eliteMrpAmountRupees', event.target.value)}
                                    />
                                  </label>
                                  <label className="module-pricing-mobile-field">
                                    <span>Elite Tenure</span>
                                    <select
                                      className="module-pricing-select"
                                      value={bf.eliteTenure}
                                      onChange={(event) => updateBatchPriceForm(courseName, b.batchName, 'eliteTenure', parseInt(event.target.value))}
                                    >
                                      <option value={1}>1 month</option>
                                      <option value={2}>2 months</option>
                                      <option value={3}>3 months</option>
                                      <option value={6}>6 months</option>
                                      <option value={12}>12 months</option>
                                    </select>
                                  </label>
                                </div>
                                <label className="module-pricing-mobile-active">
                                  <input
                                    type="checkbox"
                                    checked={bf.active !== false}
                                    onChange={(event) => updateBatchPriceForm(courseName, b.batchName, 'active', event.target.checked)}
                                  />
                                  Active batch
                                </label>
                                <div className="batch-pricing-actions-row">
                                  <label className="secondary-btn pricing-thumbnail-upload-btn">
                                    Upload Thumbnail
                                    <input
                                      type="file"
                                      accept="image/*"
                                      hidden
                                      onChange={async (event) => {
                                        const file = event.target.files?.[0];
                                        if (!file) return;
                                        try {
                                          const resp = await uploadCoursePricingThumbnailAdmin(file);
                                          updateBatchPriceForm(courseName, b.batchName, 'thumbnailUrl', String(resp?.thumbnailUrl || '').trim());
                                          updateBatchPriceForm(courseName, b.batchName, 'thumbnailName', String(resp?.thumbnailName || file.name || '').trim());
                                        } catch (err) {
                                          setBanner({ type: 'error', text: err.message || 'Thumbnail upload failed.' });
                                        } finally {
                                          event.target.value = '';
                                        }
                                      }}
                                    />
                                  </label>
                                  <button type="button" className="primary-btn" onClick={() => handleSaveBatchPrice(courseName, b.batchName)}>
                                    Save Batch Price
                                  </button>
                                  {bf.thumbnailUrl ? (
                                    <img src={bf.thumbnailUrl} alt={`${b.batchName} thumbnail`} className="batch-pricing-thumb-preview" />
                                  ) : null}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!visibleCourses.length ? (
              <p className="empty-note">No active courses found. Create a course first in Course Setup Workspace.</p>
            ) : null}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
