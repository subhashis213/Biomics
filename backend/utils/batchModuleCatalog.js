const Course = require('../models/Course');
const Module = require('../models/Module');
const ModulePricing = require('../models/ModulePricing');
const Video = require('../models/Video');
const Quiz = require('../models/Quiz');
const TopicTest = require('../models/TopicTest');
const MockExam = require('../models/MockExam');
const FullMockTest = require('../models/FullMockTest');
const {
  ALL_MODULES,
  normalizeCourseName,
  normalizeBatchName,
  normalizeModuleName
} = require('./courseAccess');

function normalizeNameKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCatalogText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

/**
 * Content (Video/Quiz/Module) query for a batch:
 * - If the course has only one batch → all content for the category (migrated batch strings included).
 * - If multiple batches → target batch OR General/empty OR batch string that is not another sibling batch name
 *   (so migrated "old course" batch labels still surface modules under the right catalog).
 */
async function buildCategoryContentScopeFilter(category, targetBatchName) {
  const cat = normalizeCourseName(category);
  const B = normalizeBatchName(targetBatchName);
  const course = await findCourseDocByName(cat);

  const siblingExactStrings = (course?.batches || [])
    .map((b) => normalizeCatalogText(b?.name))
    .filter((name) => name && normalizeNameKey(name) !== normalizeNameKey(B));

  if (!siblingExactStrings.length) {
    return { category: cat };
  }

  return {
    category: cat,
    $or: [
      { batch: { $in: [B, 'General', '', null] } },
      { batch: { $nin: siblingExactStrings } }
    ]
  };
}

async function findCourseDocByName(courseName) {
  const normalizedKey = normalizeNameKey(courseName);
  if (!normalizedKey) return null;
  const docs = await Course.find({}).sort({ updatedAt: -1 }).lean();
  return docs.find((entry) => normalizeNameKey(entry?.name) === normalizedKey) || null;
}

/**
 * Module names explicitly stored on the Course batch (authoritative catalog for admin + pricing UI).
 */
async function getConfiguredModuleNamesForBatch(courseName, batchName) {
  const course = await findCourseDocByName(courseName);
  if (!course?.batches?.length) return [];
  const b = normalizeBatchName(batchName);
  const batchEntry = course.batches.find((entry) => normalizeBatchName(entry?.name) === b);
  const raw = Array.isArray(batchEntry?.moduleNames) ? batchEntry.moduleNames : [];
  const out = [];
  const seen = new Set();
  raw.forEach((name) => {
    const m = normalizeModuleName(name);
    if (!m || m === ALL_MODULES) return;
    const k = m.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(m);
  });
  return out;
}

/**
 * Inferred module names from Module rows and published content (no ModulePricing — caller merges pricing).
 */
async function inferModuleNamesFromContentAndRows(courseName, batchName, precomputedScope = null) {
  const cat = normalizeCourseName(courseName);
  const scope = precomputedScope || await buildCategoryContentScopeFilter(cat, batchName);

  const [modules, videoModules, quizModules, topicTestModules, mockExamModules, fullMockModules] = await Promise.all([
    Module.find(scope).sort({ name: 1 }).lean(),
    Video.distinct('module', scope),
    Quiz.distinct('module', scope),
    TopicTest.distinct('module', scope),
    MockExam.distinct('module', scope),
    FullMockTest.distinct('module', scope)
  ]);

  const contentModuleNames = [
    ...videoModules,
    ...quizModules,
    ...topicTestModules,
    ...mockExamModules,
    ...fullMockModules
  ].map((entry) => normalizeModuleName(entry)).filter(Boolean);

  const inferred = new Set();
  modules.forEach((entry) => {
    const m = normalizeModuleName(entry?.name);
    if (m && m !== ALL_MODULES) inferred.add(m);
  });
  contentModuleNames.forEach((m) => {
    if (m && m !== ALL_MODULES) inferred.add(m);
  });

  return Array.from(inferred);
}

/** @deprecated use getMergedModuleNamesForBatch */
async function inferModuleNamesForBatch(courseName, batchName) {
  return getMergedModuleNamesForBatch(courseName, batchName);
}

/**
 * One round-trip: merged module names + ModulePricing docs (for payment routes).
 */
async function fetchBatchModuleCatalogAndPricing(courseName, batchName) {
  const cat = normalizeCourseName(courseName);
  const batch = normalizeBatchName(batchName);
  const scope = await buildCategoryContentScopeFilter(cat, batch);

  const [configured, fromRows, pricingDocs] = await Promise.all([
    getConfiguredModuleNamesForBatch(courseName, batchName),
    inferModuleNamesFromContentAndRows(courseName, batchName, scope),
    ModulePricing.find(scope).lean()
  ]);

  const pricedModuleNames = pricingDocs
    .map((entry) => normalizeModuleName(entry?.moduleName))
    .filter((moduleName) => moduleName && moduleName !== ALL_MODULES);

  const merged = new Set([...configured, ...fromRows, ...pricedModuleNames]);
  const mergedModuleNames = Array.from(merged)
    .filter((m) => m && m !== ALL_MODULES)
    .sort((a, b) => a.localeCompare(b));
  return { mergedModuleNames, pricingDocs };
}

/**
 * Full list for a batch: configured catalog ∪ Module/content ∪ ModulePricing rows.
 */
async function getMergedModuleNamesForBatch(courseName, batchName) {
  const { mergedModuleNames } = await fetchBatchModuleCatalogAndPricing(courseName, batchName);
  return mergedModuleNames;
}

async function saveModuleNamesToCourseBatch(courseName, batchName, moduleNames) {
  const cat = normalizeCourseName(courseName);
  const b = normalizeBatchName(batchName);
  const lean = await findCourseDocByName(cat);
  if (!lean?._id) return false;

  const normalizedList = [];
  const seen = new Set();
  (Array.isArray(moduleNames) ? moduleNames : []).forEach((name) => {
    const m = normalizeModuleName(name);
    if (!m || m === ALL_MODULES) return;
    const k = m.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    normalizedList.push(m);
  });
  normalizedList.sort((a, b) => a.localeCompare(b));

  const courseDoc = await Course.findById(lean._id);
  if (!courseDoc) return false;
  const idx = (courseDoc.batches || []).findIndex((entry) => normalizeBatchName(entry?.name) === b);
  if (idx < 0) return false;
  courseDoc.batches[idx].moduleNames = normalizedList;
  courseDoc.markModified('batches');
  await courseDoc.save();
  return true;
}

async function appendModuleNameToCourseBatch(courseName, batchName, moduleName) {
  const m = normalizeModuleName(moduleName);
  if (!m || m === ALL_MODULES) return;
  const current = await getConfiguredModuleNamesForBatch(courseName, batchName);
  if (current.some((x) => x.toLowerCase() === m.toLowerCase())) return;
  await saveModuleNamesToCourseBatch(courseName, batchName, [...current, m]);
}

async function removeModuleNameFromCourseBatch(courseName, batchName, moduleName) {
  const m = normalizeModuleName(moduleName);
  if (!m) return;
  const configured = await getConfiguredModuleNamesForBatch(courseName, batchName);
  const next = configured.filter((x) => x.toLowerCase() !== m.toLowerCase());
  if (next.length === configured.length) return;
  await saveModuleNamesToCourseBatch(courseName, batchName, next);
}

/** Replace catalog with union of configured + inferred (backfill / "Sync" button). */
async function rebuildCourseBatchModuleCatalog(courseName, batchName) {
  const merged = await getMergedModuleNamesForBatch(courseName, batchName);
  await saveModuleNamesToCourseBatch(courseName, batchName, merged);
  return merged;
}

module.exports = {
  getConfiguredModuleNamesForBatch,
  inferModuleNamesForBatch,
  inferModuleNamesFromContentAndRows,
  buildCategoryContentScopeFilter,
  fetchBatchModuleCatalogAndPricing,
  getMergedModuleNamesForBatch,
  appendModuleNameToCourseBatch,
  removeModuleNameFromCourseBatch,
  rebuildCourseBatchModuleCatalog,
  saveModuleNamesToCourseBatch,
  findCourseDocByName
};
