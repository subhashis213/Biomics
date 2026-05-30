import { requestJson } from './client';

export type LiveClass = {
  _id: string;
  title: string;
  description?: string;
  roomName?: string;
  status?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  scheduledAt?: string | null;
  scheduledEndAt?: string | null;
  isActive?: boolean;
  isScheduled?: boolean;
  course?: string;
  batch?: string;
  premiumOnly?: boolean;
  maxParticipants?: number;
  canAccess?: boolean;
  isLocked?: boolean;
  joinRoute?: string;
};

export type CalendarEntry = {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  kind: 'live-class' | 'blocked-slot';
  liveClassId?: string;
  course?: string;
  batch?: string;
  premiumOnly?: boolean;
  status?: string;
};

export type StudentWorkspace = {
  access: { hasCourseAccess: boolean; enrolledCourse: string; notes?: string };
  activeClass: LiveClass | null;
  upcomingClasses: LiveClass[];
  calendar: CalendarEntry[];
};

export type AdminWorkspace = {
  classes?: LiveClass[];
  activeClass?: LiveClass | null;
  upcomingClasses?: LiveClass[];
  calendar?: CalendarEntry[];
  calendarBlocks?: CalendarEntry[];
  availableCourses?: string[];
  availableBatchesByCourse?: Record<string, string[]>;
};

export type LiveKitTokenResponse = {
  token: string;
  roomName: string;
  livekitUrl: string;
  liveClass?: LiveClass;
};

export function fetchStudentLiveWorkspace(token: string) {
  return requestJson<StudentWorkspace>('/api/livekit/student/workspace', { token });
}

export function fetchAdminLiveWorkspace(token: string) {
  return requestJson<AdminWorkspace>('/api/livekit/admin/workspace', { token });
}

export function fetchTeacherLiveToken(token: string, classId: string) {
  return requestJson<LiveKitTokenResponse>(
    `/api/livekit/teacher-token?classId=${encodeURIComponent(classId)}`,
    { token }
  );
}

export function fetchStudentLiveToken(token: string, classId: string) {
  return requestJson<LiveKitTokenResponse>(
    `/api/livekit/student-token?classId=${encodeURIComponent(classId)}`,
    { token }
  );
}

export function startLiveClass(token: string, classId: string) {
  return requestJson<{ ok?: boolean; liveClass?: LiveClass }>(
    `/api/livekit/classes/${encodeURIComponent(classId)}/start`,
    { method: 'POST', token }
  );
}

export function endLiveClass(token: string, classId: string) {
  return requestJson<{ ok?: boolean }>(`/api/livekit/classes/${encodeURIComponent(classId)}/end`, {
    method: 'POST',
    token
  });
}

export function createLiveClass(
  token: string,
  payload: {
    title: string;
    description?: string;
    course: string;
    batch?: string;
    scheduledAt: string;
    scheduledEndAt?: string;
    maxParticipants?: number;
  }
) {
  return requestJson<{ liveClass?: LiveClass }>('/api/livekit/classes', {
    method: 'POST',
    token,
    body: JSON.stringify(payload)
  });
}

export function createCalendarBlock(
  token: string,
  payload: { course: string; batch?: string; title: string; description?: string; startsAt: string; endsAt: string }
) {
  return requestJson<{ ok?: boolean; block?: CalendarEntry }>('/api/livekit/calendar/blocks', {
    method: 'POST',
    token,
    body: JSON.stringify(payload)
  });
}
