import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchMockExamPerformanceAdmin,
  fetchMockExamsAdmin,
  deleteMockExamAdmin,
  releaseMockExamResultAdmin,
  saveMockExamAdmin,
  toggleMockExamNoticeAdmin
} from '../api';
import { fetchCoursesAdmin } from '../api';
import AppShell from '../components/AppShell';
import PdfMcqExtractor from '../components/PdfMcqExtractor';
import QuestionClipboardModal from '../components/QuestionClipboardModal';
import StatCard from '../components/StatCard';
import { copyQuestionsToClipboard, readClipboard } from '../utils/questionClipboard';

// courses are loaded dynamically from server

function formatMonthLabel(monthValue) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthValue || ''))) return monthValue || 'Unknown Month';
  const [year, month] = String(monthValue).split('-');
  const parsed = new Date(Number(year), Number(month) - 1, 1);
  return parsed.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

export default function AdminMockExamPage() {
  const navigate = useNavigate();
  const [mockExamCategory, setMockExamCategory] = useState('');
  const [courses, setCourses] = useState([]);
  const [mockExamTitle, setMockExamTitle] = useState('');
  const [mockExamDescription, setMockExamDescription] = useState('');
  const [mockExamDate, setMockExamDate] = useState('');
  const [mockExamWindowEndAt, setMockExamWindowEndAt] = useState('');
  const [mockExamDurationMinutes, setMockExamDurationMinutes] = useState(60);
  const [mockExamNoticeEnabled, setMockExamNoticeEnabled] = useState(true);
  const [mockExamQuestions, setMockExamQuestions] = useState([
    { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }
  ]);
  const [mockExamSaving, setMockExamSaving] = useState(false);
  const [editingMockExamId, setEditingMockExamId] = useState('');
  const [mockExamMessage, setMockExamMessage] = useState(null);
  const [expandedQuestions, setExpandedQuestions] = useState({});
  const [clipboardModalOpen, setClipboardModalOpen] = useState(false);
  const [clipboardCount, setClipboardCount] = useState(() => readClipboard()?.questions?.length || 0);
  const [copyToast, setCopyToast] = useState(null);

  function refreshClipboardCount() {
    setClipboardCount(readClipboard()?.questions?.length || 0);
  }

  function handleCopyQuestions() {
    if (!mockExamQuestions.some((q) => q.question.trim())) {
      setCopyToast({ type: 'error', text: 'No questions to copy — add at least one question first.' });
      window.setTimeout(() => setCopyToast(null), 3000);
      return;
    }
    copyQuestionsToClipboard(mockExamQuestions, 'Monthly Mock Exam', mockExamTitle || 'Untitled Exam');
    setClipboardCount(mockExamQuestions.length);
    setCopyToast({ type: 'success', text: `${mockExamQuestions.length} question${mockExamQuestions.length !== 1 ? 's' : ''} copied to clipboard!` });
    window.setTimeout(() => setCopyToast(null), 3000);
  }

  function handlePasteQuestions(questions, pasteMode) {
    const normalized = questions.map((q) => ({
      question: q.question,
      options: Array.isArray(q.options) ? [...q.options] : ['', '', '', ''],
      correctIndex: Number(q.correctIndex ?? 0),
      explanation: q.explanation || ''
    }));
    if (pasteMode === 'replace') {
      setMockExamQuestions(normalized);
    } else {
      setMockExamQuestions((prev) => [
        ...prev.filter((q) => q.question.trim()),
        ...normalized
      ]);
    }
    setExpandedQuestions({});
    refreshClipboardCount();
    setCopyToast({ type: 'success', text: `${questions.length} question${questions.length !== 1 ? 's' : ''} pasted!` });
    window.setTimeout(() => setCopyToast(null), 3000);
  }

  function toggleExpand(qi) {
    setExpandedQuestions((prev) => ({ ...prev, [qi]: !prev[qi] }));
  }

  function handleAutoResize(e) {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  }
  const [mockExamList, setMockExamList] = useState([]);
  const [mockExamPerformance, setMockExamPerformance] = useState([]);
  const [mockExamPerformanceMonths, setMockExamPerformanceMonths] = useState([]);
  const [mockExamPerformanceMonthFilter, setMockExamPerformanceMonthFilter] = useState('all');
  const [mockExamPerformanceLoading, setMockExamPerformanceLoading] = useState(false);
  const [mockExamPerformanceError, setMockExamPerformanceError] = useState('');

  useEffect(() => {
    let ignore = false;
    (async function loadCourses() {
      try {
        const res = await fetchCoursesAdmin();
        if (ignore) return;
        const list = Array.isArray(res?.courses) ? res.courses : [];
        setCourses(list);
        if (!mockExamCategory && list.length) setMockExamCategory(list[0].name || list[0]);
      } catch {
        if (!ignore) setCourses([]);
      }
    })();
    return () => { ignore = true; };
  }, []);

  function resetBuilder() {
    setEditingMockExamId('');
    setMockExamTitle('');
    setMockExamDescription('');
    setMockExamDate('');
    setMockExamWindowEndAt('');
    setMockExamDurationMinutes(60);
    setMockExamNoticeEnabled(true);
    setMockExamQuestions([{ question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }]);
  }

  function updateQuestion(index, field, value) {
    setMockExamQuestions((current) => current.map((item, idx) => (
      idx === index ? { ...item, [field]: value } : item
    )));
  }

  function updateOption(questionIndex, optionIndex, value) {
    setMockExamQuestions((current) => current.map((item, idx) => {
      if (idx !== questionIndex) return item;
      const nextOptions = [...item.options];
      nextOptions[optionIndex] = value;
      return { ...item, options: nextOptions };
    }));
  }

  function addQuestion() {
    setMockExamQuestions((current) => [
      ...current,
      { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }
    ]);
  }

  function removeQuestion(index) {
    setMockExamQuestions((current) => {
      if (current.length === 1) return current;
      return current.filter((_, idx) => idx !== index);
    });
  }

  function editExam(exam) {
    setEditingMockExamId(exam._id);
    setMockExamCategory(exam.category || DEFAULT_COURSE);
    setMockExamTitle(exam.title || '');
    setMockExamDescription(exam.description || '');
    setMockExamDate(exam.examDate ? new Date(exam.examDate).toISOString().slice(0, 16) : '');
    setMockExamWindowEndAt(exam.examWindowEndAt ? new Date(exam.examWindowEndAt).toISOString().slice(0, 16) : '');
    setMockExamDurationMinutes(exam.durationMinutes || 60);
    setMockExamNoticeEnabled(exam.noticeEnabled !== false);
    setMockExamQuestions((exam.questions || []).map((item) => ({
      question: item.question,
      options: [...item.options],
      correctIndex: Number(item.correctIndex || 0),
      explanation: item.explanation || ''
    })));
    setMockExamMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadMockExamList(category = mockExamCategory) {
    try {
      const data = await fetchMockExamsAdmin(category);
      setMockExamList(Array.isArray(data?.exams) ? data.exams : []);
    } catch (error) {
      setMockExamMessage({ type: 'error', text: error.message || 'Failed to load monthly mock exams.' });
    }
  }

  async function loadMockExamPerformance(category = mockExamCategory, monthFilter = mockExamPerformanceMonthFilter) {
    setMockExamPerformanceLoading(true);
    setMockExamPerformanceError('');
    try {
      const activeMonth = monthFilter === 'all' ? '' : monthFilter;
      const data = await fetchMockExamPerformanceAdmin(category, activeMonth);
      setMockExamPerformance(Array.isArray(data?.performance) ? data.performance : []);
      setMockExamPerformanceMonths(Array.isArray(data?.months) ? data.months : []);
    } catch (error) {
      setMockExamPerformanceError(error.message || 'Failed to load exam performance.');
    } finally {
      setMockExamPerformanceLoading(false);
    }
  }

  useEffect(() => {
    loadMockExamList(mockExamCategory);
  }, [mockExamCategory]);

  useEffect(() => {
    loadMockExamPerformance(mockExamCategory, mockExamPerformanceMonthFilter);
  }, [mockExamCategory, mockExamPerformanceMonthFilter]);

  useEffect(() => {
    if (mockExamPerformanceMonthFilter === 'all') return;
    if (mockExamPerformanceMonths.includes(mockExamPerformanceMonthFilter)) return;
    setMockExamPerformanceMonthFilter('all');
  }, [mockExamPerformanceMonths, mockExamPerformanceMonthFilter]);

  async function handleSaveMockExam(event) {
    event.preventDefault();
    if (!mockExamCategory || !mockExamTitle.trim() || !mockExamDate) {
      setMockExamMessage({ type: 'error', text: 'Course, title and exam date are required.' });
      return;
    }

    const hasInvalidQuestion = mockExamQuestions.some((item) => {
      if (!item.question.trim()) return true;
      if (!Array.isArray(item.options) || item.options.length !== 4) return true;
      if (item.options.some((opt) => !opt.trim())) return true;
      return item.correctIndex < 0 || item.correctIndex > 3;
    });

    if (hasInvalidQuestion) {
      setMockExamMessage({ type: 'error', text: 'Each question must have text, 4 options and one correct answer.' });
      return;
    }

    setMockExamSaving(true);
    setMockExamMessage(null);
    try {
      await saveMockExamAdmin({
        examId: editingMockExamId || undefined,
        category: mockExamCategory,
        title: mockExamTitle.trim(),
        description: mockExamDescription.trim(),
        examDate: new Date(mockExamDate).toISOString(),
        examWindowEndAt: mockExamWindowEndAt ? new Date(mockExamWindowEndAt).toISOString() : null,
        durationMinutes: Number(mockExamDurationMinutes || 60),
        noticeEnabled: mockExamNoticeEnabled,
        questions: mockExamQuestions.map((item) => ({
          question: item.question.trim(),
          options: item.options.map((opt) => opt.trim()),
          correctIndex: Number(item.correctIndex),
          explanation: String(item.explanation || '').trim()
        }))
      });

      setMockExamMessage({ type: 'success', text: editingMockExamId ? 'Mock exam updated.' : 'Mock exam created.' });
      resetBuilder();
      await loadMockExamList(mockExamCategory);
    } catch (error) {
      setMockExamMessage({ type: 'error', text: error.message || 'Failed to save mock exam.' });
    } finally {
      setMockExamSaving(false);
    }
  }

  async function handleToggleMockResultRelease(exam) {
    try {
      await releaseMockExamResultAdmin(exam._id, !exam.resultReleased);
      await loadMockExamList(mockExamCategory);
      setMockExamMessage({ type: 'success', text: !exam.resultReleased ? 'Result released.' : 'Result hidden.' });
    } catch (error) {
      setMockExamMessage({ type: 'error', text: error.message || 'Failed to update result release.' });
    }
  }

  async function handleToggleMockNotice(exam) {
    try {
      await toggleMockExamNoticeAdmin(exam._id, !(exam.noticeEnabled !== false));
      await loadMockExamList(mockExamCategory);
      setMockExamMessage({ type: 'success', text: exam.noticeEnabled !== false ? 'Student notice banner disabled.' : 'Student notice banner enabled.' });
    } catch (error) {
      setMockExamMessage({ type: 'error', text: error.message || 'Failed to update exam notice setting.' });
    }
  }

  async function handleDeleteMockExam(exam) {
    const examTitle = String(exam?.title || 'this exam');
    const confirmed = window.confirm(`Delete "${examTitle}"?\n\nThis will also remove all student attempts for this exam.`);
    if (!confirmed) return;
    try {
      await deleteMockExamAdmin(exam._id);
      await loadMockExamList(mockExamCategory);
      setMockExamMessage({ type: 'success', text: 'Mock exam deleted successfully.' });
    } catch (error) {
      setMockExamMessage({ type: 'error', text: error.message || 'Failed to delete mock exam.' });
    }
  }

  return (
    <>
    <AppShell
      title="Monthly Mock Test Workspace"
      subtitle="Create and manage monthly exams in a dedicated page"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
      )}
    >
      <main className="admin-workspace-page">
        <section className="workspace-hero workspace-hero-mock">
          <div>
            <p className="eyebrow">Monthly Mock Test</p>
              <h2>Choose course, configure exam details and add questions</h2>
              <p className="subtitle">Stylish dedicated interface for course-wise monthly exam management.</p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label={`${mockExamCategory} Exams`} value={mockExamList.length} />
            <StatCard label="Performance Rows" value={mockExamPerformance.length} />
          </div>
        </section>

        <PdfMcqExtractor
          sectionName="Monthly Mock Test"
          onApplyQuestions={(extracted) => {
            setMockExamQuestions(extracted);
            setMockExamMessage({ type: 'success', text: `Loaded ${extracted.length} extracted question${extracted.length !== 1 ? 's' : ''} into the form.` });
          }}
        />

        <section className="card quiz-builder-panel workspace-panel">
          <form className="quiz-builder-form" onSubmit={handleSaveMockExam}>
            <label>
              Course
              <select value={mockExamCategory} onChange={(event) => setMockExamCategory(event.target.value)}>
                {courses.length === 0 ? <option value="">Loading courses...</option> : null}
                {courses.map((c) => (
                  <option key={c.name || c} value={c.name || c}>{c.displayName || c.name || c}</option>
                ))}
              </select>
            </label>

            <label>
              Exam title
              <input
                value={mockExamTitle}
                onChange={(event) => setMockExamTitle(event.target.value)}
                placeholder="Example: April Grand Mock Test"
                required
              />
            </label>

            <label>
              Description
              <textarea
                rows="2"
                value={mockExamDescription}
                onChange={(event) => setMockExamDescription(event.target.value)}
                placeholder="Optional exam instructions"
              />
            </label>

            <div className="quiz-meta-grid">
              <label>
                Exam date & time
                <input type="datetime-local" value={mockExamDate} onChange={(event) => setMockExamDate(event.target.value)} required />
              </label>

              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={mockExamDurationMinutes}
                  onChange={(event) => setMockExamDurationMinutes(Number(event.target.value || 5))}
                  required
                />
              </label>

              <label>
                Exam window end (optional)
                <input type="datetime-local" value={mockExamWindowEndAt} onChange={(event) => setMockExamWindowEndAt(event.target.value)} />
              </label>

              <label>
                Student notice banner
                <select
                  value={mockExamNoticeEnabled ? 'enabled' : 'disabled'}
                  onChange={(event) => setMockExamNoticeEnabled(event.target.value === 'enabled')}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>

            <div className="quiz-question-list">
              {mockExamQuestions.map((question, questionIndex) => (
                <article key={`mock-question-${questionIndex}`} className="quiz-editor-card">
                  <div className="quiz-editor-head">
                    <strong>Question {questionIndex + 1}</strong>
                    <div className="qe-head-actions">
                      <button
                        type="button"
                        className="qe-expand-btn"
                        onClick={() => toggleExpand(questionIndex)}
                        title={expandedQuestions[questionIndex] ? 'Collapse fields' : 'Expand fields for long text'}
                      >
                        {expandedQuestions[questionIndex] ? '↑ Show less' : '↕ Expand fields'}
                      </button>
                      {mockExamQuestions.length > 1 ? (
                        <button type="button" className="danger-text-btn" onClick={() => removeQuestion(questionIndex)}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <label>
                    Question text
                    <textarea
                      className={`qe-textarea${expandedQuestions[questionIndex] ? ' qe-textarea-expanded' : ' qe-textarea-collapsed'}`}
                      value={question.question}
                      onChange={(event) => updateQuestion(questionIndex, 'question', event.target.value)}
                      onInput={expandedQuestions[questionIndex] ? handleAutoResize : undefined}
                      placeholder="Enter question text here…"
                      required
                    />
                  </label>

                  <div className="quiz-options-list">
                    {question.options.map((option, optionIndex) => (
                      <label key={`mock-option-${questionIndex}-${optionIndex}`}>
                        Option {['A', 'B', 'C', 'D'][optionIndex]}
                        <textarea
                          className={`qe-textarea qe-textarea-option${expandedQuestions[questionIndex] ? ' qe-textarea-expanded' : ' qe-textarea-collapsed'}`}
                          value={option}
                          onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                          onInput={expandedQuestions[questionIndex] ? handleAutoResize : undefined}
                          placeholder={`Option ${['A', 'B', 'C', 'D'][optionIndex]}`}
                          required
                        />
                      </label>
                    ))}
                  </div>

                  <label>
                    Correct option
                    <select
                      value={question.correctIndex}
                      onChange={(event) => updateQuestion(questionIndex, 'correctIndex', Number(event.target.value))}
                    >
                      <option value={0}>Option A</option>
                      <option value={1}>Option B</option>
                      <option value={2}>Option C</option>
                      <option value={3}>Option D</option>
                    </select>
                  </label>

                  <label>
                    Explanation (shown after result release)
                    <textarea
                      className={`qe-textarea${expandedQuestions[questionIndex] ? ' qe-textarea-expanded' : ' qe-textarea-collapsed'}`}
                      value={question.explanation || ''}
                      onChange={(event) => updateQuestion(questionIndex, 'explanation', event.target.value)}
                      onInput={expandedQuestions[questionIndex] ? handleAutoResize : undefined}
                      placeholder="Optional explanation shown after result release"
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
              {editingMockExamId ? (
                <button type="button" className="secondary-btn" onClick={resetBuilder}>Cancel Edit</button>
              ) : null}
            </div>
            {copyToast ? <p className={`inline-message ${copyToast.type} qcb-toast`}>{copyToast.text}</p> : null}

            {mockExamMessage ? <p className={`inline-message ${mockExamMessage.type}`}>{mockExamMessage.text}</p> : null}

            <button className="primary-btn" type="submit" disabled={mockExamSaving}>
              {mockExamSaving ? 'Saving exam...' : editingMockExamId ? 'Update Exam' : 'Create Exam'}
            </button>
          </form>
        </section>

        <section className="card quiz-admin-list workspace-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Scheduled Mock Exams</p>
              <h3>{mockExamCategory} monthly exams</h3>
            </div>
          </div>

          {mockExamList.length ? (
            <div className="quiz-admin-items">
              {mockExamList.map((exam) => (
                <article key={exam._id} className="quiz-admin-item">
                  <div className="quiz-admin-item-body">
                    <strong>{exam.title}</strong>
                    <p>{new Date(exam.examDate).toLocaleString()}</p>
                    <div className="quiz-admin-meta">
                      <span className="quiz-admin-meta-chip">{exam.questions?.length || 0} questions</span>
                      <span className="quiz-admin-meta-chip">{exam.durationMinutes || 60} min</span>
                      <span className="quiz-admin-meta-chip">Notice {exam.noticeEnabled !== false ? 'On' : 'Off'}</span>
                      <span className="quiz-admin-meta-chip">{exam.resultReleased ? 'Result Released' : 'Result Pending'}</span>
                    </div>
                  </div>
                  <div className="quiz-admin-item-actions">
                    <button type="button" className="secondary-btn" onClick={() => editExam(exam)}>Edit</button>
                    <button
                      type="button"
                      className={exam.noticeEnabled !== false ? 'secondary-btn' : 'primary-btn'}
                      onClick={() => handleToggleMockNotice(exam)}
                    >
                      {exam.noticeEnabled !== false ? 'Disable Notice' : 'Enable Notice'}
                    </button>
                    <button
                      type="button"
                      className={exam.resultReleased ? 'danger-btn' : 'primary-btn'}
                      onClick={() => handleToggleMockResultRelease(exam)}
                    >
                      {exam.resultReleased ? 'Hide Result' : 'Release Result'}
                    </button>
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => handleDeleteMockExam(exam)}
                    >
                      Delete Exam
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-note">No monthly mock exams scheduled for this class yet.</p>
          )}
        </section>

        <section className="card quiz-admin-list workspace-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Student Performance</p>
              <h3>{mockExamCategory} exam attempts</h3>
            </div>
            <label className="quiz-leaderboard-filter">
              Month
              <select value={mockExamPerformanceMonthFilter} onChange={(event) => setMockExamPerformanceMonthFilter(event.target.value)}>
                <option value="all">All Months</option>
                {mockExamPerformanceMonths.map((monthValue) => (
                  <option key={monthValue} value={monthValue}>{formatMonthLabel(monthValue)}</option>
                ))}
              </select>
            </label>
          </div>

          {mockExamPerformanceLoading ? <p className="empty-note">Loading performance...</p> : null}
          {!mockExamPerformanceLoading && mockExamPerformanceError ? <p className="inline-message error">{mockExamPerformanceError}</p> : null}

          {!mockExamPerformanceLoading && !mockExamPerformanceError ? (
            mockExamPerformance.length ? (
              <div className="leaderboard-table-wrap">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Student</th>
                      <th>Exam</th>
                      <th>Month</th>
                      <th>Score</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockExamPerformance.map((entry, index) => (
                      <tr key={`${entry.username || 'student'}-${entry.examTitle || 'exam'}-${entry.submittedAt || index}`} className={entry.rank === 1 ? 'leaderboard-row-top' : ''}>
                        <td>#{entry.rank || index + 1}</td>
                        <td>{entry.username || 'Unknown'}</td>
                        <td>{entry.examTitle || 'Monthly Mock Exam'}</td>
                        <td>{formatMonthLabel(entry.month)}</td>
                        <td>{entry.score || 0}/{entry.total || 0} ({Math.round(Number(entry.percentage) || 0)}%)</td>
                        <td>{entry.submittedAt ? new Date(entry.submittedAt).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-note">No student attempts found for this filter.</p>
            )
          ) : null}
        </section>
      </main>
    </AppShell>
    <QuestionClipboardModal
      open={clipboardModalOpen}
      onClose={() => setClipboardModalOpen(false)}
      onPaste={handlePasteQuestions}
    />
    </>
  );
}
