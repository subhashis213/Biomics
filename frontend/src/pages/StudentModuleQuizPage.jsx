import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchModuleTopics, requestJson } from '../api';

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return String(value || '');
  }
}

function getQuestionCount(quiz) {
  return Math.max(
    Number(quiz?.questionCount) || 0,
    Array.isArray(quiz?.questions) ? quiz.questions.length : 0
  );
}

export default function StudentModuleQuizPage() {
  const navigate = useNavigate();
  const { courseName, moduleName } = useParams();

  const decodedCourseName = normalizeText(safeDecode(courseName) || 'General');
  const decodedModuleName = normalizeText(safeDecode(moduleName) || 'General');

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [allModuleQuizzes, setAllModuleQuizzes] = useState([]);
  const [catalogTopics, setCatalogTopics] = useState([]);
  const [topicsLoadedFromCatalog, setTopicsLoadedFromCatalog] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    const courseQuery = decodedCourseName
      ? `?course=${encodeURIComponent(decodedCourseName)}`
      : '';

    requestJson(`/quizzes/my-course/${encodeURIComponent(decodedModuleName)}${courseQuery}`)
      .then((data) => {
        if (cancelled) return;
        const quizList = Array.isArray(data?.quizzes) ? data.quizzes : [];
        setAllModuleQuizzes(quizList);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error.message || 'Failed to load quizzes for this module.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [decodedCourseName, decodedModuleName]);

  useEffect(() => {
    let cancelled = false;
    setCatalogTopics([]);
    setTopicsLoadedFromCatalog(false);

    fetchModuleTopics(decodedCourseName, decodedModuleName)
      .then((data) => {
        if (cancelled) return;
        const topics = Array.isArray(data?.topics)
          ? data.topics.map((entry) => normalizeText(entry?.name || '')).filter(Boolean)
          : [];
        setCatalogTopics(topics);
        setTopicsLoadedFromCatalog(true);
      })
      .catch(() => {
        if (!cancelled) setTopicsLoadedFromCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [decodedCourseName, decodedModuleName]);

  const topicFolders = useMemo(() => {
    if (topicsLoadedFromCatalog) {
      return Array.from(new Set(catalogTopics)).sort((a, b) => a.localeCompare(b));
    }
    return Array.from(new Set(
      allModuleQuizzes
        .map((quiz) => normalizeText(quiz?.topic || 'General'))
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));
  }, [allModuleQuizzes, catalogTopics, topicsLoadedFromCatalog]);

  const hasTopicFolders = topicFolders.some((topic) => topic.toLowerCase() !== 'general');

  const quizCountByTopic = useMemo(() => {
    return allModuleQuizzes.reduce((acc, quiz) => {
      const topic = normalizeText(quiz?.topic || 'General');
      acc[topic] = (acc[topic] || 0) + 1;
      return acc;
    }, {});
  }, [allModuleQuizzes]);

  const visibleTopicFolders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return topicFolders;
    return topicFolders.filter((topic) => topic.toLowerCase().includes(query));
  }, [topicFolders, searchQuery]);

  const filteredQuizzes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const allowedTopicSet = topicsLoadedFromCatalog
      ? new Set(topicFolders.map((topic) => topic.toLowerCase()))
      : null;
    return allModuleQuizzes.filter((quiz) => {
      const quizTopic = normalizeText(quiz?.topic || 'General');
      if (allowedTopicSet && !allowedTopicSet.has(quizTopic.toLowerCase())) return false;
      if (hasTopicFolders && selectedTopic) {
        if (quizTopic !== selectedTopic) return false;
      }
      if (!query) return true;
      const haystack = `${quiz?.title || ''} ${quiz?.difficulty || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [allModuleQuizzes, hasTopicFolders, selectedTopic, searchQuery, topicsLoadedFromCatalog, topicFolders]);

  function handleBack() {
    if (selectedTopic) {
      setSelectedTopic('');
      setSearchQuery('');
      return;
    }
    navigate(`/student/module/${encodeURIComponent(decodedCourseName || 'General')}/${encodeURIComponent(decodedModuleName || 'General')}`);
  }

  return (
    <main className="lecture-page lecture-enter">
      <header className="lecture-page-hero lecture-enter-stage-1">
        <div className="lecture-page-hero-left">
          <p className="eyebrow">Quiz Workspace</p>
          <h1>{decodedModuleName}</h1>
          <p className="lecture-page-subtitle">
            {decodedCourseName} • {hasTopicFolders && !selectedTopic ? 'Topic Folders' : 'Quiz List'}
          </p>
        </div>
        <div className="lecture-page-hero-actions">
          <button type="button" className="secondary-btn" onClick={handleBack}>
            {selectedTopic ? '← Back to Topic Folders' : '← Back to Module Sections'}
          </button>
          <span className="lecture-total-chip">
            {hasTopicFolders && !selectedTopic
              ? `${visibleTopicFolders.length} topic folder${visibleTopicFolders.length === 1 ? '' : 's'}`
              : `${filteredQuizzes.length} quiz${filteredQuizzes.length === 1 ? '' : 'zes'}`}
          </span>
        </div>
      </header>

      <section className="lecture-tools-panel lecture-enter-stage-2">
        <label>
          {hasTopicFolders && !selectedTopic ? 'Search topic folders' : 'Search quizzes'}
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={hasTopicFolders && !selectedTopic ? 'Search by topic name' : 'Search by quiz title or difficulty'}
          />
        </label>
      </section>

      {isLoading ? <p className="empty-note">Loading quizzes...</p> : null}
      {!isLoading && loadError ? <p className="inline-message error">{loadError}</p> : null}

      {!isLoading && !loadError && hasTopicFolders && !selectedTopic ? (
        <section className="lecture-topic-stage lecture-enter-stage-3">
          {visibleTopicFolders.length ? (
            <div className="lecture-topic-grid student-quiz-topic-grid">
              {visibleTopicFolders.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  className="lecture-topic-card student-quiz-topic-card"
                  onClick={() => {
                    setSelectedTopic(topic);
                    setSearchQuery('');
                  }}
                >
                  <span className="lecture-topic-icon" aria-hidden="true">🧪</span>
                  <strong>{topic}</strong>
                  <div className="lecture-topic-badges">
                    <span className="lecture-topic-badge lecture-topic-badge-quizzes">
                      {quizCountByTopic[topic] || 0} {(quizCountByTopic[topic] || 0) === 1 ? 'quiz set' : 'quiz sets'}
                    </span>
                  </div>
                  <span>Open quizzes</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-state">No topics found for this module.</p>
          )}
        </section>
      ) : null}

      {!isLoading && !loadError && (!hasTopicFolders || selectedTopic) ? (
        <section className="card quiz-panel lecture-enter-stage-3">
          {filteredQuizzes.length ? (
            <div className="quiz-picker-list">
              <p className="quiz-picker-prompt">
                {filteredQuizzes.length === 1
                  ? 'This topic has 1 quiz. Click it to open:'
                  : `This topic has ${filteredQuizzes.length} quizzes. Click one to begin:`}
              </p>
              {filteredQuizzes.map((quiz) => (
                <button
                  key={quiz._id}
                  type="button"
                  className="quiz-picker-card"
                  onClick={() => navigate(`/student/quiz/${encodeURIComponent(quiz._id)}?module=${encodeURIComponent(decodedModuleName || quiz.module || '')}`)}
                >
                  <div className="quiz-picker-info">
                    <strong className="quiz-picker-title">{quiz.title}</strong>
                    <div className="quiz-picker-meta">
                      <span className={`quiz-difficulty quiz-difficulty-${quiz.difficulty || 'medium'}`}>{quiz.difficulty || 'medium'}</span>
                      <span>{getQuestionCount(quiz)} {getQuestionCount(quiz) === 1 ? 'question' : 'questions'}</span>
                      <span>{quiz.timeLimitMinutes || 15} min</span>
                    </div>
                  </div>
                  <span className="quiz-picker-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-note">No quizzes found for this selection.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
