import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fetchQuizById, fetchRecentQuizAttempts, submitQuiz } from '../api';

function formatTimer(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function resolveReviewCorrectIndex(item) {
  const direct = Number(item?.correctIndex);
  if (Number.isInteger(direct) && direct >= 0 && direct <= 3) return direct;

  if (item?.correctAnswer && Array.isArray(item?.options)) {
    const matchIndex = item.options.findIndex(
      (opt) => String(opt).trim().toLowerCase() === String(item.correctAnswer).trim().toLowerCase()
    );
    if (matchIndex >= 0) return matchIndex;
  }

  return -1;
}

function buildQuestionOrder(length, shouldShuffle) {
  const order = Array.from({ length }, (_, index) => index);
  if (!shouldShuffle || length <= 1) return order;

  for (let i = order.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [order[i], order[randomIndex]] = [order[randomIndex], order[i]];
  }

  const unchanged = order.every((value, index) => value === index);
  if (unchanged && length > 1) {
    const first = order.shift();
    order.push(first);
  }

  return order;
}

export default function StudentQuizPage() {
  const navigate = useNavigate();
  const { quizId } = useParams();
  const [searchParams] = useSearchParams();

  const moduleNameParam = String(searchParams.get('module') || '').trim();
  const moduleName = moduleNameParam || 'Module';

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [questionOrder, setQuestionOrder] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reviewMarks, setReviewMarks] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [pendingUnansweredCount, setPendingUnansweredCount] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [isFloatingBackVisible, setIsFloatingBackVisible] = useState(true);

  const autoSubmittedRef = useRef(false);
  const exitTimerRef = useRef(null);

  useEffect(() => {
    if (!quizId) {
      setLoadError('Quiz not found.');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    Promise.all([fetchQuizById(quizId), fetchRecentQuizAttempts().catch(() => ({ attempts: [] }))])
      .then(([quizData, attemptData]) => {
        if (cancelled) return;
        const nextQuiz = quizData?.quiz || null;
        if (!nextQuiz?.questions?.length) {
          throw new Error('Quiz questions are unavailable.');
        }

        const hasAttemptedThisQuiz = Array.isArray(attemptData?.attempts)
          ? attemptData.attempts.some((attempt) => String(attempt?.quizId || '') === String(nextQuiz._id || quizId))
          : false;
        const nextQuestionOrder = buildQuestionOrder(nextQuiz.questions.length, hasAttemptedThisQuiz);

        setQuiz(nextQuiz);
        setQuestionOrder(nextQuestionOrder);
        setAnswers(Array(nextQuiz.questions.length).fill(-1));
        setActiveIndex(0);
        setReviewMarks({});
        setResult(null);
        setShowReview(false);
        setSecondsLeft((nextQuiz.timeLimitMinutes || 15) * 60);
        setStartedAt(Date.now());
        autoSubmittedRef.current = false;
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || 'Failed to load quiz.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [quizId]);

  useEffect(() => {
    if (!quiz || result || secondsLeft <= 0) return undefined;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [quiz, result, secondsLeft]);

  async function submitCurrentQuiz(requireAllAnswered) {
    if (!quiz || isSubmitting) return;
    if (requireAllAnswered && answers.some((value) => value < 0)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const durationSeconds = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : undefined;
      const normalizedOrder = questionOrder.length === answers.length
        ? questionOrder
        : Array.from({ length: answers.length }, (_, index) => index);
      const answersForSubmission = Array.from({ length: answers.length }, () => -1);
      normalizedOrder.forEach((originalIndex, displayIndex) => {
        const value = Number(answers[displayIndex]);
        answersForSubmission[originalIndex] = Number.isInteger(value) && value >= 0 && value <= 3 ? value : -1;
      });

      const data = await submitQuiz(quiz._id, answersForSubmission, durationSeconds);
      setResult(data?.result || null);
      setShowReview(false);
    } catch (error) {
      window.alert(error.message || 'Failed to submit quiz.');
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!quiz || result || isSubmitting || secondsLeft !== 0) return;
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    submitCurrentQuiz(false);
  }, [quiz, result, isSubmitting, secondsLeft]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let previousY = window.scrollY;
    let ticking = false;

    function handleScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const scrollingDown = currentY > previousY + 6;
        const scrollingUp = currentY < previousY - 6;

        if (currentY < 120 || scrollingUp) {
          setIsFloatingBackVisible(true);
        } else if (scrollingDown) {
          setIsFloatingBackVisible(false);
        }

        previousY = currentY;
        ticking = false;
      });
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const displayedQuestions = useMemo(() => {
    if (!Array.isArray(quiz?.questions)) return [];
    if (questionOrder.length !== quiz.questions.length) return quiz.questions;
    return questionOrder.map((index) => quiz.questions[index]).filter(Boolean);
  }, [quiz, questionOrder]);

  const totalQuestions = displayedQuestions.length;
  const safeActiveIndex = totalQuestions ? Math.max(0, Math.min(activeIndex, totalQuestions - 1)) : 0;
  const activeQuestion = totalQuestions ? displayedQuestions[safeActiveIndex] : null;

  const attemptedCount = useMemo(() => {
    return answers.reduce((count, value) => count + (Number.isInteger(value) && value >= 0 ? 1 : 0), 0);
  }, [answers]);

  const markedCount = useMemo(() => {
    return Object.keys(reviewMarks).filter((key) => reviewMarks[key]).length;
  }, [reviewMarks]);

  const reviewItems = Array.isArray(result?.review) ? result.review : [];

  function handleSelectOption(optionIndex) {
    setAnswers((current) => {
      const next = [...current];
      const existing = Number.isInteger(next[safeActiveIndex]) ? next[safeActiveIndex] : -1;
      next[safeActiveIndex] = existing === optionIndex ? -1 : optionIndex;
      return next;
    });
  }

  function handleToggleReview() {
    setReviewMarks((current) => {
      const next = { ...current };
      if (next[safeActiveIndex]) delete next[safeActiveIndex];
      else next[safeActiveIndex] = true;
      return next;
    });
  }

  async function handleSubmitWithWarning(event) {
    event.preventDefault();
    const unansweredCount = answers.reduce((count, value) => count + (value >= 0 ? 0 : 1), 0);

    if (unansweredCount > 0) {
      setPendingUnansweredCount(unansweredCount);
      return;
    }

    await submitCurrentQuiz(true);
  }

  function handleBackToDashboard() {
    if (isExiting) return;
    const quizInProgress = quiz && !result && !isLoading;
    if (quizInProgress && !isSubmitting) {
      setExitConfirmOpen(true);
      return;
    }
    setIsExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      navigate('/student', {
        state: moduleNameParam
          ? {
              restoreModule: {
                name: moduleNameParam
              }
            }
          : null
      });
    }, 320);
  }

  return (
    <main className={`quiz-exam-page page-exit-transition${isExiting ? ' is-exiting' : ''}`}>
      <header className="quiz-exam-header">
        <button type="button" className="secondary-btn" onClick={handleBackToDashboard}>
          ← Back To Dashboard
        </button>
        <div className="quiz-exam-title-wrap">
          <p className="eyebrow">Exam Mode</p>
          <h1>{quiz?.title || 'Quiz'}</h1>
          <p>{moduleName}</p>
        </div>
        <div className="quiz-exam-meta">
          <span className={`quiz-difficulty quiz-difficulty-${quiz?.difficulty || 'medium'}`}>
            Difficulty: {quiz?.difficulty || 'medium'}
          </span>
          <span className={`quiz-timer ${secondsLeft <= 30 ? 'quiz-timer-warning' : ''}`}>
            Time Left: {formatTimer(secondsLeft)}
          </span>
        </div>
      </header>

      {isLoading ? <p className="empty-note">Loading quiz...</p> : null}
      {!isLoading && loadError ? <p className="inline-message error">{loadError}</p> : null}

      {!isLoading && !loadError && quiz && !result ? (
        <form className="quiz-workspace" onSubmit={handleSubmitWithWarning}>
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
                          aria-pressed={isSelected}
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

            <aside className="quiz-workspace-sidebar" aria-label="Question navigator">
              <div className="quiz-sidebar-summary card">
                <h4>Questions Overview</h4>
                <p>Total Questions: <strong>{totalQuestions}</strong></p>
                <p>Attempted: <strong>{attemptedCount}</strong></p>
                <p>Marked for review: <strong>{markedCount}</strong></p>
              </div>

              <div className="quiz-question-navigator" role="list">
                {Array.from({ length: totalQuestions }).map((_, index) => {
                  const isAttempted = Number.isInteger(answers[index]) && answers[index] >= 0;
                  const isMarked = Boolean(reviewMarks[index]);
                  const statusClass = isMarked ? 'is-review' : (isAttempted ? 'is-attempted' : 'is-unattempted');
                  return (
                    <button
                      key={`question-nav-${index}`}
                      type="button"
                      className={`quiz-nav-item ${statusClass}${safeActiveIndex === index ? ' is-active' : ''}`}
                      onClick={() => setActiveIndex(index)}
                      role="listitem"
                      aria-label={`Question ${index + 1}`}
                    >
                      Q{index + 1}
                    </button>
                  );
                })}
              </div>

              <button type="submit" className="primary-btn quiz-submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
              </button>
            </aside>
          </div>
        </form>
      ) : null}

      {!isLoading && !loadError && quiz && result ? (
        <section className="quiz-thankyou-pop" role="status" aria-live="polite">
          <h3>Quiz Submitted</h3>
          <p>Your result is ready.</p>
          <div className="quiz-result-box">
            <strong>Your Score: {result.score}/{result.total}</strong>
            <span>Percentage: {result.percentage}%</span>
          </div>
          <div className="quiz-thankyou-actions">
            <button type="button" className="secondary-btn" onClick={() => setShowReview((current) => !current)}>
              {showReview ? 'Hide Review' : 'Review Answers'}
            </button>
            <button type="button" className="primary-btn" onClick={handleBackToDashboard} disabled={isExiting}>
              Back To Dashboard
            </button>
          </div>

          {showReview ? (
            <div className="quiz-review-list">
              {reviewItems.length ? reviewItems.map((item, idx) => (
                <article key={`review-${idx}`} className={`quiz-review-item ${item.isCorrect ? 'correct' : 'incorrect'}`}>
                  <p><strong>Q{idx + 1}.</strong> {item.question}</p>
                  <div className="quiz-review-options">
                    {item.options.map((option, optionIndex) => {
                      const parsedCorrectIndex = resolveReviewCorrectIndex(item);
                      const isCorrectOption = optionIndex === parsedCorrectIndex;
                      const isSelectedOption = optionIndex === item.selectedIndex;
                      return (
                        <p
                          key={`review-${idx}-option-${optionIndex}`}
                          className={`quiz-review-option ${isCorrectOption ? 'correct' : ''} ${isSelectedOption ? 'selected' : ''}`}
                        >
                          <span className="quiz-review-option-index">{String.fromCharCode(65 + optionIndex)}.</span> {option}
                          {isCorrectOption ? <strong className="quiz-review-badge"> Correct</strong> : null}
                          {isSelectedOption && !isCorrectOption ? <strong className="quiz-review-badge"> Your choice</strong> : null}
                        </p>
                      );
                    })}
                  </div>
                  <p>
                    <span className="quiz-review-label">Your answer:</span>{' '}
                    {item.selectedIndex >= 0 ? item.options[item.selectedIndex] : 'Not answered'}
                  </p>
                  <p>
                    <span className="quiz-review-label">Correct answer:</span>{' '}
                    {(resolveReviewCorrectIndex(item) >= 0 && item.options[resolveReviewCorrectIndex(item)])
                      ? item.options[resolveReviewCorrectIndex(item)]
                      : (item.correctAnswer || 'Correct answer unavailable')}
                  </p>
                  {item.explanation ? (
                    <p><span className="quiz-review-label">Explanation:</span> {item.explanation}</p>
                  ) : null}
                </article>
              )) : (
                <p className="empty-note">Review details are not available.</p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {exitConfirmOpen ? (
        <div className="quiz-confirm-overlay" role="dialog" aria-modal="true" aria-label="Exit quiz confirmation">
          <div className="quiz-confirm-card">
            <h3>Quiz Not Submitted Yet</h3>
            <p>
              You have not submitted this quiz yet. If you exit now, your progress might be lost.
              Are you sure you want to leave?
            </p>
            <div className="quiz-confirm-actions">
              <button type="button" className="secondary-btn" onClick={() => setExitConfirmOpen(false)}>
                Continue Quiz
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  setExitConfirmOpen(false);
                  setIsExiting(true);
                  exitTimerRef.current = window.setTimeout(() => {
                    navigate('/student', {
                      state: moduleNameParam
                        ? {
                            restoreModule: {
                              name: moduleNameParam
                            }
                          }
                        : null
                    });
                  }, 320);
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
                  await submitCurrentQuiz(false);
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Anyway'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={`quiz-floating-back${isFloatingBackVisible ? '' : ' is-hidden'}`}
        onClick={handleBackToDashboard}
        disabled={isExiting}
        aria-label="Go to previous page"
      >
        ← Previous Page
      </button>
    </main>
  );
}
