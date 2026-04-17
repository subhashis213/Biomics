import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { requestJson } from '../api';
import AppShell from '../components/AppShell';
import PdfMcqExtractor from '../components/PdfMcqExtractor';
import QuestionClipboardModal from '../components/QuestionClipboardModal';
import StatCard from '../components/StatCard';
import TopicTestCatalogBoard from '../components/TopicTestCatalogBoard';
import { copyQuestionsToClipboard, readClipboard } from '../utils/questionClipboard';

const COURSE_CATEGORIES = [
  '11th', '12th', 'NEET', 'IIT-JAM', 'CSIR-NET Life Science', 'GATE'
];
const DEFAULT_COURSE = 'CSIR-NET Life Science';

function normalizeText(value) {
  return String(value || '').trim();
}

function emptyQuestion() {
  return { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' };
}

export default function AdminTopicTestBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();

  function updateBuilderQuery(nextEditId) {
    const params = new URLSearchParams(location.search);
    if (category) params.set('category', category);
    else params.delete('category');
    if (nextEditId) params.set('edit', nextEditId);
    else params.delete('edit');
    const nextSearch = params.toString();
    navigate(`/admin/test-series/topic-tests${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  }

  // builder form
  const [category, setCategory] = useState(DEFAULT_COURSE);
  const [module, setModule] = useState('');
  const [topic, setTopic] = useState('General');
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [editingId, setEditingId] = useState('');

  // dropdowns from module catalog
  const [moduleCatalog, setModuleCatalog] = useState([]);
  const [topicsByKey, setTopicsByKey] = useState({});

  // list
  const [tests, setTests] = useState([]);
  const [allTests, setAllTests] = useState([]);

  // delete dialog
  const [deleteDialog, setDeleteDialog] = useState({ open: false, test: null });
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
    copyQuestionsToClipboard(questions, 'Topic Test Builder', title || 'Untitled Topic Test');
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

  // ── data loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    let ignore = false;
    requestJson('/modules').then((res) => {
      if (!ignore) setModuleCatalog(Array.isArray(res?.modules) ? res.modules : []);
    }).catch(() => {});
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    const modName = normalizeText(module);
    if (!modName || !category) return undefined;
    const key = `${category}::${modName}`;
    if (topicsByKey[key]) return undefined;
    let cancelled = false;
    requestJson(`/modules/topics?category=${encodeURIComponent(category)}&module=${encodeURIComponent(modName)}`)
      .then((res) => {
        if (cancelled) return;
        const topics = Array.isArray(res?.topics)
          ? res.topics.map((t) => normalizeText(t?.name || '')).filter(Boolean)
          : [];
        setTopicsByKey((prev) => ({ ...prev, [key]: topics }));
      })
      .catch(() => {
        if (!cancelled) setTopicsByKey((prev) => ({ ...prev, [`${category}::${modName}`]: [] }));
      });
    return () => { cancelled = true; };
  }, [category, module, topicsByKey]);

  async function loadTests() {
    try {
      const [filtered, all] = await Promise.all([
        requestJson(`/test-series/topic-tests/admin?category=${encodeURIComponent(category)}`),
        requestJson('/test-series/topic-tests/admin')
      ]);
      setTests(Array.isArray(filtered?.tests) ? filtered.tests : []);
      setAllTests(Array.isArray(all?.tests) ? all.tests : []);
    } catch {
      setMessage({ type: 'error', text: 'Failed to load topic tests.' });
    }
  }

  useEffect(() => { loadTests(); }, [category]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const categoryFromQuery = params.get('category');
    if (categoryFromQuery && COURSE_CATEGORIES.includes(categoryFromQuery) && categoryFromQuery !== category) {
      setCategory(categoryFromQuery);
    }
  }, [location.search, category]);

  useEffect(() => {
    const editId = new URLSearchParams(location.search).get('edit');
    if (!editId) return;
    if (editingId === editId) return;

    const matchedTest = allTests.find((test) => test._id === editId);
    if (matchedTest) {
      editTest(matchedTest);
    }
  }, [location.search, allTests, editingId]);

  // ── derived options ──────────────────────────────────────────────────────

  const availableModules = useMemo(() => {
    const catalogSet = new Set(
      moduleCatalog
        .filter((e) => normalizeText(e?.category) === category)
        .map((e) => normalizeText(e?.name))
        .filter(Boolean)
    );
    allTests
      .filter((t) => normalizeText(t.category) === category)
      .forEach((t) => catalogSet.add(normalizeText(t.module)));
    return Array.from(catalogSet).sort((a, b) => a.localeCompare(b));
  }, [moduleCatalog, allTests, category]);

  const availableTopics = useMemo(() => {
    if (!module) return ['General'];
    const key = `${category}::${normalizeText(module)}`;
    const catalogTopics = topicsByKey[key] || [];
    const testTopics = allTests
      .filter((t) => normalizeText(t.category) === category && normalizeText(t.module) === normalizeText(module))
      .map((t) => normalizeText(t.topic))
      .filter(Boolean);
    return Array.from(new Set(['General', ...catalogTopics, ...testTopics])).sort();
  }, [category, module, topicsByKey, allTests]);

  useEffect(() => {
    if (!module) { setTopic('General'); return; }
    if (!availableTopics.includes(topic)) setTopic(availableTopics[0] || 'General');
  }, [module, availableTopics, topic]);

  // ── question helpers ─────────────────────────────────────────────────────

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
    setModule('');
    setTopic('General');
    setTitle('');
    setDifficulty('medium');
    setDurationMinutes(30);
    setQuestions([emptyQuestion()]);
    updateBuilderQuery('');
  }

  function editTest(test) {
    setEditingId(test._id);
    setCategory(test.category || DEFAULT_COURSE);
    setModule(test.module || '');
    setTopic(test.topic || 'General');
    setTitle(test.title || '');
    setDifficulty(test.difficulty || 'medium');
    setDurationMinutes(test.durationMinutes || 30);
    setQuestions((test.questions || []).map((q) => ({
      question: q.question,
      options: [...q.options],
      correctIndex: Number(q.correctIndex || 0),
      explanation: q.explanation || ''
    })));
    setMessage(null);
    if (new URLSearchParams(location.search).get('edit') !== test._id) {
      const params = new URLSearchParams(location.search);
      params.set('category', test.category || DEFAULT_COURSE);
      params.set('edit', test._id);
      navigate(`/admin/test-series/topic-tests?${params.toString()}`, { replace: true });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!category || !normalizeText(module) || !normalizeText(title)) {
      setMessage({ type: 'error', text: 'Course, module and title are required.' });
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
      await requestJson('/test-series/topic-tests', {
        method: 'POST',
        body: JSON.stringify({
          testId: editingId || undefined,
          category,
          module: normalizeText(module),
          topic: (normalizeText(topic) || 'General'),
          title: normalizeText(title),
          difficulty,
          durationMinutes: Number(durationMinutes),
          questions: questions.map((q) => ({
            question: q.question.trim(),
            options: q.options.map((o) => o.trim()),
            correctIndex: Number(q.correctIndex),
            explanation: String(q.explanation || '').trim()
          }))
        })
      });
      setMessage({ type: 'success', text: editingId ? 'Topic test updated.' : 'Topic test created.' });
      resetBuilder();
      await loadTests();
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Failed to save topic test.' });
    } finally {
      setSaving(false);
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────

  function handleDeleteClick(test) {
    setDeleteDialog({ open: true, test });
  }

  function closeDeleteDialog() {
    if (isDeleting) return;
    setDeleteDialog({ open: false, test: null });
  }

  useEffect(() => {
    if (!deleteDialog.open) return undefined;
    function onKey(e) { if (e.key === 'Escape') closeDeleteDialog(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteDialog.open, isDeleting]);

  async function confirmDelete() {
    if (!deleteDialog.test?._id || isDeleting) return;
    setIsDeleting(true);
    try {
      await requestJson(`/test-series/topic-tests/${deleteDialog.test._id}`, { method: 'DELETE' });
      await loadTests();
      setMessage({ type: 'success', text: 'Topic test deleted.' });
      if (editingId === deleteDialog.test._id) resetBuilder();
      setDeleteDialog({ open: false, test: null });
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Failed to delete.' });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <AppShell
        title="Topic Test Builder"
        subtitle="Create and manage module/topic-wise tests for the Test Series"
        roleLabel="Admin"
        actions={(
          <>
            <button type="button" className="secondary-btn" onClick={() => navigate('/admin/test-series')}>
              Back to Test Series Hub
            </button>
          </>
        )}
      >
        <main className="admin-workspace-page">
          <section className="workspace-hero workspace-hero-testseries">
            <div>
              <p className="eyebrow">Topic Test Series</p>
              <h2>Build module / topic-wise assessments</h2>
              <p className="subtitle">Each test is linked to a course, module and topic. Students who purchase the Topic Test Series can take these tests.</p>
            </div>
            <div className="workspace-hero-stats">
              <StatCard label={`${category} Tests`} value={tests.length} />
              <StatCard label="Total Tests" value={allTests.length} />
            </div>
          </section>

          <PdfMcqExtractor
            sectionName="Topic Test"
            onApplyQuestions={(extracted) => {
              setQuestions(extracted);
              setMessage({ type: 'success', text: `Loaded ${extracted.length} extracted question${extracted.length !== 1 ? 's' : ''} into the form.` });
            }}
          />

          {/* ── builder form ── */}
          <section className="card quiz-builder-panel workspace-panel">
            <form className="quiz-builder-form" onSubmit={handleSave}>
              <div className="workspace-row-two">
                <label>
                  Course
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {COURSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>
                  Module
                  <select value={module} onChange={(e) => setModule(e.target.value)} required>
                    <option value="" disabled>{availableModules.length ? 'Select module' : 'No modules yet'}</option>
                    {availableModules.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>

              <label>
                Topic
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={!module || !availableTopics.length}
                >
                  {availableTopics.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>

              <label>
                Test title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cell Biology — Medium Level Assessment"
                  required
                />
              </label>

              <div className="quiz-meta-grid">
                <label>
                  Difficulty
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
                <label>
                  Duration (minutes)
                  <input
                    type="number"
                    min="5"
                    max="300"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value || 5))}
                  />
                </label>
              </div>

              <div className="quiz-question-list">
                {questions.map((q, qi) => (
                  <article key={`ts-q-${qi}`} className="quiz-editor-card">
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
                        <label key={`ts-opt-${qi}-${oi}`}>
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
                        placeholder="Optional explanation shown after submission"
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
                {saving ? 'Saving…' : editingId ? 'Update Topic Test' : 'Create Topic Test'}
              </button>
            </form>
          </section>

          {/* ── list ── */}
          <section className="card quiz-admin-list workspace-panel">
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Published Tests</p>
                <h3>{category} — topic tests</h3>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => navigate(`/admin/test-series/topic-tests/catalog?category=${encodeURIComponent(category)}`)}
              >
                Open Full Organizer
              </button>
            </div>
            <TopicTestCatalogBoard
              tests={tests}
              mode="admin"
              title={`${category} topic tests`}
              subtitle="Published tests are grouped into separate module and topic containers for faster scanning."
              emptyMessage={`No topic tests created for ${category} yet.`}
              renderCardActions={(test) => (
                <>
                  <button type="button" className="secondary-btn" onClick={() => editTest(test)}>Edit</button>
                  <button type="button" className="danger-btn" onClick={() => handleDeleteClick(test)}>Delete</button>
                </>
              )}
            />
          </section>
        </main>
      </AppShell>

      {deleteDialog.open ? createPortal(
        <div
          className="confirm-modal-backdrop"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) closeDeleteDialog(); }}
        >
          <section className="confirm-modal card quiz-delete-confirm-modal" role="dialog" aria-modal="true" aria-label="Delete topic test confirmation">
            <p className="eyebrow">Delete Topic Test</p>
            <h2>Delete this test?</h2>
            <p className="subtitle">
              <strong>{deleteDialog.test?.title}</strong> will be permanently removed from {deleteDialog.test?.category}.
            </p>
            <div className="quiz-delete-confirm-meta">
              <span>{deleteDialog.test?.module}</span>
              <span>{deleteDialog.test?.topic}</span>
            </div>
            <div className="confirm-modal-actions">
              <button type="button" className="secondary-btn" onClick={(e) => { e.stopPropagation(); closeDeleteDialog(); }} disabled={isDeleting}>
                Cancel
              </button>
              <button type="button" className="danger-btn" onClick={(e) => { e.stopPropagation(); confirmDelete(); }} disabled={isDeleting}>
                {isDeleting ? 'Deleting…' : 'Delete Test'}
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
