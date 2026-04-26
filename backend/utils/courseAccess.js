const ModulePricing = require('../models/ModulePricing');
const BatchPricing = require('../models/BatchPricing');

const MEMBERSHIP_PLANS = {
  pro: { type: 'pro', label: 'Pro', durationMonths: 1 },
  elite: { type: 'elite', label: 'Elite', durationMonths: 3 }
};

const ALL_MODULES = 'ALL_MODULES';

function normalizeCourseName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeModuleName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim() || 'General';
}

function normalizeBatchName(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized || 'General';
}

function getMembershipPlan(planType) {
  return MEMBERSHIP_PLANS[String(planType || '').trim().toLowerCase()] || null;
}

function getPlanPriceInPaise(pricing, planType) {
  const plan = getMembershipPlan(planType);
  if (!plan || !pricing) return 0;
  if (plan.type === 'elite') return Math.max(0, Number(pricing.elitePriceInPaise || 0));
  return Math.max(0, Number(pricing.proPriceInPaise || 0));
}

/**
 * Returns active membership for a specific module (or ALL_MODULES bundle).
 * An ALL_MODULES entry also grants access to every individual module.
 */
function getActiveModuleMembership(userDoc, course, moduleName, batchName = 'General') {
  const normalizedCourse = normalizeCourseName(course);
  const normalizedModule = normalizeModuleName(moduleName);
  const normalizedBatch = normalizeBatchName(batchName);
  if (!userDoc || !normalizedCourse || !Array.isArray(userDoc.purchasedCourses)) return null;
  const now = Date.now();

  const isActive = (entry) => {
    if (!entry?.expiresAt) return true;
    const exp = new Date(entry.expiresAt).getTime();
    return Number.isFinite(exp) && exp > now;
  };

  // Check bundle (ALL_MODULES) — gives access to every module
  const matchBatch = (entryBatch) => {
    const stored = normalizeBatchName(entryBatch);
    return stored === normalizedBatch || stored === 'General';
  };

  const bundleEntry = userDoc.purchasedCourses
    .filter((e) => (
      normalizeCourseName(e?.course) === normalizedCourse
      && normalizeModuleName(e?.moduleName) === ALL_MODULES
      && matchBatch(e?.batch)
    ))
    .filter(isActive)
    .sort((a, b) => new Date(b?.expiresAt || 0).getTime() - new Date(a?.expiresAt || 0).getTime())[0];
  if (bundleEntry) return bundleEntry;

  // If asking for ALL_MODULES specifically, no individual module entry counts
  if (normalizedModule === ALL_MODULES) return null;

  // Check individual module entry
  const moduleEntry = userDoc.purchasedCourses
    .filter((e) => (
      normalizeCourseName(e?.course) === normalizedCourse
      && normalizeModuleName(e?.moduleName) === normalizedModule
      && matchBatch(e?.batch)
    ))
    .filter(isActive)
    .sort((a, b) => new Date(b?.expiresAt || 0).getTime() - new Date(a?.expiresAt || 0).getTime())[0];

  return moduleEntry || null;
}

/** Legacy alias — checks for any active membership for the course (any module or bundle). */
function getActiveCourseMembership(userDoc, course) {
  const normalizedCourse = normalizeCourseName(course);
  if (!userDoc || !normalizedCourse || !Array.isArray(userDoc.purchasedCourses)) return null;
  const now = Date.now();
  const matching = userDoc.purchasedCourses
    .filter((e) => normalizeCourseName(e?.course) === normalizedCourse)
    .filter((e) => {
      if (!e?.expiresAt) return true;
      const exp = new Date(e.expiresAt).getTime();
      return Number.isFinite(exp) && exp > now;
    })
    .sort((a, b) => new Date(b?.expiresAt || 0).getTime() - new Date(a?.expiresAt || 0).getTime());
  return matching[0] || null;
}

/** Fetch all active pricing docs for a course from ModulePricing collection. */
async function getCoursePricingDocs(course) {
  const normalized = normalizeCourseName(course);
  if (!normalized) return [];
  return ModulePricing.find({ category: normalized, active: true }).lean();
}

/** Fetch a single pricing doc for a course + module. */
async function getModulePricingDoc(course, moduleName, batchName = 'General') {
  const normalized = normalizeCourseName(course);
  const normalizedMod = normalizeModuleName(moduleName);
  const normalizedBatch = normalizeBatchName(batchName);
  if (!normalized) return null;

  // First try batch-level pricing (if moduleName happens to be a batch name)
  try {
    const batchDoc = await BatchPricing.findOne({ category: normalized, batchName: normalizedMod, active: true }).lean();
    if (batchDoc) return batchDoc;
  } catch (e) {
    // ignore
  }

  const direct = await ModulePricing.findOne({
    category: normalized,
    batch: normalizedBatch,
    moduleName: normalizedMod,
    active: true
  }).lean();
  if (direct) return direct;

  const generalFallback = await ModulePricing.findOne({
    category: normalized,
    batch: 'General',
    moduleName: normalizedMod,
    active: true
  }).lean();
  if (generalFallback) return generalFallback;

  // Backward-compat fallback for legacy records with inconsistent spacing.
  const candidates = await ModulePricing.find({ category: normalized, active: true }).lean();
  return candidates.find(
    (entry) => normalizeModuleName(entry.moduleName) === normalizedMod
      && (normalizeBatchName(entry.batch) === normalizedBatch || normalizeBatchName(entry.batch) === 'General')
  ) || null;
}

/**
 * Check if user has access to a specific module in a course.
 * Returns true if:
 *  - The module has no active pricing (free)
 *  - User has an active ALL_MODULES bundle
 *  - User has an active individual module entry for that module
 */
async function hasModuleAccess(userDoc, course, moduleName, batchName = 'General') {
  const normalizedCourse = normalizeCourseName(course);
  const normalizedModule = normalizeModuleName(moduleName);
  const normalizedBatch = normalizeBatchName(batchName);
  if (!userDoc || !normalizedCourse) return false;

  const enrolledCourse = normalizeCourseName(userDoc.class);
  const hasMembership = Boolean(getActiveModuleMembership(userDoc, normalizedCourse, normalizedModule, normalizedBatch));

  // Prevent accidental cross-course access from being treated as free content.
  // A different course requires an explicit active membership for that course.
  if (enrolledCourse && enrolledCourse !== normalizedCourse && !hasMembership) {
    return false;
  }

  const pricingDoc = await getModulePricingDoc(normalizedCourse, normalizedModule, normalizedBatch);
  const isFree = !pricingDoc
    || (Number(pricingDoc.proPriceInPaise || 0) <= 0 && Number(pricingDoc.elitePriceInPaise || 0) <= 0);
  if (isFree) {
    // Also check if there's any course-level pricing (bundle) that might gate everything
    // If ANY pricing doc exists for this course, even free modules might be gated by bundle.
    // But per-module free means this specific module is free.
    return true;
  }

  return hasMembership;
}

/**
 * Legacy course-wide access check. Returns true if:
 *  - No pricing docs at all for the course (entirely free)
 *  - User has at least one active membership (any module or bundle)
 */
async function hasCourseAccess(userDoc, course) {
  const normalizedCourse = normalizeCourseName(course);
  if (!userDoc || !normalizedCourse) return false;

  const enrolledCourse = normalizeCourseName(userDoc.class);
  const hasMembership = Boolean(getActiveCourseMembership(userDoc, normalizedCourse));
  if (enrolledCourse && enrolledCourse !== normalizedCourse && !hasMembership) {
    return false;
  }

  const pricingDocs = await getCoursePricingDocs(normalizedCourse);
  const hasPricing = pricingDocs.some(
    (p) => Number(p.proPriceInPaise || 0) > 0 || Number(p.elitePriceInPaise || 0) > 0
  );
  if (!hasPricing) return true;

  return hasMembership;
}

// Keep legacy alias for backward compat with paymentRoutes
async function getCoursePricing(course) {
  return getModulePricingDoc(course, ALL_MODULES);
}

module.exports = {
  ALL_MODULES,
  MEMBERSHIP_PLANS,
  getActiveCourseMembership,
  getActiveModuleMembership,
  normalizeCourseName,
  normalizeModuleName,
  normalizeBatchName,
  getCoursePricing,
  getCoursePricingDocs,
  getModulePricingDoc,
  getMembershipPlan,
  getPlanPriceInPaise,
  hasCourseAccess,
  hasModuleAccess
};
