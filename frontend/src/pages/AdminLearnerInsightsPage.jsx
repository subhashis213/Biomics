import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { fetchAdminUserInsights, getApiBase } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';

const TRACKED_WINDOW_OPTIONS = [
  { value: '7', shortLabel: '1 week', headingLabel: '7 days' },
  { value: '14', shortLabel: '2 weeks', headingLabel: '14 days' },
  { value: '30', shortLabel: '1 month', headingLabel: '30 days' }
];

function formatDate(value) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatMoney(amountInPaise, currency = 'INR') {
  const amount = Number(amountInPaise || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

function formatPercent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0%';
  return `${Math.round(numeric)}%`;
}

function formatUsageTime(seconds) {
  const totalSeconds = Math.max(0, Number(seconds || 0));
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0m';

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatDurationCompact(seconds) {
  const numeric = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(numeric / 3600);
  const minutes = Math.round((numeric % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function buildAvatarSrc(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${getApiBase()}${raw}`;
}

function formatInputDate(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(days) {
  const next = new Date();
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + Number(days || 0));
  return formatInputDate(next);
}

function parseInputDate(value, endOfDay = false) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed;
}

function normalizeDateRange(fromValue, toValue) {
  const start = parseInputDate(fromValue, false);
  const end = parseInputDate(toValue, true);
  if (start && end && start.getTime() > end.getTime()) {
    return {
      start: parseInputDate(toValue, false),
      end: parseInputDate(fromValue, true)
    };
  }
  return { start, end };
}

function matchesDateRange(value, range) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  if (range.start && parsed < range.start) return false;
  if (range.end && parsed > range.end) return false;
  return true;
}

function filterAttemptList(items, range) {
  return items.filter((item) => matchesDateRange(item.submittedAt, range));
}

function normalizeFilterToken(value) {
  return String(value || '').trim().toLowerCase();
}

function buildFrequencySummary(items) {
  const summary = new Map();
  items.forEach((item) => {
    const resourceId = String(item?.resourceId || item?.title || '').trim();
    const attemptType = String(item?.attemptType || 'assessment').trim();
    const key = `${attemptType}:${resourceId}`;
    if (!summary.has(key)) {
      summary.set(key, {
        key,
        title: String(item?.title || 'Untitled').trim() || 'Untitled',
        attemptType,
        category: String(item?.category || '').trim(),
        module: String(item?.module || '').trim(),
        topic: String(item?.topic || '').trim(),
        attempts: 0,
        totalPercent: 0,
        scoredEntries: 0,
        totalDurationSeconds: 0,
        lastSubmittedAt: null
      });
    }

    const entry = summary.get(key);
    entry.attempts += 1;
    entry.totalDurationSeconds += Number(item?.durationSeconds || 0);
    const percent = Number(item?.percent || 0);
    if (Number.isFinite(percent) && Number(item?.total || 0) > 0) {
      entry.totalPercent += percent;
      entry.scoredEntries += 1;
    }
    const submittedAt = item?.submittedAt ? new Date(item.submittedAt) : null;
    if (submittedAt && !Number.isNaN(submittedAt.getTime())) {
      if (!entry.lastSubmittedAt || submittedAt > new Date(entry.lastSubmittedAt)) {
        entry.lastSubmittedAt = submittedAt.toISOString();
      }
    }
  });

  return [...summary.values()]
    .map((item) => ({
      ...item,
      averagePercent: item.scoredEntries ? item.totalPercent / item.scoredEntries : 0
    }))
    .sort((left, right) => {
      if (right.attempts !== left.attempts) return right.attempts - left.attempts;
      return new Date(right.lastSubmittedAt || 0).getTime() - new Date(left.lastSubmittedAt || 0).getTime();
    })
    .slice(0, 8);
}

function buildDailyUsageSeries(items, dayWindow) {
  const safeWindow = Math.min(30, Math.max(1, Number(dayWindow || 7)));
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (safeWindow - 1));

  const buckets = [];
  const bucketMap = new Map();

  for (let index = 0; index < safeWindow; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const key = formatInputDate(day);
    const entry = {
      key,
      label: day.toLocaleDateString([], { weekday: 'short' }),
      shortDate: day.toLocaleDateString([], { day: '2-digit', month: 'short' }),
      seconds: 0,
      hours: 0
    };
    buckets.push(entry);
    bucketMap.set(key, entry);
  }

  items.forEach((item) => {
    const key = String(item?.date || '').trim();
    if (!key || !matchesDateRange(key, { start, end })) return;
    const bucket = bucketMap.get(key);
    if (!bucket) return;
    bucket.seconds += Number(item?.seconds || 0);
  });

  buckets.forEach((bucket) => {
    bucket.hours = bucket.seconds / 3600;
  });

  return buckets;
}

function sumDailyUsageRange(items, range) {
  return items.reduce((sum, item) => {
    if (!matchesDateRange(item?.date, range)) return sum;
    return sum + Number(item?.seconds || 0);
  }, 0);
}

function SparkStrip({ items, tone, hasScores }) {
  if (!items.length) return null;
  const displayItems = items.slice(0, 8).reverse();
  return (
    <div className="learner-insights-spark-strip" aria-hidden="true">
      {displayItems.map((item, index) => {
        const height = hasScores
          ? Math.max(18, Math.min(100, Number(item.percent || 0)))
          : 100 - (index * 7);
        return (
          <span
            key={`spark-${item.id}-${index}`}
            className={`learner-insights-spark-bar learner-insights-spark-${tone}`}
            style={{ height: `${Math.max(18, height)}%` }}
          />
        );
      })}
    </div>
  );
}

function ActivityPanel({ title, eyebrow, items, emptyText, tone, summaryLabel = 'Open filtered history table' }) {
  const hasScores = items.some((item) => Number(item?.total || 0) > 0);
  return (
    <section className={`card workspace-panel learner-insights-activity-panel learner-insights-tone-${tone}`}>
      <div className="section-header compact learner-insights-section-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <StatCard label="Entries" value={items.length} />
      </div>

      {!items.length ? (
        <p className="empty-note">{emptyText}</p>
      ) : (
        <>
          <div className="learner-insights-panel-topline">
            <SparkStrip items={items} tone={tone} hasScores={hasScores} />
            <div className="learner-insights-activity-list">
              {items.slice(0, 3).map((item) => (
                <article key={`${title}-${item.id}-${item.submittedAt || item.uploadedAt || ''}`} className="learner-insights-activity-item">
                  <div className="learner-insights-activity-head">
                    <div>
                      <strong>{item.title}</strong>
                      <p>
                        {[item.category, item.batch, item.module, item.topic].filter(Boolean).join(' • ') || 'General'}
                      </p>
                    </div>
                    {'percent' in item ? <span className="learner-insights-score-pill">{formatPercent(item.percent)}</span> : null}
                  </div>
                  <div className="learner-insights-activity-meta">
                    {'score' in item ? <span>Score {item.score}/{item.total}</span> : null}
                    {'durationSeconds' in item ? <span>{formatDurationCompact(item.durationSeconds)}</span> : null}
                    <span>{formatDateTime(item.submittedAt || item.uploadedAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <details className="learner-insights-history-details">
            <summary>{summaryLabel}</summary>
            <div className="analytics-table-wrap learner-insights-history-table-wrap">
              <table className="analytics-table learner-insights-history-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Path</th>
                    {hasScores ? <th>Score</th> : null}
                    {hasScores ? <th>Accuracy</th> : null}
                    <th>Duration</th>
                    <th>{hasScores ? 'Submitted' : 'Updated'}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={`history-${title}-${item.id}-${item.submittedAt || item.uploadedAt || ''}`}>
                      <td><strong>{item.title}</strong></td>
                      <td>{[item.category, item.batch, item.module, item.topic].filter(Boolean).join(' • ') || 'General'}</td>
                      {hasScores ? <td>{item.score}/{item.total}</td> : null}
                      {hasScores ? <td>{formatPercent(item.percent)}</td> : null}
                      <td>{'durationSeconds' in item ? formatDurationCompact(item.durationSeconds || 0) : 'NA'}</td>
                      <td>{formatDateTime(item.submittedAt || item.uploadedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

function CollapsiblePurchaseTable({ title, eyebrow, items, summaryLabel, columns, emptyText }) {
  return (
    <section className="card workspace-panel learner-insights-purchase-panel">
      <div className="section-header compact learner-insights-section-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <StatCard label="Orders" value={items.length} />
      </div>

      {!items.length ? (
        <p className="empty-note">{emptyText}</p>
      ) : (
        <details className="learner-insights-collapsible-table" open>
          <summary>{summaryLabel}</summary>
          <div className="analytics-table-wrap learner-insights-history-table-wrap">
            <table className="analytics-table learner-insights-history-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    {columns.map((column) => (
                      <td key={`${item.id}-${column.key}`}>{column.render(item)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function FrequencyBarChart({ title, eyebrow, items, emptyText, tone, subtitle }) {
  const maxAttempts = Math.max(...items.map((item) => Number(item.attempts || 0)), 1);
  return (
    <section className={`card workspace-panel learner-insights-frequency-panel learner-insights-tone-${tone}`}>
      <div className="section-header compact learner-insights-section-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>
        <StatCard label="Repeated Items" value={items.length} />
      </div>

      {!items.length ? (
        <p className="empty-note">{emptyText}</p>
      ) : (
        <div className="learner-insights-frequency-list">
          {items.map((item) => (
            <article key={item.key} className="learner-insights-frequency-item">
              <div className="learner-insights-frequency-head">
                <div>
                  <strong>{item.title}</strong>
                  <p>{[item.category, item.module, item.topic].filter(Boolean).join(' • ') || 'General'}</p>
                </div>
                <span className="learner-insights-score-pill">{item.attempts}x</span>
              </div>
              <div className="learner-insights-frequency-track">
                <div
                  className={`learner-insights-frequency-fill learner-insights-bar-${tone}`}
                  style={{ width: `${Math.max(10, (Number(item.attempts || 0) / maxAttempts) * 100)}%` }}
                />
              </div>
              <div className="learner-insights-frequency-meta">
                <span>Avg accuracy {formatPercent(item.averagePercent)}</span>
                <span>Tracked time {formatDurationCompact(item.totalDurationSeconds)}</span>
                <span>Last seen {formatDateTime(item.lastSubmittedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DailyHoursChart({ items, dayWindow, totalSeconds }) {
  const maxHours = Math.max(...items.map((item) => Number(item.hours || 0)), 0);
  const safeMaxHours = maxHours > 0 ? Math.ceil(maxHours) : 1;
  const peakItem = items.reduce((best, item) => {
    if (!best || Number(item.seconds || 0) > Number(best.seconds || 0)) return item;
    return best;
  }, null);
  const tickSteps = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    ratio,
    valueHours: safeMaxHours * ratio,
    label: formatUsageTime(safeMaxHours * ratio * 3600)
  }));
  const selectedWindowLabel = TRACKED_WINDOW_OPTIONS.find((option) => Number(option.value) === Number(dayWindow))?.shortLabel || `${dayWindow} days`;

  return (
    <section className="card workspace-panel learner-insights-hours-panel learner-insights-tone-teal">
      <div className="section-header compact learner-insights-section-header">
        <div>
          <p className="eyebrow">Full-Site Usage</p>
          <h3>Active webapp hours in the last {dayWindow} days</h3>
          <p className="subtitle">Captured from real session heartbeats across the entire webapp, not only timed assessments.</p>
        </div>
        <StatCard label="Usage Time" value={formatUsageTime(totalSeconds)} />
      </div>

      <div className="learner-insights-usage-mobile-head">
        <span className="learner-insights-usage-window-pill">{selectedWindowLabel}</span>
        {peakItem && Number(peakItem.seconds || 0) > 0 ? (
          <span className="learner-insights-usage-peak-note">
            Peak {peakItem.label} · {formatUsageTime(peakItem.seconds)}
          </span>
        ) : null}
      </div>

      <div className="learner-insights-usage-chart-shell">
        <div className="learner-insights-usage-axis" aria-hidden="true">
          {tickSteps.map((tick) => (
            <span
              key={`tick-${tick.ratio}`}
              className="learner-insights-usage-axis-label"
              style={{ bottom: `${tick.ratio * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div className="learner-insights-usage-plot">
          <div className="learner-insights-usage-grid" aria-hidden="true">
            {tickSteps.map((tick) => (
              <span
                key={`grid-${tick.ratio}`}
                className="learner-insights-usage-grid-line"
                style={{ bottom: `${tick.ratio * 100}%` }}
              />
            ))}
          </div>

          <div className="learner-insights-day-chart">
            {items.map((item) => {
              const heightPercent = maxHours > 0 ? (item.hours / maxHours) * 100 : 0;
              const isPeak = peakItem && peakItem.key === item.key && Number(item.seconds || 0) > 0;
              return (
                <article key={item.key} className={`learner-insights-day-column${isPeak ? ' is-peak' : ''}`}>
                  <span className={`learner-insights-day-value${isPeak ? ' is-peak' : ''}`}>{formatUsageTime(item.seconds)}</span>
                  <div className="learner-insights-day-bar-track">
                    <div
                      className="learner-insights-day-bar-fill"
                      style={{ height: `${Math.max(item.hours > 0 ? 14 : 0, heightPercent)}%` }}
                    />
                  </div>
                  <strong className="learner-insights-day-label">{item.label}</strong>
                  <span className="learner-insights-day-date">{item.shortDate}</span>
                  <small className="learner-insights-day-status">{item.hours > 0 ? 'Active day' : 'No activity'}</small>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div className="learner-insights-usage-footer">
        <span>X-axis: day in selected window</span>
        <span>Y-axis: active usage time</span>
      </div>
    </section>
  );
}

export default function AdminLearnerInsightsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username = '' } = useParams();
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState(null);
  const [filters, setFilters] = useState({
    from: shiftDate(-6),
    to: shiftDate(0),
    dayWindow: '7',
    course: 'all',
    batch: 'all'
  });

  useAutoDismissMessage(banner, setBanner);

  useEffect(() => {
    let ignore = false;

    async function loadInsights() {
      setLoading(true);
      try {
        const result = await fetchAdminUserInsights(username);
        if (!ignore) {
          setInsights(result);
        }
      } catch (error) {
        if (!ignore) {
          setBanner({ type: 'error', text: error.message || 'Failed to load learner insights.' });
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadInsights();
    return () => {
      ignore = true;
    };
  }, [username]);

  const learner = insights?.learner || {};
  const overview = insights?.overview || {};
  const progressBars = Array.isArray(insights?.progress?.bars) ? insights.progress.bars : [];
  const coursePayments = Array.isArray(insights?.purchases?.coursePayments) ? insights.purchases.coursePayments : [];
  const testSeriesPayments = Array.isArray(insights?.purchases?.testSeriesPayments) ? insights.purchases.testSeriesPayments : [];
  const siteUsage = insights?.activity?.siteUsage || {};
  const siteUsageDaily = Array.isArray(siteUsage?.dailyUsage) ? siteUsage.dailyUsage : [];
  const avatarSrc = useMemo(() => buildAvatarSrc(learner.avatarUrl), [learner.avatarUrl]);
  const learnerInitial = String(learner.username || username || 'L').trim().charAt(0).toUpperCase();

  const quizAttempts = Array.isArray(insights?.activity?.quizAttempts)
    ? insights.activity.quizAttempts
    : (Array.isArray(insights?.activity?.recentQuizAttempts) ? insights.activity.recentQuizAttempts : []);
  const topicTestAttempts = Array.isArray(insights?.activity?.topicTestAttempts)
    ? insights.activity.topicTestAttempts
    : (Array.isArray(insights?.activity?.recentTopicTestAttempts) ? insights.activity.recentTopicTestAttempts : []);
  const fullMockAttempts = Array.isArray(insights?.activity?.fullMockAttempts)
    ? insights.activity.fullMockAttempts
    : (Array.isArray(insights?.activity?.recentFullMockAttempts) ? insights.activity.recentFullMockAttempts : []);
  const mockExamAttempts = Array.isArray(insights?.activity?.mockExamAttempts)
    ? insights.activity.mockExamAttempts
    : (Array.isArray(insights?.activity?.recentMockExamAttempts) ? insights.activity.recentMockExamAttempts : []);
  const recentCompletedVideos = Array.isArray(insights?.activity?.recentCompletedVideos) ? insights.activity.recentCompletedVideos : [];

  const availableCourses = useMemo(() => {
    const values = new Set();
    [
      learner?.class,
      ...coursePayments.map((item) => item.course),
      ...testSeriesPayments.map((item) => item.course),
      ...quizAttempts.map((item) => item.category),
      ...topicTestAttempts.map((item) => item.category),
      ...fullMockAttempts.map((item) => item.category),
      ...mockExamAttempts.map((item) => item.category),
      ...recentCompletedVideos.map((item) => item.category),
      ...(Array.isArray(learner?.purchasedCourses) ? learner.purchasedCourses.map((item) => item?.course) : [])
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .forEach((value) => values.add(value));
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [learner?.class, learner?.purchasedCourses, coursePayments, testSeriesPayments, quizAttempts, topicTestAttempts, fullMockAttempts, mockExamAttempts, recentCompletedVideos]);

  const availableBatches = useMemo(() => {
    const selectedCourse = normalizeFilterToken(filters.course);
    const values = new Set();
    const addIfMatchingCourse = (courseValue, batchValue) => {
      const normalizedCourse = normalizeFilterToken(courseValue);
      if (selectedCourse !== 'all' && normalizedCourse !== selectedCourse) return;
      const batch = String(batchValue || '').trim();
      if (batch) values.add(batch);
    };

    coursePayments.forEach((item) => addIfMatchingCourse(item.course, item.batch));
    testSeriesPayments.forEach((item) => addIfMatchingCourse(item.course, item.batch));
    quizAttempts.forEach((item) => addIfMatchingCourse(item.category, item.batch));
    topicTestAttempts.forEach((item) => addIfMatchingCourse(item.category, item.batch));
    fullMockAttempts.forEach((item) => addIfMatchingCourse(item.category, item.batch));
    mockExamAttempts.forEach((item) => addIfMatchingCourse(item.category, item.batch));
    (Array.isArray(learner?.purchasedCourses) ? learner.purchasedCourses : []).forEach((item) => addIfMatchingCourse(item?.course, item?.batch));

    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [filters.course, coursePayments, testSeriesPayments, quizAttempts, topicTestAttempts, fullMockAttempts, mockExamAttempts, learner?.purchasedCourses]);

  useEffect(() => {
    if (filters.batch === 'all') return;
    if (availableBatches.includes(filters.batch)) return;
    setFilters((current) => ({ ...current, batch: 'all' }));
  }, [availableBatches, filters.batch]);

  function matchesCourseBatch(courseValue, batchValue) {
    const selectedCourse = normalizeFilterToken(filters.course);
    const selectedBatch = normalizeFilterToken(filters.batch);
    const currentCourse = normalizeFilterToken(courseValue);
    const currentBatch = normalizeFilterToken(batchValue || 'General');
    if (selectedCourse !== 'all' && currentCourse !== selectedCourse) return false;
    if (selectedBatch !== 'all' && currentBatch !== selectedBatch) return false;
    return true;
  }

  const dateRange = useMemo(() => normalizeDateRange(filters.from, filters.to), [filters.from, filters.to]);

  const filteredQuizAttempts = useMemo(
    () => filterAttemptList(quizAttempts, dateRange).filter((item) => matchesCourseBatch(item.category, item.batch)),
    [quizAttempts, dateRange, filters.course, filters.batch]
  );
  const filteredTopicTestAttempts = useMemo(
    () => filterAttemptList(topicTestAttempts, dateRange).filter((item) => matchesCourseBatch(item.category, item.batch)),
    [topicTestAttempts, dateRange, filters.course, filters.batch]
  );
  const filteredFullMockAttempts = useMemo(
    () => filterAttemptList(fullMockAttempts, dateRange).filter((item) => matchesCourseBatch(item.category, item.batch)),
    [fullMockAttempts, dateRange, filters.course, filters.batch]
  );
  const filteredMockExamAttempts = useMemo(
    () => filterAttemptList(mockExamAttempts, dateRange).filter((item) => matchesCourseBatch(item.category, item.batch)),
    [mockExamAttempts, dateRange, filters.course, filters.batch]
  );
  const filteredAssessmentAttempts = useMemo(
    () => [...filteredQuizAttempts, ...filteredTopicTestAttempts, ...filteredFullMockAttempts, ...filteredMockExamAttempts],
    [filteredQuizAttempts, filteredTopicTestAttempts, filteredFullMockAttempts, filteredMockExamAttempts]
  );
  const filteredCoursePayments = useMemo(
    () => coursePayments.filter((item) => matchesCourseBatch(item.course, item.batch)),
    [coursePayments, filters.course, filters.batch]
  );
  const filteredTestSeriesPayments = useMemo(
    () => testSeriesPayments.filter((item) => matchesCourseBatch(item.course, item.batch)),
    [testSeriesPayments, filters.course, filters.batch]
  );
  const filteredVoucherUsage = useMemo(
    () => [...filteredCoursePayments, ...filteredTestSeriesPayments].filter((item) => item.voucherCode),
    [filteredCoursePayments, filteredTestSeriesPayments]
  );
  const filteredCompletedVideos = useMemo(
    () => recentCompletedVideos.filter((item) => matchesCourseBatch(item.category, item.batch)),
    [recentCompletedVideos, filters.course, filters.batch]
  );
  const filteredPurchasedCourses = useMemo(
    () => (Array.isArray(learner.purchasedCourses) ? learner.purchasedCourses : []).filter((item) => matchesCourseBatch(item?.course, item?.batch)),
    [learner.purchasedCourses, filters.course, filters.batch]
  );

  const selectedRangeTrackedSeconds = useMemo(
    () => sumDailyUsageRange(siteUsageDaily, dateRange),
    [siteUsageDaily, dateRange]
  );

  const trackedHoursSeries = useMemo(
    () => buildDailyUsageSeries(siteUsageDaily, Number(filters.dayWindow || 7)),
    [siteUsageDaily, filters.dayWindow]
  );

  const trackedHoursWindowSeconds = useMemo(
    () => trackedHoursSeries.reduce((sum, item) => sum + Number(item.seconds || 0), 0),
    [trackedHoursSeries]
  );

  const quizFrequency = useMemo(() => buildFrequencySummary(filteredQuizAttempts), [filteredQuizAttempts]);
  const examFrequency = useMemo(
    () => buildFrequencySummary([...filteredTopicTestAttempts, ...filteredFullMockAttempts, ...filteredMockExamAttempts]),
    [filteredTopicTestAttempts, filteredFullMockAttempts, filteredMockExamAttempts]
  );

  const filterSummary = useMemo(() => {
    const scope = [
      filters.course !== 'all' ? filters.course : null,
      filters.batch !== 'all' ? filters.batch : null
    ].filter(Boolean).join(' • ');
    if (filters.from && filters.to) {
      return scope
        ? `${formatDate(filters.from)} to ${formatDate(filters.to)} · ${scope}`
        : `${formatDate(filters.from)} to ${formatDate(filters.to)}`;
    }
    if (filters.from) {
      return scope ? `From ${formatDate(filters.from)} · ${scope}` : `From ${formatDate(filters.from)}`;
    }
    if (filters.to) {
      return scope ? `Up to ${formatDate(filters.to)} · ${scope}` : `Up to ${formatDate(filters.to)}`;
    }
    return scope ? `All-time attempt history · ${scope}` : 'All-time attempt history';
  }, [filters.from, filters.to, filters.course, filters.batch]);

  const coursePurchaseColumns = useMemo(() => ([
    {
      key: 'course',
      label: 'Course',
      render: (item) => (
        <div className="learner-insights-table-strong">
          <strong>{item.course}</strong>
          <span>
            {(item.moduleName === 'ALL_MODULES' ? 'Full course access' : item.moduleName)}
            {item.batch ? ` • Batch: ${item.batch}` : ''}
          </span>
        </div>
      )
    },
    { key: 'plan', label: 'Plan', render: (item) => String(item.planType || '').toUpperCase() || 'NA' },
    { key: 'status', label: 'Status', render: (item) => item.status || 'unknown' },
    { key: 'amount', label: 'Amount', render: (item) => formatMoney(item.amountInPaise, item.currency) },
    { key: 'voucher', label: 'Voucher', render: (item) => item.voucherCode || 'No voucher' },
    { key: 'date', label: 'Paid On', render: (item) => formatDate(item.paidAt || item.createdAt) }
  ]), []);

  const testSeriesColumns = useMemo(() => ([
    {
      key: 'course',
      label: 'Course',
      render: (item) => (
        <div className="learner-insights-table-strong">
          <strong>{item.course}</strong>
          <span>
            {item.seriesType === 'topic_test' ? 'Topic Tests' : 'Full Mocks'}
            {item.batch ? ` • Batch: ${item.batch}` : ''}
          </span>
        </div>
      )
    },
    { key: 'status', label: 'Status', render: (item) => item.status || 'unknown' },
    { key: 'amount', label: 'Amount', render: (item) => formatMoney(item.amountInPaise, item.currency) },
    { key: 'voucher', label: 'Voucher', render: (item) => item.voucherCode || 'No voucher' },
    { key: 'date', label: 'Paid On', render: (item) => formatDate(item.paidAt || item.createdAt) }
  ]), []);

  const backTarget = typeof location.state?.from === 'string' && location.state.from
    ? location.state.from
    : '/admin/registered-learners';

  function handleBackNavigation() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate(backTarget, { replace: true });
  }

  return (
    <AppShell
      title="Learner Insights"
      subtitle="Detailed admin workspace for one registered learner"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <div className="registered-learners-topbar-actions">
          <button
            type="button"
            className={`secondary-btn workspace-refresh-btn${refreshing ? ' is-loading' : ''}`}
            onClick={() => {
              setRefreshing(true);
              fetchAdminUserInsights(username)
                .then((result) => setInsights(result))
                .catch((error) => setBanner({ type: 'error', text: error.message || 'Failed to refresh learner insights.' }))
                .finally(() => setRefreshing(false));
            }}
            disabled={refreshing}
          >
            <span className="workspace-refresh-btn-icon" aria-hidden="true">↻</span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="secondary-btn" onClick={handleBackNavigation}>
            ← Back to Learners
          </button>
        </div>
      )}
    >
      <main className="admin-workspace-page learner-insights-page">
        <section className="workspace-hero learner-insights-hero">
          <div className="learner-insights-hero-main">
            <div className="learner-insights-avatar-block">
              {avatarSrc ? (
                <img className="learner-insights-avatar-image" src={avatarSrc} alt={`${learner.username || username} avatar`} />
              ) : (
                <div className="learner-insights-avatar-fallback">{learnerInitial}</div>
              )}
              <div className="learner-insights-avatar-meta">
                <p className="eyebrow">Student Detail Workspace</p>
                <h2>{learner.username || username}</h2>
                <p className="subtitle">Track purchases, voucher usage, repeat quiz behavior, exam activity and true full-site usage in one premium admin view.</p>
              </div>
            </div>
            <div className="learner-insights-meta-row">
              {learner.class ? <span className="student-course-badge">{learner.class}</span> : null}
              <span className="storage-monitor-meta-pill">Joined {formatDate(learner.createdAt)}</span>
              <span className="storage-monitor-meta-pill">{learner.city || 'City not available'}</span>
              <span className="storage-monitor-meta-pill">{learner.email || 'Email not available'}</span>
            </div>
            <div className="learner-insights-contact-grid">
              <article className="learner-insights-contact-card">
                <span>Phone</span>
                <strong>{learner.phone || 'Not available'}</strong>
              </article>
              <article className="learner-insights-contact-card">
                <span>Email</span>
                <strong>{learner.email || 'Not available'}</strong>
              </article>
              <article className="learner-insights-contact-card">
                <span>City</span>
                <strong>{learner.city || 'Not available'}</strong>
              </article>
            </div>
          </div>
          <div className="workspace-hero-stats learner-insights-hero-stats">
            <StatCard label="Course Purchases" value={overview.totalCoursePurchases || 0} />
            <StatCard label="Test Series" value={overview.totalTestSeriesPurchases || 0} />
            <StatCard label="Voucher Uses" value={overview.totalVoucherUses || 0} />
            <StatCard label="Site Usage" value={formatUsageTime(overview.totalWebappUsageSeconds || 0)} />
            <StatCard label="Video Progress" value={formatPercent(overview.videoCompletionPercent || 0)} />
          </div>
        </section>

        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}
        {loading ? <p className="empty-note">Loading learner insights...</p> : null}

        {!loading && insights ? (
          <>
            <section className="learner-insights-main-grid">
              <section className="card workspace-panel learner-insights-progress-card">
                <div className="section-header compact learner-insights-section-header">
                  <div>
                    <p className="eyebrow">Progress Graph</p>
                    <h3>Premium progress overview</h3>
                    <p className="subtitle">Bar colors highlight current completion and accuracy across videos, quizzes and test series.</p>
                  </div>
                </div>
                <div className="learner-insights-bar-chart">
                  {progressBars.map((item) => (
                    <div key={item.key} className="learner-insights-bar-row">
                      <div className="learner-insights-bar-label-row">
                        <span>{item.label}</span>
                        <strong>{formatPercent(item.value)}</strong>
                      </div>
                      <div className="learner-insights-bar-track">
                        <div className={`learner-insights-bar-fill learner-insights-bar-${item.tone}`} style={{ width: `${Math.min(100, Number(item.value || 0))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="learner-insights-mini-metrics">
                  {progressBars.map((item) => (
                    <article key={`mini-${item.key}`} className="learner-insights-mini-metric">
                      <span>{item.label}</span>
                      <strong>{formatPercent(item.value)}</strong>
                    </article>
                  ))}
                </div>
              </section>

              <section className="card workspace-panel learner-insights-profile-card">
                <div className="section-header compact learner-insights-section-header">
                  <div>
                    <p className="eyebrow">Student Info</p>
                    <h3>Profile and unlocked access</h3>
                  </div>
                  <StatCard label="Completed Videos" value={`${overview.completedCourseVideos || 0}/${overview.totalCourseVideos || 0}`} />
                </div>
                <div className="learner-insights-profile-grid">
                  <div><span>Phone</span><strong>{learner.phone || 'Not available'}</strong></div>
                  <div><span>Email</span><strong>{learner.email || 'Not available'}</strong></div>
                  <div><span>City</span><strong>{learner.city || 'Not available'}</strong></div>
                  <div><span>Class</span><strong>{learner.class || 'Not available'}</strong></div>
                </div>
                <div className="learner-insights-access-list">
                  {filteredPurchasedCourses.length ? (
                    filteredPurchasedCourses.map((item, index) => (
                      <article key={`${item.course}-${item.moduleName}-${index}`} className="learner-insights-access-item">
                        <strong>{item.course}</strong>
                        <p>
                          {item.moduleName === 'ALL_MODULES' ? 'Full course unlocked' : item.moduleName}
                          {item.batch ? ` • Batch: ${item.batch}` : ''}
                        </p>
                        <span>{String(item.planType || '').toUpperCase()} · {formatDate(item.unlockedAt)}</span>
                      </article>
                    ))
                  ) : (
                    <p className="empty-note">No unlocked course access found for the selected course/batch filters.</p>
                  )}
                </div>
              </section>
            </section>

            <section className="card workspace-panel learner-insights-filter-panel">
              <div className="section-header compact learner-insights-section-header">
                <div>
                  <p className="eyebrow">Attempt Filters</p>
                  <h3>Date-range controls for history and repeat counts</h3>
                  <p className="subtitle">Attempt tables and repeat-attempt charts below use this range. The usage chart reads from full-site session tracking and uses the day window selector.</p>
                </div>
              </div>
              <div className="learner-insights-filter-grid">
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Course</span>
                  <select
                    value={filters.course}
                    onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))}
                  >
                    <option value="all">All courses</option>
                    {availableCourses.map((courseName) => (
                      <option key={`course-filter-${courseName}`} value={courseName}>{courseName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Batch</span>
                  <select
                    value={filters.batch}
                    onChange={(event) => setFilters((current) => ({ ...current, batch: event.target.value }))}
                  >
                    <option value="all">All batches</option>
                    {availableBatches.map((batchName) => (
                      <option key={`batch-filter-${batchName}`} value={batchName}>{batchName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Tracked usage window</span>
                  <div className="learner-insights-window-switcher" role="tablist" aria-label="Tracked usage window">
                    {TRACKED_WINDOW_OPTIONS.map((option) => {
                      const active = filters.dayWindow === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={`learner-insights-window-chip${active ? ' is-active' : ''}`}
                          onClick={() => setFilters((current) => ({ ...current, dayWindow: option.value }))}
                        >
                          {option.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </label>
                <div className="learner-insights-filter-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setFilters({ from: shiftDate(-6), to: shiftDate(0), dayWindow: '7', course: 'all', batch: 'all' })}
                  >
                    Last 7 days
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setFilters((current) => ({ ...current, from: '', to: '' }))}
                  >
                    All time
                  </button>
                </div>
              </div>
              <div className="learner-insights-filter-stats">
                <StatCard label="Active Range" value={filterSummary} />
                <StatCard label="Filtered Attempts" value={filteredAssessmentAttempts.length} />
                <StatCard label="Filtered Orders" value={filteredCoursePayments.length + filteredTestSeriesPayments.length} />
                <StatCard label="Range Usage" value={formatUsageTime(selectedRangeTrackedSeconds)} />
                <StatCard label="Usage Sessions" value={siteUsage.totalSessions || 0} />
                <StatCard label="Top Repeat Exam" value={examFrequency[0] ? `${examFrequency[0].attempts}x` : '0x'} />
              </div>
            </section>

            <section className="learner-insights-dual-grid learner-insights-analytics-grid">
              <DailyHoursChart
                items={trackedHoursSeries}
                dayWindow={Number(filters.dayWindow || 7)}
                totalSeconds={trackedHoursWindowSeconds}
              />
              <FrequencyBarChart
                title="Most Repeated Exams and Test Series"
                eyebrow="Exam Attempt Graph"
                items={examFrequency}
                emptyText="No test-series or exam attempts found in this range."
                tone="violet"
                subtitle="Shows how many times the learner retook each topic test, full mock or exam in the selected date range."
              />
            </section>

            <section className="learner-insights-dual-grid learner-insights-analytics-grid">
              <FrequencyBarChart
                title="Most Repeated Quizzes"
                eyebrow="Quiz Retake Trend"
                items={quizFrequency}
                emptyText="No quiz attempts found in this range."
                tone="blue"
                subtitle="Counts each quiz attempt for the selected period so admins can spot heavy repeat practice."
              />
              <section className="card workspace-panel learner-insights-frequency-panel learner-insights-tone-amber">
                <div className="section-header compact learner-insights-section-header">
                  <div>
                    <p className="eyebrow">Engagement Summary</p>
                    <h3>Selected-range attempt totals</h3>
                    <p className="subtitle">A compact snapshot of how the learner has used tests in the current date range.</p>
                  </div>
                </div>
                <div className="learner-insights-mini-metrics learner-insights-summary-metrics">
                  <article className="learner-insights-mini-metric">
                    <span>Quiz Attempts</span>
                    <strong>{filteredQuizAttempts.length}</strong>
                  </article>
                  <article className="learner-insights-mini-metric">
                    <span>Topic Tests</span>
                    <strong>{filteredTopicTestAttempts.length}</strong>
                  </article>
                  <article className="learner-insights-mini-metric">
                    <span>Full Mocks</span>
                    <strong>{filteredFullMockAttempts.length}</strong>
                  </article>
                  <article className="learner-insights-mini-metric">
                    <span>Monthly Mocks</span>
                    <strong>{filteredMockExamAttempts.length}</strong>
                  </article>
                  <article className="learner-insights-mini-metric">
                    <span>Tracked Time</span>
                    <strong>{formatUsageTime(selectedRangeTrackedSeconds)}</strong>
                  </article>
                  <article className="learner-insights-mini-metric">
                    <span>Top Quiz Retake</span>
                    <strong>{quizFrequency[0] ? `${quizFrequency[0].attempts}x` : '0x'}</strong>
                  </article>
                </div>
              </section>
            </section>

            <section className="learner-insights-dual-grid">
              <CollapsiblePurchaseTable
                title="Course memberships bought by this learner"
                eyebrow="Purchases"
                items={filteredCoursePayments}
                summaryLabel="Open course purchase table"
                columns={coursePurchaseColumns}
                emptyText="No course purchase history found."
              />
              <CollapsiblePurchaseTable
                title="Topic test and full mock purchases"
                eyebrow="Test Series"
                items={filteredTestSeriesPayments}
                summaryLabel="Open test series purchase table"
                columns={testSeriesColumns}
                emptyText="No test series purchase history found."
              />
            </section>

            <section className="card workspace-panel learner-insights-voucher-panel">
              <div className="section-header compact learner-insights-section-header">
                <div>
                  <p className="eyebrow">Voucher Usage</p>
                  <h3>All voucher codes used by this learner</h3>
                </div>
                <StatCard label="Used" value={filteredVoucherUsage.length} />
              </div>
              {!filteredVoucherUsage.length ? (
                <p className="empty-note">This learner has not used any voucher code in the selected scope.</p>
              ) : (
                <div className="learner-insights-voucher-grid">
                  {filteredVoucherUsage.map((item) => (
                    <article key={`voucher-${item.id}`} className="learner-insights-voucher-card">
                      <strong>{item.voucherCode}</strong>
                      <p>{item.voucherDescription || 'Voucher applied on purchase'}</p>
                      <div className="learner-insights-voucher-meta">
                        <span>{item.course}{item.batch ? ` • ${item.batch}` : ''}</span>
                        <span>{formatDate(item.paidAt || item.createdAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="learner-insights-activity-grid">
              <ActivityPanel
                title="Quiz Attempt History"
                eyebrow="Quiz Activity"
                items={filteredQuizAttempts}
                emptyText="No quiz attempts recorded in this range."
                tone="blue"
              />
              <ActivityPanel
                title="Topic Test History"
                eyebrow="Test Series Activity"
                items={filteredTopicTestAttempts}
                emptyText="No topic test attempts recorded in this range."
                tone="amber"
              />
              <ActivityPanel
                title="Full Mock History"
                eyebrow="Test Series Activity"
                items={filteredFullMockAttempts}
                emptyText="No full mock attempts recorded in this range."
                tone="violet"
              />
              <ActivityPanel
                title="Monthly Mock History"
                eyebrow="Mock Exam Activity"
                items={filteredMockExamAttempts}
                emptyText="No monthly mock attempts recorded in this range."
                tone="rose"
              />
            </section>

            <ActivityPanel
              title="Completed Videos"
              eyebrow="Learning Progress"
              items={filteredCompletedVideos}
              emptyText="No completed videos recorded yet."
              tone="teal"
              summaryLabel="Open completed video table"
            />
          </>
        ) : null}
      </main>
    </AppShell>
  );
}