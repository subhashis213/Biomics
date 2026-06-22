/** Archived / legacy catalog names that belong to an active course. */
const LEGACY_COURSE_ALIASES = {
  'CSIR LifeScience NET2026': [
    'CSIR NET LIFESCIENCE TEST1',
    'CSIR-NET Life Science',
    'CSIR- NET Life Science',
    'Batch 1.0 CSIR NET LIFE SCIENCE',
    'Rank Booster Crash Course'
  ]
};

function normalizeCourse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getLegacySourceCourses(activeCourse) {
  const key = normalizeCourse(activeCourse);
  return (LEGACY_COURSE_ALIASES[key] || []).map(normalizeCourse).filter(Boolean);
}

/** Active course + any legacy source names still holding unmigrated rows. */
function expandCourseCategories(activeCourse) {
  const primary = normalizeCourse(activeCourse);
  if (!primary) return [];
  const legacy = getLegacySourceCourses(primary);
  return [...new Set([primary, ...legacy])];
}

module.exports = {
  LEGACY_COURSE_ALIASES,
  normalizeCourse,
  getLegacySourceCourses,
  expandCourseCategories
};
