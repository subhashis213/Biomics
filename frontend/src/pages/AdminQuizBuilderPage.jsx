import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteQuiz, fetchAdminQuizzes, requestJson, saveModuleQuiz } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';

const COURSE_CATEGORIES = [
  '11th',
  '12th',
  'NEET',
  'IIT-JAM',
  'CSIR-NET Life Science',
  'GATE'
];

function normalizeText(value) {
  return String(value || '').trim();
}

export default function AdminQuizBuilderPage() {
  const navigate = useNavigate();
  const [quizCategory, setQuizCategory] = useState(COURSE_CATEGORIES[0]);
  const [quizModule, setQuizModule] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState('medium');
  const [quizRequireExplanation, setQuizRequireExplanation] = useState(false);
  const [quizTimeLimitMinutes, setQuizTimeLimitMinutes] = useState(15);
  const [quizQuestions, setQuizQuestions] = useState([
    { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }
  ]);
  const [quizSaving, setQuizSaving] = useState(false);
  const [quizMessage, setQuizMessage] = useState(null);
  const [editingQuizId, setEditingQuizId] = useState('');
  const [adminQuizzes, setAdminQuizzes] = useState([]);
  const [allAdminQuizzes, setAllAdminQuizzes] = useState([]);
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    let ignore = false;

    async function loadVideos() {
      try {
        const response = await requestJson('/videos');
        if (!ignore) {
          setVideos(Array.isArray(response) ? response : []);
        }
      } catch {
        if (!ignore) setVideos([]);
      }
    }

    loadVideos();
    return () => {
      ignore = true;
    };
  }, []);

  async function loadAdminQuizzes(category = quizCategory) {
    try {
      const [filtered, all] = await Promise.all([
        fetchAdminQuizzes(category),
        fetchAdminQuizzes('')
      ]);
      setAdminQuizzes(Array.isArray(filtered?.quizzes) ? filtered.quizzes : []);
      setAllAdminQuizzes(Array.isArray(all?.quizzes) ? all.quizzes : []);
    } catch (error) {
      setQuizMessage({ type: 'error', text: error.message || 'Failed to load quizzes.' });
    }
  }

  useEffect(() => {
    loadAdminQuizzes(quizCategory);
  }, [quizCategory]);

  const modulesByCourseFromVideos = useMemo(() => {
    const result = {};
    videos.forEach((video) => {
      const category = video.category || 'General';
      const module = normalizeText(video.module || 'General') || 'General';
      if (!result[category]) result[category] = new Set();
      result[category].add(module);
    });
    return result;
  }, [videos]);

  const modulesByCourseFromQuizzes = useMemo(() => {
    const result = {};
    allAdminQuizzes.forEach((quiz) => {
      const category = quiz.category || 'General';
      const module = normalizeText(quiz.module || 'General') || 'General';
      if (!result[category]) result[category] = new Set();
      result[category].add(module);
    });
    return result;
  }, [allAdminQuizzes]);

  const availableModules = useMemo(() => {
    return Array.from(new Set([
      ...Array.from(modulesByCourseFromVideos[quizCategory] || []),
      ...Array.from(modulesByCourseFromQuizzes[quizCategory] || [])
    ])).sort((a, b) => a.localeCompare(b));
  }, [modulesByCourseFromVideos, modulesByCourseFromQuizzes, quizCategory]);

  function resetBuilder() {
    setEditingQuizId('');
    setQuizModule('');
    setQuizTitle('');
    setQuizDifficulty('medium');
    setQuizRequireExplanation(false);
    setQuizTimeLimitMinutes(15);
    setQuizQuestions([{ question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }]);
  }

  function updateQuestion(index, field, value) {
    setQuizQuestions((current) => current.map((item, idx) => (
      idx === index ? { ...item, [field]: value } : item
    )));
  }

  function updateOption(questionIndex, optionIndex, value) {
    setQuizQuestions((current) => current.map((item, idx) => {
      if (idx !== questionIndex) return item;
      const nextOptions = [...item.options];
      nextOptions[optionIndex] = value;
      return { ...item, options: nextOptions };
    }));
  }

  function addQuestion() {
    setQuizQuestions((current) => [
      ...current,
      { question: '', options: ['', '', '', ''], correctIndex: 0, explanation: '' }
    ]);
  }

  function removeQuestion(index) {
    setQuizQuestions((current) => {
      if (current.length === 1) return current;
      return current.filter((_, idx) => idx !== index);
    });
  }

  function editQuiz(quiz) {
    setEditingQuizId(quiz._id);
    setQuizCategory(quiz.category || COURSE_CATEGORIES[0]);
    setQuizModule(quiz.module || '');
    setQuizTitle(quiz.title || '');
    setQuizDifficulty(quiz.difficulty || 'medium');
    setQuizRequireExplanation(Boolean(quiz.requireExplanation));
    setQuizTimeLimitMinutes(quiz.timeLimitMinutes || 15);
    setQuizQuestions((quiz.questions || []).map((item) => ({
      question: item.question,
      options: [...item.options],
      correctIndex: Number(item.correctIndex || 0),
      explanation: item.explanation || ''
    })));
    setQuizMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDeleteQuiz(quiz) {
    const ok = window.confirm(`Delete quiz for ${quiz.module} (${quiz.category})?`);
    if (!ok) return;

    try {
      await deleteQuiz(quiz._id);
      await loadAdminQuizzes(quizCategory);
      setQuizMessage({ type: 'success', text: 'Quiz deleted.' });
      if (editingQuizId === quiz._id) resetBuilder();
    } catch (error) {
      setQuizMessage({ type: 'error', text: error.message || 'Failed to delete quiz.' });
    }
  }

  async function handleSaveQuiz(event) {
    event.preventDefault();
    if (!quizCategory || !quizModule.trim() || !quizTitle.trim()) {
      setQuizMessage({ type: 'error', text: 'Class, chapter and title are required.' });
      return;
    }

    const invalid = quizQuestions.some((item) => {
      if (!item.question.trim()) return true;
      if (!Array.isArray(item.options) || item.options.length !== 4) return true;
      if (item.options.some((opt) => !opt.trim())) return true;
      if (quizRequireExplanation && !String(item.explanation || '').trim()) return true;
      return item.correctIndex < 0 || item.correctIndex > 3;
    });

    if (invalid) {
      setQuizMessage({ type: 'error', text: quizRequireExplanation
        ? 'Every question needs text, 4 options, correct answer and explanation.'
        : 'Every question needs text, 4 options and correct answer.' });
      return;
    }

    setQuizSaving(true);
    setQuizMessage(null);
    try {
      const normalizedModule = quizModule.trim();
      await saveModuleQuiz({
        quizId: editingQuizId || undefined,
        category: quizCategory,
        module: normalizedModule,
        title: quizTitle.trim(),
        difficulty: quizDifficulty,
        requireExplanation: quizRequireExplanation,
        timeLimitMinutes: Number(quizTimeLimitMinutes || 15),
        questions: quizQuestions.map((item) => ({
          question: item.question.trim(),
          options: item.options.map((opt) => opt.trim()),
          correctIndex: Number(item.correctIndex),
          explanation: String(item.explanation || '').trim()
        }))
      });
      setQuizMessage({ type: 'success', text: editingQuizId ? 'Quiz updated successfully.' : 'Quiz created successfully.' });
      resetBuilder();
      await loadAdminQuizzes(quizCategory);
    } catch (error) {
      setQuizMessage({ type: 'error', text: error.message || 'Failed to save quiz.' });
    } finally {
      setQuizSaving(false);
    }
  }

  return (
    <AppShell
      title="Chapter Quiz Workspace"
      subtitle="Create class-wise chapter quizzes in a dedicated page"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
      )}
    >
      <main className="admin-workspace-page">
        <section className="workspace-hero workspace-hero-quiz">
          <div>
            <p className="eyebrow">Chapter-wise Quizzes</p>
            <h2>Choose class, chapter and build questions</h2>
            <p className="subtitle">A cleaner exam-builder interface for quiz authoring and management.</p>
          </div>
          <div className="workspace-hero-stats">
            <StatCard label={`${quizCategory} Quizzes`} value={adminQuizzes.length} />
            <StatCard label="Total Quizzes" value={allAdminQuizzes.length} />
          </div>
        </section>

        <section className="card quiz-builder-panel workspace-panel">
          <form className="quiz-builder-form" onSubmit={handleSaveQuiz}>
            <div className="workspace-row-two">
              <label>
                Class
                <select value={quizCategory} onChange={(event) => setQuizCategory(event.target.value)}>
                  {COURSE_CATEGORIES.map((course) => (
                    <option key={course} value={course}>{course}</option>
                  ))}
                </select>
              </label>

              <label>
                Chapter / Module
                <input
                  value={quizModule}
                  onChange={(event) => setQuizModule(event.target.value)}
                  placeholder={availableModules.length ? `Try: ${availableModules.slice(0, 3).join(', ')}` : 'Example: Genetics'}
                  list="quiz-modules-list"
                  required
                />
                <datalist id="quiz-modules-list">
                  {availableModules.map((moduleName) => (
                    <option key={moduleName} value={moduleName} />
                  ))}
                </datalist>
              </label>
            </div>

            <label>
              Quiz title
              <input
                value={quizTitle}
                onChange={(event) => setQuizTitle(event.target.value)}
                placeholder="Example: Genetics Rapid Revision"
                required
              />
            </label>

            <div className="quiz-meta-grid">
              <label>
                Difficulty
                <select value={quizDifficulty} onChange={(event) => setQuizDifficulty(event.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>

              <label>
                Time limit (minutes)
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={quizTimeLimitMinutes}
                  onChange={(event) => setQuizTimeLimitMinutes(Number(event.target.value || 1))}
                />
              </label>
            </div>

            <label className="quiz-inline-checkbox">
              <input
                type="checkbox"
                checked={quizRequireExplanation}
                onChange={(event) => setQuizRequireExplanation(event.target.checked)}
              />
              Explanation required in each question
            </label>

            <div className="quiz-question-list">
              {quizQuestions.map((question, questionIndex) => (
                <article key={`quiz-question-${questionIndex}`} className="quiz-editor-card">
                  <div className="quiz-editor-head">
                    <strong>Question {questionIndex + 1}</strong>
                    {quizQuestions.length > 1 ? (
                      <button type="button" className="danger-text-btn" onClick={() => removeQuestion(questionIndex)}>
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <label>
                    Question text
                    <input
                      value={question.question}
                      onChange={(event) => updateQuestion(questionIndex, 'question', event.target.value)}
                      placeholder="Enter question"
                      required
                    />
                  </label>

                  <div className="quiz-options-list">
                    {question.options.map((option, optionIndex) => (
                      <label key={`quiz-option-${questionIndex}-${optionIndex}`}>
                        Option {optionIndex + 1}
                        <input
                          value={option}
                          onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                          placeholder={`Option ${optionIndex + 1}`}
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
                      <option value={0}>Option 1</option>
                      <option value={1}>Option 2</option>
                      <option value={2}>Option 3</option>
                      <option value={3}>Option 4</option>
                    </select>
                  </label>

                  <label>
                    Explanation
                    <textarea
                      rows="2"
                      value={question.explanation || ''}
                      onChange={(event) => updateQuestion(questionIndex, 'explanation', event.target.value)}
                      placeholder={quizRequireExplanation ? 'Required explanation' : 'Optional explanation'}
                    />
                  </label>
                </article>
              ))}
            </div>

            <div className="workspace-inline-actions">
              <button type="button" className="secondary-btn" onClick={addQuestion}>+ Add Question</button>
              {editingQuizId ? (
                <button type="button" className="secondary-btn" onClick={resetBuilder}>Cancel Edit</button>
              ) : null}
            </div>

            {quizMessage ? <p className={`inline-message ${quizMessage.type}`}>{quizMessage.text}</p> : null}

            <button type="submit" className="primary-btn" disabled={quizSaving}>
              {quizSaving ? 'Saving quiz...' : editingQuizId ? 'Update Quiz' : 'Create Quiz'}
            </button>
          </form>
        </section>

        <section className="card quiz-admin-list workspace-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Chapter Quiz Bank</p>
              <h3>{quizCategory} quizzes</h3>
            </div>
          </div>

          {adminQuizzes.length ? (
            <div className="quiz-admin-items">
              {adminQuizzes.map((quiz) => (
                <article key={quiz._id} className="quiz-admin-item">
                  <div className="quiz-admin-item-body">
                    <strong>{quiz.title || quiz.module}</strong>
                    <p>{quiz.module} • {quiz.category}</p>
                    <div className="quiz-admin-meta">
                      <span className="quiz-admin-meta-chip">{quiz.questions?.length || 0} questions</span>
                      <span className="quiz-admin-meta-chip">{quiz.timeLimitMinutes || 15} min</span>
                      <span className="quiz-admin-meta-chip">{quiz.requireExplanation ? 'Explanation Req' : 'No Explanation Req'}</span>
                    </div>
                  </div>
                  <div className="quiz-admin-item-actions">
                    <button type="button" className="secondary-btn" onClick={() => editQuiz(quiz)}>Edit</button>
                    <button type="button" className="danger-btn" onClick={() => handleDeleteQuiz(quiz)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-note">No quizzes found for this class yet.</p>
          )}
        </section>
      </main>
    </AppShell>
  );
}
