/**
 * Helpers for admin content scoping by course batch (legacy-safe).
 */

function normalizeValue(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mongo $or clauses matching a batch column to a target batch name,
 * including legacy empty/General/missing and case-insensitive exact match.
 */
function buildBatchOrClause(batchName) {
  const normalized = normalizeValue(batchName || '');
  if (!normalized) return null;
  const clauses = [
    { batch: normalized },
    { batch: 'General' },
    { batch: '' },
    { batch: null },
    { batch: { $exists: false } }
  ];
  try {
    clauses.push({ batch: new RegExp(`^\\s*${escapeRegex(normalized)}\\s*$`, 'i') });
  } catch {
    // ignore
  }
  return clauses;
}

function withOptionalBatch(baseFilter, batchName) {
  const batchClause = buildBatchOrClause(batchName);
  if (!batchClause) return baseFilter;
  return {
    $and: [baseFilter, { $or: batchClause }]
  };
}

/** Same batch for sweep (handles case / whitespace). */
function sameBatchStored(stored, target) {
  const a = normalizeValue(stored);
  const b = normalizeValue(target);
  if (!b) return true;
  if (!a) return b === 'General' || b === '';
  return a.toLowerCase() === b.toLowerCase();
}

module.exports = {
  normalizeValue,
  buildBatchOrClause,
  withOptionalBatch,
  sameBatchStored
};
