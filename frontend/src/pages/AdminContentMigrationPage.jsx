import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchMigrationData,
  migrateContentToBatchAdmin
} from '../api';
import AppShell from '../components/AppShell';

export default function AdminContentMigrationPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [selectedSourceCourse, setSelectedSourceCourse] = useState('');
  const [selectedSourceBatch, setSelectedSourceBatch] = useState('');
  const [selectedTargetCourse, setSelectedTargetCourse] = useState('');
  const [selectedTargetBatch, setSelectedTargetBatch] = useState('');
  const [migrationMode, setMigrationMode] = useState('copy');
  const [moduleFilter, setModuleFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);
  const [banner, setBanner] = useState(null);
  const [expandedCourses, setExpandedCourses] = useState(new Set());

  useEffect(() => {
    if (banner) {
      const timer = setTimeout(() => setBanner(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [banner]);

  useEffect(() => {
    loadMigrationData();
  }, []);

  async function loadMigrationData() {
    setLoading(true);
    try {
      const response = await fetchMigrationData();
      // Filter out courses without active batches
      const filteredCourses = (response?.courses || []).filter(course => 
        course.batches && course.batches.length > 0
      );
      setCourses(filteredCourses);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load migration data' });
    } finally {
      setLoading(false);
    }
  }

  const getSourceCourseData = () => {
    return courses.find(c => c.name === selectedSourceCourse);
  };

  const getTargetCourseData = () => {
    return courses.find(c => c.name === selectedTargetCourse);
  };

  const getSourceBatchContent = () => {
    const course = getSourceCourseData();
    const batch = course?.batches?.find(b => b.name === selectedSourceBatch);
    return batch || { videos: 0, quizzes: 0, tests: 0, totalContent: 0 };
  };

  const getTargetBatchContent = () => {
    const course = getTargetCourseData();
    const batch = course?.batches?.find(b => b.name === selectedTargetBatch);
    return batch || { videos: 0, quizzes: 0, tests: 0, totalContent: 0 };
  };

  const toggleCourseExpand = (courseName) => {
    const newSet = new Set(expandedCourses);
    if (newSet.has(courseName)) {
      newSet.delete(courseName);
    } else {
      newSet.add(courseName);
    }
    setExpandedCourses(newSet);
  };

  async function handleMigrateContent() {
    if (!selectedSourceCourse || !selectedSourceBatch || !selectedTargetCourse || !selectedTargetBatch) {
      setBanner({ type: 'error', text: 'Please select source batch and target batch' });
      return;
    }

    if (selectedSourceCourse === selectedTargetCourse && selectedSourceBatch === selectedTargetBatch) {
      setBanner({ type: 'error', text: 'Source and target cannot be the same' });
      return;
    }

    setMigrating(true);
    setMigrationResult(null);

    try {
      const result = await migrateContentToBatchAdmin(selectedTargetCourse, selectedTargetBatch, {
        mode: migrationMode,
        sourceCourse: selectedSourceCourse,
        sourceBatch: selectedSourceBatch,
        module: moduleFilter || null,
        topic: topicFilter || null
      });

      setMigrationResult(result);
      setBanner({
        type: 'success',
        text: `Content ${migrationMode === 'copy' ? 'copied' : 'moved'} successfully`
      });

      setTimeout(() => loadMigrationData(), 1000);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Migration failed' });
    } finally {
      setMigrating(false);
    }
  }

  const shellActions = (
    <div className="workspace-shell-actions">
      <button type="button" className="secondary-btn" onClick={() => navigate('/admin/course-workspace')}>
        Back to Workspace
      </button>
      <button type="button" className="secondary-btn" onClick={() => navigate('/admin')}>
        Dashboard
      </button>
    </div>
  );

  if (loading) {
    return (
      <AppShell
        title="Content Migration"
        subtitle="Copy or move content between course batches"
        roleLabel="Admin"
        actions={shellActions}
      >
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '18px', marginBottom: '10px' }}>Loading migration data...</div>
          <div style={{ width: '40px', height: '40px', border: '3px solid #6366f1', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Content Migration"
      subtitle="Copy or move content between course batches with visibility"
      roleLabel="Admin"
      actions={shellActions}
    >
      {banner && (
        <div
          className={`migration-banner ${banner.type === 'error' ? 'error' : 'success'}`}
          role="status"
          aria-live="polite"
        >
          {banner.text}
        </div>
      )}

      <div className="migration-page">
        {/* Header */}
        <div className="migration-page-header">
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: 'var(--text-primary)',
            marginBottom: '8px'
          }}>
            Content Migration Workspace
          </h1>
          <p style={{
            fontSize: '16px',
            color: 'var(--text-secondary)',
            margin: 0
          }}>
            Copy or move content between course batches with batch-level details
          </p>
        </div>

        {/* Migration Form */}
        <div className="migration-surface-card">
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginBottom: '24px'
          }}>
            Migration Configuration
          </h2>

          <div className="migration-top-grid" style={{ marginBottom: '24px' }}>
            {/* Source Section */}
            <div>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ color: '#ef4444' }}>📤</span>
                Source Content
              </h3>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'var(--text-primary)',
                  marginBottom: '6px'
                }}>
                  Source Course *
                </label>
                <select
                  value={selectedSourceCourse}
                  onChange={(e) => {
                    setSelectedSourceCourse(e.target.value);
                    setSelectedSourceBatch('');
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">Select source course</option>
                  {courses.map(course => (
                    <option key={course.name} value={course.name}>
                      {course.name} ({course.batches?.length || 0} batches)
                    </option>
                  ))}
                </select>
              </div>

              {selectedSourceCourse && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text-primary)',
                    marginBottom: '6px'
                  }}>
                    Source Batch *
                  </label>
                  <select
                    value={selectedSourceBatch}
                    onChange={(e) => setSelectedSourceBatch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Select source batch</option>
                    {getSourceCourseData()?.batches?.map(batch => (
                      <option key={batch.name} value={batch.name}>
                        {batch.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedSourceBatch && (
                <div style={{
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)'
                }}>
                  <h4 style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    marginBottom: '8px'
                  }}>
                    Content to Migrate
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Videos:</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                        {getSourceBatchContent().videos}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Quizzes:</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                        {getSourceBatchContent().quizzes}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Tests:</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                        {getSourceBatchContent().tests}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Total:</span>
                      <span style={{ color: '#ef4444', fontWeight: '600' }}>
                        {getSourceBatchContent().totalContent}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Target Section */}
            <div>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ color: '#059669' }}>📥</span>
                Target Location
              </h3>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'var(--text-primary)',
                  marginBottom: '6px'
                }}>
                  Target Course *
                </label>
                <select
                  value={selectedTargetCourse}
                  onChange={(e) => {
                    setSelectedTargetCourse(e.target.value);
                    setSelectedTargetBatch('');
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">Select target course</option>
                  {courses.map(course => (
                    <option key={course.name} value={course.name}>
                      {course.name} ({course.batches?.length || 0} batches)
                    </option>
                  ))}
                </select>
              </div>

              {selectedTargetCourse && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text-primary)',
                    marginBottom: '6px'
                  }}>
                    Target Batch *
                  </label>
                  <select
                    value={selectedTargetBatch}
                    onChange={(e) => setSelectedTargetBatch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Select target batch</option>
                    {getTargetCourseData()?.batches?.map(batch => (
                      <option key={batch.name} value={batch.name}>
                        {batch.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedTargetBatch && (
                <div style={{
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)'
                }}>
                  <h4 style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    marginBottom: '8px'
                  }}>
                    Existing Content
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Videos:</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                        {getTargetBatchContent().videos}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Quizzes:</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                        {getTargetBatchContent().quizzes}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Tests:</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                        {getTargetBatchContent().tests}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Total:</span>
                      <span style={{ color: '#059669', fontWeight: '600' }}>
                        {getTargetBatchContent().totalContent}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Migration Options */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              marginBottom: '16px'
            }}>
              Migration Options
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: 'var(--text-primary)',
                marginBottom: '8px'
              }}>
                Migration Mode
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                {[
                  { value: 'copy', label: 'Copy Content', desc: 'Duplicate to target (keep original)' },
                  { value: 'move', label: 'Move Content', desc: 'Move to target (remove from source)' }
                ].map(mode => (
                  <button
                    key={mode.value}
                    onClick={() => setMigrationMode(mode.value)}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      backgroundColor: migrationMode === mode.value ? '#6366f1' : 'var(--bg-secondary)',
                      color: migrationMode === mode.value ? 'white' : 'var(--text-primary)',
                      border: `1px solid ${migrationMode === mode.value ? '#6366f1' : 'var(--border)'}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontWeight: '600' }}>{mode.label}</div>
                    <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="migration-filter-grid">
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'var(--text-primary)',
                  marginBottom: '6px'
                }}>
                  Module Filter (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Filter by module name..."
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'var(--text-primary)',
                  marginBottom: '6px'
                }}>
                  Topic Filter (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Filter by topic name..."
                  value={topicFilter}
                  onChange={(e) => setTopicFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={() => navigate('/admin/course-workspace')} className="secondary-btn">
              Back to Course Workspace
            </button>
            <button
              onClick={handleMigrateContent}
              disabled={migrating || !selectedSourceCourse || !selectedSourceBatch || !selectedTargetCourse || !selectedTargetBatch}
              style={{
                padding: '12px 24px',
                backgroundColor: migrating ? '#6b7280' : '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: migrating ? 'not-allowed' : 'pointer',
                opacity: migrating ? 0.6 : 1
              }}
            >
              {migrating ? 'Migrating...' : `${migrationMode === 'copy' ? 'Copy' : 'Move'} Content`}
            </button>
          </div>
        </div>

        {/* Migration Results */}
        {migrationResult && (
          <div className="migration-surface-card migration-results-card">
            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ color: '#059669' }}>✓</span>
              Migration Results
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '16px'
            }}>
              {[
                { label: 'Videos', value: migrationResult.result?.videos?.updated ?? migrationResult.result?.videos?.copied ?? 0 },
                { label: 'Quizzes', value: migrationResult.result?.quizzes?.updated ?? migrationResult.result?.quizzes?.copied ?? 0 },
                { label: 'Topic Tests', value: migrationResult.result?.topicTests?.updated ?? migrationResult.result?.topicTests?.copied ?? 0 },
                { label: 'Mock Exams', value: migrationResult.result?.mockExams?.updated ?? migrationResult.result?.mockExams?.copied ?? 0 },
                { label: 'Test Series', value: migrationResult.result?.testSeries?.updated ?? migrationResult.result?.testSeries?.copied ?? 0 }
              ].map(item => (
                <div key={item.label} style={{
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '16px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  border: '1px solid var(--border-light)'
                }}>
                  <div style={{
                    fontSize: '24px',
                    fontWeight: '700',
                    color: '#059669',
                    marginBottom: '4px'
                  }}>
                    {item.value}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    fontWeight: '500'
                  }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Courses with Batches Overview */}
        <div className="migration-surface-card">
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginBottom: '20px'
          }}>
            Courses & Batch Content Overview
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {courses.map(course => (
              <div key={course.name}>
                <button
                  onClick={() => toggleCourseExpand(course.name)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: expandedCourses.has(course.name) ? '#6366f1' : 'var(--bg-secondary)',
                    color: expandedCourses.has(course.name) ? 'white' : 'var(--text-primary)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span>{course.name} ({course.batches?.length || 0} batches)</span>
                  <span style={{ fontSize: '18px' }}>
                    {expandedCourses.has(course.name) ? '▼' : '▶'}
                  </span>
                </button>

                {expandedCourses.has(course.name) && (
                  <div style={{
                    marginTop: '8px',
                    paddingLeft: '0',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '12px'
                  }}>
                    {course.batches?.map(batch => (
                      <div key={batch.name} style={{
                        backgroundColor: 'var(--bg-secondary)',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light)'
                      }}>
                        <h4 style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: 'var(--text-primary)',
                          marginBottom: '8px'
                        }}>
                          {batch.name}
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Videos:</span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                              {batch.videos}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Quizzes:</span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                              {batch.quizzes}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Tests:</span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                              {batch.tests}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Total:</span>
                            <span style={{ color: '#6366f1' }}>
                              {batch.totalContent}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .workspace-shell-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .migration-page {
          width: min(1180px, 100%);
          margin: 0 auto;
          padding: clamp(8px, 2vw, 20px);
        }

        .migration-page-header {
          margin-bottom: clamp(16px, 2.8vw, 28px);
        }

        .migration-surface-card {
          background-color: var(--bg-card);
          border-radius: 14px;
          padding: clamp(16px, 2.2vw, 24px);
          margin-bottom: clamp(16px, 2.8vw, 28px);
          border: 1px solid var(--border);
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.08);
        }

        .migration-results-card {
          margin-top: 6px;
        }

        .migration-top-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: clamp(14px, 2vw, 24px);
        }

        .migration-filter-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .migration-banner {
          position: fixed;
          top: calc(var(--app-shell-topbar-clearance, 72px) + 10px);
          right: clamp(10px, 2vw, 20px);
          z-index: 1200;
          padding: 12px 18px;
          color: white;
          border-radius: 10px;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.25);
          font-size: 14px;
          font-weight: 500;
          max-width: min(90vw, 420px);
        }

        .migration-banner.error {
          background-color: #dc2626;
        }

        .migration-banner.success {
          background-color: #059669;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 960px) {
          .migration-top-grid,
          .migration-filter-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .workspace-shell-actions {
            width: 100%;
          }

          .workspace-shell-actions .secondary-btn {
            flex: 1 1 auto;
          }
        }
      `}</style>
    </AppShell>
  );
}