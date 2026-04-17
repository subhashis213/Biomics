import { useMemo, useState } from 'react';

function normalizeText(value) {
  return String(value || '').trim();
}

function sortWithGeneralFirst(left, right) {
  if (left === 'General' && right !== 'General') return -1;
  if (right === 'General' && left !== 'General') return 1;
  return left.localeCompare(right);
}

function groupTopicTests(tests, searchTerm) {
  const normalizedSearch = normalizeText(searchTerm).toLowerCase();
  const filteredTests = Array.isArray(tests)
    ? tests.filter((test) => {
        if (!normalizedSearch) return true;
        return [test?.title, test?.module, test?.topic, test?.category, test?.difficulty]
          .some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      })
    : [];

  const modules = new Map();

  filteredTests.forEach((test) => {
    const moduleName = normalizeText(test?.module) || 'General';
    const topicName = normalizeText(test?.topic) || 'General';

    if (!modules.has(moduleName)) {
      modules.set(moduleName, {
        name: moduleName,
        tests: [],
        topics: new Map()
      });
    }

    const moduleGroup = modules.get(moduleName);
    moduleGroup.tests.push(test);

    if (!moduleGroup.topics.has(topicName)) {
      moduleGroup.topics.set(topicName, {
        name: topicName,
        tests: []
      });
    }

    moduleGroup.topics.get(topicName).tests.push(test);
  });

  return Array.from(modules.values())
    .sort((left, right) => sortWithGeneralFirst(left.name, right.name))
    .map((moduleGroup) => ({
      ...moduleGroup,
      topics: Array.from(moduleGroup.topics.values())
        .sort((left, right) => sortWithGeneralFirst(left.name, right.name))
    }));
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function TopicTestCatalogBoard({
  tests,
  mode = 'student',
  title,
  subtitle,
  emptyMessage,
  searchValue,
  onSearchChange,
  toolbar,
  renderCardActions
}) {
  const [localSearch, setLocalSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const effectiveSearch = typeof searchValue === 'string' ? searchValue : localSearch;
  const setEffectiveSearch = onSearchChange || setLocalSearch;

  const groupedModules = useMemo(
    () => groupTopicTests(tests, effectiveSearch),
    [tests, effectiveSearch]
  );

  const summary = useMemo(() => {
    const moduleCount = groupedModules.length;
    const topicCount = groupedModules.reduce((count, moduleGroup) => count + moduleGroup.topics.length, 0);
    const testCount = groupedModules.reduce((count, moduleGroup) => count + moduleGroup.tests.length, 0);
    return { moduleCount, topicCount, testCount };
  }, [groupedModules]);

  const activeModule = useMemo(
    () => groupedModules.find((moduleGroup) => moduleGroup.name === selectedModule) || null,
    [groupedModules, selectedModule]
  );

  const activeTopic = useMemo(
    () => activeModule?.topics.find((topicGroup) => topicGroup.name === selectedTopic) || null,
    [activeModule, selectedTopic]
  );

  const currentStep = activeTopic ? 'tests' : activeModule ? 'topics' : 'modules';

  function openModule(moduleName) {
    setSelectedModule(moduleName);
    setSelectedTopic('');
  }

  function openTopic(topicName) {
    setSelectedTopic(topicName);
  }

  function goBackToModules() {
    setSelectedModule('');
    setSelectedTopic('');
  }

  function goBackToTopics() {
    setSelectedTopic('');
  }

  return (
    <section className={`ts-topic-catalog ts-topic-catalog-${mode}`}>
      <div className="ts-topic-catalog-header">
        <div className="ts-topic-catalog-copy">
          <p className="eyebrow">Organized Topic Test View</p>
          <h3>{title}</h3>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>
        <div className="ts-topic-catalog-tools">
          <label className="ts-topic-search">
            <span>Search</span>
            <input
              type="text"
              value={effectiveSearch}
              onChange={(event) => setEffectiveSearch(event.target.value)}
              placeholder="Filter by module, topic or test title"
            />
          </label>
          {toolbar ? <div className="ts-topic-toolbar">{toolbar}</div> : null}
        </div>
      </div>

      <div className="ts-topic-summary-strip">
        <article className="ts-topic-summary-card">
          <span>Modules</span>
          <strong>{summary.moduleCount}</strong>
        </article>
        <article className="ts-topic-summary-card">
          <span>Topics</span>
          <strong>{summary.topicCount}</strong>
        </article>
        <article className="ts-topic-summary-card">
          <span>Tests</span>
          <strong>{summary.testCount}</strong>
        </article>
      </div>

      <div className="ts-topic-pathbar">
        <div className="ts-topic-breadcrumbs" aria-label="Organizer path">
          <button type="button" className={`ts-topic-crumb${currentStep === 'modules' ? ' active' : ''}`} onClick={goBackToModules}>
            Modules
          </button>
          <span>/</span>
          <button
            type="button"
            className={`ts-topic-crumb${currentStep === 'topics' ? ' active' : ''}`}
            onClick={activeModule ? goBackToTopics : undefined}
            disabled={!activeModule}
          >
            {activeModule ? activeModule.name : 'Topics'}
          </button>
          <span>/</span>
          <span className={`ts-topic-crumb static${currentStep === 'tests' ? ' active' : ''}`}>
            {activeTopic ? activeTopic.name : 'Tests'}
          </span>
        </div>
        <p className="ts-topic-step-note">
          {currentStep === 'modules' && 'Step 1: pick a module.'}
          {currentStep === 'topics' && 'Step 2: choose a topic inside this module.'}
          {currentStep === 'tests' && 'Step 3: open the test from this topic.'}
        </p>
      </div>

      {groupedModules.length ? (
        <>
          {currentStep === 'modules' ? (
            <div className="ts-topic-module-grid">
              {groupedModules.map((moduleGroup) => (
                <button
                  key={moduleGroup.name}
                  type="button"
                  className="ts-topic-module-card ts-topic-module-button"
                  onClick={() => openModule(moduleGroup.name)}
                >
                  <header className="ts-topic-module-head">
                    <div>
                      <p className="ts-topic-module-label">Module</p>
                      <h4>{moduleGroup.name}</h4>
                    </div>
                    <div className="ts-topic-module-meta">
                      <span>{pluralize(moduleGroup.topics.length, 'topic', 'topics')}</span>
                      <span>{pluralize(moduleGroup.tests.length, 'test', 'tests')}</span>
                    </div>
                  </header>
                  <p className="ts-topic-module-description">
                    Open this module to see all topic containers in a dedicated next step.
                  </p>
                  <span className="ts-topic-open-link">Open Topics</span>
                </button>
              ))}
            </div>
          ) : null}

          {currentStep === 'topics' && activeModule ? (
            <div className="ts-topic-focus-shell">
              <div className="ts-topic-focus-head">
                <div>
                  <p className="ts-topic-module-label">Selected Module</p>
                  <h4>{activeModule.name}</h4>
                  <p className="subtitle">Now choose a topic to see the quizzes in a cleaner final list.</p>
                </div>
                <button type="button" className="secondary-btn" onClick={goBackToModules}>
                  All Modules
                </button>
              </div>
              <div className="ts-topic-bucket-grid topics-only">
                {activeModule.topics.map((topicGroup) => (
                  <button
                    key={`${activeModule.name}-${topicGroup.name}`}
                    type="button"
                    className="ts-topic-bucket-card ts-topic-bucket-button"
                    onClick={() => openTopic(topicGroup.name)}
                  >
                    <div className="ts-topic-bucket-head">
                      <div>
                        <p className="ts-topic-bucket-label">Topic</p>
                        <h5>{topicGroup.name}</h5>
                      </div>
                      <span className="ts-topic-bucket-count">{pluralize(topicGroup.tests.length, 'test', 'tests')}</span>
                    </div>
                    <p className="ts-topic-bucket-description">
                      Open this topic to see all tests in a proper quiz list.
                    </p>
                    <span className="ts-topic-open-link">Open Quizzes</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {currentStep === 'tests' && activeModule && activeTopic ? (
            <div className="ts-topic-focus-shell">
              <div className="ts-topic-focus-head">
                <div>
                  <p className="ts-topic-bucket-label">Selected Topic</p>
                  <h4>{activeTopic.name}</h4>
                  <p className="subtitle">{activeModule.name} module</p>
                </div>
                <div className="ts-topic-focus-actions">
                  <button type="button" className="secondary-btn" onClick={goBackToTopics}>
                    Back to Topics
                  </button>
                  <button type="button" className="secondary-btn" onClick={goBackToModules}>
                    All Modules
                  </button>
                </div>
              </div>
              <div className="ts-topic-test-list standalone">
                {activeTopic.tests.map((test) => (
                  <article key={test._id} className="ts-topic-test-item">
                    <div className="ts-topic-test-copy">
                      <div className="ts-topic-test-topline">
                        <strong>{test.title}</strong>
                        <span className={`ts-topic-difficulty-chip is-${String(test.difficulty || 'medium').toLowerCase()}`}>
                          {test.difficulty || 'medium'}
                        </span>
                      </div>
                      <div className="ts-topic-test-meta">
                        <span>{test.questionCount || test.questions?.length || 0} questions</span>
                        <span>{test.durationMinutes || 30} min</span>
                        {test.category ? <span>{test.category}</span> : null}
                        <span>{activeModule.name}</span>
                        <span>{activeTopic.name}</span>
                      </div>
                    </div>
                    {renderCardActions ? (
                      <div className="ts-topic-test-actions">
                        {renderCardActions(test)}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="ts-topic-empty-state">
          <span className="ts-topic-empty-icon">Sections</span>
          <p>{emptyMessage || 'No topic tests match this filter yet.'}</p>
        </div>
      )}
    </section>
  );
}