const express = require('express');
const { StreamChat } = require('stream-chat');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const ChatHistory = require('../models/ChatHistory');
const User = require('../models/User');
const Module = require('../models/Module');
const Topic = require('../models/Topic');
const Video = require('../models/Video');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const MockExam = require('../models/MockExam');
const TopicTest = require('../models/TopicTest');
const FullMockTest = require('../models/FullMockTest');
const LiveClass = require('../models/LiveClass');
const MockExamAttempt = require('../models/MockExamAttempt');
const TopicTestAttempt = require('../models/TopicTestAttempt');
const FullMockAttempt = require('../models/FullMockAttempt');
const AuditLog = require('../models/AuditLog');

const MAX_HISTORY_MESSAGES = 200;
const CONTEXT_WINDOW = 20; // how many recent messages to send as context
const DEFAULT_MAX_OUTPUT_TOKENS = 1200;
const STREAM_CHANNEL_TYPE = 'messaging';
const STREAM_CHANNEL_ID = 'community-general';
const WEBAPP_CONTEXT_CACHE_MS = 10 * 1000;

const webappContextCache = {
  snapshot: null,
  fetchedAt: 0
};

const adminContextCache = {
  snapshot: null,
  fetchedAt: 0
};

function getChatOwnerKey(user = {}) {
  const role = user?.role === 'admin' ? 'admin' : 'user';
  const username = cleanCatalogValue(user?.username || 'guest', 'guest');
  return `${role}:${username}`;
}

function getChatLookupKeys(user = {}) {
  const ownerKey = getChatOwnerKey(user);
  const plainUsername = cleanCatalogValue(user?.username || 'guest', 'guest');
  return ownerKey.startsWith('user:') ? [ownerKey, plainUsername] : [ownerKey];
}

function cleanCatalogValue(value, fallback = 'General') {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || fallback;
}

function uniqueSorted(values = []) {
  return [...new Set(values.map((value) => cleanCatalogValue(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function listPreview(values = [], maxItems = 6) {
  const normalized = uniqueSorted(values);
  if (!normalized.length) return 'General';
  const items = normalized.slice(0, maxItems);
  return normalized.length > maxItems ? `${items.join(', ')} +${normalized.length - maxItems} more` : items.join(', ');
}

function formatDateLabel(value) {
  if (!value) return 'date not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'date not set';
  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatAccessStatus(hasAccess) {
  return hasAccess ? 'already unlocked for this student' : 'exists on the platform but may require purchase or access';
}

async function buildWebappKnowledgeSnapshot() {
  const cacheAge = Date.now() - webappContextCache.fetchedAt;
  if (webappContextCache.snapshot && cacheAge < WEBAPP_CONTEXT_CACHE_MS) {
    return webappContextCache.snapshot;
  }

  const [modules, topics, videos, quizzes, monthlyExams, topicTests, fullMocks, liveClasses] = await Promise.all([
    Module.find({}, 'category name').sort({ category: 1, name: 1 }).lean(),
    Topic.find({}, 'category module name').sort({ category: 1, module: 1, name: 1 }).lean(),
    Video.find({}, 'category module topic title').lean(),
    Quiz.find({}, 'category module topic title').lean(),
    MockExam.find({}, 'category title examDate examWindowEndAt resultReleased').sort({ examDate: 1 }).lean(),
    TopicTest.find({}, 'category module topic title').lean(),
    FullMockTest.find({}, 'category title').lean(),
    LiveClass.find({}, 'title isActive isScheduled startedAt scheduledAt').sort({ scheduledAt: 1, startedAt: -1 }).lean()
  ]);

  const moduleMap = new Map();
  const ensureEntry = (categoryValue, moduleValue) => {
    const category = cleanCatalogValue(categoryValue);
    const module = cleanCatalogValue(moduleValue);
    const key = `${category}::${module}`;
    if (!moduleMap.has(key)) {
      moduleMap.set(key, {
        key,
        category,
        module,
        topics: new Set(),
        videoCount: 0,
        quizCount: 0,
        topicTestCount: 0
      });
    }
    return moduleMap.get(key);
  };

  modules.forEach((item) => ensureEntry(item.category, item.name));

  topics.forEach((item) => {
    const entry = ensureEntry(item.category, item.module);
    if (item.name && cleanCatalogValue(item.name) !== 'General') entry.topics.add(cleanCatalogValue(item.name));
  });

  videos.forEach((item) => {
    const entry = ensureEntry(item.category, item.module);
    entry.videoCount += 1;
    if (item.topic && cleanCatalogValue(item.topic) !== 'General') entry.topics.add(cleanCatalogValue(item.topic));
  });

  quizzes.forEach((item) => {
    const entry = ensureEntry(item.category, item.module);
    entry.quizCount += 1;
    if (item.topic && cleanCatalogValue(item.topic) !== 'General') entry.topics.add(cleanCatalogValue(item.topic));
  });

  topicTests.forEach((item) => {
    const entry = ensureEntry(item.category, item.module);
    entry.topicTestCount += 1;
    if (item.topic && cleanCatalogValue(item.topic) !== 'General') entry.topics.add(cleanCatalogValue(item.topic));
  });

  const moduleIndex = [...moduleMap.values()]
    .map((entry) => ({
      category: entry.category,
      module: entry.module,
      topics: uniqueSorted([...entry.topics]),
      videoCount: entry.videoCount,
      quizCount: entry.quizCount,
      topicTestCount: entry.topicTestCount
    }))
    .sort((left, right) => left.category.localeCompare(right.category) || left.module.localeCompare(right.module));

  const byCourse = new Map();
  moduleIndex.forEach((entry) => {
    if (!byCourse.has(entry.category)) byCourse.set(entry.category, []);
    byCourse.get(entry.category).push(entry);
  });

  const courseSummaries = [...byCourse.entries()].map(([category, entries]) => ({
    category,
    modules: entries
  }));

  const now = Date.now();
  const upcomingMonthlyExams = monthlyExams
    .filter((exam) => new Date(exam.examWindowEndAt || exam.examDate).getTime() >= now)
    .slice(0, 4)
    .map((exam) => ({
      title: cleanCatalogValue(exam.title),
      category: cleanCatalogValue(exam.category),
      examDate: exam.examDate,
      resultReleased: Boolean(exam.resultReleased)
    }));

  const activeLiveClass = liveClasses.find((item) => item.isActive) || null;
  const upcomingLiveClass = liveClasses.find((item) => item.isScheduled && new Date(item.scheduledAt || 0).getTime() >= now) || null;

  const contextText = [
    'Current Biomics Hub webapp data:',
    courseSummaries.length
      ? `Modules by course:\n${courseSummaries.map((course) => `- ${course.category}: ${course.modules.map((entry) => `${entry.module} [topics: ${listPreview(entry.topics)}; videos: ${entry.videoCount}; quizzes: ${entry.quizCount}; topic tests: ${entry.topicTestCount}]`).join('; ')}`).join('\n')}`
      : '- No modules are currently published.',
    moduleIndex.some((entry) => entry.quizCount > 0)
      ? `Quiz section availability:\n${moduleIndex.filter((entry) => entry.quizCount > 0).map((entry) => `- ${entry.module} (${entry.category}): ${entry.quizCount} quizzes, topics: ${listPreview(entry.topics)}`).join('\n')}`
      : 'Quiz section availability: no quizzes are published right now.',
    upcomingMonthlyExams.length
      ? `Monthly exams currently available:\n${upcomingMonthlyExams.map((exam) => `- ${exam.title} (${exam.category}) on ${formatDateLabel(exam.examDate)}${exam.resultReleased ? ' — result released' : ''}`).join('\n')}`
      : 'Monthly exams: no active or upcoming monthly exam is available right now.',
    `Test series currently available: ${topicTests.length} topic tests and ${fullMocks.length} full mock tests.`,
    activeLiveClass
      ? `Live class right now: ${cleanCatalogValue(activeLiveClass.title)}.`
      : upcomingLiveClass
        ? `Upcoming live class: ${cleanCatalogValue(upcomingLiveClass.title)} at ${formatDateLabel(upcomingLiveClass.scheduledAt)}.`
        : 'Live class status: no live or upcoming class is currently scheduled.'
  ].join('\n\n');

  const snapshot = {
    moduleIndex,
    courseSummaries,
    monthlyExams: monthlyExams.map((exam) => ({
      title: cleanCatalogValue(exam.title),
      category: cleanCatalogValue(exam.category),
      examDate: exam.examDate,
      resultReleased: Boolean(exam.resultReleased)
    })),
    upcomingMonthlyExams,
    topicTestCount: topicTests.length,
    fullMockCount: fullMocks.length,
    activeLiveClass,
    upcomingLiveClass,
    contextText
  };

  webappContextCache.snapshot = snapshot;
  webappContextCache.fetchedAt = Date.now();
  return snapshot;
}

async function buildStudentAccessSummary(username) {
  const student = await User.findOne({ username }, 'purchasedCourses').lean();
  const purchases = Array.isArray(student?.purchasedCourses) ? student.purchasedCourses : [];
  const normalized = purchases.map((item) => ({
    course: cleanCatalogValue(item.course),
    moduleName: cleanCatalogValue(item.moduleName || 'ALL_MODULES'),
    expiresAt: item.expiresAt || null
  }));

  const summaryText = normalized.length
    ? `Student unlocked access: ${normalized.map((item) => item.moduleName === 'ALL_MODULES' ? `${item.course} (all modules)` : `${item.course} / ${item.moduleName}`).join('; ')}`
    : 'Student unlocked access: no paid course or module access is recorded yet.';

  return { entries: normalized, summaryText };
}

function summarizeAuditEvent(log = {}) {
  const action = cleanCatalogValue(log.action, 'UNKNOWN');
  const actor = cleanCatalogValue(log.actorUsername, 'admin');
  const targetType = cleanCatalogValue(log.targetType, 'item');
  const detailParts = [
    log.details?.title,
    log.details?.module,
    log.details?.category,
    log.details?.code,
    log.details?.username
  ].map((value) => cleanCatalogValue(value, '')).filter(Boolean);

  return `${action} by ${actor} on ${targetType}${detailParts.length ? ` (${detailParts.join(' · ')})` : ''} at ${formatDateLabel(log.createdAt)}`;
}

async function buildAdminKnowledgeSnapshot(baseSnapshot) {
  const cacheAge = Date.now() - adminContextCache.fetchedAt;
  if (adminContextCache.snapshot && cacheAge < WEBAPP_CONTEXT_CACHE_MS) {
    return adminContextCache.snapshot;
  }

  const [
    students,
    auditLogs,
    quizAttemptStats,
    quizModuleScores,
    mockAttemptStats,
    topicTestStats,
    topicTestModuleScores,
    fullMockStats
  ] = await Promise.all([
    User.find({}, 'username class city phone email purchasedCourses completedVideos favorites').sort({ username: 1 }).lean(),
    AuditLog.find({}, 'action actorUsername targetType details createdAt').sort({ createdAt: -1 }).limit(30).lean(),
    // Quiz: total attempts + last attempt per student
    QuizAttempt.aggregate([
      {
        $group: {
          _id: '$username',
          quizAttempts: { $sum: 1 },
          lastQuizAt: { $max: '$submittedAt' },
          quizModules: { $addToSet: '$module' },
          totalScore: { $sum: '$score' },
          totalPossible: { $sum: '$total' }
        }
      }
    ]),
    // Quiz: best score per student per module
    QuizAttempt.aggregate([
      {
        $group: {
          _id: { username: '$username', module: '$module', category: '$category' },
          attempts: { $sum: 1 },
          bestScore: { $max: '$score' },
          totalQ: { $first: '$total' },
          avgScore: { $avg: { $multiply: [{ $divide: ['$score', '$total'] }, 100] } },
          lastAt: { $max: '$submittedAt' }
        }
      },
      { $sort: { '_id.username': 1, '_id.module': 1 } }
    ]),
    // Monthly exam: total attempts per student + best score per exam
    MockExamAttempt.aggregate([
      {
        $group: {
          _id: '$username',
          mockExamAttempts: { $sum: 1 },
          lastMockAt: { $max: '$submittedAt' },
          totalScore: { $sum: '$score' },
          totalPossible: { $sum: '$total' },
          categories: { $addToSet: '$category' },
          bestPct: { $max: { $multiply: [{ $divide: ['$score', '$total'] }, 100] } }
        }
      }
    ]),
    // Test series topic tests: per student per module
    TopicTestAttempt.aggregate([
      {
        $group: {
          _id: { username: '$username', module: '$module', category: '$category' },
          attempts: { $sum: 1 },
          bestScore: { $max: '$score' },
          totalQ: { $first: '$total' },
          avgPct: { $avg: { $multiply: [{ $divide: ['$score', '$total'] }, 100] } },
          lastAt: { $max: '$submittedAt' }
        }
      },
      { $sort: { '_id.username': 1, '_id.module': 1 } }
    ]),
    // Test series topic tests: total per student
    TopicTestAttempt.aggregate([
      {
        $group: {
          _id: '$username',
          topicTestAttempts: { $sum: 1 },
          lastTopicTestAt: { $max: '$submittedAt' },
          modules: { $addToSet: '$module' }
        }
      }
    ]),
    // Full mock tests: per student
    FullMockAttempt.aggregate([
      {
        $group: {
          _id: '$username',
          fullMockAttempts: { $sum: 1 },
          lastFullMockAt: { $max: '$submittedAt' },
          bestPct: { $max: { $multiply: [{ $divide: ['$score', '$total'] }, 100] } },
          avgPct: { $avg: { $multiply: [{ $divide: ['$score', '$total'] }, 100] } }
        }
      }
    ])
  ]);

  // ─── Index attempt data by username for O(1) lookups ──────────────────────
  const quizStatMap = new Map(quizAttemptStats.map((item) => [
    cleanCatalogValue(item._id),
    {
      quizAttempts: Number(item.quizAttempts || 0),
      lastQuizAt: item.lastQuizAt || null,
      quizModules: uniqueSorted(item.quizModules || []),
      overallQuizPct: item.totalPossible > 0 ? Math.round((item.totalScore / item.totalPossible) * 100) : 0
    }
  ]));

  // quizModuleBreakdown: Map<username, Array<{module,category,attempts,bestScore,totalQ,avgPct,lastAt}>>
  const quizModuleBreakdownMap = new Map();
  quizModuleScores.forEach((item) => {
    const username = cleanCatalogValue(item._id.username);
    if (!quizModuleBreakdownMap.has(username)) quizModuleBreakdownMap.set(username, []);
    quizModuleBreakdownMap.get(username).push({
      module: cleanCatalogValue(item._id.module),
      category: cleanCatalogValue(item._id.category),
      attempts: Number(item.attempts || 0),
      bestScore: Number(item.bestScore || 0),
      totalQ: Number(item.totalQ || 0),
      avgPct: Math.round(Number(item.avgScore || 0)),
      lastAt: item.lastAt || null
    });
  });

  const mockStatMap = new Map(mockAttemptStats.map((item) => [
    cleanCatalogValue(item._id),
    {
      mockExamAttempts: Number(item.mockExamAttempts || 0),
      lastMockAt: item.lastMockAt || null,
      mockBestPct: Math.round(Number(item.bestPct || 0)),
      mockOverallPct: item.totalPossible > 0 ? Math.round((item.totalScore / item.totalPossible) * 100) : 0,
      mockCategories: uniqueSorted(item.categories || [])
    }
  ]));

  // topicTestModuleBreakdown: Map<username, Array<{module,category,attempts,bestScore,totalQ,avgPct,lastAt}>>
  const topicTestModuleBreakdownMap = new Map();
  topicTestModuleScores.forEach((item) => {
    const username = cleanCatalogValue(item._id.username);
    if (!topicTestModuleBreakdownMap.has(username)) topicTestModuleBreakdownMap.set(username, []);
    topicTestModuleBreakdownMap.get(username).push({
      module: cleanCatalogValue(item._id.module),
      category: cleanCatalogValue(item._id.category),
      attempts: Number(item.attempts || 0),
      bestScore: Number(item.bestScore || 0),
      totalQ: Number(item.totalQ || 0),
      avgPct: Math.round(Number(item.avgPct || 0)),
      lastAt: item.lastAt || null
    });
  });

  const topicTestStatMap = new Map(topicTestStats.map((item) => [
    cleanCatalogValue(item._id),
    {
      topicTestAttempts: Number(item.topicTestAttempts || 0),
      lastTopicTestAt: item.lastTopicTestAt || null,
      topicTestModules: uniqueSorted(item.modules || [])
    }
  ]));

  const fullMockStatMap = new Map(fullMockStats.map((item) => [
    cleanCatalogValue(item._id),
    {
      fullMockAttempts: Number(item.fullMockAttempts || 0),
      lastFullMockAt: item.lastFullMockAt || null,
      fullMockBestPct: Math.round(Number(item.bestPct || 0)),
      fullMockAvgPct: Math.round(Number(item.avgPct || 0))
    }
  ]));

  // ─── Build per-student comprehensive summary ─────────────────────────────
  const studentSummaries = students.map((student) => {
    const username = cleanCatalogValue(student.username);
    const quizMeta = quizStatMap.get(username) || { quizAttempts: 0, lastQuizAt: null, quizModules: [], overallQuizPct: 0 };
    const mockMeta = mockStatMap.get(username) || { mockExamAttempts: 0, lastMockAt: null, mockBestPct: 0, mockOverallPct: 0, mockCategories: [] };
    const topicTestMeta = topicTestStatMap.get(username) || { topicTestAttempts: 0, lastTopicTestAt: null, topicTestModules: [] };
    const fullMockMeta = fullMockStatMap.get(username) || { fullMockAttempts: 0, lastFullMockAt: null, fullMockBestPct: 0, fullMockAvgPct: 0 };

    const purchasedCourses = Array.isArray(student.purchasedCourses)
      ? student.purchasedCourses.map((item) => item?.moduleName && item.moduleName !== 'ALL_MODULES'
        ? `${cleanCatalogValue(item.course)} / ${cleanCatalogValue(item.moduleName)}`
        : `${cleanCatalogValue(item.course)} (all modules)`)
      : [];

    const totalAttempts = quizMeta.quizAttempts + mockMeta.mockExamAttempts + topicTestMeta.topicTestAttempts + fullMockMeta.fullMockAttempts;

    return {
      username,
      className: cleanCatalogValue(student.class, 'Unknown'),
      city: cleanCatalogValue(student.city, 'Unknown'),
      phone: cleanCatalogValue(student.phone, 'Not shared'),
      email: cleanCatalogValue(student.email, 'Not shared'),
      completedVideos: Array.isArray(student.completedVideos) ? student.completedVideos.length : 0,
      favorites: Array.isArray(student.favorites) ? student.favorites.length : 0,
      purchasedCourses,
      // Quiz section
      quizAttempts: quizMeta.quizAttempts,
      quizModules: quizMeta.quizModules,
      quizOverallPct: quizMeta.overallQuizPct,
      lastQuizAt: quizMeta.lastQuizAt,
      quizModuleBreakdown: quizModuleBreakdownMap.get(username) || [],
      // Monthly exam section
      mockExamAttempts: mockMeta.mockExamAttempts,
      mockBestPct: mockMeta.mockBestPct,
      mockOverallPct: mockMeta.mockOverallPct,
      mockCategories: mockMeta.mockCategories,
      lastMockAt: mockMeta.lastMockAt,
      // Test series — topic tests
      topicTestAttempts: topicTestMeta.topicTestAttempts,
      topicTestModules: topicTestMeta.topicTestModules,
      lastTopicTestAt: topicTestMeta.lastTopicTestAt,
      topicTestModuleBreakdown: topicTestModuleBreakdownMap.get(username) || [],
      // Test series — full mocks
      fullMockAttempts: fullMockMeta.fullMockAttempts,
      fullMockBestPct: fullMockMeta.fullMockBestPct,
      fullMockAvgPct: fullMockMeta.fullMockAvgPct,
      lastFullMockAt: fullMockMeta.lastFullMockAt,
      // Combined
      totalAttempts
    };
  });

  const attemptLeaders = [...studentSummaries]
    .sort((left, right) => right.totalAttempts - left.totalAttempts)
    .slice(0, 10);

  const recentAuditEvents = auditLogs.map((log) => ({
    action: cleanCatalogValue(log.action),
    targetType: cleanCatalogValue(log.targetType),
    actorUsername: cleanCatalogValue(log.actorUsername),
    createdAt: log.createdAt,
    summary: summarizeAuditEvent(log)
  }));

  const totalQuizAttempts = studentSummaries.reduce((sum, s) => sum + s.quizAttempts, 0);
  const totalMockAttempts = studentSummaries.reduce((sum, s) => sum + s.mockExamAttempts, 0);
  const totalTopicTestAttempts = studentSummaries.reduce((sum, s) => sum + s.topicTestAttempts, 0);
  const totalFullMockAttempts = studentSummaries.reduce((sum, s) => sum + s.fullMockAttempts, 0);

  const contextText = [
    `Admin data snapshot: ${studentSummaries.length} registered students, ${baseSnapshot.moduleIndex.length} modules, ${baseSnapshot.monthlyExams.length} monthly exams, ${baseSnapshot.topicTestCount} topic tests, ${baseSnapshot.fullMockCount} full mock tests.`,
    `Platform-wide attempts: ${totalQuizAttempts} quiz, ${totalMockAttempts} monthly exam, ${totalTopicTestAttempts} topic test (series), ${totalFullMockAttempts} full mock (series).`,
    attemptLeaders.length
      ? `Most active students (all sections):\n${attemptLeaders.map((item) => `- ${item.username}: quiz ${item.quizAttempts}, monthly exam ${item.mockExamAttempts}, topic test ${item.topicTestAttempts}, full mock ${item.fullMockAttempts} | overall quiz avg ${item.quizOverallPct}%, mock best ${item.mockBestPct}%`).join('\n')}`
      : 'Most active students: no attempts recorded yet.',
    recentAuditEvents.length
      ? `Recent admin log events:\n${recentAuditEvents.slice(0, 15).map((item) => `- ${item.summary}`).join('\n')}`
      : 'Recent admin log events: no recent audit entries.'
  ].join('\n\n');

  const snapshot = {
    studentSummaries,
    attemptLeaders,
    recentAuditEvents,
    totalQuizAttempts,
    totalMockAttempts,
    totalTopicTestAttempts,
    totalFullMockAttempts,
    contextText
  };

  adminContextCache.snapshot = snapshot;
  adminContextCache.fetchedAt = Date.now();
  return snapshot;
}

function findRelevantStudents(question, studentSummaries = []) {
  const text = cleanCatalogValue(question, '').toLowerCase();
  if (!text) return [];

  return studentSummaries.filter((student) => {
    return [student.username, student.className, student.city, student.phone, student.email]
      .some((value) => cleanCatalogValue(value, '').toLowerCase() && text.includes(cleanCatalogValue(value, '').toLowerCase()));
  }).slice(0, 5);
}

function hasStudentAccess(accessSummary, category, moduleName) {
  const entries = Array.isArray(accessSummary?.entries) ? accessSummary.entries : [];
  return entries.some((entry) => {
    const sameCourse = cleanCatalogValue(entry.course).toLowerCase() === cleanCatalogValue(category).toLowerCase();
    if (!sameCourse) return false;
    return cleanCatalogValue(entry.moduleName) === 'ALL_MODULES'
      || cleanCatalogValue(entry.moduleName).toLowerCase() === cleanCatalogValue(moduleName).toLowerCase();
  });
}

function findRelevantModules(question, snapshot) {
  const text = cleanCatalogValue(question, '').toLowerCase();
  if (!text) return [];
  return snapshot.moduleIndex.filter((entry) => {
    const moduleName = entry.module.toLowerCase();
    const categoryName = entry.category.toLowerCase();
    if (!moduleName || moduleName === 'general') return false;
    return text.includes(moduleName) || text.includes(`${moduleName} module`) || text.includes(categoryName);
  }).slice(0, 4);
}

async function translateStructuredAnswer(apiKey, answer, language) {
  if (language === 'en') return answer;
  if (language === 'or') return enforceOdiaResponse(apiKey, answer, answer);

  try {
    const { geminiRes, data } = await callGemini(
      apiKey,
      'Translate the answer into simple Hindi in Devanagari only. Keep all facts, bullet points, headings, names, and numbers accurate. Do not add new information.',
      [{ role: 'user', parts: [{ text: answer }] }],
      { temperature: 0.1, maxOutputTokens: 1200 }
    );
    if (geminiRes.ok) {
      const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (translated) return translated;
    }
  } catch (_) {
    // Fall back to English answer if translation fails.
  }

  return answer;
}

async function resolveWebappAwareAnswer({ question, language, snapshot, accessSummary, apiKey }) {
  const lower = cleanCatalogValue(question, '').toLowerCase();
  const matchedModules = findRelevantModules(question, snapshot);

  if (/monthly\s*(exam|mock)|mock\s*exam|exam\s*section|is there any.*exam|upcoming.*exam/.test(lower)) {
    const answer = snapshot.upcomingMonthlyExams.length
      ? [
          'Yes, monthly exams are available right now.',
          ...snapshot.upcomingMonthlyExams.map((exam) => `- ${exam.title} for ${exam.category} on ${formatDateLabel(exam.examDate)}${exam.resultReleased ? ' (result released)' : ''}`)
        ].join('\n')
      : 'Right now there is no active or upcoming monthly exam published in the webapp.';
    return translateStructuredAnswer(apiKey, answer, language);
  }

  if ((/module/.test(lower) || matchedModules.length) && !/test\s*series|mock\s*test/.test(lower)) {
    if (matchedModules.length) {
      const answer = matchedModules.map((entry) => {
        const accessStatus = formatAccessStatus(hasStudentAccess(accessSummary, entry.category, entry.module));
        return [
          `Yes, ${entry.module} is available in ${entry.category}.`,
          `Topics created so far: ${listPreview(entry.topics, 10)}.`,
          `Current content: ${entry.videoCount} video lectures, ${entry.quizCount} quizzes, and ${entry.topicTestCount} topic tests.`,
          `Access status for this student: ${accessStatus}.`
        ].join(' ');
      }).join('\n\n');
      return translateStructuredAnswer(apiKey, answer, language);
    }

    if (/what modules|which modules|available modules|list.*modules/.test(lower)) {
      const answer = snapshot.courseSummaries.length
        ? `Available modules right now:\n${snapshot.courseSummaries.map((course) => `- ${course.category}: ${course.modules.map((entry) => entry.module).join(', ')}`).join('\n')}`
        : 'No modules are currently available in the webapp.';
      return translateStructuredAnswer(apiKey, answer, language);
    }
  }

  if (/quiz\s*(section|details|available|availability)|what quizzes|which quizzes|quiz topics/.test(lower)) {
    const quizEnabledModules = snapshot.moduleIndex.filter((entry) => entry.quizCount > 0);
    const answer = quizEnabledModules.length
      ? [
          'Quiz section is available now for these modules:',
          ...quizEnabledModules.map((entry) => `- ${entry.module} (${entry.category}): ${entry.quizCount} quizzes, topics: ${listPreview(entry.topics, 8)}`)
        ].join('\n')
      : 'No quiz section has been published yet.';
    return translateStructuredAnswer(apiKey, answer, language);
  }

  if (/test\s*series|topic\s*test|full\s*mock/.test(lower)) {
    const answer = `Current test series availability: ${snapshot.topicTestCount} topic tests and ${snapshot.fullMockCount} full mock tests are published in the webapp.`;
    return translateStructuredAnswer(apiKey, answer, language);
  }

  return '';
}

// ─── helpers used only inside resolveAdminAwareAnswer ────────────────────────

function formatModuleScoreRow(row) {
  const pctLabel = row.totalQ > 0 ? ` (best ${row.bestScore}/${row.totalQ} = ${Math.round((row.bestScore / row.totalQ) * 100)}%, avg ${row.avgPct}%)` : '';
  return `  • ${row.module}${row.category ? ` [${row.category}]` : ''}: ${row.attempts} attempt(s)${pctLabel}, last: ${formatDateLabel(row.lastAt)}`;
}

function buildStudentProfile(student) {
  const lines = [
    `Student: ${student.username}`,
    `Class/Course: ${student.className} | City: ${student.city} | Phone: ${student.phone} | Email: ${student.email}`,
    `Purchased access: ${student.purchasedCourses.length ? student.purchasedCourses.join('; ') : 'None'}`,
    `Videos watched: ${student.completedVideos} | Saved (favourites): ${student.favorites}`,
    '',
    `── Quiz Section ──`,
    `Total quiz attempts: ${student.quizAttempts} | Overall avg score: ${student.quizOverallPct}% | Last attempt: ${formatDateLabel(student.lastQuizAt)}`,
    student.quizModuleBreakdown.length
      ? `Module-wise quiz breakdown:\n${student.quizModuleBreakdown.map(formatModuleScoreRow).join('\n')}`
      : '  No quiz attempts recorded yet.',
    '',
    `── Monthly Exam Section ──`,
    `Total monthly exam attempts: ${student.mockExamAttempts} | Best score: ${student.mockBestPct}% | Overall avg: ${student.mockOverallPct}% | Last attempt: ${formatDateLabel(student.lastMockAt)}`,
    student.mockCategories.length ? `Courses attempted: ${student.mockCategories.join(', ')}` : '',
    '',
    `── Test Series — Topic Tests ──`,
    `Total topic test attempts: ${student.topicTestAttempts} | Last attempt: ${formatDateLabel(student.lastTopicTestAt)}`,
    student.topicTestModuleBreakdown.length
      ? `Module-wise topic test breakdown:\n${student.topicTestModuleBreakdown.map(formatModuleScoreRow).join('\n')}`
      : '  No topic test attempts recorded yet.',
    '',
    `── Test Series — Full Mock Tests ──`,
    `Total full mock attempts: ${student.fullMockAttempts} | Best score: ${student.fullMockBestPct}% | Avg score: ${student.fullMockAvgPct}% | Last attempt: ${formatDateLabel(student.lastFullMockAt)}`
  ];
  return lines.filter((line) => line !== null && line !== undefined).join('\n');
}

async function resolveAdminAwareAnswer({ question, language, snapshot, adminSnapshot, apiKey }) {
  const lower = cleanCatalogValue(question, '').toLowerCase();
  const matchedStudents = findRelevantStudents(question, adminSnapshot.studentSummaries);

  const wantsScoreOrPerformance = /score|marks|result|performance|percentage|rank|how (well|good)|progress/.test(lower);
  const wantsQuizSection = /quiz/.test(lower);
  const wantsMockSection = /monthly\s*(exam|test|mock)|mock\s*exam|monthly exam/.test(lower);
  const wantsTopicTest = /topic\s*test|test\s*series|series/.test(lower);
  const wantsFullMock = /full\s*mock|full\s*test/.test(lower);
  const wantsModuleWise = /module\s*wise|module-wise|per module|each module|section wise|breakd/.test(lower);
  const wantsAttemptCount = /how many times|attempt|took|taken|tried|retried/.test(lower);

  // ── Full student profile (when a specific student is mentioned) ─────────────
  if (matchedStudents.length && (wantsScoreOrPerformance || wantsAttemptCount || /profile|details|info|data|everything|all about/.test(lower))) {
    const answer = matchedStudents.map((student) => buildStudentProfile(student)).join('\n\n━━━━━━━\n\n');
    return translateStructuredAnswer(apiKey, answer, language);
  }

  // ── Module-wise quiz scores for a specific student ──────────────────────────
  if (matchedStudents.length && wantsQuizSection && (wantsModuleWise || wantsScoreOrPerformance)) {
    const answer = matchedStudents.map((student) => {
      if (!student.quizModuleBreakdown.length) {
        return `${student.username} has not attempted any quizzes yet.`;
      }
      return [
        `Quiz section score breakdown for ${student.username} (${student.className}):`,
        `Overall: ${student.quizAttempts} attempt(s), average score ${student.quizOverallPct}%`,
        ...student.quizModuleBreakdown.map(formatModuleScoreRow)
      ].join('\n');
    }).join('\n\n');
    return translateStructuredAnswer(apiKey, answer, language);
  }

  // ── Monthly exam scores ─────────────────────────────────────────────────────
  if (matchedStudents.length && wantsMockSection && (wantsScoreOrPerformance || wantsAttemptCount)) {
    const answer = matchedStudents.map((student) => {
      return [
        `Monthly exam section for ${student.username} (${student.className}):`,
        `Total attempts: ${student.mockExamAttempts} | Best score: ${student.mockBestPct}% | Avg score: ${student.mockOverallPct}%`,
        `Last attempted: ${formatDateLabel(student.lastMockAt)}`,
        student.mockCategories.length ? `Courses attempted: ${student.mockCategories.join(', ')}` : 'No monthly exam attempts found.'
      ].join('\n');
    }).join('\n\n');
    return translateStructuredAnswer(apiKey, answer, language);
  }

  // ── Topic test (test series) scores module-wise ─────────────────────────────
  if (matchedStudents.length && wantsTopicTest && (wantsScoreOrPerformance || wantsAttemptCount || wantsModuleWise)) {
    const answer = matchedStudents.map((student) => {
      if (!student.topicTestModuleBreakdown.length) {
        return `${student.username} has not attempted any topic tests (test series) yet.`;
      }
      return [
        `Test series — topic test breakdown for ${student.username} (${student.className}):`,
        `Total topic test attempts: ${student.topicTestAttempts} | Last: ${formatDateLabel(student.lastTopicTestAt)}`,
        ...student.topicTestModuleBreakdown.map(formatModuleScoreRow)
      ].join('\n');
    }).join('\n\n');
    return translateStructuredAnswer(apiKey, answer, language);
  }

  // ── Full mock test scores ───────────────────────────────────────────────────
  if (matchedStudents.length && wantsFullMock && (wantsScoreOrPerformance || wantsAttemptCount)) {
    const answer = matchedStudents.map((student) => {
      return [
        `Test series — full mock test results for ${student.username} (${student.className}):`,
        `Total full mock attempts: ${student.fullMockAttempts} | Best score: ${student.fullMockBestPct}% | Avg score: ${student.fullMockAvgPct}%`,
        `Last attempted: ${formatDateLabel(student.lastFullMockAt)}`
      ].join('\n');
    }).join('\n\n');
    return translateStructuredAnswer(apiKey, answer, language);
  }

  // ── Generic attempt count for a named student ───────────────────────────────
  if (matchedStudents.length && wantsAttemptCount) {
    const answer = matchedStudents.map((student) => {
      return [
        `${student.username} attempt summary:`,
        `  • Quiz section: ${student.quizAttempts} attempts (modules: ${listPreview(student.quizModules, 6)})`,
        `  • Monthly exam: ${student.mockExamAttempts} attempts`,
        `  • Topic tests (test series): ${student.topicTestAttempts} attempts (modules: ${listPreview(student.topicTestModules, 6)})`,
        `  • Full mock tests (test series): ${student.fullMockAttempts} attempts`,
        `  Total across all sections: ${student.totalAttempts}`
      ].join('\n');
    }).join('\n\n');
    return translateStructuredAnswer(apiKey, answer, language);
  }

  // ── List / count of all students ────────────────────────────────────────────
  if (/student|learner|registered user|registered student|student details|all students|user list|show students/.test(lower) && !matchedStudents.length) {
    const answer = [
      `There are ${adminSnapshot.studentSummaries.length} registered students right now.`,
      `Student list: ${adminSnapshot.studentSummaries.slice(0, 15).map((s) => s.username).join(', ')}${adminSnapshot.studentSummaries.length > 15 ? ` and ${adminSnapshot.studentSummaries.length - 15} more` : ''}.`,
      `Platform-wide attempt totals: ${adminSnapshot.totalQuizAttempts} quiz, ${adminSnapshot.totalMockAttempts} monthly exam, ${adminSnapshot.totalTopicTestAttempts} topic test, ${adminSnapshot.totalFullMockAttempts} full mock.`
    ].join('\n');
    return translateStructuredAnswer(apiKey, answer, language);
  }

  // ── Attempt count question without specific student → top leaders ───────────
  if (wantsAttemptCount && !matchedStudents.length) {
    const answer = adminSnapshot.attemptLeaders.length
      ? [
          'Top students by total attempts (all sections):',
          ...adminSnapshot.attemptLeaders.map((s) => `- ${s.username}: quiz ${s.quizAttempts}, monthly exam ${s.mockExamAttempts}, topic test ${s.topicTestAttempts}, full mock ${s.fullMockAttempts}`)
        ].join('\n')
      : 'No attempts recorded across any section yet.';
    return translateStructuredAnswer(apiKey, answer, language);
  }

  // ── Scores / performance without specific student ───────────────────────────
  if (wantsScoreOrPerformance && wantsQuizSection && !matchedStudents.length) {
    const topScorers = [...adminSnapshot.studentSummaries]
      .filter((s) => s.quizAttempts > 0)
      .sort((a, b) => b.quizOverallPct - a.quizOverallPct)
      .slice(0, 8);
    const answer = topScorers.length
      ? [`Quiz section top performers:`, ...topScorers.map((s) => `- ${s.username} (${s.className}): avg ${s.quizOverallPct}%, ${s.quizAttempts} attempts`)].join('\n')
      : 'No quiz scores have been recorded yet.';
    return translateStructuredAnswer(apiKey, answer, language);
  }

  if (wantsScoreOrPerformance && wantsMockSection && !matchedStudents.length) {
    const topScorers = [...adminSnapshot.studentSummaries]
      .filter((s) => s.mockExamAttempts > 0)
      .sort((a, b) => b.mockBestPct - a.mockBestPct)
      .slice(0, 8);
    const answer = topScorers.length
      ? [`Monthly exam top performers:`, ...topScorers.map((s) => `- ${s.username} (${s.className}): best ${s.mockBestPct}%, ${s.mockExamAttempts} attempt(s)`)].join('\n')
      : 'No monthly exam scores have been recorded yet.';
    return translateStructuredAnswer(apiKey, answer, language);
  }

  if (wantsScoreOrPerformance && wantsTopicTest && !matchedStudents.length) {
    const topScorers = [...adminSnapshot.studentSummaries]
      .filter((s) => s.topicTestAttempts > 0)
      .sort((a, b) => b.topicTestAttempts - a.topicTestAttempts)
      .slice(0, 8);
    const answer = topScorers.length
      ? [`Topic test (test series) most active students:`, ...topScorers.map((s) => `- ${s.username} (${s.className}): ${s.topicTestAttempts} attempts (modules: ${listPreview(s.topicTestModules, 5)})`)].join('\n')
      : 'No topic test attempts have been recorded yet.';
    return translateStructuredAnswer(apiKey, answer, language);
  }

  if (wantsScoreOrPerformance && wantsFullMock && !matchedStudents.length) {
    const topScorers = [...adminSnapshot.studentSummaries]
      .filter((s) => s.fullMockAttempts > 0)
      .sort((a, b) => b.fullMockBestPct - a.fullMockBestPct)
      .slice(0, 8);
    const answer = topScorers.length
      ? [`Full mock test top performers:`, ...topScorers.map((s) => `- ${s.username} (${s.className}): best ${s.fullMockBestPct}%, avg ${s.fullMockAvgPct}%, ${s.fullMockAttempts} attempt(s)`)].join('\n')
      : 'No full mock test scores have been recorded yet.';
    return translateStructuredAnswer(apiKey, answer, language);
  }

  // ── Audit log events ─────────────────────────────────────────────────────────
  if (/audit|log|recent changes|recent updates|activity log|who created|video created|quiz created/.test(lower)) {
    let filteredEvents = adminSnapshot.recentAuditEvents;
    if (/video|lecture|material/.test(lower)) {
      filteredEvents = filteredEvents.filter((item) => /video|material/i.test(item.action) || /video|material/i.test(item.targetType));
    } else if (/quiz|mock exam|exam/.test(lower)) {
      filteredEvents = filteredEvents.filter((item) => /quiz|mock|exam/i.test(item.action) || /quiz|exam/i.test(item.targetType));
    }
    const answer = filteredEvents.length
      ? ['Recent admin log details:', ...filteredEvents.slice(0, 12).map((item) => `- ${item.summary}`)].join('\n')
      : 'No matching recent audit log entries were found.';
    return translateStructuredAnswer(apiKey, answer, language);
  }

  // ── Content count ────────────────────────────────────────────────────────────
  if (/how many videos|how many lectures|content count|video count/.test(lower)) {
    const totalVideos = snapshot.moduleIndex.reduce((sum, entry) => sum + Number(entry.videoCount || 0), 0);
    const answer = `There are ${totalVideos} uploaded lecture videos right now across ${snapshot.courseSummaries.length} course groups.`;
    return translateStructuredAnswer(apiKey, answer, language);
  }

  // ── Named student with no specific section → full profile ──────────────────
  if (matchedStudents.length) {
    const answer = matchedStudents.map((student) => buildStudentProfile(student)).join('\n\n━━━━━━━\n\n');
    return translateStructuredAnswer(apiKey, answer, language);
  }

  return '';
}

async function persistChatTurn(username, selectedLanguage, question, answer) {
  await ChatHistory.findOneAndUpdate(
    { username },
    {
      $push: {
        messages: {
          $each: [
            { role: 'user', content: question.trim() },
            { role: 'assistant', content: answer }
          ],
          $slice: -MAX_HISTORY_MESSAGES
        }
      },
      $set: { language: selectedLanguage }
    },
    { upsert: true, new: true }
  );
}

function toStreamSafeUserId(role, username) {
  const safeName = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@_. -]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[\s.-]+|[\s.-]+$/g, '');
  const suffix = safeName || 'member';
  return `${role}-${suffix}`.slice(0, 80);
}

// POST /chat/community/token — issue Stream user token for real-time community chat
router.post('/community/token', authenticateToken(), async (req, res) => {
  try {
    const apiKey = String(process.env.STREAM_API_KEY || '').trim();
    const apiSecret = String(process.env.STREAM_API_SECRET || '').trim();
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Stream chat is not configured on server.' });
    }

    const username = String(req.user?.username || '').trim();
    const role = req.user?.role === 'admin' ? 'admin' : 'user';
    if (!username) {
      return res.status(400).json({ error: 'Invalid session user.' });
    }

    const streamClient = StreamChat.getInstance(apiKey, apiSecret);
    const streamUserId = toStreamSafeUserId(role, username);
    const displayName = role === 'admin' ? `Admin · ${username}` : username;

    await streamClient.upsertUser({
      id: streamUserId,
      name: displayName,
      biomicsRole: role
    });

    const channel = streamClient.channel(STREAM_CHANNEL_TYPE, STREAM_CHANNEL_ID, {
      name: 'Biomics Community',
      members: [streamUserId],
      created_by_id: streamUserId
    });

    try {
      await channel.create();
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('already exists')) {
        throw error;
      }
    }

    try {
      await channel.addMembers([streamUserId]);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('already') && !message.includes('member')) {
        throw error;
      }
    }

    const token = streamClient.createToken(streamUserId);
    return res.json({
      apiKey,
      token,
      user: {
        id: streamUserId,
        name: displayName,
        biomicsRole: role
      },
      channel: {
        type: STREAM_CHANNEL_TYPE,
        id: STREAM_CHANNEL_ID
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to initialize community chat.' });
  }
});

// DELETE /chat/community/messages — admin-only wipe of all community chat messages
router.delete('/community/messages', authenticateToken('admin'), async (req, res) => {
  try {
    const apiKey = String(process.env.STREAM_API_KEY || '').trim();
    const apiSecret = String(process.env.STREAM_API_SECRET || '').trim();
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Stream chat is not configured on server.' });
    }

    const adminUsername = String(req.user?.username || '').trim();
    const adminId = toStreamSafeUserId('admin', adminUsername || 'admin');
    const streamClient = StreamChat.getInstance(apiKey, apiSecret);

    await streamClient.upsertUser({
      id: adminId,
      name: adminUsername ? `Admin · ${adminUsername}` : 'Admin',
      biomicsRole: 'admin'
    });

    const channel = streamClient.channel(STREAM_CHANNEL_TYPE, STREAM_CHANNEL_ID, {
      name: 'Biomics Community',
      created_by_id: adminId
    });

    try {
      await channel.create();
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('already exists')) {
        throw error;
      }
    }

    await channel.truncate();

    return res.json({
      message: 'Community chat conversations cleared successfully.',
      clearedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Failed to clear community chat.' });
  }
});

function estimateAnswerProfile(question = '') {
  const text = String(question || '').trim();
  const words = text ? text.split(/\s+/).length : 0;
  const lower = text.toLowerCase();
  const deepIntent = /(explain in detail|detailed|step by step|full|complete|elaborate|deeply|why|how|strategy|plan|roadmap|compare)/.test(lower);
  const shortIntent = /(short answer|brief|in short|one line|summarize|tl;dr)/.test(lower);

  if (shortIntent) {
    return { maxOutputTokens: 700, temperature: 0.45 };
  }
  if (deepIntent || words > 28) {
    return { maxOutputTokens: 1800, temperature: 0.6 };
  }
  if (words > 16) {
    return { maxOutputTokens: 1400, temperature: 0.55 };
  }
  return { maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS, temperature: 0.5 };
}

function normalizeLanguage(language) {
  return ['en', 'hi', 'or'].includes(language) ? language : 'en';
}

function hasOdiaScript(text) {
  return /[\u0B00-\u0B7F]/.test(text || '');
}

async function callGemini(apiKey, systemPrompt, contents, generationConfig = {}) {
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
          temperature: 0.5,
          topP: 0.9,
          ...generationConfig
        }
      })
    }
  );

  const data = await geminiRes.json();
  return { geminiRes, data };
}

async function enforceOdiaResponse(apiKey, answer, question) {
  // First pass: rewrite generated answer in strict Odia script.
  const rewritePrompt = 'Convert the answer strictly into Odia (Oriya script) only. Keep the same meaning. Do not use English or Hindi.';
  const rewriteContents = [{ role: 'user', parts: [{ text: `Convert to Odia:\n\n${answer}` }] }];
  const { geminiRes: rewriteRes, data: rewriteData } = await callGemini(
    apiKey,
    rewritePrompt,
    rewriteContents,
    { temperature: 0.1 }
  );

  if (rewriteRes.ok) {
    const rewritten = rewriteData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (rewritten && hasOdiaScript(rewritten)) {
      return rewritten;
    }
  }

  // Second pass: answer the original question directly in Odia if rewrite failed.
  const retryPrompt = [
    'You must answer only in Odia (Oriya script).',
    'Do not output English or Hindi.',
    'Give clear educational explanation with short points.'
  ].join(' ');
  const retryContents = [{ role: 'user', parts: [{ text: question }] }];
  const { geminiRes: retryRes, data: retryData } = await callGemini(
    apiKey,
    retryPrompt,
    retryContents,
    { temperature: 0.2 }
  );

  if (retryRes.ok) {
    const retried = retryData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (retried && hasOdiaScript(retried)) {
      return retried;
    }
  }

  // Final guaranteed Odia-script fallback text.
  return 'କ୍ଷମା କରିବେ। ଏହି ମୁହୂର୍ତ୍ତରେ ଓଡ଼ିଆରେ ପୂର୍ଣ୍ଣ ଉତ୍ତର ତିଆରି କରିପାରିଲି ନାହିଁ। ଦୟାକରି ପୁନର୍ବାର ପଚାରନ୍ତୁ।';
}

function buildSystemPrompt(language, webappContext = '', roleSpecificContext = '', userRole = 'user') {
  const langLabel = language === 'hi'
    ? 'Hindi (Devanagari script)'
    : language === 'or'
      ? 'Odia (Oriya script)'
      : 'English';
  return [
    userRole === 'admin'
      ? 'You are Sonupriya Sahu, acting as a smart admin copilot for the Biomics Hub webapp.'
      : 'You are Sonupriya Sahu, a friendly and highly capable tutor for Indian students using the Biomics Hub webapp.',
    `Always respond in ${langLabel}.`,
    language === 'or'
      ? 'Important: Reply only in Odia script. Do not switch to English or Hindi unless user explicitly asks for translation.'
      : 'Reply in the selected language unless user explicitly asks to switch language.',
    'Teach with depth but in simple language, like a supportive personal tutor.',
    'Be clear, structured, accurate, and outcome-focused.',
    'Use numbered lists and clear headings where helpful.',
    'Default to concise answers, but provide full depth whenever the user asks for detail or when the topic requires it.',
    'You are strong in Botany, Biology, and Life Sciences for learners at any stage, with primary focus on CSIR-NET Life Science preparation.',
    'Support concept explanation, revision planning, problem-solving, and exam strategy for any study-related topic.',
    'When asked about Biomics Hub content such as modules, topics, quizzes, test series, live classes, or monthly exams, answer strictly from the provided webapp data below. Do not invent unavailable modules or exams.',
    'If a requested module exists, clearly say yes and list the current topics, quizzes, or tests available for that module.',
    'If the requested content is not present in the data, say that it is not currently available and ask for the exact module or course name if needed.',
    'When asked for exam dates, notification windows, syllabus updates, or application deadlines: provide the latest known timeline clearly, mention the exam year, and advise checking the official website for final confirmation.',
    'When asked for MCQs: generate realistic exam-style one-best-answer MCQs with 4 options, correct answer, and a short explanation.',
    'If the user asks for mock tests, provide mixed-difficulty questions similar to real exam patterns.',
    'If the user asks non-study small talk, answer briefly and guide back to productive study help.',
    webappContext ? `WEBAPP DATA:\n${webappContext}` : '',
    roleSpecificContext ? `${userRole === 'admin' ? 'ADMIN DATA' : 'STUDENT ACCESS DATA'}:\n${roleSpecificContext}` : ''
  ].filter(Boolean).join('\n\n');
}

// POST /chat/ask — get AI answer and persist to history
router.post('/ask', authenticateToken(), async (req, res) => {
  try {
    const { question, language = 'en', history = [] } = req.body;
    const { username } = req.user;
    const selectedLanguage = normalizeLanguage(language);
    const userRole = req.user?.role === 'admin' ? 'admin' : 'user';
    const ownerKey = getChatOwnerKey(req.user);

    if (!question?.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'AI service not configured. Add GEMINI_API_KEY to backend/.env'
      });
    }

    const snapshot = await buildWebappKnowledgeSnapshot();
    const accessSummary = userRole === 'user'
      ? await buildStudentAccessSummary(username)
      : { entries: [], summaryText: '' };
    const adminSnapshot = userRole === 'admin'
      ? await buildAdminKnowledgeSnapshot(snapshot)
      : null;

    const directRoleAnswer = userRole === 'admin'
      ? await resolveAdminAwareAnswer({
          question: question.trim(),
          language: selectedLanguage,
          snapshot,
          adminSnapshot,
          apiKey
        })
      : '';

    if (directRoleAnswer) {
      await persistChatTurn(ownerKey, selectedLanguage, question, directRoleAnswer);
      return res.json({ answer: directRoleAnswer });
    }

    const directWebappAnswer = await resolveWebappAwareAnswer({
      question: question.trim(),
      language: selectedLanguage,
      snapshot,
      accessSummary,
      apiKey
    });

    if (directWebappAnswer) {
      await persistChatTurn(ownerKey, selectedLanguage, question, directWebappAnswer);
      return res.json({ answer: directWebappAnswer });
    }

    const systemPrompt = buildSystemPrompt(
      selectedLanguage,
      [snapshot.contextText, adminSnapshot?.contextText].filter(Boolean).join('\n\n'),
      userRole === 'admin' ? adminSnapshot?.contextText || '' : accessSummary.summaryText,
      userRole
    );
    const answerProfile = estimateAnswerProfile(question);

    // Build Gemini contents array from recent conversation history
    const contents = [];
    const recentHistory = Array.isArray(history) ? history.slice(-CONTEXT_WINDOW) : [];
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      }
    }
    contents.push({ role: 'user', parts: [{ text: question.trim() }] });

    const { geminiRes, data } = await callGemini(apiKey, systemPrompt, contents, answerProfile);

    if (!geminiRes.ok) {
      const errMsg = data?.error?.message || 'AI service returned an error';
      return res.status(502).json({ error: errMsg });
    }

    let answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      'Sorry, I could not generate a response. Please try again.';

    const finishReason = String(data.candidates?.[0]?.finishReason || '').toUpperCase();
    if (finishReason === 'MAX_TOKENS') {
      const continuationContents = [
        ...contents,
        { role: 'model', parts: [{ text: answer }] },
        {
          role: 'user',
          parts: [{ text: 'Continue from exactly where you stopped. Do not repeat prior lines.' }]
        }
      ];

      const { geminiRes: continuationRes, data: continuationData } = await callGemini(
        apiKey,
        systemPrompt,
        continuationContents,
        {
          maxOutputTokens: Math.min(1200, answerProfile.maxOutputTokens),
          temperature: Math.max(0.35, answerProfile.temperature - 0.1)
        }
      );

      if (continuationRes.ok) {
        const continuation = continuationData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (continuation) {
          answer = `${answer}\n\n${continuation}`.trim();
        }
      }
    }

    // Odia mode: enforce Odia output even if the first generation is not in Odia.
    if (selectedLanguage === 'or') {
      answer = await enforceOdiaResponse(apiKey, answer, question.trim());
    }

    await persistChatTurn(ownerKey, selectedLanguage, question, answer);

    res.json({ answer });
  } catch (err) {
    console.error('Chat /ask error:', err);
    res.status(500).json({ error: 'Failed to process request. Please try again.' });
  }
});

// GET /chat/history — load chat history for logged in user
router.get('/history', authenticateToken(), async (req, res) => {
  try {
    const record = await ChatHistory.findOne({ username: { $in: getChatLookupKeys(req.user) } }).sort({ updatedAt: -1 }).lean();
    res.json({
      messages: record?.messages || [],
      language: record?.language || 'en'
    });
  } catch (err) {
    console.error('Chat /history error:', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// DELETE /chat/history — clear chat history for logged in user
router.delete('/history', authenticateToken(), async (req, res) => {
  try {
    await ChatHistory.findOneAndUpdate(
      { username: getChatOwnerKey(req.user) },
      { $set: { messages: [] } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Chat /history DELETE error:', err);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// DELETE /chat/history/all — admin-only wipe of all AI tutor chat history in MongoDB
router.delete('/history/all', authenticateToken('admin'), async (req, res) => {
  try {
    const result = await ChatHistory.deleteMany({});
    res.json({
      ok: true,
      deletedCount: Number(result?.deletedCount || 0),
      message: 'All AI tutor chat histories were cleared.'
    });
  } catch (err) {
    console.error('Chat /history/all DELETE error:', err);
    res.status(500).json({ error: 'Failed to clear all AI tutor histories' });
  }
});

module.exports = router;
