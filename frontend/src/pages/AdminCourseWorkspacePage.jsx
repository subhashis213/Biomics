import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { requestJson, uploadMaterial } from '../api';
import AppShell from '../components/AppShell';
import ModuleManager from '../components/ModuleManager';
import { MAX_MATERIAL_MB } from '../constants';

const COURSE_CATEGORIES = [
  '11th',
  '12th',
  'NEET',
  'IIT-JAM',
  'CSIR-NET Life Science',
  'GATE'
];

const COURSE_MODAL_THEME = {
  '11th': {
    accent: '#2563eb',
    accentAlt: '#0ea5e9',
    glowA: '37, 99, 235',
    glowB: '14, 165, 233'
  },
  '12th': {
    accent: '#0f766e',
    accentAlt: '#14b8a6',
    glowA: '15, 118, 110',
    glowB: '20, 184, 166'
  },
  'NEET': {
    accent: '#16a34a',
    accentAlt: '#84cc16',
    glowA: '22, 163, 74',
    glowB: '132, 204, 22'
  },
  'IIT-JAM': {
    accent: '#d97706',
    accentAlt: '#f59e0b',
    glowA: '217, 119, 6',
    glowB: '245, 158, 11'
  },
  'CSIR-NET Life Science': {
    accent: '#0891b2',
    accentAlt: '#06b6d4',
    glowA: '8, 145, 178',
    glowB: '6, 182, 212'
  },
  'GATE': {
    accent: '#dc2626',
    accentAlt: '#ef4444',
    glowA: '220, 38, 38',
    glowB: '239, 68, 68'
  }
};

const CSIR_COURSE = 'CSIR-NET Life Science';

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

export default function AdminCourseWorkspacePage() {
  const navigate = useNavigate();
  const { courseName } = useParams();
  const selectedCourse = safeDecode(courseName);
  const isCsirModuleFlow = true;

  const [modalStep, setModalStep] = useState('module');
  const [courseModules, setCourseModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [moduleTopicsByKey, setModuleTopicsByKey] = useState({});
  const [newTopicName, setNewTopicName] = useState('');
  const [isTopicLoading, setIsTopicLoading] = useState(false);
  const [isTopicSaving, setIsTopicSaving] = useState(false);
  const [isTopicDeleting, setIsTopicDeleting] = useState('');
  const [renamingTopic, setRenamingTopic] = useState(null);
  const [renameTopicValue, setRenameTopicValue] = useState('');
  const [modalNoteFile, setModalNoteFile] = useState(null);
  const [modalMessage, setModalMessage] = useState(null);
  const [modalUploadProgress, setModalUploadProgress] = useState(0);
  const [publishingForCourse, setPublishingForCourse] = useState(false);
  const [videoForm, setVideoForm] = useState({ title: '', description: '', url: '' });

  const selectedCourseTheme = COURSE_MODAL_THEME[selectedCourse] || COURSE_MODAL_THEME['11th'];
  const courseModalStyle = {
    '--course-modal-accent': selectedCourseTheme.accent,
    '--course-modal-accent-alt': selectedCourseTheme.accentAlt,
    '--course-modal-glow-a': selectedCourseTheme.glowA,
    '--course-modal-glow-b': selectedCourseTheme.glowB
  };

  const courseModalSteps = [
    { id: 'module', label: 'Module' },
    { id: 'topic', label: 'Topic' },
    { id: 'upload', label: 'Upload' }
  ];
  const activeCourseModalStepIndex = courseModalSteps.findIndex((step) => step.id === modalStep);

  function getTopicBucketKey(course, moduleName) {
    return `${String(course || '').trim()}::${String(moduleName || '').trim()}`;
  }

  const topicBucketKey = getTopicBucketKey(selectedCourse, selectedModule);
  const currentModuleTopics = moduleTopicsByKey[topicBucketKey] || [];

  useEffect(() => {
    if (!modalMessage) return undefined;
    const timer = window.setTimeout(() => setModalMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [modalMessage]);

  useEffect(() => {
    if (!COURSE_CATEGORIES.includes(selectedCourse)) {
      navigate('/admin', { replace: true });
      return;
    }

    let ignore = false;
    async function loadCourseData() {
      try {
        const [moduleRes, videosRes] = await Promise.allSettled([
          requestJson('/modules'),
          requestJson('/videos')
        ]);

        if (ignore) return;

        const moduleNames = [];
        if (moduleRes.status === 'fulfilled') {
          (moduleRes.value?.modules || []).forEach((entry) => {
            const category = String(entry?.category || '').trim();
            const name = String(entry?.name || '').trim();
            if (category === selectedCourse && name) moduleNames.push(name);
          });
        }

        if (videosRes.status === 'fulfilled') {
          (Array.isArray(videosRes.value) ? videosRes.value : []).forEach((video) => {
            const category = String(video?.category || '').trim();
            const moduleName = String(video?.module || 'General').trim();
            if (category === selectedCourse && moduleName) moduleNames.push(moduleName);
          });
        }

        setCourseModules(Array.from(new Set(moduleNames)).sort((a, b) => a.localeCompare(b)));
      } catch (error) {
        if (!ignore) {
          setModalMessage({ type: 'error', text: error.message || 'Failed to load modules.' });
        }
      }
    }

    loadCourseData();
    return () => {
      ignore = true;
    };
  }, [selectedCourse, navigate]);

  async function loadTopicsForModule(course, moduleName) {
    if (!course || !moduleName) return;
    setIsTopicLoading(true);
    try {
      const query = `?category=${encodeURIComponent(course)}&module=${encodeURIComponent(moduleName)}`;
      const response = await requestJson(`/modules/topics${query}`);
      const topics = Array.isArray(response?.topics)
        ? response.topics.map((entry) => String(entry?.name || '').trim()).filter(Boolean)
        : [];
      const bucketKey = getTopicBucketKey(course, moduleName);
      setModuleTopicsByKey((prev) => ({ ...prev, [bucketKey]: topics }));
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message || 'Failed to load topics.' });
    } finally {
      setIsTopicLoading(false);
    }
  }

  async function handleModuleCreate(moduleName) {
    if (!selectedCourse || !moduleName) return;
    try {
      await requestJson('/modules', {
        method: 'POST',
        body: JSON.stringify({ category: selectedCourse, name: moduleName })
      });
      setCourseModules((prev) => Array.from(new Set([...prev, moduleName])).sort((a, b) => a.localeCompare(b)));
      setSelectedModule(moduleName);
      if (isCsirModuleFlow) {
        setSelectedTopic(null);
        setModalStep('topic');
        await loadTopicsForModule(selectedCourse, moduleName);
      } else {
        setModalStep('upload');
      }
      setModalMessage(null);
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message || 'Failed to create module.' });
      throw error;
    }
  }

  async function handleModuleSelect(moduleName) {
    setSelectedModule(moduleName);
    if (isCsirModuleFlow) {
      setSelectedTopic(null);
      setModalStep('topic');
      await loadTopicsForModule(selectedCourse, moduleName);
    } else {
      setModalStep('upload');
    }
  }

  async function handleModuleDelete(moduleName) {
    if (!selectedCourse || !moduleName) return;
    try {
      await Promise.all([
        requestJson('/videos/module', {
          method: 'DELETE',
          body: JSON.stringify({ category: selectedCourse, module: moduleName })
        }),
        requestJson('/quizzes/module', {
          method: 'DELETE',
          body: JSON.stringify({ category: selectedCourse, module: moduleName })
        }),
        requestJson('/modules', {
          method: 'DELETE',
          body: JSON.stringify({ category: selectedCourse, name: moduleName })
        })
      ]);
      setCourseModules((prev) => prev.filter((item) => item !== moduleName));
      if (selectedModule === moduleName) {
        setSelectedModule(null);
        setSelectedTopic(null);
        setModalStep('module');
      }
      setModalMessage({ type: 'success', text: `Module "${moduleName}" and all its content deleted.` });
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message || 'Failed to delete module.' });
      throw error;
    }
  }

  async function handleTopicCreate() {
    const topicName = newTopicName.trim();
    if (!selectedCourse || !selectedModule || !topicName) return;
    const bucketKey = getTopicBucketKey(selectedCourse, selectedModule);
    const existingTopics = moduleTopicsByKey[bucketKey] || [];
    if (existingTopics.some((item) => item.toLowerCase() === topicName.toLowerCase())) {
      setModalMessage({ type: 'error', text: 'Topic already exists in this module.' });
      return;
    }

    setIsTopicSaving(true);
    setModalMessage(null);
    try {
      await requestJson('/modules/topics', {
        method: 'POST',
        body: JSON.stringify({ category: selectedCourse, module: selectedModule, name: topicName })
      });
      setModuleTopicsByKey((prev) => ({
        ...prev,
        [bucketKey]: Array.from(new Set([...(prev[bucketKey] || []), topicName])).sort((a, b) => a.localeCompare(b))
      }));
      setSelectedTopic(topicName);
      setNewTopicName('');
      setModalMessage({ type: 'success', text: `Topic "${topicName}" created.` });
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message || 'Failed to create topic.' });
    } finally {
      setIsTopicSaving(false);
    }
  }

  function handleTopicSelect(topicName) {
    setSelectedTopic(topicName);
    setModalStep('upload');
    setModalMessage(null);
  }

  async function handleTopicDelete(topicName) {
    if (!selectedCourse || !selectedModule || !topicName) return;
    const bucketKey = getTopicBucketKey(selectedCourse, selectedModule);
    setIsTopicDeleting(topicName);
    try {
      await requestJson('/modules/topics', {
        method: 'DELETE',
        body: JSON.stringify({ category: selectedCourse, module: selectedModule, name: topicName })
      });
      setModuleTopicsByKey((prev) => ({
        ...prev,
        [bucketKey]: (prev[bucketKey] || []).filter((entry) => entry !== topicName)
      }));
      if (selectedTopic === topicName) setSelectedTopic(null);
      setModalMessage({ type: 'success', text: `Topic "${topicName}" removed.` });
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message || 'Failed to delete topic.' });
    } finally {
      setIsTopicDeleting('');
    }
  }

  async function handleTopicRename(oldName, newName) {
    if (!selectedCourse || !selectedModule) return;
    const bucketKey = getTopicBucketKey(selectedCourse, selectedModule);
    await requestJson('/modules/topics/rename', {
      method: 'PUT',
      body: JSON.stringify({ category: selectedCourse, module: selectedModule, oldName, newName })
    });
    setModuleTopicsByKey((prev) => ({
      ...prev,
      [bucketKey]: (prev[bucketKey] || []).map((t) => (t === oldName ? newName : t)).sort((a, b) => a.localeCompare(b))
    }));
    if (selectedTopic === oldName) setSelectedTopic(newName);
    setModalMessage({ type: 'success', text: `Topic renamed to "${newName}".` });
  }

  async function handleModuleRename(oldName, newName) {
    if (!selectedCourse) return;
    await requestJson('/modules/rename', {
      method: 'PUT',
      body: JSON.stringify({ category: selectedCourse, oldName, newName })
    });
    setCourseModules((prev) => Array.from(new Set(prev.map((m) => (m === oldName ? newName : m)))).sort((a, b) => a.localeCompare(b)));
    if (selectedModule === oldName) setSelectedModule(newName);
    setModalMessage({ type: 'success', text: `Module renamed to "${newName}".` });
  }

  function goBackToModuleStep() {
    setModalStep('module');
    setSelectedModule(null);
    setSelectedTopic(null);
    setNewTopicName('');
    setVideoForm({ title: '', description: '', url: '' });
    setModalNoteFile(null);
    setModalMessage(null);
  }

  function goBackToTopicStep() {
    setModalStep('topic');
    setSelectedTopic(null);
    setVideoForm({ title: '', description: '', url: '' });
    setModalNoteFile(null);
    setModalMessage(null);
  }

  async function handleCreateVideo(event) {
    event.preventDefault();
    if (!videoForm.title.trim() || !videoForm.url.trim() || !selectedCourse || !selectedModule) return;
    if (!selectedTopic) {
      setModalMessage({ type: 'error', text: 'Please select or create a topic before uploading.' });
      return;
    }

    if (modalNoteFile) {
      const isPdf = modalNoteFile.type === 'application/pdf' || modalNoteFile.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        setModalMessage({ type: 'error', text: 'Only PDF notes are allowed.' });
        return;
      }
      if (modalNoteFile.size > MAX_MATERIAL_MB * 1024 * 1024) {
        setModalMessage({ type: 'error', text: `Maximum notes size is ${MAX_MATERIAL_MB}MB.` });
        return;
      }
    }

    setPublishingForCourse(true);
    setModalMessage(null);
    setModalUploadProgress(0);

    try {
      const createdVideo = await requestJson('/videos', {
        method: 'POST',
        body: JSON.stringify({
          title: videoForm.title.trim(),
          description: videoForm.description.trim(),
          url: videoForm.url.trim(),
          category: selectedCourse,
          module: selectedModule,
          topic: selectedTopic || 'General'
        })
      });

      if (modalNoteFile) {
        await uploadMaterial(createdVideo._id, modalNoteFile, (percent) => {
          setModalUploadProgress(percent);
        });
      }

      const topicSegment = selectedTopic ? ` / ${selectedTopic}` : '';
      setVideoForm({ title: '', description: '', url: '' });
      setModalNoteFile(null);
      setPublishingForCourse(false);
      setModalMessage({ type: 'success', text: `Lecture added to ${selectedModule}${topicSegment} in ${selectedCourse}.` });
    } catch (error) {
      setModalMessage({ type: 'error', text: error.message || 'Failed to publish lecture.' });
      setPublishingForCourse(false);
    }
  }

  const navItems = useMemo(() => [
    { id: 'builder-workspace', label: 'Builder', icon: '🧩' },
    { id: 'builder-step-guide', label: 'Steps', icon: '🪜' }
  ], []);

  return (
    <AppShell
      title="Course Content Builder"
      subtitle="Create modules, topics, and upload videos with notes in a full-page workflow"
      roleLabel="Admin"
      showThemeSwitch={false}
      navTitle="Builder"
      navItems={navItems}
      actions={(
        <button type="button" className="secondary-btn" onClick={() => navigate('/admin')}>
          Back To Dashboard
        </button>
      )}
    >
      <section id="builder-workspace" className="card admin-course-workspace" style={courseModalStyle}>
        <header className="admin-course-workspace-head">
          <div>
            <p className="eyebrow">Course Workspace</p>
            <h2>{selectedCourse}</h2>
            {(modalStep === 'upload' || modalStep === 'topic') && selectedModule ? (
              <p className="module-breadcrumb">→ <strong>{selectedModule}</strong>{modalStep === 'upload' && selectedTopic ? <> / <strong>{selectedTopic}</strong></> : null}</p>
            ) : null}
          </div>
        </header>

        <div id="builder-step-guide" className="course-modal-stagebar" role="list" aria-label="Course creation steps">
          {courseModalSteps.map((step, index) => {
            const isActive = step.id === modalStep;
            const isDone = activeCourseModalStepIndex > index;
            return (
              <div key={step.id} className={`course-modal-stage-pill${isActive ? ' active' : ''}${isDone ? ' done' : ''}`} role="listitem">
                <span className="course-modal-stage-index">{isDone ? '✓' : index + 1}</span>
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>

        {modalStep === 'module' ? (
          <section className="course-modal-step-shell module-step-shell" aria-label="Module workspace">
            <div className="course-modal-step-head">
              <p className="eyebrow">Step 1</p>
              <h3>Create or pick a module</h3>
              <p className="subtitle">Choose the module first, then continue to topic and upload stages.</p>
            </div>
            <ModuleManager
              course={selectedCourse}
              modules={courseModules}
              selectedModule={selectedModule}
              onModuleSelect={handleModuleSelect}
              onModuleCreate={handleModuleCreate}
              onModuleDelete={handleModuleDelete}
              onModuleRename={handleModuleRename}
              isProcessing={publishingForCourse}
              modalMessage={modalMessage}
              onClearMessage={() => setModalMessage(null)}
            />
          </section>
        ) : modalStep === 'topic' ? (
          <section className="course-modal-step-shell topic-step-shell" aria-label="Topic workspace">
            <div className="csir-topic-manager">
              <div className="upload-form-header">
                <button
                  type="button"
                  className="back-btn"
                  onClick={goBackToModuleStep}
                  disabled={isTopicLoading || isTopicSaving}
                >
                  ← Back to Modules
                </button>
              </div>

              <div className="csir-topic-header">
                <div>
                  <p className="eyebrow">Step 2</p>
                  <h3>Choose topic folder for {selectedModule}</h3>
                  <p className="subtitle">Create topic folders and upload learning videos + PDFs inside each topic.</p>
                </div>
              </div>

              <div className="csir-topic-create-row">
                <input
                  type="text"
                  value={newTopicName}
                  onChange={(event) => setNewTopicName(event.target.value)}
                  placeholder="Create topic name (e.g., Cell Signaling)"
                  disabled={isTopicSaving || isTopicLoading}
                />
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleTopicCreate}
                  disabled={isTopicSaving || isTopicLoading || !newTopicName.trim()}
                >
                  {isTopicSaving ? 'Creating...' : 'Create Topic'}
                </button>
              </div>

              {modalMessage ? <p className={`inline-message ${modalMessage.type}`}>{modalMessage.text}</p> : null}
              {isTopicLoading ? <p className="empty-note">Loading topic folders...</p> : null}

              {!isTopicLoading && currentModuleTopics.length ? (
                <div className="csir-topic-grid">
                  {currentModuleTopics.map((topicName) => (
                    <article key={topicName} className={`csir-topic-card${selectedTopic === topicName ? ' active' : ''}${renamingTopic === topicName ? ' renaming' : ''}`}>
                      {renamingTopic === topicName ? (
                        <div className="csir-topic-rename-row">
                          <input
                            className="csir-topic-rename-input"
                            value={renameTopicValue}
                            onChange={(e) => setRenameTopicValue(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                const trimmed = renameTopicValue.trim();
                                if (!trimmed) return;
                                if (trimmed === renamingTopic) { setRenamingTopic(null); return; }
                                try { await handleTopicRename(renamingTopic, trimmed); setRenamingTopic(null); } catch {}
                              }
                              if (e.key === 'Escape') setRenamingTopic(null);
                            }}
                            autoFocus
                            aria-label={`Rename topic ${topicName}`}
                          />
                          <button
                            type="button"
                            className="csir-topic-rename-save"
                            title="Save rename"
                            onClick={async () => {
                              const trimmed = renameTopicValue.trim();
                              if (!trimmed) return;
                              if (trimmed === renamingTopic) { setRenamingTopic(null); return; }
                              try { await handleTopicRename(renamingTopic, trimmed); setRenamingTopic(null); } catch {}
                            }}
                          >✓</button>
                          <button type="button" className="csir-topic-rename-cancel" title="Cancel" onClick={() => setRenamingTopic(null)}>✕</button>
                        </div>
                      ) : (
                        <>
                          <button type="button" className="csir-topic-open" onClick={() => handleTopicSelect(topicName)}>
                            <span className="csir-topic-icon" aria-hidden="true">📁</span>
                            <span className="csir-topic-name">{topicName}</span>
                            <span className="csir-topic-hint">Open Folder</span>
                          </button>
                          <button
                            type="button"
                            className="csir-topic-rename-btn"
                            title={`Rename topic "${topicName}"`}
                            onClick={() => { setRenamingTopic(topicName); setRenameTopicValue(topicName); setModalMessage(null); }}
                            disabled={!!isTopicDeleting}
                          >✏️</button>
                          <button
                            type="button"
                            className="csir-topic-delete"
                            onClick={() => handleTopicDelete(topicName)}
                            disabled={isTopicDeleting === topicName}
                            title={`Delete topic ${topicName}`}
                          >
                            {isTopicDeleting === topicName ? 'Deleting...' : '🗑'}
                          </button>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              ) : null}

              {!isTopicLoading && !currentModuleTopics.length ? (
                <p className="empty-note">No topics yet. Create your first topic folder to start uploading content.</p>
              ) : null}
            </div>
          </section>
        ) : (
          <form className="course-modal-form course-upload-shell" onSubmit={handleCreateVideo}>
            <div className="upload-form-header">
              <button
                type="button"
                className="back-btn"
                onClick={isCsirModuleFlow ? goBackToTopicStep : goBackToModuleStep}
                disabled={publishingForCourse}
              >
                {isCsirModuleFlow ? '← Back to Topics' : '← Back to Modules'}
              </button>
            </div>

            <div className="course-modal-step-head">
              <p className="eyebrow">Step 3</p>
              <h3>Upload lecture video and notes</h3>
              <p className="subtitle">Publish content into the selected folder with optional PDF notes.</p>
            </div>

            <label>
              Lecture title
              <input value={videoForm.title} onChange={(event) => setVideoForm((current) => ({ ...current, title: event.target.value }))} required disabled={publishingForCourse} />
            </label>
            <label>
              Description
              <textarea value={videoForm.description} onChange={(event) => setVideoForm((current) => ({ ...current, description: event.target.value }))} rows="4" disabled={publishingForCourse} />
            </label>
            <label>
              Video URL
              <input value={videoForm.url} onChange={(event) => setVideoForm((current) => ({ ...current, url: event.target.value }))} required disabled={publishingForCourse} />
            </label>
            <label>
              Notes (PDF, optional)
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setModalNoteFile(event.target.files?.[0] || null)}
                disabled={publishingForCourse}
              />
            </label>

            {modalNoteFile ? <p className="optional-note">Selected note: {modalNoteFile.name}</p> : null}
            {modalUploadProgress > 0 && modalUploadProgress < 100 ? <p className="optional-note">Uploading notes: {modalUploadProgress}%</p> : null}
            {modalMessage ? <p className={`inline-message ${modalMessage.type}`}>{modalMessage.text}</p> : null}

            <button className="primary-btn" type="submit" disabled={publishingForCourse}>
              {publishingForCourse ? 'Publishing...' : 'Add Lecture & Notes'}
            </button>
          </form>
        )}
      </section>
    </AppShell>
  );
}
