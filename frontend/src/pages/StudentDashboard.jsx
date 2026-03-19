import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { downloadMaterial, requestJson } from '../api';
import logoImg from '../assets/biomics-logo.jpeg';
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
  const { session, logout, login } = useSessionStore();

  const {
    videos, course, favoriteIds, completedIds, quizzes, quizAttempts,
    isLoading, loadError, toggleFavorite, toggleCompleted, refreshAttempts,
    favMutError, progressMutError
  } = useCourseData();

  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [banner, setBanner] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({});
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ username: '', phone: '', city: '', password: '' });
  const [profileMessage, setProfileMessage] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [liveClass, setLiveClass] = useState(null); // { active, title, meetUrl, startedAt }

  const profilePasswordHint =
    profileForm.password.length > 0 && profileForm.password.length < 8
      ? 'Password must be at least 8 characters.'
      : null;

  const selectedModuleName = selectedModule?.name || '';
  const selectedModuleCourse = selectedModule?.category || '';
  const quizEnabledForSelection = Boolean(selectedModuleName) && selectedModuleCourse === course;

  const {
    moduleQuiz, moduleQuizList, quizAnswers, quizResult, quizReview,
    showQuizReview, quizSecondsLeft, loadingQuiz, loadingQuizDetailsId, submittingQuiz,
    moduleHasQuiz, setQuizAnswers, setShowQuizReview,
    handleSelectQuizFromList, handleBackToQuizList, handleRetakeQuiz,
    handleSubmitQuiz, handleLoadQuizForModule
  } = useQuizSession({
    selectedModule: quizEnabledForSelection ? selectedModuleName : null,
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

  function normalizeCourseName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function resolveModuleKey(categoryName, moduleName) {
    const safeCategory = normalizeCourseName(categoryName || 'General');
    return `${safeCategory}::${normalizeModuleName(moduleName || 'General')}`;
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

  const moduleMetaByKey = {};
  const availableCourses = Array.from(new Set(videos.map((video) => normalizeCourseName(video.category || '')).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const activeCourseFilter = selectedCourseFilter === 'all' ? '' : selectedCourseFilter;

  // Group videos by course+module key.
  const videosByModule = videos.reduce((acc, video) => {
    const category = normalizeCourseName(video.category || 'General');
    const displayModule = String(video.module || 'General').trim() || 'General';
    const moduleKey = resolveModuleKey(category, displayModule);
    if (!moduleMetaByKey[moduleKey]) {
      moduleMetaByKey[moduleKey] = { module: displayModule, category };
    }
    if (!acc[moduleKey]) {
      acc[moduleKey] = [];
    }
    acc[moduleKey].push(video);
    return acc;
  }, {});

  const quizzesByModule = quizzes.reduce((acc, quiz) => {
    const category = normalizeCourseName(quiz.category || course || 'General');
    const displayModule = String(quiz.module || 'General').trim() || 'General';
    const moduleKey = resolveModuleKey(category, displayModule);
    if (!moduleMetaByKey[moduleKey]) {
      moduleMetaByKey[moduleKey] = { module: displayModule, category };
    }
    if (!acc[moduleKey]) {
      acc[moduleKey] = [];
    }
    acc[moduleKey].push(quiz);
    return acc;
  }, {});

  quizAttempts.forEach((attempt) => {
    const category = normalizeCourseName(attempt.category || course || 'General');
    const displayModule = String(attempt.module || 'General').trim() || 'General';
    const moduleKey = resolveModuleKey(category, displayModule);
    if (!moduleMetaByKey[moduleKey]) {
      moduleMetaByKey[moduleKey] = { module: displayModule, category };
    }
  });

  const modules = Object.keys(moduleMetaByKey)
    .filter((moduleKey) => {
      if (!activeCourseFilter) return true;
      return moduleMetaByKey[moduleKey].category === activeCourseFilter;
    })
    .sort((a, b) => {
      const aMeta = moduleMetaByKey[a];
      const bMeta = moduleMetaByKey[b];
      if (aMeta.category !== bMeta.category) return aMeta.category.localeCompare(bMeta.category);
      return aMeta.module.localeCompare(bMeta.module);
    });

  const visibleModules = modules.filter((moduleKey) => {
    const moduleMeta = moduleMetaByKey[moduleKey];
    const moduleName = moduleMeta.module;
    const courseName = moduleMeta.category;
    if (!query) return true;
    if (moduleName.toLowerCase().includes(query)) return true;
    if (courseName.toLowerCase().includes(query)) return true;

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

  const selectedModuleKey = selectedModule
    ? resolveModuleKey(selectedModuleCourse, selectedModuleName)
    : '';
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
  const videosForActiveFilter = activeCourseFilter
    ? videos.filter((video) => normalizeCourseName(video.category || 'General') === activeCourseFilter)
    : videos;
  const progressScopeVideos = selectedModule ? selectedModuleVideos : videosForActiveFilter;
  const progressScopeCompletedCount = progressScopeVideos.filter((video) => completedIds.has(normalizeId(video._id))).length;
  const progressScopePercent = progressScopeVideos.length
    ? Math.round((progressScopeCompletedCount / progressScopeVideos.length) * 100)
    : 0;
  const progressScopeLabel = selectedModule
    ? `${selectedModuleCourse} • ${selectedModuleName}`
    : (activeCourseFilter || 'All Courses');
  const selectedModuleAttempts = selectedModule
    ? quizAttempts.filter((attempt) => {
      const sameModule = normalizeModuleName(attempt.module) === normalizeModuleName(selectedModuleName);
      const sameCategory = normalizeCourseName(attempt.category || course || '') === normalizeCourseName(selectedModuleCourse || '');
      return sameModule && sameCategory;
    })
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
    const moduleKey = resolveModuleKey(attempt.category || course || 'General', attempt.module || 'General');
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

  useEffect(() => {
    if (!profileMessage) return undefined;
    const timer = window.setTimeout(() => setProfileMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [profileMessage]);

  useEffect(() => {
    if (!profileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [profileOpen]);

  useEffect(() => {
    let cancelled = false;
    setIsProfileLoading(true);
    requestJson('/auth/me')
      .then((data) => {
        if (cancelled) return;
        const user = data?.user || null;
        setProfile(user);
        setProfileForm({
          username: user?.username || '',
          phone: user?.phone || '',
          city: user?.city || '',
          password: ''
        });
      })
      .catch((error) => {
        if (!cancelled) setBanner({ type: 'error', text: error.message });
      })
      .finally(() => {
        if (!cancelled) setIsProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  // Poll for live class status every 5 seconds
  useEffect(() => {
    let cancelled = false;
    async function checkLive() {
      try {
        const data = await requestJson('/live/status');
        if (!cancelled) {
          if (data.active) {
            setLiveClass(data);
          } else {
            setLiveClass(null);
          }
        }
      } catch {
        // silently ignore — non-critical
      }
    }
    checkLive();
    const interval = window.setInterval(checkLive, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

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

  async function handleSaveProfile(event) {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      const payload = {
        username: profileForm.username.trim(),
        phone: profileForm.phone.trim(),
        city: profileForm.city.trim()
      };
      if (profileForm.password.trim()) {
        payload.password = profileForm.password;
      }

      const response = await requestJson('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      setProfile(response.user);
      setProfileForm((current) => ({
        ...current,
        username: response.user.username,
        phone: response.user.phone,
        city: response.user.city,
        password: ''
      }));
      login({
        role: 'user',
        username: response.user.username,
        token: response.token
      });
      setProfileMessage({ type: 'success', text: response.message || 'Profile updated successfully.' });
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message });
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    setIsUploadingAvatar(true);
    setProfileMessage(null);
    try {
      const response = await requestJson('/auth/me/avatar', {
        method: 'POST',
        body: formData
      });
      setProfile(response.user);
      setProfileMessage({ type: 'success', text: response.message || 'Profile photo updated successfully.' });
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message });
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = '';
    }
  }

  async function handleDeleteAvatar() {
    setIsUploadingAvatar(true);
    setProfileMessage(null);
    try {
      const response = await requestJson('/auth/me/avatar', {
        method: 'DELETE'
      });
      setProfile(response.user);
      setProfileMessage({ type: 'success', text: response.message || 'Profile photo removed successfully.' });
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message });
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  const profileAvatarUrl = profile?.avatarUrl
    ? `${import.meta.env.VITE_API_URL || ''}${profile.avatarUrl}`
    : '';
  const profileInitial = (profile?.username || session?.username || 'S').trim().charAt(0).toUpperCase();

  return (
    <>
    <AppShell
      title="Student Dashboard"
      subtitle={`Welcome${session?.username ? `, ${session.username}` : ''}. ${course ? `You are enrolled in ${course}.` : ''} Watch lessons and download lecture materials.`}
      roleLabel="Student"
      actions={(
        <div className="profile-trigger-wrap">
          <button
            type="button"
            className="profile-icon-btn"
            onClick={() => setProfileOpen(true)}
            aria-label="Open profile settings"
            title="Profile settings"
          >
            {profileAvatarUrl ? (
              <img src={profileAvatarUrl} alt="Student profile" className="profile-icon-image" />
            ) : (
              <span className="profile-icon-fallback">{profileInitial}</span>
            )}
          </button>
          <div className="profile-hover-card" aria-hidden="true">
            <strong>{profile?.username || session?.username || 'Student'}</strong>
            <span>{profile?.class || course || 'Course unavailable'}</span>
            <span>{profile?.city || 'City unavailable'}</span>
          </div>
        </div>
      )}
    >
      <div className="student-dashboard-view">
        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        {/* ── Live Class Banner ──────────────────────────── */}
        {liveClass ? (
          <section className="live-class-student-banner card">
            <div className="live-class-banner-info">
              <span className="live-badge pulsing">LIVE NOW</span>
              <div>
                <strong className="live-class-title-display">{liveClass.title}</strong>
                <span className="live-class-since">⏰ Live since {new Date(liveClass.startedAt).toLocaleTimeString()}</span>
              </div>
            </div>
            <a
              href={liveClass.meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="primary-btn live-join-btn"
            >
              📹 Join Google Meet
            </a>
          </section>
        ) : null}

      <section className="student-tools-row card">
        <label>
          Search modules or lectures
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by module name, lecture title, or description"
          />
        </label>
        <label>
          Filter by course
          <select
            value={selectedCourseFilter}
            onChange={(event) => {
              setSelectedCourseFilter(event.target.value);
              setSelectedModule(null);
            }}
          >
            <option value="all">All Courses</option>
            {availableCourses.map((courseName) => (
              <option key={courseName} value={courseName}>{courseName}</option>
            ))}
          </select>
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
        ) : null}

        <div className="progress-summary-box">
          <strong>{progressScopeCompletedCount}/{progressScopeVideos.length} complete</strong>
          <span>{progressScopeLabel} progress: {progressScopePercent}%</span>
        </div>
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
              <button
                key={video._id}
                type="button"
                className="favorite-chip"
                onClick={() => setSelectedModule({
                  name: String(video.module || 'General').trim() || 'General',
                  category: normalizeCourseName(video.category || 'General')
                })}
              >
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
              <h2>{selectedModuleCourse} - {selectedModuleName}</h2>
              <button
                className="back-btn small"
                onClick={() => setSelectedModule(null)}
                title="Back to modules"
              >
                ← Back to Modules
              </button>
            </>
          ) : (
            <h2>{activeCourseFilter ? `${activeCourseFilter} Modules` : 'All Course Modules'}</h2>
          )}
        </div>
        {selectedModule && <StatCard label="Lectures in Module" value={displayedVideos.length} />}
        {!selectedModule && <StatCard label="Total Modules" value={visibleModules.length} />}
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
            {visibleModules.map((moduleKey) => {
              const moduleMeta = moduleMetaByKey[moduleKey];
              const module = moduleMeta.module;
              const moduleCourse = moduleMeta.category;
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
                  onClick={() => setSelectedModule({ name: module, category: moduleCourse })}
                >
                  <div className="module-card-header">
                    <span className="module-card-icon">📚</span>
                    <span className="module-card-count">{moduleVideos.length}</span>
                  </div>
                  <div className="module-card-body">
                    <h3 className="module-card-title">{module}</h3>
                    {selectedCourseFilter === 'all' ? <p className="module-card-course">{moduleCourse}</p> : null}
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
            })}
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
            ? `No lectures available in ${selectedModuleName}.`
            : (activeCourseFilter ? `No modules available for ${activeCourseFilter}.` : 'No modules available yet.')}
        </p>
      )}

      {!selectedModule && visibleModules.length ? (
        <section className="card quiz-history-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Quiz Performance</p>
              <h2>Last score by module</h2>
            </div>
          </div>
          <div className="quiz-history-grid">
            {visibleModules.map((moduleKey) => {
              const moduleMeta = moduleMetaByKey[moduleKey];
              const module = moduleMeta.module;
              const moduleCourse = moduleMeta.category;
              const attempt = latestAttemptByModule[moduleKey];
              return (
                <article key={`history-${moduleKey}`} className="quiz-history-item">
                  <strong>{module}</strong>
                  {selectedCourseFilter === 'all' ? <small>{moduleCourse}</small> : null}
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
              <h2>{selectedModuleName} Assessment</h2>
            </div>
            <StatCard label="Attempts" value={selectedModuleAttempts.length} />
          </div>

          {!quizEnabledForSelection ? (
            <p className="empty-note">Quizzes are currently enabled only for your enrolled course ({course || 'your profile course'}).</p>
          ) : !moduleHasQuiz ? (
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

      {/* ── Footer ──────────────────────────────────── */}
      <footer className="student-footer">
        <div className="footer-grid">
          <div className="footer-brand-col">
            <img src={logoImg} alt="Biomics Hub" className="footer-logo" />
            <p className="footer-tagline">Empowering students with quality science education</p>
          </div>
          <div className="footer-col">
            <h4>About Us</h4>
            <p>Biomics Hub is a premier online learning platform for Biology, Chemistry and Life Sciences. We help students excel in NEET, IIT-JAM, CSIR-NET, GATE and school board examinations.</p>
          </div>
          <div className="footer-col">
            <h4>Contact</h4>
            <p>&#x1F4CD; 123 Science Park, Sector 15<br/>Bhubaneswar, Odisha – 751024</p>
            <p>&#x1F4DE; +91 98765 43210</p>
            <p>&#x2709;&#xFE0F; support@biomicshub.in</p>
          </div>
          <div className="footer-col">
            <h4>Quick Links</h4>
            <ul className="footer-links">
              <li>Courses</li>
              <li>Live Classes</li>
              <li>Study Material</li>
              <li>Quiz Builder</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Biomics Hub. All rights reserved.</span>
        </div>
      </footer>

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
            <p>You have completed the quiz for {selectedModuleName}.</p>
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

      {profileOpen ? (
        <div className="profile-modal-backdrop" onClick={() => setProfileOpen(false)}>
          <section className="profile-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-modal-header">
              <div>
                <p className="eyebrow">Student Profile</p>
                <h2>Profile Settings</h2>
              </div>
              <button type="button" className="quiz-modal-close-btn" onClick={() => setProfileOpen(false)} aria-label="Close profile settings">
                ×
              </button>
            </div>

            {isProfileLoading ? (
              <p className="empty-note">Loading profile...</p>
            ) : (
              <div className="profile-modal-body">
                <aside className="profile-summary-card">
                  <div className="profile-avatar-large">
                    {profileAvatarUrl ? (
                      <img src={profileAvatarUrl} alt="Student profile" className="profile-avatar-large-image" />
                    ) : (
                      <span>{profileInitial}</span>
                    )}
                  </div>
                  <label className="profile-photo-upload">
                    <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={isUploadingAvatar} />
                    <span>{isUploadingAvatar ? 'Uploading...' : 'Change Photo'}</span>
                  </label>
                  <button
                    type="button"
                    className="secondary-btn profile-delete-photo-btn"
                    onClick={handleDeleteAvatar}
                    disabled={!profileAvatarUrl || isUploadingAvatar}
                  >
                    Delete Photo
                  </button>
                  <div className="profile-summary-list">
                    <div><span>Username</span><strong>{profile?.username || '-'}</strong></div>
                    <div><span>Phone</span><strong>{profile?.phone || '-'}</strong></div>
                    <div><span>Course</span><strong>{profile?.class || '-'}</strong></div>
                    <div><span>City</span><strong>{profile?.city || '-'}</strong></div>
                  </div>
                </aside>

                <form className="profile-edit-form" onSubmit={handleSaveProfile}>
                  <label>
                    Username
                    <input
                      type="text"
                      value={profileForm.username}
                      onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))}
                      placeholder="Update username"
                    />
                  </label>
                  <label>
                    Phone Number
                    <input
                      type="text"
                      value={profileForm.phone}
                      onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="10-digit phone"
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    City
                    <input
                      type="text"
                      value={profileForm.city}
                      onChange={(event) => setProfileForm((current) => ({ ...current, city: event.target.value }))}
                      placeholder="Update city"
                    />
                  </label>
                  <label>
                    New Password
                    <input
                      type="password"
                      value={profileForm.password}
                      onChange={(event) => setProfileForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Minimum 8 characters"
                    />
                    {profilePasswordHint ? <small className="field-hint">⚠ {profilePasswordHint}</small> : null}
                  </label>
                  <label>
                    Enrolled Course
                    <input type="text" value={profile?.class || ''} disabled />
                  </label>

                  <div className="profile-edit-actions">
                    <button type="submit" className="primary-btn" disabled={isSavingProfile}>
                      {isSavingProfile ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button type="button" className="secondary-btn" onClick={handleLogout}>
                      Logout
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => setProfileOpen(false)}>
                      Close
                    </button>
                  </div>
                  {profileMessage ? <p className={`inline-message ${profileMessage.type}`}>{profileMessage.text}</p> : null}
                </form>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
