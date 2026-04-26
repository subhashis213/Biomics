const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { AccessToken, RoomServiceClient, TrackSource } = require('livekit-server-sdk');
const LiveClass = require('../models/LiveClass');
const LiveClassCalendarBlock = require('../models/LiveClassCalendarBlock');
const Course = require('../models/Course');
const User = require('../models/User');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logAdminAction } = require('../utils/auditLog');
const { ALL_MODULES, getActiveCourseMembership, getActiveModuleMembership, hasCourseAccess, normalizeCourseName } = require('../utils/courseAccess');
const classServerRoutes = require('./classServerRoutes');

const router = express.Router();

const LIVEKIT_URL = String(process.env.LIVEKIT_URL || '').trim();
const LIVEKIT_API_KEY = String(process.env.LIVEKIT_API_KEY || '').trim();
const LIVEKIT_API_SECRET = String(process.env.LIVEKIT_API_SECRET || '').trim();
const LIVEKIT_SERVICE_URL = LIVEKIT_URL.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
const DEFAULT_ROOM_PREFIX = 'biomicshub-live';
const MAX_ALLOWED_PARTICIPANTS = 101;
const STUDENT_WORKSPACE_STREAM_HEARTBEAT_MS = 25000;
const studentWorkspaceStreamClients = new Map();
let nextStudentWorkspaceStreamClientId = 1;

const createLiveClassSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(400).optional().default(''),
  roomName: z.string().max(120).optional(),
  course: z.string().max(120).optional().default(''),
  batch: z.string().max(120).optional().default('General'),
  scheduledAt: z.string().datetime().nullable().optional(),
  scheduledEndAt: z.string().datetime().nullable().optional(),
  premiumOnly: z.boolean().optional().default(true),
  allowedUsernames: z.array(z.string().min(1).max(80)).optional().default([]),
  maxParticipants: z.number().int().min(1).max(MAX_ALLOWED_PARTICIPANTS).optional().default(MAX_ALLOWED_PARTICIPANTS)
});

const updateLiveClassSchema = createLiveClassSchema.partial();
const GENERAL_BATCH = 'General';

function normalizeBatchName(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return GENERAL_BATCH;
  const key = normalized.toLowerCase();
  if (key === 'general' || key === 'all' || key === 'all batches') return GENERAL_BATCH;
  return normalized;
}


const updatePremiumAccessSchema = z.object({
  premiumEnabled: z.boolean(),
  premiumLabel: z.string().max(80).optional().default('Premium Access'),
  premiumExpiresAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(240).optional().default('')
});

const createCalendarBlockSchema = z.object({
  course: z.string().min(1).max(120),
  batch: z.string().max(120).optional().default(GENERAL_BATCH),
  title: z.string().min(1).max(120),
  description: z.string().max(240).optional().default(''),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime()
});

const updateCalendarBlockSchema = createCalendarBlockSchema;

const removeStudentFromClassSchema = z.object({
  username: z.string().min(1).max(80)
});

function ensureLiveKitConfig() {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    const error = new Error('LiveKit environment variables are incomplete. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.');
    error.statusCode = 500;
    throw error;
  }
}

function slugifyRoomName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function buildRoomName(title, explicitRoomName) {
  const preferred = slugifyRoomName(explicitRoomName);
  if (preferred) return preferred;
  const titleSlug = slugifyRoomName(title) || 'session';
  return `${DEFAULT_ROOM_PREFIX}-${titleSlug}-${Date.now().toString(36)}`;
}

function normalizeUsernameList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean))];
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRoomServiceClient() {
  ensureLiveKitConfig();
  return new RoomServiceClient(LIVEKIT_SERVICE_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

function getLiveKitFailureHint(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  if (message.includes('permissions denied') || message.includes('unauthenticated') || code === 'unauthenticated') {
    return 'LiveKit rejected the backend credentials. Verify LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Render, then redeploy the backend service.';
  }

  if (
    message.includes('fetch failed')
    || message.includes('enotfound')
    || message.includes('econnrefused')
    || message.includes('network')
    || code === 'enotfound'
    || code === 'econnrefused'
  ) {
    return 'Render could not reach the LiveKit host. Verify LIVEKIT_URL, DNS, SSL, and that the LiveKit nginx proxy is publicly reachable.';
  }

  return 'Check the Render backend environment values for LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET, then redeploy the service.';
}

async function getLiveKitServiceState() {
  ensureLiveKitConfig();

  try {
    const roomService = getRoomServiceClient();
    await roomService.listRooms([]);
    return {
      ok: true,
      ready: true,
      livekitUrl: LIVEKIT_URL,
      serviceUrl: LIVEKIT_SERVICE_URL,
      message: 'LiveKit signal service is reachable.'
    };
  } catch (error) {
    return {
      ok: false,
      ready: false,
      livekitUrl: LIVEKIT_URL,
      serviceUrl: LIVEKIT_SERVICE_URL,
      message: error?.message || 'LiveKit signal service is not reachable yet.',
      failureCode: String(error?.code || '').trim(),
      hint: getLiveKitFailureHint(error)
    };
  }
}

function authenticateStreamToken(token, role = 'user') {
  const rawToken = String(token || '').trim();
  if (!rawToken) return null;

  try {
    const payload = jwt.verify(rawToken, JWT_SECRET);
    if (role && payload?.role !== role) return null;
    return payload;
  } catch {
    return null;
  }
}

function writeSseEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function notifyStudentWorkspaceUpdated(reason = 'workspace-updated') {
  const payload = { type: 'workspace-updated', reason, ts: Date.now() };
  for (const client of studentWorkspaceStreamClients.values()) {
    writeSseEvent(client.res, 'workspace-updated', payload);
  }
}

function extractStudentUsernameFromIdentity(identity, classId) {
  const rawIdentity = String(identity || '').trim();
  const rawClassId = String(classId || '').trim();
  const prefix = 'student-';
  const suffix = `-${rawClassId}`;

  if (!rawIdentity.startsWith(prefix) || !rawClassId || !rawIdentity.endsWith(suffix)) {
    return '';
  }

  return normalizeUsername(rawIdentity.slice(prefix.length, rawIdentity.length - suffix.length));
}

function getUserActiveCourseNames(user) {
  return new Set(
    (Array.isArray(user?.purchasedCourses) ? user.purchasedCourses : [])
      .filter((entry) => {
        if (!entry?.course) return false;
        if (!entry?.expiresAt) return true;
        const expiresAt = new Date(entry.expiresAt).getTime();
        return Number.isFinite(expiresAt) && expiresAt > Date.now();
      })
      .map((entry) => normalizeCourseName(entry.course))
      .filter(Boolean)
  );
}

async function userHasCourseContentAccess(user, classDoc) {
  const targetCourse = normalizeCourseName(classDoc?.course);
  if (!targetCourse) return true;

  if (await hasCourseAccess(user, targetCourse)) return true;

  const enrolledCourse = normalizeCourseName(user?.class);
  return Boolean(enrolledCourse) && enrolledCourse === targetCourse;
}

function userMatchesClassCourse(user, classDoc) {
  const targetCourse = normalizeCourseName(classDoc?.course);
  if (!targetCourse) return true;

  return getUserActiveCourseNames(user).has(targetCourse);
}

async function canUserDiscoverClass(user, classDoc) {
  const targetCourse = normalizeCourseName(classDoc?.course);
  if (!targetCourse) return true;

  if (await userHasCourseContentAccess(user, classDoc)) return true;

  const enrolledCourse = normalizeCourseName(user?.class);
  return Boolean(enrolledCourse) && enrolledCourse === targetCourse;
}

async function canUserAccessClass(user, classDoc, role = 'user') {
  if (role === 'admin') return true;

  const username = normalizeUsername(user?.username);
  const removedUsernames = normalizeUsernameList(classDoc?.removedUsernames || []);
  if (username && removedUsernames.includes(username)) return false;

  const allowedUsernames = normalizeUsernameList(classDoc?.allowedUsernames || []);
  if (username && allowedUsernames.includes(username)) return true;

  const hasCourseLevelAccess = await userHasCourseContentAccess(user, classDoc);
  if (!hasCourseLevelAccess) return false;

  const targetCourse = normalizeCourseName(classDoc?.course);
  const targetBatch = normalizeBatchName(classDoc?.batch);
  if (!targetCourse || targetBatch === GENERAL_BATCH) return true;

  const batchMembership = getActiveModuleMembership(user, targetCourse, targetBatch);
  if (batchMembership) return true;

  // Explicit ALL_MODULES bundle always grants access to every batch under the course.
  return Boolean(getActiveModuleMembership(user, targetCourse, ALL_MODULES));
}

function isUserRemovedFromClass(user, classDoc) {
  const username = normalizeUsername(user?.username);
  if (!username) return false;
  return normalizeUsernameList(classDoc?.removedUsernames || []).includes(username);
}

function isClassCurrentlyLive(classDoc) {
  return Boolean(classDoc?.isActive) || String(classDoc?.status || '').trim().toLowerCase() === 'live';
}

function isClassScheduledForStudents(classDoc) {
  return Boolean(classDoc?.isScheduled) && !isClassCurrentlyLive(classDoc);
}

function serializeLiveClass(classDoc, user, role = 'user', accessState = {}) {
  const allowedUsernames = normalizeUsernameList(classDoc?.allowedUsernames || []);
  const removedUsernames = normalizeUsernameList(classDoc?.removedUsernames || []);
  const canAccess = role === 'admin'
    ? true
    : Boolean(accessState.canAccess);
  const isLocked = role === 'admin'
    ? false
    : Boolean(accessState.isLocked);

  return {
    _id: String(classDoc?._id || ''),
    title: String(classDoc?.title || '').trim(),
    description: String(classDoc?.description || '').trim(),
    roomName: String(classDoc?.roomName || '').trim(),
    status: String(classDoc?.status || '').trim() || (classDoc?.isActive ? 'live' : classDoc?.isScheduled ? 'scheduled' : 'ended'),
    startedAt: classDoc?.startedAt || null,
    endedAt: classDoc?.endedAt || null,
    scheduledAt: classDoc?.scheduledAt || null,
    scheduledEndAt: classDoc?.scheduledEndAt || null,
    isActive: Boolean(classDoc?.isActive),
    isScheduled: Boolean(classDoc?.isScheduled),
    course: String(classDoc?.course || '').trim(),
    batch: normalizeBatchName(classDoc?.batch),
    premiumOnly: Boolean(classDoc?.premiumOnly),
    maxParticipants: Number(classDoc?.maxParticipants || MAX_ALLOWED_PARTICIPANTS),
    allowedUsernames,
    removedUsernames,
    createdBy: String(classDoc?.createdBy || '').trim(),
    canAccess,
    isLocked,
    livekitUrl: LIVEKIT_URL,
    joinRoute: role === 'admin'
      ? `/admin/live-classes/${encodeURIComponent(String(classDoc?._id || ''))}/studio`
      : `/student/live-classes/${encodeURIComponent(String(classDoc?._id || ''))}`,
    pollState: classDoc?.pollState
      ? {
          isActive: Boolean(classDoc.pollState.isActive),
          question: String(classDoc.pollState.question || '').trim(),
          options: Array.isArray(classDoc.pollState.options) ? classDoc.pollState.options : [],
          correctOption: String(classDoc.pollState.correctOption || '').trim(),
          revealed: Boolean(classDoc.pollState.revealed),
          updatedAt: classDoc.pollState.updatedAt || null
        }
      : null
  };
}

function serializeCalendarBlock(entry, fallback = {}) {
  return {
    _id: String(entry?._id || fallback._id || ''),
    course: String(entry?.course || fallback.course || '').trim(),
    batch: normalizeBatchName(entry?.batch || fallback.batch || GENERAL_BATCH),
    title: String(entry?.title || fallback.title || '').trim(),
    description: String(entry?.description || fallback.description || '').trim(),
    startsAt: entry?.startsAt || fallback.startsAt || null,
    endsAt: entry?.endsAt || fallback.endsAt || null,
    kind: String(entry?.kind || fallback.kind || 'blocked-slot').trim() || 'blocked-slot',
    createdBy: String(entry?.createdBy || fallback.createdBy || '').trim()
  };
}

function getCalendarBlockSignature(entry) {
  const startsAt = entry?.startsAt ? new Date(entry.startsAt) : null;
  const endsAt = entry?.endsAt ? new Date(entry.endsAt) : null;

  return [
    normalizeCourseName(entry?.course),
    normalizeBatchName(entry?.batch),
    String(entry?.title || '').trim().toLowerCase(),
    startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.toISOString() : '',
    endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt.toISOString() : '',
    String(entry?.kind || 'blocked-slot').trim().toLowerCase()
  ].join('::');
}

function dedupeCalendarBlocks(entries = []) {
  const seen = new Set();

  return entries.filter((entry) => {
    const signature = getCalendarBlockSignature(entry);
    if (!signature || seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}

function collectLegacyCalendarBlocks(users = []) {
  return (Array.isArray(users) ? users : [])
    .flatMap((user) => (Array.isArray(user?.liveClassCalendarBlocks) ? user.liveClassCalendarBlocks : []).map((entry) => (
      serializeCalendarBlock(entry, { createdBy: String(user?.username || '').trim() })
    )));
}

function buildCalendarEntries(user, classes = [], accessibleCourseNames = []) {
  const activeCourses = new Set([
    ...Array.from(getUserActiveCourseNames(user)),
    ...accessibleCourseNames.map((courseName) => normalizeCourseName(courseName)).filter(Boolean)
  ]);

  const classEntries = classes.map((classDoc) => ({
    id: String(classDoc?._id || ''),
    title: String(classDoc?.title || '').trim(),
    description: String(classDoc?.description || '').trim(),
    startsAt: classDoc?.scheduledAt || classDoc?.startedAt || null,
    endsAt: classDoc?.scheduledEndAt || classDoc?.endedAt || null,
    kind: 'live-class',
    liveClassId: String(classDoc?._id || ''),
    course: String(classDoc?.course || '').trim(),
      batch: normalizeBatchName(classDoc?.batch),
    premiumOnly: Boolean(classDoc?.premiumOnly),
    status: String(classDoc?.status || '').trim() || 'scheduled'
  }));

  const sharedCalendarBlocks = Array.isArray(user?.calendarBlocks)
    ? user.calendarBlocks.map((entry) => serializeCalendarBlock(entry))
    : [];
  const legacyCalendarBlocks = Array.isArray(user?.liveClassCalendarBlocks)
    ? user.liveClassCalendarBlocks.map((entry) => serializeCalendarBlock(entry))
    : [];

  const manualBlocks = dedupeCalendarBlocks([...sharedCalendarBlocks, ...legacyCalendarBlocks])
    .filter((entry) => {
      const course = normalizeCourseName(entry?.course);
      if (!course || !activeCourses.has(course)) return false;
      const batch = normalizeBatchName(entry?.batch);
      if (batch === GENERAL_BATCH) return true;
      return Boolean(
        getActiveModuleMembership(user, course, batch)
        || getActiveModuleMembership(user, course, ALL_MODULES)
      );
    })
    .map((entry) => ({
      id: String(entry?._id || ''),
      title: String(entry?.title || '').trim(),
      description: String(entry?.description || '').trim(),
      startsAt: entry?.startsAt || null,
      endsAt: entry?.endsAt || null,
      kind: String(entry?.kind || 'blocked-slot').trim() || 'blocked-slot',
      course: normalizeCourseName(entry?.course),
      batch: normalizeBatchName(entry?.batch),
      liveClassId: entry?.liveClassId ? String(entry.liveClassId) : '',
      status: 'blocked'
    }));

  return [...classEntries, ...manualBlocks]
    .filter((entry) => entry.startsAt)
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

function buildToken({ identity, name, roomName, role }) {
  ensureLiveKitConfig();
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name });

  if (role === 'teacher') {
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });
  } else {
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: [TrackSource.MICROPHONE]
    });
  }

  return token.toJwt();
}

async function findClassOrThrow(classId) {
  const classDoc = await LiveClass.findById(classId);
  if (!classDoc) {
    const error = new Error('Live class session not found.');
    error.statusCode = 404;
    throw error;
  }
  return classDoc;
}

async function loadCurrentUser(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;
  return User.findOne({ username: new RegExp(`^${escapeRegExp(normalizedUsername)}$`, 'i') }).lean();
}

async function disconnectStudentFromLiveClass(liveClass, username) {
  const normalizedUsername = normalizeUsername(username);
  const roomName = String(liveClass?.roomName || '').trim();
  const classId = String(liveClass?._id || '').trim();
  if (!normalizedUsername || !roomName || !classId) return;

  const roomService = getRoomServiceClient();
  const participants = await roomService.listParticipants(roomName).catch(() => []);
  const matchingIdentities = participants
    .map((participant) => String(participant?.identity || '').trim())
    .filter(Boolean)
    .filter((identity) => extractStudentUsernameFromIdentity(identity, classId) === normalizedUsername);

  await Promise.allSettled(matchingIdentities.map((identity) => roomService.removeParticipant(roomName, identity)));
}

router.get('/status', authenticateToken(), async (req, res) => {
  try {
    const role = String(req.user?.role || 'user').trim();
    const currentUser = role === 'admin' ? null : await loadCurrentUser(req.user?.username);
    const activeClass = await LiveClass.findOne({ $or: [{ isActive: true }, { status: 'live' }] }).sort({ startedAt: -1, updatedAt: -1 }).lean();
    const upcomingClasses = await LiveClass.find({ isScheduled: true, isActive: false, status: 'scheduled', scheduledAt: { $gte: new Date() } })
      .sort({ scheduledAt: 1 })
      .limit(8)
      .lean();

    let accessibleUpcoming = upcomingClasses;
    if (role !== 'admin') {
      const upcomingAccess = await Promise.all(upcomingClasses.map(async (item) => ({
        item,
        canAccess: await canUserAccessClass(currentUser, item, role)
      })));
      accessibleUpcoming = upcomingAccess.filter((entry) => entry.canAccess).map((entry) => entry.item);
    }

    const activeCanAccess = activeClass ? await canUserAccessClass(currentUser, activeClass, role) : false;
    const activeAllowed = activeClass && activeCanAccess
      ? serializeLiveClass(activeClass, currentUser, role, { canAccess: true, isLocked: false })
      : null;

    return res.json({
      active: !!activeAllowed,
      activeClass: activeAllowed,
      upcoming: accessibleUpcoming[0] ? serializeLiveClass(accessibleUpcoming[0], currentUser, role, { canAccess: true, isLocked: false }) : null,
      classes: accessibleUpcoming.map((item) => serializeLiveClass(item, currentUser, role, { canAccess: true, isLocked: false }))
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to get live class status.' });
  }
});

router.get('/service-state', authenticateToken('admin'), async (req, res) => {
  try {
    const service = await getLiveKitServiceState();
    return res.json(service);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to get LiveKit service state.' });
  }
});

router.get('/admin/workspace', authenticateToken('admin'), async (req, res) => {
  try {
    const [classes, students, calendarBlocks, courseDocs] = await Promise.all([
      LiveClass.find().sort({ scheduledAt: 1, startedAt: -1, createdAt: -1 }).limit(40).lean(),
      User.find({}, {
        username: 1,
        email: 1,
        class: 1,
        city: 1,
        purchasedCourses: 1,
        liveClassAccess: 1,
        liveClassCalendarBlocks: 1,
        _id: 0
      }).sort({ username: 1 }).lean(),
      LiveClassCalendarBlock.find().sort({ startsAt: 1, createdAt: -1 }).lean(),
      Course.find({ active: true, archived: { $ne: true } }, { name: 1, displayName: 1, batches: 1 }).sort({ name: 1 }).lean()
    ]);

    const mergedCalendarBlocks = dedupeCalendarBlocks([
      ...calendarBlocks.map((entry) => serializeCalendarBlock(entry)),
      ...collectLegacyCalendarBlocks(students)
    ]);

    const availableCoursesSet = new Set();
    courseDocs.forEach((courseDoc) => {
      const name = String(courseDoc?.name || courseDoc?.displayName || '').trim();
      if (name) availableCoursesSet.add(name);
    });
    students.forEach((student) => {
      const enrolledCourse = String(student?.class || '').trim();
      if (enrolledCourse) availableCoursesSet.add(enrolledCourse);
      (Array.isArray(student?.purchasedCourses) ? student.purchasedCourses : []).forEach((entry) => {
        const courseName = String(entry?.course || '').trim();
        if (courseName) availableCoursesSet.add(courseName);
      });
    });
    classes.forEach((classDoc) => {
      const courseName = String(classDoc?.course || '').trim();
      if (courseName) availableCoursesSet.add(courseName);
    });

    const availableBatchesByCourse = {};
    availableCoursesSet.forEach((courseName) => {
      const set = new Set([GENERAL_BATCH]);

      const matchingCourseDoc = courseDocs.find((courseDoc) => normalizeCourseName(courseDoc?.name || courseDoc?.displayName) === normalizeCourseName(courseName));
      (Array.isArray(matchingCourseDoc?.batches) ? matchingCourseDoc.batches : []).forEach((batch) => {
        if (batch?.active === false) return;
        const batchName = normalizeBatchName(batch?.name);
        if (batchName && batchName !== GENERAL_BATCH) set.add(batchName);
      });

      classes
        .filter((classDoc) => normalizeCourseName(classDoc?.course) === normalizeCourseName(courseName))
        .forEach((classDoc) => {
          const batchName = normalizeBatchName(classDoc?.batch);
          if (batchName && batchName !== GENERAL_BATCH) set.add(batchName);
        });

      mergedCalendarBlocks
        .filter((entry) => normalizeCourseName(entry?.course) === normalizeCourseName(courseName))
        .forEach((entry) => {
          const batchName = normalizeBatchName(entry?.batch);
          if (batchName && batchName !== GENERAL_BATCH) set.add(batchName);
        });

      students.forEach((student) => {
        (Array.isArray(student?.purchasedCourses) ? student.purchasedCourses : []).forEach((entry) => {
          if (normalizeCourseName(entry?.course) !== normalizeCourseName(courseName)) return;
          const moduleName = String(entry?.moduleName || '').trim();
          if (!moduleName || moduleName === ALL_MODULES) return;
          const batchName = normalizeBatchName(moduleName);
          if (batchName && batchName !== GENERAL_BATCH) set.add(batchName);
        });
      });

      availableBatchesByCourse[courseName] = Array.from(set).sort((left, right) => {
        if (left === GENERAL_BATCH) return -1;
        if (right === GENERAL_BATCH) return 1;
        return left.localeCompare(right);
      });
    });

    const availableCourses = Array.from(availableCoursesSet).sort((left, right) => left.localeCompare(right));

    return res.json({
      classes: classes.map((item) => serializeLiveClass(item, null, 'admin')),
      calendarBlocks: mergedCalendarBlocks.map((entry) => serializeCalendarBlock(entry)),
      availableCourses,
      availableBatchesByCourse,
      students: students.map((student) => ({
        username: student.username,
        email: student.email || '',
        class: student.class || '',
        city: student.city || '',
        purchasedCourses: Array.isArray(student?.purchasedCourses)
          ? student.purchasedCourses.map((entry) => ({
              course: String(entry?.course || '').trim(),
              moduleName: String(entry?.moduleName || '').trim() || 'ALL_MODULES',
              expiresAt: entry?.expiresAt || null
            }))
          : [],
        liveClassAccess: {
          premiumEnabled: Boolean(student?.liveClassAccess?.premiumEnabled),
          premiumLabel: String(student?.liveClassAccess?.premiumLabel || 'Premium Access').trim(),
          premiumExpiresAt: student?.liveClassAccess?.premiumExpiresAt || null,
          notes: String(student?.liveClassAccess?.notes || '').trim()
        }
      }))
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load admin live class workspace.' });
  }
});

router.get('/student/workspace', authenticateToken('user'), async (req, res) => {
  try {
    const [currentUser, calendarBlocks] = await Promise.all([
      loadCurrentUser(req.user?.username),
      LiveClassCalendarBlock.find().sort({ startsAt: 1, createdAt: -1 }).lean()
    ]);
    if (!currentUser) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const classes = await LiveClass.find({
      $or: [
        { isActive: true },
        { status: 'live' },
        { isScheduled: true, scheduledAt: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } }
      ]
    }).sort({ scheduledAt: 1, startedAt: -1 }).lean();

    const enrolledCourse = normalizeCourseName(currentUser?.class);
    const hasEnrolledCourseAccess = await hasCourseAccess(currentUser, enrolledCourse);
    const classAccessStates = await Promise.all(classes.map(async (item) => ({
      item,
      canAccess: await canUserAccessClass(currentUser, item, 'user')
    })));
    const accessibleClasses = classAccessStates.filter((entry) => entry.canAccess).map((entry) => entry.item);
    const activeClass = accessibleClasses.find((item) => isClassCurrentlyLive(item)) || null;
    const upcomingClasses = accessibleClasses.filter((item) => isClassScheduledForStudents(item));

    return res.json({
      access: {
        hasCourseAccess: hasEnrolledCourseAccess,
        enrolledCourse: String(currentUser?.class || '').trim(),
        notes: String(currentUser?.liveClassAccess?.notes || '').trim()
      },
      activeClass: activeClass ? serializeLiveClass(activeClass, currentUser, 'user', { canAccess: true, isLocked: false }) : null,
      upcomingClasses: upcomingClasses.map((item) => serializeLiveClass(item, currentUser, 'user', { canAccess: true, isLocked: false })),
      calendar: buildCalendarEntries({ ...currentUser, calendarBlocks }, upcomingClasses, hasEnrolledCourseAccess ? [enrolledCourse] : [])
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load student live class workspace.' });
  }
});

router.get('/student/workspace/stream', (req, res) => {
  const token = String(req.query.token || '').trim();
  const userPayload = authenticateStreamToken(token, 'user');
  if (!userPayload) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const clientId = nextStudentWorkspaceStreamClientId++;
  const heartbeatId = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, STUDENT_WORKSPACE_STREAM_HEARTBEAT_MS);

  studentWorkspaceStreamClients.set(clientId, { res, username: String(userPayload?.username || '').trim() });
  writeSseEvent(res, 'connected', { type: 'connected', ts: Date.now() });

  req.on('close', () => {
    clearInterval(heartbeatId);
    studentWorkspaceStreamClients.delete(clientId);
  });
});

router.post('/classes', authenticateToken('admin'), validate(createLiveClassSchema), async (req, res) => {
  try {
    const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
    const scheduledEndAt = req.body.scheduledEndAt ? new Date(req.body.scheduledEndAt) : null;
    const title = String(req.body.title || '').trim();
    const liveClass = await LiveClass.create({
      title,
      description: String(req.body.description || '').trim(),
      roomName: buildRoomName(title, req.body.roomName),
      course: String(req.body.course || '').trim(),
      batch: normalizeBatchName(req.body.batch),
      scheduledAt,
      scheduledEndAt,
      isScheduled: Boolean(scheduledAt),
      isActive: false,
      startedAt: scheduledAt || new Date(),
      status: scheduledAt ? 'scheduled' : 'ended',
      premiumOnly: req.body.premiumOnly !== false,
      allowedUsernames: normalizeUsernameList(req.body.allowedUsernames || []),
      removedUsernames: [],
      maxParticipants: Math.min(MAX_ALLOWED_PARTICIPANTS, Math.max(1, Number(req.body.maxParticipants || MAX_ALLOWED_PARTICIPANTS))),
      createdBy: String(req.user?.username || '').trim(),
      serverInstanceId: String(process.env.EC2_INSTANCE_ID || '').trim(),
      meetUrl: LIVEKIT_URL
    });

    await logAdminAction(req, {
      action: 'CREATE_LIVEKIT_CLASS',
      targetType: 'LiveClass',
      targetId: String(liveClass._id),
      details: { title: liveClass.title, roomName: liveClass.roomName, scheduledAt }
    });

    notifyStudentWorkspaceUpdated('class-created');

    return res.status(201).json({ liveClass: serializeLiveClass(liveClass.toObject(), null, 'admin') });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create live class.' });
  }
});

router.patch('/classes/:classId', authenticateToken('admin'), validate(updateLiveClassSchema), async (req, res) => {
  try {
    const liveClass = await findClassOrThrow(req.params.classId);
    if (req.body.title !== undefined) liveClass.title = String(req.body.title || '').trim() || liveClass.title;
    if (req.body.description !== undefined) liveClass.description = String(req.body.description || '').trim();
    if (req.body.roomName !== undefined) liveClass.roomName = buildRoomName(liveClass.title, req.body.roomName);
    if (req.body.course !== undefined) liveClass.course = String(req.body.course || '').trim();
    if (req.body.batch !== undefined) liveClass.batch = normalizeBatchName(req.body.batch);
    if (req.body.scheduledAt !== undefined) {
      liveClass.scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
      liveClass.isScheduled = Boolean(liveClass.scheduledAt);
      if (!liveClass.isActive) {
        liveClass.status = liveClass.isScheduled ? 'scheduled' : liveClass.status;
      }
    }
    if (req.body.scheduledEndAt !== undefined) liveClass.scheduledEndAt = req.body.scheduledEndAt ? new Date(req.body.scheduledEndAt) : null;
    if (req.body.premiumOnly !== undefined) liveClass.premiumOnly = Boolean(req.body.premiumOnly);
    if (req.body.allowedUsernames !== undefined) liveClass.allowedUsernames = normalizeUsernameList(req.body.allowedUsernames || []);
    if (req.body.maxParticipants !== undefined) {
      liveClass.maxParticipants = Math.min(MAX_ALLOWED_PARTICIPANTS, Math.max(1, Number(req.body.maxParticipants || MAX_ALLOWED_PARTICIPANTS)));
    }
    if (Array.isArray(liveClass.removedUsernames) && liveClass.removedUsernames.length) {
      const allowedSet = new Set(normalizeUsernameList(liveClass.allowedUsernames || []));
      liveClass.removedUsernames = normalizeUsernameList(liveClass.removedUsernames || []).filter((username) => !allowedSet.has(username));
    }
    await liveClass.save();

    await logAdminAction(req, {
      action: 'UPDATE_LIVEKIT_CLASS',
      targetType: 'LiveClass',
      targetId: String(liveClass._id),
      details: { title: liveClass.title }
    });

    notifyStudentWorkspaceUpdated('class-updated');

    return res.json({ liveClass: serializeLiveClass(liveClass.toObject(), null, 'admin') });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update live class.' });
  }
});

router.delete('/classes/:classId', authenticateToken('admin'), async (req, res) => {
  try {
    const liveClass = await findClassOrThrow(req.params.classId);
    const wasScheduledOnly = !liveClass.isActive && String(liveClass.status || '').trim() === 'scheduled';

    if (wasScheduledOnly) {
      await LiveClass.deleteOne({ _id: liveClass._id });

      await logAdminAction(req, {
        action: 'DELETE_SCHEDULED_LIVEKIT_CLASS',
        targetType: 'LiveClass',
        targetId: String(liveClass._id),
        details: { title: liveClass.title }
      });

      notifyStudentWorkspaceUpdated('class-deleted');

      return res.json({ ok: true, message: 'Scheduled live class removed.', server: null });
    }

    const wasActive = Boolean(liveClass.isActive);
    liveClass.status = 'cancelled';
    liveClass.isActive = false;
    liveClass.isScheduled = false;
    liveClass.endedAt = new Date();
    await liveClass.save();

    const remainingActiveClass = await LiveClass.exists({
      isActive: true,
      _id: { $ne: liveClass._id }
    });

    let server = null;
    if (wasActive && !remainingActiveClass && typeof classServerRoutes.stopServerIfRunning === 'function') {
      const stopResponse = await classServerRoutes.stopServerIfRunning().catch(() => null);
      server = stopResponse?.server || null;
    }

    await logAdminAction(req, {
      action: 'CANCEL_LIVEKIT_CLASS',
      targetType: 'LiveClass',
      targetId: String(liveClass._id),
      details: { title: liveClass.title, serverStopped: wasActive && !remainingActiveClass }
    });

    notifyStudentWorkspaceUpdated('class-cancelled');

    return res.json({ ok: true, message: 'Live class cancelled.', server });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to cancel live class.' });
  }
});

router.post('/classes/:classId/start', authenticateToken('admin'), async (req, res) => {
  try {
    const liveClass = await findClassOrThrow(req.params.classId);
    await LiveClass.updateMany({ isActive: true }, {
      $set: {
        isActive: false,
        status: 'ended',
        endedAt: new Date()
      }
    });

    liveClass.isActive = true;
    liveClass.isScheduled = false;
    liveClass.status = 'live';
    liveClass.startedAt = new Date();
    liveClass.endedAt = null;
    await liveClass.save();

    await logAdminAction(req, {
      action: 'START_LIVEKIT_CLASS',
      targetType: 'LiveClass',
      targetId: String(liveClass._id),
      details: { title: liveClass.title, roomName: liveClass.roomName }
    });

    notifyStudentWorkspaceUpdated('class-started');

    return res.json({ liveClass: serializeLiveClass(liveClass.toObject(), null, 'admin') });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to start live class.' });
  }
});

router.post('/classes/:classId/end', authenticateToken('admin'), async (req, res) => {
  try {
    const liveClass = await findClassOrThrow(req.params.classId);
    liveClass.isActive = false;
    liveClass.status = 'ended';
    liveClass.endedAt = new Date();
    await liveClass.save();

    const remainingActiveClass = await LiveClass.exists({
      isActive: true,
      _id: { $ne: liveClass._id }
    });

    let server = null;
    if (!remainingActiveClass && typeof classServerRoutes.stopServerIfRunning === 'function') {
      const stopResponse = await classServerRoutes.stopServerIfRunning().catch(() => null);
      server = stopResponse?.server || null;
    }

    await logAdminAction(req, {
      action: 'END_LIVEKIT_CLASS',
      targetType: 'LiveClass',
      targetId: String(liveClass._id),
      details: { title: liveClass.title, serverStopped: !remainingActiveClass }
    });

    notifyStudentWorkspaceUpdated('class-ended');

    return res.json({
      ok: true,
      liveClass: serializeLiveClass(liveClass.toObject(), null, 'admin'),
      server
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to end live class.' });
  }
});

router.post('/classes/:classId/remove-student', authenticateToken('admin'), validate(removeStudentFromClassSchema), async (req, res) => {
  try {
    const liveClass = await findClassOrThrow(req.params.classId);
    const requestedUsername = String(req.body.username || '').trim();
    const normalizedUsername = normalizeUsername(requestedUsername);
    const user = await User.findOne({ username: new RegExp(`^${escapeRegExp(normalizedUsername)}$`, 'i') }).lean();
    if (!user) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const removedUsernames = new Set(normalizeUsernameList(liveClass.removedUsernames || []));
    removedUsernames.add(normalizedUsername);
    liveClass.removedUsernames = Array.from(removedUsernames);
    await liveClass.save();
    await disconnectStudentFromLiveClass(liveClass, user.username).catch(() => {});

    await logAdminAction(req, {
      action: 'REMOVE_STUDENT_FROM_LIVEKIT_CLASS',
      targetType: 'LiveClass',
      targetId: String(liveClass._id),
      details: { username: user.username, title: liveClass.title }
    });

    notifyStudentWorkspaceUpdated('student-removed');

    return res.json({
      ok: true,
      message: `${user.username} removed from current session.`,
      liveClass: serializeLiveClass(liveClass.toObject(), null, 'admin')
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to remove student from current session.' });
  }
});

router.get('/teacher-token', authenticateToken('admin'), async (req, res) => {
  try {
    const classId = String(req.query.classId || '').trim();
    if (!classId) {
      return res.status(400).json({ error: 'classId is required.' });
    }

    const liveClass = await findClassOrThrow(classId);
    if (!isClassCurrentlyLive(liveClass)) {
      return res.status(409).json({ error: 'Start the live class before opening the teacher studio room.' });
    }
    const token = await buildToken({
      identity: `teacher-${String(req.user?.username || 'admin').trim()}-${String(liveClass._id)}`,
      name: String(req.user?.username || 'Admin').trim() || 'Admin',
      roomName: liveClass.roomName,
      role: 'teacher'
    });

    return res.json({
      token,
      roomName: liveClass.roomName,
      livekitUrl: LIVEKIT_URL,
      liveClass: serializeLiveClass(liveClass.toObject(), null, 'admin')
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to generate teacher token.' });
  }
});

router.get('/student-token', authenticateToken('user'), async (req, res) => {
  try {
    const classId = String(req.query.classId || '').trim();
    if (!classId) {
      return res.status(400).json({ error: 'classId is required.' });
    }

    const [liveClass, currentUser] = await Promise.all([
      findClassOrThrow(classId),
      loadCurrentUser(req.user?.username)
    ]);

    if (!currentUser) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    if (isUserRemovedFromClass(currentUser, liveClass)) {
      return res.status(403).json({ error: 'You were removed from the current live session by the admin.' });
    }

    if (!await canUserAccessClass(currentUser, liveClass, 'user')) {
      return res.status(403).json({ error: 'You need course access for this live class.' });
    }

    if (!isClassCurrentlyLive(liveClass)) {
      return res.status(409).json({ error: 'This live class room is not active yet.' });
    }

    const token = await buildToken({
      identity: `student-${String(currentUser.username || 'student').trim()}-${String(liveClass._id)}`,
      name: String(currentUser.username || 'Student').trim() || 'Student',
      roomName: liveClass.roomName,
      role: 'student'
    });

    return res.json({
      token,
      roomName: liveClass.roomName,
      livekitUrl: LIVEKIT_URL,
      liveClass: serializeLiveClass(liveClass.toObject(), currentUser, 'user', { canAccess: true, isLocked: false })
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to generate student token.' });
  }
});

router.get('/access/students', authenticateToken('admin'), async (req, res) => {
  try {
    const students = await User.find({}, {
      username: 1,
      email: 1,
      class: 1,
      city: 1,
      liveClassAccess: 1,
      _id: 0
    }).sort({ username: 1 }).lean();

    return res.json({
      students: students.map((student) => ({
        username: student.username,
        email: student.email || '',
        class: student.class || '',
        city: student.city || '',
        liveClassAccess: {
          premiumEnabled: Boolean(student?.liveClassAccess?.premiumEnabled),
          premiumLabel: String(student?.liveClassAccess?.premiumLabel || 'Premium Access').trim(),
          premiumExpiresAt: student?.liveClassAccess?.premiumExpiresAt || null,
          notes: String(student?.liveClassAccess?.notes || '').trim()
        },
        calendarBlocks: 0
      }))
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to load student live access list.' });
  }
});

router.patch('/access/students/:username', authenticateToken('admin'), validate(updatePremiumAccessSchema), async (req, res) => {
  try {
    const username = String(req.params.username || '').trim();
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    user.liveClassAccess = {
      premiumEnabled: Boolean(req.body.premiumEnabled),
      premiumLabel: String(req.body.premiumLabel || 'Premium Access').trim() || 'Premium Access',
      premiumExpiresAt: req.body.premiumExpiresAt ? new Date(req.body.premiumExpiresAt) : null,
      notes: String(req.body.notes || '').trim()
    };
    await user.save();

    await logAdminAction(req, {
      action: 'UPDATE_LIVEKIT_PREMIUM_ACCESS',
      targetType: 'User',
      targetId: username,
      details: { premiumEnabled: user.liveClassAccess.premiumEnabled, premiumExpiresAt: user.liveClassAccess.premiumExpiresAt }
    });

    notifyStudentWorkspaceUpdated('premium-access-updated');

    return res.json({
      ok: true,
      access: {
        premiumEnabled: Boolean(user?.liveClassAccess?.premiumEnabled),
        premiumLabel: String(user?.liveClassAccess?.premiumLabel || 'Premium Access').trim(),
        premiumExpiresAt: user?.liveClassAccess?.premiumExpiresAt || null,
        notes: String(user?.liveClassAccess?.notes || '').trim()
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update student live access.' });
  }
});

router.post('/calendar/blocks', authenticateToken('admin'), validate(createCalendarBlockSchema), async (req, res) => {
  try {
    const startsAt = new Date(req.body.startsAt);
    const endsAt = new Date(req.body.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return res.status(400).json({ error: 'Calendar block start and end time are invalid.' });
    }

    const course = String(req.body.course || '').trim();
    if (!course) {
      return res.status(400).json({ error: 'Course is required for calendar blocking.' });
    }

    const block = await LiveClassCalendarBlock.create({
      course,
      batch: normalizeBatchName(req.body.batch),
      title: String(req.body.title || '').trim(),
      description: String(req.body.description || '').trim(),
      startsAt,
      endsAt,
      kind: 'blocked-slot',
      createdBy: String(req.user?.username || '').trim()
    });

    await logAdminAction(req, {
      action: 'CREATE_LIVEKIT_CALENDAR_BLOCK',
      targetType: 'Course',
      targetId: course,
      details: { title: req.body.title, batch: normalizeBatchName(req.body.batch), startsAt, endsAt }
    });

    notifyStudentWorkspaceUpdated('calendar-block-created');

    return res.status(201).json({
      ok: true,
      block: {
        _id: String(block?._id || ''),
        course,
        batch: normalizeBatchName(block?.batch),
        title: String(block?.title || '').trim(),
        description: String(block?.description || '').trim(),
        startsAt: block?.startsAt || null,
        endsAt: block?.endsAt || null,
        kind: String(block?.kind || 'blocked-slot').trim(),
        createdBy: String(block?.createdBy || '').trim()
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create calendar block.' });
  }
});

router.patch('/calendar/blocks/:blockId', authenticateToken('admin'), validate(updateCalendarBlockSchema), async (req, res) => {
  try {
    const blockId = String(req.params.blockId || '').trim();
    const block = await LiveClassCalendarBlock.findById(blockId);
    if (!block) {
      return res.status(404).json({ error: 'Calendar block not found.' });
    }

    const startsAt = new Date(req.body.startsAt);
    const endsAt = new Date(req.body.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return res.status(400).json({ error: 'Calendar block start and end time are invalid.' });
    }

    const course = String(req.body.course || '').trim();
    if (!course) {
      return res.status(400).json({ error: 'Course is required for calendar blocking.' });
    }

    block.course = course;
    block.batch = normalizeBatchName(req.body.batch);
    block.title = String(req.body.title || '').trim();
    block.description = String(req.body.description || '').trim();
    block.startsAt = startsAt;
    block.endsAt = endsAt;
    await block.save();

    await logAdminAction(req, {
      action: 'UPDATE_LIVEKIT_CALENDAR_BLOCK',
      targetType: 'Course',
      targetId: course,
      details: { blockId, title: block.title, batch: block.batch, startsAt, endsAt }
    });

    notifyStudentWorkspaceUpdated('calendar-block-updated');

    return res.json({
      ok: true,
      block: {
        _id: String(block?._id || ''),
        course,
        batch: normalizeBatchName(block?.batch),
        title: String(block?.title || '').trim(),
        description: String(block?.description || '').trim(),
        startsAt: block?.startsAt || null,
        endsAt: block?.endsAt || null,
        kind: String(block?.kind || 'blocked-slot').trim(),
        createdBy: String(block?.createdBy || '').trim()
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to update calendar block.' });
  }
});

router.delete('/calendar/blocks/:blockId', authenticateToken('admin'), async (req, res) => {
  try {
    const blockId = String(req.params.blockId || '').trim();
    const objectId = mongoose.Types.ObjectId.isValid(blockId) ? new mongoose.Types.ObjectId(blockId) : null;
    const block = await LiveClassCalendarBlock.findByIdAndDelete(blockId);
    let legacyRemovedCount = 0;

    if (objectId) {
      const deleteLegacyById = await User.collection.updateMany(
        {
          $or: [
            { 'liveClassCalendarBlocks._id': objectId },
            { 'calendarBlocks._id': objectId }
          ]
        },
        {
          $pull: {
            liveClassCalendarBlocks: { _id: objectId },
            calendarBlocks: { _id: objectId }
          }
        }
      ).catch(() => ({ modifiedCount: 0 }));

      legacyRemovedCount += Number(deleteLegacyById?.modifiedCount || 0);
    }

    if (block) {
      const matchingLegacyBlock = {
        course: String(block?.course || '').trim(),
        batch: normalizeBatchName(block?.batch),
        title: String(block?.title || '').trim(),
        startsAt: block?.startsAt || null,
        endsAt: block?.endsAt || null,
        kind: String(block?.kind || 'blocked-slot').trim() || 'blocked-slot'
      };
      const matchingLegacyBlockWithoutBatch = {
        course: String(block?.course || '').trim(),
        title: String(block?.title || '').trim(),
        startsAt: block?.startsAt || null,
        endsAt: block?.endsAt || null,
        kind: String(block?.kind || 'blocked-slot').trim() || 'blocked-slot'
      };

      const deleteLegacyBySignature = await User.collection.updateMany(
        {
          $or: [
            { liveClassCalendarBlocks: { $elemMatch: matchingLegacyBlock } },
            { calendarBlocks: { $elemMatch: matchingLegacyBlock } },
            { liveClassCalendarBlocks: { $elemMatch: matchingLegacyBlockWithoutBatch } },
            { calendarBlocks: { $elemMatch: matchingLegacyBlockWithoutBatch } }
          ]
        },
        {
          $pull: {
            liveClassCalendarBlocks: { $or: [matchingLegacyBlock, matchingLegacyBlockWithoutBatch] },
            calendarBlocks: { $or: [matchingLegacyBlock, matchingLegacyBlockWithoutBatch] }
          }
        }
      ).catch(() => ({ modifiedCount: 0 }));

      legacyRemovedCount += Number(deleteLegacyBySignature?.modifiedCount || 0);
    }

    if (!block && !legacyRemovedCount) {
      return res.status(404).json({ error: 'Calendar block not found.' });
    }

    await logAdminAction(req, {
      action: 'DELETE_LIVEKIT_CALENDAR_BLOCK',
      targetType: 'Course',
      targetId: String(block?.course || blockId).trim(),
      details: { blockId, legacyRemovedCount }
    });

    notifyStudentWorkspaceUpdated('calendar-block-deleted');

    return res.json({ ok: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to delete calendar block.' });
  }
});

module.exports = router;