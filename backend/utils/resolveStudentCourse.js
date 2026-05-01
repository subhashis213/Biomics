const Course = require('../models/Course');

function normalizeCourseName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/** Collapse punctuation/spacing so "NET 2026" and "NET2026" reconcile. */
function alphanumericKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Map a student's URL hint or enrolled class to the canonical Course.name in DB.
 */
function pickCanonicalCourseName(preferredRaw, enrolledRaw, catalogNames = []) {
  const want = normalizeCourseName(preferredRaw);
  const enrolled = normalizeCourseName(enrolledRaw);
  const list = [...new Set((catalogNames || []).map((n) => normalizeCourseName(n)))].filter(Boolean);
  if (!list.length) return want || enrolled || '';

  const resolveOne = (candidate) => {
    if (!candidate) return '';
    if (list.includes(candidate)) return candidate;
    const lower = candidate.toLowerCase();
    const ci = list.find((n) => n.toLowerCase() === lower);
    if (ci) return ci;
    const ak = alphanumericKey(candidate);
    if (ak) {
      const flex = list.find((n) => alphanumericKey(n) === ak);
      if (flex) return flex;
    }
    return '';
  };

  return resolveOne(want) || resolveOne(enrolled) || '';
}

async function resolveStudentCourseFromRequest(queryCourse, enrolledClass) {
  const catalog = await Course.find({ active: true }).select('name').lean();
  const names = catalog.map((entry) => entry.name);
  return pickCanonicalCourseName(queryCourse, enrolledClass, names);
}

module.exports = {
  normalizeCourseName,
  pickCanonicalCourseName,
  resolveStudentCourseFromRequest
};
