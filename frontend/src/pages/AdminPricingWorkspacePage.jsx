import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchCoursePricingAdmin,
  fetchModulePricingAdmin,
  saveCoursePricingAdmin,
  saveModulePricingAdmin
} from '../api';
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

const COURSE_META = {
  '11th':                  { icon: '📖' },
  '12th':                  { icon: '🎓' },
  'NEET':                  { icon: '🧬' },
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
  const [priceFormByCourse, setPriceFormByCourse] = useState({});
  const [modulePricingByCourse, setModulePricingByCourse] = useState({});
  const [expandedPricingCourse, setExpandedPricingCourse] = useState(null);
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [isSavingModulePrice, setIsSavingModulePrice] = useState(false);
  const [pricingSaveStatus, setPricingSaveStatus] = useState({});
  const [banner, setBanner] = useState(null);

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
      const pricingResponse = await fetchCoursePricingAdmin();
      const pricing = Array.isArray(pricingResponse?.pricing) ? pricingResponse.pricing : [];
      setCoursePricing(pricing);

      const nextPriceForm = {};
      pricing.forEach((entry) => {
        nextPriceForm[entry.course] = {
          proAmountRupees: String(Number(entry.proPriceInPaise || 0) / 100),
          eliteAmountRupees: String(Number(entry.elitePriceInPaise || 0) / 100),
          active: entry.active !== false
        };
      });

      COURSE_CATEGORIES.forEach((courseName) => {
        if (!nextPriceForm[courseName]) {
          nextPriceForm[courseName] = { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
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

  useEffect(() => {
    loadPaymentSettings();
  }, []);

  async function handleSaveCoursePrice(courseName) {
    const key = getStatusKey(courseName);
    const form = priceFormByCourse[courseName] || { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
    const proRupees = Number(form.proAmountRupees || 0);
    const eliteRupees = Number(form.eliteAmountRupees || 0);
    if (!Number.isFinite(proRupees) || proRupees < 0 || !Number.isFinite(eliteRupees) || eliteRupees < 0) {
      setPricingInlineStatus(key, 'error', 'Invalid amount');
      return;
    }

    setIsSavingPricing(true);
    try {
      await saveCoursePricingAdmin(courseName, {
        proPriceInPaise: Math.round(proRupees * 100),
        elitePriceInPaise: Math.round(eliteRupees * 100),
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
        const form = courseData?.priceFormByModule?.[mod.moduleName] || { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
        return saveModulePricingAdmin(courseName, mod.moduleName, {
          proPriceInPaise: Math.round(Number(form.proAmountRupees || 0) * 100),
          elitePriceInPaise: Math.round(Number(form.eliteAmountRupees || 0) * 100),
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
        <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
      )}
    >
      <main className="admin-workspace-page">
        <section className="workspace-hero workspace-hero-pricing">
          <div>
            <p className="eyebrow">Pricing Settings</p>
            <h2>Course bundle and module pricing</h2>
            <p className="subtitle">Configure Pro and Elite pricing with separate controls per course.</p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label="Courses" value={COURSE_CATEGORIES.length} />
            <StatCard label="Configured" value={coursePricing.length} />
          </div>
        </section>

        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        <section className="card payment-pricing-card workspace-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Course & Module Pricing</p>
              <h3>Set Pro and Elite prices per course or module</h3>
            </div>
          </div>

          <div className="quiz-admin-items">
            {COURSE_CATEGORIES.map((courseName) => {
              const meta = COURSE_META[courseName] || {};
              const form = priceFormByCourse[courseName] || { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
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
                    <div className="quiz-admin-meta pricing-input-row" aria-label="Bundle pricing">
                      <label className="pricing-input-label">
                        <span>Pro (Rs/mo)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.proAmountRupees}
                          onChange={(event) => {
                            const proAmountRupees = event.target.value;
                            setPriceFormByCourse((current) => ({
                              ...current,
                              [courseName]: { ...(current[courseName] || {}), proAmountRupees }
                            }));
                            clearPricingSaveStatus(getStatusKey(courseName));
                          }}
                          placeholder="0.00"
                        />
                      </label>
                      <label className="pricing-input-label">
                        <span>Elite (Rs/3 mo)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.eliteAmountRupees}
                          onChange={(event) => {
                            const eliteAmountRupees = event.target.value;
                            setPriceFormByCourse((current) => ({
                              ...current,
                              [courseName]: { ...(current[courseName] || {}), eliteAmountRupees }
                            }));
                            clearPricingSaveStatus(getStatusKey(courseName));
                          }}
                          placeholder="0.00"
                        />
                      </label>
                      <label className="pricing-active-label">
                        <input
                          type="checkbox"
                          checked={form.active !== false}
                          onChange={(event) => {
                            const active = event.target.checked;
                            setPriceFormByCourse((current) => ({
                              ...current,
                              [courseName]: { ...(current[courseName] || {}), active }
                            }));
                            clearPricingSaveStatus(getStatusKey(courseName));
                          }}
                        />
                        Active
                      </label>
                    </div>
                  </div>

                  <div className="quiz-admin-item-actions pricing-actions-col">
                    {bundleStatus ? (
                      <span className={`pricing-inline-status pricing-inline-status-${bundleStatus.type}`}>{bundleStatus.text}</span>
                    ) : null}
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={isSavingPricing}
                      onClick={() => handleSaveCoursePrice(courseName)}
                    >
                      {isSavingPricing ? 'Saving...' : 'Save Bundle'}
                    </button>
                    <button
                      type="button"
                      className="secondary-btn module-price-toggle-btn"
                      onClick={async () => {
                        if (isExpanded) {
                          setExpandedPricingCourse(null);
                        } else {
                          setExpandedPricingCourse(courseName);
                          if (!modulePricingByCourse[courseName]) {
                            await loadModulePricing(courseName);
                          }
                        }
                      }}
                    >
                      {isExpanded ? 'Close Module Editor' : 'Open Module Editor'}
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
                                  <th>Elite Price</th>
                                  <th>Active</th>
                                </tr>
                              </thead>
                              <tbody>
                                {courseModuleData.modules.filter((mod) => !mod.isBundle).map((mod) => {
                                  const mf = courseModuleData.priceFormByModule[mod.moduleName] || { proAmountRupees: '0', eliteAmountRupees: '0', active: true };
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
                        </>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
