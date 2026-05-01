const Course = require('../models/Course');

function normalizeCourseName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/** Collapse punctuation/spacing so "NET 2026" and "NET2026" reconcile. */
function alphanumericKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function nospaceLower(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
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
    const nsk = nospaceLower(candidate);
    if (nsk) {
      const flexNs = list.find((n) => nospaceLower(n) === nsk);
      if (flexNs) return flexNs;
    }
    return '';
  };

  return resolveOne(want) || resolveOne(enrolled) || '';
}

/**
 * @param {string} queryCourse - URL or UI hint
 * @param {string} enrolledClass - user.class
 * @param {string[]} [extraHints] - e.g. purchasedCourses[].course
 */
async function resolveStudentCourseFromRequest(queryCourse, enrolledClass, extraHints = []) {
  const catalog = await Course.find({}).select('name').lean();
  const names = catalog.map((entry) => entry.name);

  let resolved = pickCanonicalCourseName(queryCourse, enrolledClass, names);
  if (!resolved && Array.isArray(extraHints)) {
    for (const hint of extraHints) {
      if (!hint) continue;
      resolved = pickCanonicalCourseName(hint, enrolledClass, names);
      if (resolved) break;
    }
  }
  if (!resolved) {
    const fb = normalizeCourseName(enrolledClass) || normalizeCourseName(queryCourse) || '';
    if (fb) {
      resolved = pickCanonicalCourseName(fb, fb, names) || fb;
    }
  }
  return resolved || '';
}

module.exports = {
  normalizeCourseName,
  pickCanonicalCourseName,
  resolveStudentCourseFromRequest
};
