import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { downloadMockExamResultPdf, fetchMockExamById, fetchMockExamResult, submitMockExam } from '../api';

function formatTimer(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function StudentMockExamPage() {
  const navigate = useNavigate();
  const { examId } = useParams();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [result, setResult] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [reviewMarks, setReviewMarks] = useState({});
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [pendingUnansweredCount, setPendingUnansweredCount] = useState(0);
  const [hasStartedExam, setHasStartedExam] = useState(false);
  const [hasAcceptedRules, setHasAcceptedRules] = useState(false);

  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (!examId) {
      setLoadError('Mock exam not found.');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    fetchMockExamById(examId)
      .then((data) => {
        if (cancelled) return;
        const nextExam = data?.exam || null;
        if (!nextExam) throw new Error('Mock exam is unavailable.');
        setExam(nextExam);
        setAnswers(Array((nextExam.questions || []).length).fill(-1));
        setReviewMarks({});
        setActiveIndex(0);
        setSecondsLeft((nextExam.durationMinutes || 60) * 60);
        setStartedAt(null);
        setHasStartedExam(false);
        setHasAcceptedRules(false);
        autoSubmittedRef.current = false;

        if (nextExam.attempted) {
          return fetchMockExamResult(examId)
            .then((resultData) => {
              if (!cancelled) setResult(resultData?.result || null);
            })
            .catch(() => {
              if (!cancelled) setSubmitMessage('You already attempted this exam. Result will be visible once released by admin.');
            });
        }
        return null;
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || 'Failed to load mock exam.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    if (!exam || result || exam.attempted || !hasStartedExam || secondsLeft <= 0) return undefined;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [exam, result, secondsLeft, hasStartedExam]);

  async function handleSubmitExam(forceSubmit = false, submitReason = '') {
    if (!exam || exam.attempted || result || isSubmitting) return;
    if (!forceSubmit) {
      const unansweredCount = answers.reduce((count, value) => count + (value >= 0 ? 0 : 1), 0);
      if (unansweredCount > 0) {
        setPendingUnansweredCount(unansweredCount);
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitMessage('');
    try {
      const durationSeconds = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : undefined;
      const data = await submitMockExam(exam._id, answers, durationSeconds);
      setSubmitMessage(submitReason || data?.message || 'Exam submitted successfully.');
      setExam((current) => (current ? { ...current, attempted: true } : current));
      setHasStartedExam(false);
      if (data?.result?.released) {
        const resultData = await fetchMockExamResult(exam._id);
        setResult(resultData?.result || null);
      }
    } catch (error) {
      setSubmitMessage(error.message || 'Failed to submit exam.');
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!exam || result || exam.attempted || isSubmitting || secondsLeft !== 0) return;
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    handleSubmitExam(true, 'Time is over. Your exam has been submitted automatically.');
  }, [exam, result, isSubmitting, secondsLeft]);

  useEffect(() => {
    if (!exam || result || exam.attempted || isSubmitting || !hasStartedExam) return undefined;

    const triggerSecuritySubmit = () => {
      if (autoSubmittedRef.current) return;
      autoSubmittedRef.current = true;
      setPendingUnansweredCount(0);
      setExitConfirmOpen(false);
      handleSubmitExam(true, 'Tab switching or window change was detected. Your exam has been submitted automatically.');
    };

    const handleVisibilityChange = () => {
      if (document.hidden) triggerSecuritySubmit();
    };

    const handleWindowBlur = () => {
      if (document.visibilityState === 'hidden' || !document.hasFocus()) {
        triggerSecuritySubmit();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [exam, result, isSubmitting, hasStartedExam, answers, startedAt]);

  function handleStartExam() {
    if (!exam || !hasAcceptedRules || result || exam.attempted) return;
    setStartedAt(Date.now());
    setHasStartedExam(true);
    setSubmitMessage('');
    autoSubmittedRef.current = false;
  }

  const totalQuestions = Array.isArray(exam?.questions) ? exam.questions.length : 0;
  const safeActiveIndex = totalQuestions ? Math.max(0, Math.min(activeIndex, totalQuestions - 1)) : 0;
  const activeQuestion = totalQuestions ? exam.questions[safeActiveIndex] : null;

  const attemptedCount = useMemo(() => answers.filter((value) => value >= 0).length, [answers]);
  const markedCount = useMemo(
    () => Object.keys(reviewMarks).filter((key) => reviewMarks[key]).length,
    [reviewMarks]
  );

  function handleToggleReview() {
    setReviewMarks((current) => {
      const next = { ...current };
      if (next[safeActiveIndex]) {
        delete next[safeActiveIndex];
      } else {
        next[safeActiveIndex] = true;
      }
      return next;
    });
  }

  function handleSelectOption(optionIndex) {
    setAnswers((current) => {
      const next = [...current];
      next[safeActiveIndex] = next[safeActiveIndex] === optionIndex ? -1 : optionIndex;
      return next;
    });
  }

  async function handleDownloadPdf() {
    if (!exam?._id) return;
    try {
      await downloadMockExamResultPdf(exam._id);
    } catch (error) {
      setSubmitMessage(error.message || 'Failed to download PDF.');
    }
  }

  function handleBackToExamSection() {
    const examInProgress = exam && !exam.attempted && !result && !isLoading;
    if (examInProgress && !isSubmitting) {
      setExitConfirmOpen(true);
      return;
    }
    navigate('/student');
  }

  return (
    <main className="quiz-exam-page">
      <header className="quiz-exam-header">
        <button type="button" className="secondary-btn" onClick={handleBackToExamSection}>
          ← Back To Exam Section
        </button>
        <div className="quiz-exam-title-wrap">
          <p className="eyebrow">Monthly Mock Exam</p>
          <h1>{exam?.title || 'Mock Exam'}</h1>
          <p>{exam?.category || ''}</p>
        </div>
        <div className="quiz-exam-meta">
          <span className="quiz-difficulty">One Attempt Only</span>
          <span className={`quiz-timer ${secondsLeft <= 60 ? 'quiz-timer-warning' : ''}`}>Time Left: {formatTimer(secondsLeft)}</span>
        </div>
      </header>

      {isLoading ? <p className="empty-note">Loading mock exam...</p> : null}
      {!isLoading && loadError ? <p className="inline-message error">{loadError}</p> : null}
      {submitMessage ? <p className="inline-message success">{submitMessage}</p> : null}

      {!isLoading && !loadError && exam && !exam.attempted && !result && !hasStartedExam ? (
        <section className="quiz-instruction-panel">
          <div className="quiz-instruction-hero">
            <p className="eyebrow">Exam Instructions</p>
            <h3>Read these guidelines before you start</h3>
            <p>
              This mock test contains <strong>{totalQuestions}</strong> questions and the total duration is{' '}
              <strong>{exam.durationMinutes || 60} minutes</strong>.
            </p>
          </div>

          <div className="quiz-instruction-grid">
            <article className="quiz-instruction-stat">
              <span>Total Questions</span>
              <strong>{totalQuestions}</strong>
            </article>
            <article className="quiz-instruction-stat">
              <span>Total Time</span>
              <strong>{exam.durationMinutes || 60} min</strong>
            </article>
            <article className="quiz-instruction-stat">
              <span>Attempts</span>
              <strong>One Only</strong>
            </article>
          </div>

          <ul className="quiz-rules-list">
            <li className="quiz-rule-item">Read every question carefully before selecting an answer.</li>
            <li className="quiz-rule-item">You can move between questions using the navigator and mark items for review.</li>
            <li className="quiz-rule-item">Clicking the same option again will unselect that answer.</li>
            <li className="quiz-rule-item">If you switch tabs, minimize the window, or move away from the exam screen, the test will be submitted automatically.</li>
            <li className="quiz-rule-item">Once submitted, the attempt is final and cannot be changed.</li>
          </ul>

          <label className="quiz-instruction-ack">
            <input
              type="checkbox"
              checked={hasAcceptedRules}
              onChange={(event) => setHasAcceptedRules(event.target.checked)}
            />
            <span>
              I have read the instructions and understand that switching tabs or leaving the exam window will auto-submit my mock test.
            </span>
          </label>

          <div className="quiz-instruction-cta">
            <button type="button" className="secondary-btn" onClick={() => navigate('/student')}>
              Back
            </button>
            <button type="button" className="primary-btn" disabled={!hasAcceptedRules} onClick={handleStartExam}>
              Start Mock Test
            </button>
          </div>
        </section>
      ) : null}

      {!isLoading && !loadError && exam && !exam.attempted && !result && hasStartedExam ? (
        <form className="quiz-workspace" onSubmit={(event) => { event.preventDefault(); handleSubmitExam(false); }}>
          <div className="quiz-workspace-body">
            <section className="quiz-workspace-main">
              {activeQuestion ? (
                <article className="quiz-question-card">
                  <div className="quiz-question-head">
                    <span className="quiz-question-index">Question {safeActiveIndex + 1} / {totalQuestions}</span>
                    <button
                      type="button"
                      className={`secondary-btn quiz-review-toggle${reviewMarks[safeActiveIndex] ? ' is-marked' : ''}`}
                      onClick={handleToggleReview}
                    >
                      {reviewMarks[safeActiveIndex] ? 'Marked for Review' : 'Mark for Review'}
                    </button>
                  </div>
                  <p className="quiz-question-text"><strong>Q{safeActiveIndex + 1}.</strong> {activeQuestion.question}</p>
                  <div className="quiz-options-grid">
                    {activeQuestion.options.map((option, optionIndex) => {
                      const isSelected = answers[safeActiveIndex] === optionIndex;
                      return (
                        <button
                          key={`${option}-${optionIndex}`}
                          type="button"
                          className={`quiz-option quiz-option-button${isSelected ? ' is-selected' : ''}`}
                          onClick={() => handleSelectOption(optionIndex)}
                        >
                          <span className="quiz-option-prefix">{String.fromCharCode(65 + optionIndex)}.</span>
                          <span>{option}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="quiz-question-nav-row">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
                      disabled={safeActiveIndex === 0}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => setActiveIndex((current) => Math.min(totalQuestions - 1, current + 1))}
                      disabled={safeActiveIndex >= totalQuestions - 1}
                    >
                      Next
                    </button>
                  </div>
                </article>
              ) : null}
            </section>

            <aside className="quiz-workspace-sidebar">
              <div className="quiz-sidebar-summary card">
                <h4>Exam Summary</h4>
                <p>Total Questions: <strong>{totalQuestions}</strong></p>
                <p>Attempted: <strong>{attemptedCount}</strong></p>
                <p>Marked for review: <strong>{markedCount}</strong></p>
                <p>Unattempted: <strong>{Math.max(0, totalQuestions - attemptedCount)}</strong></p>
              </div>

              <div className="quiz-question-navigator" role="list">
                {Array.from({ length: totalQuestions }).map((_, index) => {
                  const isAttempted = answers[index] >= 0;
                  const isMarked = Boolean(reviewMarks[index]);
                  const statusClass = isMarked ? 'is-review' : (isAttempted ? 'is-attempted' : 'is-unattempted');
                  return (
                    <button
                      key={`exam-question-nav-${index}`}
                      type="button"
                      className={`quiz-nav-item ${statusClass}${safeActiveIndex === index ? ' is-active' : ''}`}
                      onClick={() => setActiveIndex(index)}
                      role="listitem"
                    >
                      Q{index + 1}
                    </button>
                  );
                })}
              </div>

              <button type="submit" className="primary-btn quiz-submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Exam'}
              </button>
            </aside>
          </div>
        </form>
      ) : null}

      {!isLoading && !loadError && exam && (result || exam.attempted) ? (
        <section className="quiz-thankyou-pop">
          <h3>Exam Attempt Status</h3>
          {result ? (
            <>
              <div className="quiz-result-box">
                <strong>Your Score: {result.score}/{result.total}</strong>
                <span>Percentage: {result.percentage}%</span>
              </div>
              <div className="quiz-thankyou-actions">
                <button type="button" className="secondary-btn" onClick={() => setShowReview((current) => !current)}>
                  {showReview ? 'Hide Review' : 'Review Answers'}
                </button>
                <button type="button" className="primary-btn" onClick={handleDownloadPdf}>
                  Download Result PDF
                </button>
              </div>
              {showReview ? (
                <div className="quiz-review-list">
                  {(result.review || []).map((item, idx) => (
                    <article key={`mock-review-${idx}`} className={`quiz-review-item ${item.isCorrect ? 'correct' : 'incorrect'}`}>
                      <p><strong>Q{idx + 1}.</strong> {item.question}</p>
                      <p><span className="quiz-review-label">Your answer:</span> {item.selectedIndex >= 0 ? item.options[item.selectedIndex] : 'Not answered'}</p>
                      <p><span className="quiz-review-label">Correct answer:</span> {item.correctAnswer || 'N/A'}</p>
                      {item.explanation ? <p><span className="quiz-review-label">Explanation:</span> {item.explanation}</p> : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="empty-note">You already attempted this exam. Result will be visible when admin releases it.</p>
          )}
        </section>
      ) : null}

      {exitConfirmOpen ? (
        <div className="quiz-confirm-overlay" role="dialog" aria-modal="true" aria-label="Exit exam confirmation">
          <div className="quiz-confirm-card">
            <h3>Exam Not Submitted Yet</h3>
            <p>
              You have not submitted this exam yet. If you exit now, your progress might be lost.
              Are you sure you want to leave?
            </p>
            <div className="quiz-confirm-actions">
              <button type="button" className="secondary-btn" onClick={() => setExitConfirmOpen(false)}>
                Continue Exam
              </button>
              <button
                type="button"
                className="danger-btn quiz-exit-anyway-btn"
                onClick={() => {
                  setExitConfirmOpen(false);
                  navigate('/student');
                }}
              >
                Exit Anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingUnansweredCount > 0 ? (
        <div className="quiz-confirm-overlay" role="dialog" aria-modal="true" aria-label="Submit with unanswered questions">
          <div className="quiz-confirm-card">
            <h3>Some Questions Are Unanswered</h3>
            <p>
              You have not selected answer for <strong>{pendingUnansweredCount}</strong>{' '}
              question{pendingUnansweredCount === 1 ? '' : 's'}. Do you still want to submit?
            </p>
            <div className="quiz-confirm-actions">
              <button type="button" className="secondary-btn" onClick={() => setPendingUnansweredCount(0)}>
                Review Questions
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={async () => {
                  setPendingUnansweredCount(0);
                  await handleSubmitExam(true);
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Anyway'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
