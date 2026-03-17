import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { downloadMaterial } from '../api';
import AppShell from '../components/AppShell';
import { QuizModal } from '../components/QuizModal';
import StatCard from '../components/StatCard';
import VideoCard from '../components/VideoCard';
import { useCourseData } from '../hooks/useCourseData';
import { useFeedback } from '../hooks/useFeedback';
import { useQuizSession } from '../hooks/useQuizSession';
import { useSessionStore } from '../stores/sessionStore';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { session, logout } = useSessionStore();

  const {
    videos, course, favoriteIds, completedIds, quizzes, quizAttempts,
    isLoading, loadError, toggleFavorite, toggleCompleted, refreshAttempts,
    favMutError, progressMutError
  } = useCourseData();

  const [selectedModule, setSelectedModule] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [banner, setBanner] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({});
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const {
    moduleQuiz, moduleQuizList, quizAnswers, quizResult, quizReview,
    showQuizReview, quizSecondsLeft, loadingQuiz, loadingQuizDetailsId, submittingQuiz,
    moduleHasQuiz, setQuizAnswers, setShowQuizReview,
    handleSelectQuizFromList, handleBackToQuizList, handleRetakeQuiz,
    handleSubmitQuiz, handleLoadQuizForModule
  } = useQuizSession({
    selectedModule,
    quizzes,
    onError: (msg) => setBanner({ type: 'error', text: msg }),
    onAttemptsRefresh: refreshAttempts
  });

  const {
    register: registerFeedback, handleFeedbackSubmit, isSubmittingFeedback,
    feedbackInlineError, feedbackToast, isFeedbackToastDismissing, dismissFeedbackToast
  } = useFeedback();

  function formatTimer(totalSeconds) {
    const safe = Math.max(0, totalSeconds || 0);
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  const query = searchQuery.trim().toLowerCase();

  function resolveReviewCorrectIndex(item) {
    const direct = Number(item?.correctIndex);
    if (Number.isInteger(direct) && direct >= 0 && direct <= 3) return direct;

    if (item?.correctAnswer && Array.isArray(item?.options)) {
      const matchIndex = item.options.findIndex((opt) => String(opt).trim().toLowerCase() === String(item.correctAnswer).trim().toLowerCase());
      if (matchIndex >= 0) return matchIndex;
    }

    return -1;
  }

  function normalizeModuleName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function getQuestionCount(quiz) {
    return Math.max(
      Number(quiz?.questionCount) || 0,
      Array.isArray(quiz?.questions) ? quiz.questions.length : 0
    );
  }

  function normalizeId(value) {
    return String(value || '');
  }

  const moduleDisplayByKey = {};

  // Group videos by normalized module key.
  const videosByModule = videos.reduce((acc, video) => {
    const displayModule = String(video.module || 'General').trim() || 'General';
    const moduleKey = normalizeModuleName(displayModule);
    if (!moduleDisplayByKey[moduleKey]) {
      moduleDisplayByKey[moduleKey] = displayModule;
    }
    if (!acc[moduleKey]) {
      acc[moduleKey] = [];
    }
    acc[moduleKey].push(video);
    return acc;
  }, {});

  const quizzesByModule = quizzes.reduce((acc, quiz) => {
    const displayModule = String(quiz.module || 'General').trim() || 'General';
    const moduleKey = normalizeModuleName(displayModule);
    if (!moduleDisplayByKey[moduleKey]) {
      moduleDisplayByKey[moduleKey] = displayModule;
    }
    if (!acc[moduleKey]) {
      acc[moduleKey] = [];
    }
    acc[moduleKey].push(quiz);
    return acc;
  }, {});

  quizAttempts.forEach((attempt) => {
    const displayModule = String(attempt.module || 'General').trim() || 'General';
    const moduleKey = normalizeModuleName(displayModule);
    if (!moduleDisplayByKey[moduleKey]) {
      moduleDisplayByKey[moduleKey] = displayModule;
    }
  });

  const modules = Object.keys(moduleDisplayByKey)
    .sort((a, b) => moduleDisplayByKey[a].localeCompare(moduleDisplayByKey[b]));

  const visibleModules = modules.filter((moduleKey) => {
    const moduleName = moduleDisplayByKey[moduleKey];
    if (!query) return true;
    if (moduleName.toLowerCase().includes(query)) return true;

    const videoMatch = (videosByModule[moduleKey] || []).some((video) => {
      const haystack = `${video.title || ''} ${video.description || ''}`.toLowerCase();
      return haystack.includes(query);
    });

    const quizMatch = (quizzesByModule[moduleKey] || []).some((quiz) => {
      const haystack = `${quiz.title || ''} ${quiz.difficulty || ''}`.toLowerCase();
      return haystack.includes(query);
    });

    return videoMatch || quizMatch;
  });

  const selectedModuleKey = normalizeModuleName(selectedModule || '');
  const selectedModuleVideos = selectedModule ? (videosByModule[selectedModuleKey] || []) : [];

  const displayedVideos = selectedModuleVideos
    .filter((video) => {
      if (showSavedOnly && !favoriteIds.has(normalizeId(video._id))) return false;
      if (!query) return true;
      const haystack = `${video.title || ''} ${video.description || ''}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => {
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'oldest') return new Date(a.uploadedAt) - new Date(b.uploadedAt);
      return new Date(b.uploadedAt) - new Date(a.uploadedAt);
    });

  const favoriteVideos = videos.filter((video) => favoriteIds.has(normalizeId(video._id)));
  const completedCount = videos.filter((video) => completedIds.has(normalizeId(video._id))).length;
  const progressPercent = videos.length ? Math.round((completedCount / videos.length) * 100) : 0;
  const selectedModuleAttempts = selectedModule
    ? quizAttempts.filter((attempt) => normalizeModuleName(attempt.module) === selectedModuleKey)
    : [];
  const fallbackReviewFromLocalQuiz = (
    moduleQuiz?.questions?.length
      ? moduleQuiz.questions.map((question, idx) => {
        const selectedIndex = Number.isInteger(quizAnswers[idx]) ? quizAnswers[idx] : -1;
        const correctIndex = Number.isInteger(question.correctIndex) ? question.correctIndex : -1;
        const correctAnswer = correctIndex >= 0 && Array.isArray(question.options)
          ? question.options[correctIndex]
          : '';
        return {
          question: question.question,
          options: question.options || [],
          selectedIndex,
          correctIndex,
          correctAnswer,
          isCorrect: selectedIndex >= 0 && selectedIndex === correctIndex,
          explanation: question.explanation || ''
        };
      })
      : []
  );

  const reviewItems = quizReview.length
    ? quizReview
    : (Array.isArray(quizResult?.review) && quizResult.review.length
      ? quizResult.review
      : fallbackReviewFromLocalQuiz);

  const latestAttemptByModule = quizAttempts.reduce((acc, attempt) => {
    const moduleKey = normalizeModuleName(attempt.module || 'General');
    if (!acc[moduleKey]) acc[moduleKey] = attempt;
    return acc;
  }, {});

  useEffect(() => {
    if (!loadError) return;
    if (/authentication|unauthorized/i.test(loadError.message || '')) {
      logout();
      navigate('/', { replace: true });
    } else {
      setBanner({ type: 'error', text: loadError.message });
    }
  }, [loadError, navigate, logout]);

  useEffect(() => {
    if (favMutError) setBanner({ type: 'error', text: favMutError.message });
  }, [favMutError]);

  useEffect(() => {
    if (progressMutError) setBanner({ type: 'error', text: progressMutError.message });
  }, [progressMutError]);

  // Open modal when a quiz becomes active; close when quiz is cleared.
  useEffect(() => {
    if (moduleQuiz) {
      setQuizModalOpen(true);
      setShowExitConfirm(false);
    } else {
      setQuizModalOpen(false);
      setShowExitConfirm(false);
    }
  }, [moduleQuiz]);

  function handleCloseQuizModal() {
    if (moduleQuiz && !quizResult) {
      setShowExitConfirm(true);
    } else {
      handleBackToQuizList();
    }
  }

  function handleConfirmExit() {
    setShowExitConfirm(false);
    handleBackToQuizList();
  }

  async function handleDownload(material) {
    setDownloadProgress((current) => ({ ...current, [material.filename]: 0 }));
    try {
      await downloadMaterial(material.filename, material.name, (percent) => {
        setDownloadProgress((current) => ({ ...current, [material.filename]: percent }));
      });
      setBanner({ type: 'success', text: `Downloaded ${material.name}.` });
    } catch (error) {
      setBanner({ type: 'error', text: error.message });
    }
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  return (
    <>
    <AppShell
      title="Student Dashboard"
      subtitle={`Welcome${session?.username ? `, ${session.username}` : ''}. ${course ? `You are enrolled in ${course}.` : ''} Watch lessons and download lecture materials.`}
      roleLabel="Student"
      onLogout={handleLogout}
      actions={<StatCard label="Course Progress" value={`${progressPercent}%`} />}
    >
      <div className="student-dashboard-view">
        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

      <section className="student-tools-row card">
        <label>
          Search modules or lectures
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by module name, lecture title, or description"
          />
        </label>
        {selectedModule ? (
          <>
            <label>
              Sort lectures
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="latest">Latest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A-Z</option>
              </select>
            </label>
            <button type="button" className={`secondary-btn ${showSavedOnly ? 'active' : ''}`} onClick={() => setShowSavedOnly((current) => !current)}>
              {showSavedOnly ? 'Showing Saved Only' : 'Filter Saved Only'}
            </button>
          </>
        ) : (
          <div className="progress-summary-box">
            <strong>{completedCount}/{videos.length} complete</strong>
            <span>Keep going to increase your score</span>
          </div>
        )}
      </section>

      {!selectedModule && favoriteVideos.length ? (
        <section className="card favorites-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Saved for Later</p>
              <h2>Your Favorites</h2>
            </div>
            <StatCard label="Saved" value={favoriteVideos.length} />
          </div>
          <div className="favorite-chip-row">
            {favoriteVideos.slice(0, 8).map((video) => (
              <button key={video._id} type="button" className="favorite-chip" onClick={() => setSelectedModule(video.module || 'General')}>
                <span>★</span>
                {video.title}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section-header standalone student-lecture-header">
        <div>
          <p className="eyebrow">Learning Content</p>
          {selectedModule ? (
            <>
              <h2>{course} - {selectedModule}</h2>
              <button
                className="back-btn small"
                onClick={() => setSelectedModule(null)}
                title="Back to modules"
              >
                ← Back to Modules
              </button>
            </>
          ) : (
            <h2>{course ? `${course} Modules` : 'Course Modules'}</h2>
          )}
        </div>
        {selectedModule && <StatCard label="Lectures in Module" value={displayedVideos.length} />}
        {!selectedModule && <StatCard label="Total Modules" value={modules.length} />}
      </section>

      {isLoading ? (
        <div className="video-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={`student-skeleton-${index}`} className="video-card skeleton-card">
              <div className="skeleton-box" />
              <div className="video-card-body">
                <div className="skeleton-line large" />
                <div className="skeleton-line" />
                <div className="skeleton-line" />
              </div>
            </article>
          ))}
        </div>
      ) : !selectedModule && visibleModules.length ? (
        // Module Selection View
        <div className="modules-view-container">
          <div className="modules-grid-student">
            {visibleModules.map((moduleKey) => (
              (() => {
                const module = moduleDisplayByKey[moduleKey];
                const moduleVideos = videosByModule[moduleKey] || [];
                const completedInModule = moduleVideos.filter((video) => completedIds.has(normalizeId(video._id))).length;
                const moduleQuizCount = (quizzesByModule[moduleKey] || []).length;
                const hasQuizAttempt = Boolean(latestAttemptByModule[moduleKey]);
                const lectureProgress = moduleVideos.length
                  ? Math.round((completedInModule / moduleVideos.length) * 100)
                  : 0;
                let moduleProgressPercent = lectureProgress;
                if (!moduleVideos.length && moduleQuizCount) {
                  moduleProgressPercent = hasQuizAttempt ? 100 : 0;
                } else if (moduleVideos.length && moduleQuizCount) {
                  moduleProgressPercent = Math.round((lectureProgress + (hasQuizAttempt ? 100 : 0)) / 2);
                }
                return (
                  <button
                    key={moduleKey}
                    className="module-card-btn"
                    onClick={() => setSelectedModule(module)}
                  >
                    <div className="module-card-header">
                      <span className="module-card-icon">📚</span>
                      <span className="module-card-count">{moduleVideos.length}</span>
                    </div>
                    <div className="module-card-body">
                      <h3 className="module-card-title">{module}</h3>
                      <p className="module-card-subtitle">
                        {moduleVideos.length} {moduleVideos.length === 1 ? 'lecture' : 'lectures'}
                        {moduleQuizCount ? ` • ${moduleQuizCount} ${moduleQuizCount === 1 ? 'quiz' : 'quizzes'}` : ''}
                      </p>
                      <p className="module-card-progress">
                        Progress: {moduleProgressPercent}%
                      </p>
                      {latestAttemptByModule[moduleKey] ? (
                        <p className="module-card-quiz-score">
                          Quiz: {latestAttemptByModule[moduleKey].score}/{latestAttemptByModule[moduleKey].total}
                        </p>
                      ) : null}
                    </div>
                    <span className="module-card-arrow">→</span>
                  </button>
                );
              })()
            ))}
          </div>
        </div>
      ) : selectedModule && displayedVideos.length ? (
        // Video Grid View (within selected module)
        <div className="video-grid">
          {displayedVideos.map((video) => (
            <VideoCard
              key={video._id}
              video={video}
              adminMode={false}
              downloadProgress={downloadProgress}
              onDownloadMaterial={handleDownload}
              onToggleFavorite={toggleFavorite}
              isFavorite={favoriteIds.has(normalizeId(video._id))}
              onToggleCompleted={toggleCompleted}
              isCompleted={completedIds.has(normalizeId(video._id))}
            />
          ))}
        </div>
      ) : (
        <p className="empty-state">
          {selectedModule 
            ? `No lectures available in ${selectedModule}.` 
            : 'No modules available for your course yet.'}
        </p>
      )}

      {!selectedModule && modules.length ? (
        <section className="card quiz-history-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Quiz Performance</p>
              <h2>Last score by module</h2>
            </div>
          </div>
          <div className="quiz-history-grid">
            {modules.map((moduleKey) => {
              const module = moduleDisplayByKey[moduleKey];
              const attempt = latestAttemptByModule[moduleKey];
              return (
                <article key={`history-${module}`} className="quiz-history-item">
                  <strong>{module}</strong>
                  {attempt ? (
                    <>
                      <span>Last: {attempt.score}/{attempt.total} ({Math.round((attempt.score / attempt.total) * 100)}%)</span>
                      <small>{new Date(attempt.submittedAt).toLocaleString()}</small>
                    </>
                  ) : (
                    <span>No attempts yet</span>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {selectedModule ? (
        <section className="card quiz-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Chapter Quiz</p>
              <h2>{selectedModule} Assessment</h2>
            </div>
            <StatCard label="Attempts" value={selectedModuleAttempts.length} />
          </div>

          {!moduleHasQuiz ? (
            <p className="empty-note">No quiz available for this module yet.</p>
          ) : loadingQuiz && !moduleQuizList.length ? (
            <p className="empty-note">Loading quizzes...</p>
          ) : moduleQuizList.length ? (
            <div className="quiz-picker-list">
              <p className="quiz-picker-prompt">
                {moduleQuizList.length === 1
                  ? 'This module has 1 quiz. Click it to open:'
                  : `This module has ${moduleQuizList.length} quizzes. Click one to begin:`}
              </p>
              {moduleQuizList.map((quiz) => {
                const isActive = moduleQuiz && String(moduleQuiz._id) === String(quiz._id);
                return (
                  <button
                    key={quiz._id}
                    type="button"
                    className={`quiz-picker-card${isActive ? ' quiz-picker-card--active' : ''}`}
                    disabled={loadingQuizDetailsId === String(quiz._id)}
                    onClick={() => isActive ? setQuizModalOpen(true) : handleSelectQuizFromList(quiz)}
                  >
                    <div className="quiz-picker-info">
                      <strong className="quiz-picker-title">{quiz.title}</strong>
                      <div className="quiz-picker-meta">
                        <span className={`quiz-difficulty quiz-difficulty-${quiz.difficulty || 'medium'}`}>{quiz.difficulty || 'medium'}</span>
                        <span>{getQuestionCount(quiz)} {getQuestionCount(quiz) === 1 ? 'question' : 'questions'}</span>
                        <span>{quiz.timeLimitMinutes} min</span>
                        {isActive ? <span className="quiz-in-progress-badge">● In Progress</span> : null}
                      </div>
                    </div>
                    <span className="quiz-picker-arrow" aria-hidden="true">
                      {loadingQuizDetailsId === String(quiz._id) ? '...' : isActive ? '↗ Resume' : '→'}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <button type="button" className="secondary-btn" onClick={handleLoadQuizForModule} disabled={loadingQuiz}>
              {loadingQuiz ? 'Loading quizzes...' : 'Retry loading quizzes'}
            </button>
          )}
        </section>
      ) : null}

        <section className="card feedback-form-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Feedback</p>
            <h2>Share your feedback</h2>
          </div>
        </div>

        <form onSubmit={handleFeedbackSubmit} className="feedback-form">
          <label>
            Rating
            <select {...registerFeedback('rating')}>
              <option value="5">5 - Excellent</option>
              <option value="4">4 - Good</option>
              <option value="3">3 - Average</option>
              <option value="2">2 - Needs improvement</option>
              <option value="1">1 - Poor</option>
            </select>
          </label>

          <label>
            Message
            <textarea
              rows="4"
              placeholder="Tell us what can be improved or what you liked most"
              maxLength={1000}
              {...registerFeedback('message', { required: 'Please add your feedback message.' })}
            />
          </label>

          <button className="primary-btn" type="submit" disabled={isSubmittingFeedback}>
            {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </form>

        {feedbackInlineError ? <p className="inline-message error">{feedbackInlineError}</p> : null}
        </section>
      </div>

      {feedbackToast ? (
        <aside className={`feedback-toast ${feedbackToast.type}${isFeedbackToastDismissing ? ' feedback-toast-dismissing' : ''}`} role="status" aria-live="polite">
          <span>{feedbackToast.text}</span>
          <button type="button" className="feedback-toast-close" onClick={dismissFeedbackToast} aria-label="Dismiss feedback message">
            ×
          </button>
        </aside>
      ) : null}

      </AppShell>

      {/* ── Quiz Full-Screen Modal Outside AppShell ── */}
      <QuizModal
        open={quizModalOpen}
        title={moduleQuiz?.title || 'Quiz'}
        onClose={handleCloseQuizModal}
        showExitConfirm={showExitConfirm}
        onCancelExit={() => setShowExitConfirm(false)}
        onConfirmExit={handleConfirmExit}
      >
        {moduleQuiz && !quizResult ? (
          <form className="quiz-form" onSubmit={handleSubmitQuiz}>
            <div className="quiz-meta-strip">
              <span className={`quiz-difficulty quiz-difficulty-${moduleQuiz.difficulty || 'medium'}`}>
                Difficulty: {moduleQuiz.difficulty || 'medium'}
              </span>
              <span className={`quiz-timer ${quizSecondsLeft <= 30 ? 'quiz-timer-warning' : ''}`}>
                Time Left: {formatTimer(quizSecondsLeft)}
              </span>
            </div>
            {moduleQuiz.questions.map((question, index) => (
              <div key={`${question.question}-${index}`} className="quiz-question-card">
                <p><strong>Q{index + 1}.</strong> {question.question}</p>
                <div className="quiz-options-grid">
                  {question.options.map((option, optionIndex) => {
                    const isSelected = quizAnswers[index] === optionIndex;
                    return (
                      <label key={`${option}-${optionIndex}`} className={`quiz-option${isSelected ? ' is-selected' : ''}`}>
                        <input
                          type="radio"
                          name={`question-${index}`}
                          checked={quizAnswers[index] === optionIndex}
                          onChange={() => {
                            const next = [...quizAnswers];
                            next[index] = optionIndex;
                            setQuizAnswers(next);
                          }}
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            <button type="submit" className="primary-btn" disabled={submittingQuiz}>
              {submittingQuiz ? 'Submitting...' : 'Submit Quiz'}
            </button>
          </form>
        ) : moduleQuiz && quizResult ? (
          <section className="quiz-thankyou-pop" role="status" aria-live="polite">
            <h3>Thank you for submitting!</h3>
            <p>You have completed the quiz for {selectedModule}.</p>
            <div className="quiz-result-box">
              <strong>Your Score: {quizResult.score}/{quizResult.total}</strong>
              <span>Percentage: {quizResult.percentage}%</span>
            </div>
            <div className="quiz-thankyou-actions">
              {moduleQuizList.length > 1 ? (
                <button type="button" className="secondary-btn" onClick={handleBackToQuizList}>
                  ← All Quizzes
                </button>
              ) : null}
              <button type="button" className="secondary-btn" onClick={() => setShowQuizReview((c) => !c)}>
                {showQuizReview ? 'Hide Review' : 'Review Answers'}
              </button>
              <button type="button" className="primary-btn" onClick={handleRetakeQuiz}>
                Take Test Again
              </button>
              <button type="button" className="secondary-btn" onClick={handleCloseQuizModal}>
                Close
              </button>
            </div>

            {showQuizReview ? (
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
                  <p className="empty-note">Review details are not available. Please retake the quiz.</p>
                )}
              </div>
            ) : null}
          </section>
        ) : null}
      </QuizModal>
    </>
  );
}
