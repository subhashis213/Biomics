/**
 * Question Clipboard — localStorage-backed cross-builder clipboard.
 * Allows copying a set of questions from any admin builder and pasting
 * into any other builder (Quiz Builder, Monthly Mock Exam, Topic Test Builder,
 * Full Mock Test Builder).
 */

const STORAGE_KEY = 'biomics_question_clipboard';

/**
 * @typedef {{ question: string, options: string[], correctIndex: number, explanation: string }} Question
 * @typedef {{ source: string, sourceTitle: string, copiedAt: string, questions: Question[] }} ClipboardData
 */

/**
 * Save questions to the clipboard.
 * @param {Question[]} questions
 * @param {string} source  e.g. 'Quiz Builder'
 * @param {string} sourceTitle  e.g. 'Cell Biology Quiz'
 */
export function copyQuestionsToClipboard(questions, source, sourceTitle) {
  const data = {
    source,
    sourceTitle: sourceTitle || source,
    copiedAt: new Date().toISOString(),
    questions: questions.map((q) => ({
      question: q.question,
      options: Array.isArray(q.options) ? [...q.options] : ['', '', '', ''],
      correctIndex: Number(q.correctIndex ?? 0),
      explanation: q.explanation || ''
    }))
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage quota exceeded — silently fail
  }
  return data;
}

/**
 * Read the current clipboard.
 * @returns {ClipboardData|null}
 */
export function readClipboard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.questions) || parsed.questions.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Clear the clipboard. */
export function clearClipboard() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Format relative time for display.
 * @param {string} isoString
 */
export function formatClipboardAge(isoString) {
  if (!isoString) return '';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(isoString).toLocaleDateString();
}
