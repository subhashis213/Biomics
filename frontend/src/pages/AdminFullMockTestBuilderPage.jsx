import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { requestJson } from '../api';
import AppShell from '../components/AppShell';
import PdfMcqExtractor from '../components/PdfMcqExtractor';
import QuestionClipboardModal from '../components/QuestionClipboardModal';
import StatCard from '../components/StatCard';
import { copyQuestionsToClipboard, readClipboard } from '../utils/questionClipboard';

const COURSE_CATEGORIES = [
  '11th', '12th', 'NEET', 'IIT-JAM', 'CSIR-NET Life Science', 'GATE'
];
const DEFAULT_COURSE = 'CSIR-NET Life Science';

function emptyQuestion() {
  return { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' };
}

export default function AdminFullMockTestBuilderPage() {
  const navigate = useNavigate();

  // form
  const [category, setCategory] = useState(DEFAULT_COURSE);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [editingId, setEditingId] = useState('');

  // list
  const [mocks, setMocks] = useState([]);
  const [allMocks, setAllMocks] = useState([]);

  // delete dialog
  const [deleteDialog, setDeleteDialog] = useState({ open: false, mock: null });
  const [isDeleting, setIsDeleting] = useState(false);

  // expand/collapse per question card
  const [expandedQuestions, setExpandedQuestions] = useState({});
  const [clipboardModalOpen, setClipboardModalOpen] = useState(false);
  const [clipboardCount, setClipboardCount] = useState(() => readClipboard()?.questions?.length || 0);
  const [copyToast, setCopyToast] = useState(null);

  function refreshClipboardCount() {
    setClipboardCount(readClipboard()?.questions?.length || 0);
  }

  function handleCopyQuestions() {
    if (!questions.some((q) => q.question.trim())) {
      setCopyToast({ type: 'error', text: 'No questions to copy — add at least one question first.' });
      window.setTimeout(() => setCopyToast(null), 3000);
      return;
    }
    copyQuestionsToClipboard(questions, 'Full Mock Builder', title || 'Untitled Full Mock');
    setClipboardCount(questions.length);
    setCopyToast({ type: 'success', text: `${questions.length} question${questions.length !== 1 ? 's' : ''} copied to clipboard!` });
    window.setTimeout(() => setCopyToast(null), 3000);
  }

  function handlePasteQuestions(pasted, pasteMode) {
    const normalized = pasted.map((q) => ({
      question: q.question,
      options: Array.isArray(q.options) ? [...q.options] : ['', '', '', ''],
      correctIndex: Number(q.correctIndex ?? 0),
      explanation: q.explanation || ''
    }));
    if (pasteMode === 'replace') {
      setQuestions(normalized);
    } else {
      setQuestions((prev) => [
        ...prev.filter((q) => q.question.trim()),
        ...normalized
      ]);
    }
    setExpandedQuestions({});
    refreshClipboardCount();
    setCopyToast({ type: 'success', text: `${pasted.length} question${pasted.length !== 1 ? 's' : ''} pasted!` });
    window.setTimeout(() => setCopyToast(null), 3000);
  }

  function toggleExpand(qi) {
    setExpandedQuestions((prev) => ({ ...prev, [qi]: !prev[qi] }));
  }

  function handleAutoResize(e) {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  }

  async function loadMocks() {
    try {
      const [filtered, all] = await Promise.all([
        requestJson(`/test-series/full-mocks/admin?category=${encodeURIComponent(category)}`),
        requestJson('/test-series/full-mocks/admin')
      ]);
      setMocks(Array.isArray(filtered?.mocks) ? filtered.mocks : []);
      setAllMocks(Array.isArray(all?.mocks) ? all.mocks : []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load full mock tests.' });
    }
  }

  useEffect(() => { loadMocks(); }, [category]);

  function updateQuestion(i, field, value) {
    setQuestions((prev) => prev.map((q, idx) => idx === i ? { ...q, [field]: value } : q));
  }

  function updateOption(qi, oi, value) {
    setQuestions((prev) => prev.map((q, idx) => {
      if (idx !== qi) return q;
      const opts = [...q.options];
      opts[oi] = value;
      return { ...q, options: opts };
    }));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function removeQuestion(i) {
    setQuestions((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  }

  function resetBuilder() {
    setEditingId('');
    setTitle('');
    setDescription('');
    setDurationMinutes(90);
    setQuestions([emptyQuestion()]);
  }

  function editMock(mock) {
    setEditingId(mock._id);
    setCategory(mock.category || DEFAULT_COURSE);
    setTitle(mock.title || '');
    setDescription(mock.description || '');
    setDurationMinutes(mock.durationMinutes || 90);
    setQuestions((mock.questions || []).map((q) => ({
      question: q.question,
      options: [...q.options],
      correctIndex: Number(q.correctIndex || 0),
      explanation: q.explanation || ''
    })));
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!category || !title.trim()) {
      setMessage({ type: 'error', text: 'Course and title are required.' });
      return;
    }
    const invalid = questions.some((q) =>
      !q.question.trim() ||
      !Array.isArray(q.options) || q.options.length !== 4 ||
      q.options.some((o) => !o.trim()) ||
      q.correctIndex < 0 || q.correctIndex > 3
    );
    if (invalid) {
      setMessage({ type: 'error', text: 'Every question needs text, 4 options and a correct answer.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await requestJson('/test-series/full-mocks', {
        method: 'POST',
        body: JSON.stringify({
          mockId: editingId || undefined,
          category,
          title: title.trim(),
          description: description.trim(),
          durationMinutes: Number(durationMinutes),
          questions: questions.map((q) => ({
            question: q.question.trim(),
            options: q.options.map((o) => o.trim()),
            correctIndex: Number(q.correctIndex),
            explanation: String(q.explanation || '').trim()
          }))
        })
      });
      setMessage({ type: 'success', text: editingId ? 'Full mock test updated.' : 'Full mock test created.' });
      resetBuilder();
      await loadMocks();
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Failed to save full mock test.' });
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteClick(mock) {
    setDeleteDialog({ open: true, mock });
  }

  function closeDeleteDialog() {
    if (isDeleting) return;
    setDeleteDialog({ open: false, mock: null });
  }

  useEffect(() => {
    if (!deleteDialog.open) return undefined;
    function onKey(e) { if (e.key === 'Escape') closeDeleteDialog(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteDialog.open, isDeleting]);

  async function confirmDelete() {
    if (!deleteDialog.mock?._id || isDeleting) return;
    setIsDeleting(true);
    try {
      await requestJson(`/test-series/full-mocks/${deleteDialog.mock._id}`, { method: 'DELETE' });
      await loadMocks();
      setMessage({ type: 'success', text: 'Full mock test deleted.' });
      if (editingId === deleteDialog.mock._id) resetBuilder();
      setDeleteDialog({ open: false, mock: null });
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Failed to delete.' });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <AppShell
        title="Full Mock Test Builder"
        subtitle="Create on-demand full-length mock tests for the Test Series"
        roleLabel="Admin"
        showThemeSwitch
        actions={(
          <button type="button" className="secondary-btn" onClick={() => navigate('/admin/test-series')}>
            ← Test Series Hub
          </button>
        )}
      >
        <main className="admin-workspace-page">
          <section className="workspace-hero workspace-hero-fullmock">
            <div>
              <p className="eyebrow">Full Mock Test Series</p>
              <h2>Build full-length course mock tests</h2>
              <p className="subtitle">Select a course, compose questions, and publish. Students who purchased the Full Mock Series (or Topic Test Series) can access these on demand.</p>
            </div>
            <div className="workspace-hero-stats">
              <StatCard label={`${category} Mocks`} value={mocks.length} />
              <StatCard label="Total Mocks" value={allMocks.length} />
            </div>
          </section>

          <PdfMcqExtractor
            sectionName="Full Mock Test"
            onApplyQuestions={(extracted) => {
              setQuestions(extracted);
              setMessage({ type: 'success', text: `Loaded ${extracted.length} extracted question${extracted.length !== 1 ? 's' : ''} into the form.` });
            }}
          />

          <section className="card quiz-builder-panel workspace-panel">
            <form className="quiz-builder-form" onSubmit={handleSave}>
              <label>
                Course
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {COURSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label>
                Mock test title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. CSIR-NET Life Science — Full Length Mock 1"
                  required
                />
              </label>

              <label>
                Description (optional)
                <textarea
                  rows="2"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description for students"
                />
              </label>

              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value || 90))}
                />
              </label>

              <div className="quiz-question-list">
                {questions.map((q, qi) => (
                  <article key={`fm-q-${qi}`} className="quiz-editor-card">
                    <div className="quiz-editor-head">
                      <strong>Question {qi + 1}</strong>
                      <div className="qe-head-actions">
                        <button
                          type="button"
                          className="qe-expand-btn"
                          onClick={() => toggleExpand(qi)}
                          title={expandedQuestions[qi] ? 'Collapse fields' : 'Expand fields for long text'}
                        >
                          {expandedQuestions[qi] ? '↑ Show less' : '↕ Expand fields'}
                        </button>
                        {questions.length > 1 ? (
                          <button type="button" className="danger-text-btn" onClick={() => removeQuestion(qi)}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <label>
                      Question text
                      <textarea
                        className={`qe-textarea${expandedQuestions[qi] ? ' qe-textarea-expanded' : ' qe-textarea-collapsed'}`}
                        value={q.question}
                        onChange={(e) => updateQuestion(qi, 'question', e.target.value)}
                        onInput={expandedQuestions[qi] ? handleAutoResize : undefined}
                        placeholder="Enter question text here…"
                        required
                      />
                    </label>
                    <div className="quiz-options-list">
                      {q.options.map((opt, oi) => (
                        <label key={`fm-opt-${qi}-${oi}`}>
                          Option {['A', 'B', 'C', 'D'][oi]}
                          <textarea
                            className={`qe-textarea qe-textarea-option${expandedQuestions[qi] ? ' qe-textarea-expanded' : ' qe-textarea-collapsed'}`}
                            value={opt}
                            onChange={(e) => updateOption(qi, oi, e.target.value)}
                            onInput={expandedQuestions[qi] ? handleAutoResize : undefined}
                            placeholder={`Option ${['A', 'B', 'C', 'D'][oi]}`}
                            required
                          />
                        </label>
                      ))}
                    </div>
                    <label>
                      Correct option
                      <select
                        value={q.correctIndex}
                        onChange={(e) => updateQuestion(qi, 'correctIndex', Number(e.target.value))}
                      >
                        <option value={0}>Option A</option>
                        <option value={1}>Option B</option>
                        <option value={2}>Option C</option>
                        <option value={3}>Option D</option>
                      </select>
                    </label>
                    <label>
                      Explanation (optional)
                      <textarea
                        className={`qe-textarea${expandedQuestions[qi] ? ' qe-textarea-expanded' : ' qe-textarea-collapsed'}`}
                        value={q.explanation || ''}
                        onChange={(e) => updateQuestion(qi, 'explanation', e.target.value)}
                        onInput={expandedQuestions[qi] ? handleAutoResize : undefined}
                        placeholder="Shown after submission"
                      />
                    </label>
                  </article>
                ))}
              </div>

              <div className="workspace-inline-actions">
                <button type="button" className="secondary-btn" onClick={addQuestion}>+ Add Question</button>
                <button type="button" className="qcb-copy-btn" onClick={handleCopyQuestions} title="Copy all current questions to clipboard">
                  📋 Copy Questions
                </button>
                <button
                  type="button"
                  className="qcb-paste-btn"
                  onClick={() => { refreshClipboardCount(); setClipboardModalOpen(true); }}
                  title="Paste questions from clipboard"
                >
                  📥 Paste
                  {clipboardCount > 0 ? <span className="qcb-badge">{clipboardCount}</span> : null}
                </button>
                {editingId ? (
                  <button type="button" className="secondary-btn" onClick={resetBuilder}>Cancel Edit</button>
                ) : null}
              </div>
              {copyToast ? <p className={`inline-message ${copyToast.type} qcb-toast`}>{copyToast.text}</p> : null}

              {message ? <p className={`inline-message ${message.type}`}>{message.text}</p> : null}

              <button type="submit" className="primary-btn" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Update Mock Test' : 'Create Mock Test'}
              </button>
            </form>
          </section>

          {/* list */}
          <section className="card quiz-admin-list workspace-panel">
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Published Full Mocks</p>
                <h3>{category} — full mock tests</h3>
              </div>
            </div>
            {mocks.length ? (
              <div className="quiz-admin-items">
                {mocks.map((mock) => (
                  <article key={mock._id} className="quiz-admin-item">
                    <div className="quiz-admin-item-body">
                      <strong>{mock.title}</strong>
                      {mock.description ? <p>{mock.description}</p> : null}
                      <div className="quiz-admin-meta">
                        <span className="quiz-admin-meta-chip">{mock.questionCount || mock.questions?.length || 0} questions</span>
                        <span className="quiz-admin-meta-chip">{mock.durationMinutes || 90} min</span>
                        <span className="quiz-admin-meta-chip">{mock.category}</span>
                      </div>
                    </div>
                    <div className="quiz-admin-item-actions">
                      <button type="button" className="secondary-btn" onClick={() => editMock(mock)}>Edit</button>
                      <button type="button" className="danger-btn" onClick={() => handleDeleteClick(mock)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-note">No full mock tests created for {category} yet.</p>
            )}
          </section>
        </main>
      </AppShell>

      {deleteDialog.open ? createPortal(
        <div
          className="confirm-modal-backdrop"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) closeDeleteDialog(); }}
        >
          <section className="confirm-modal card quiz-delete-confirm-modal" role="dialog" aria-modal="true" aria-label="Delete full mock confirmation">
            <p className="eyebrow">Delete Full Mock Test</p>
            <h2>Delete this mock test?</h2>
            <p className="subtitle">
              <strong>{deleteDialog.mock?.title}</strong> will be permanently removed from {deleteDialog.mock?.category}.
            </p>
            <div className="confirm-modal-actions">
              <button type="button" className="secondary-btn" onClick={(e) => { e.stopPropagation(); closeDeleteDialog(); }} disabled={isDeleting}>
                Cancel
              </button>
              <button type="button" className="danger-btn" onClick={(e) => { e.stopPropagation(); confirmDelete(); }} disabled={isDeleting}>
                {isDeleting ? 'Deleting…' : 'Delete Mock Test'}
              </button>
            </div>
          </section>
        </div>,
        document.body
      ) : null}
      <QuestionClipboardModal
        open={clipboardModalOpen}
        onClose={() => setClipboardModalOpen(false)}
        onPaste={handlePasteQuestions}
      />
    </>
  );
}
