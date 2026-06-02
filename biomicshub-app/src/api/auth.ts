import * as SecureStore from 'expo-secure-store';
import { requestJson } from './client';

const TOKEN_KEY = 'biomics_auth_token';
const ROLE_KEY = 'biomics_auth_role';

export type AppRole = 'user' | 'admin';

export type StudentUser = {
  username: string;
  phone?: string;
  class?: string;
  city?: string;
  avatarUrl?: string;
};

export type AdminUser = {
  username: string;
  avatarUrl?: string;
};

export type SessionAccount = {
  role: AppRole;
  username: string;
  student?: StudentUser;
  admin?: AdminUser;
};

export async function getStoredAuth() {
  try {
    const [token, role] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(ROLE_KEY)
    ]);
    return { token: token || '', role: (role as AppRole) || 'user' };
  } catch {
    return { token: '', role: 'user' as AppRole };
  }
}

export async function setStoredAuth(token: string, role: AppRole) {
  if (!token) {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(ROLE_KEY)
    ]);
    return;
  }
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),
    SecureStore.setItemAsync(ROLE_KEY, role)
  ]);
}

export async function clearStoredAuth() {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(ROLE_KEY)
  ]);
}

export async function loginStudent(username: string, password: string) {
  const data = await requestJson<{ token: string; user: StudentUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  await setStoredAuth(data.token, 'user');
  return data;
}

export async function loginAdmin(username: string, password: string) {
  const data = await requestJson<{ token: string; admin: AdminUser }>('/auth/admin-login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  await setStoredAuth(data.token, 'admin');
  return data;
}

export type AutoLoginResult = {
  role: AppRole;
  token: string;
  student?: StudentUser;
  admin?: AdminUser;
};

// Detects whether the credentials belong to a student or an admin and stores the session.
export async function loginAuto(username: string, password: string): Promise<AutoLoginResult> {
  try {
    const data = await requestJson<{ token: string; user: StudentUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    await setStoredAuth(data.token, 'user');
    return { role: 'user', token: data.token, student: data.user };
  } catch (studentErr) {
    try {
      const data = await requestJson<{ token: string; admin: AdminUser }>('/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      await setStoredAuth(data.token, 'admin');
      return { role: 'admin', token: data.token, admin: data.admin };
    } catch {
      throw new Error('Invalid username or password.');
    }
  }
}

export type GoogleProfilePayload = {
  email?: string;
  name?: string;
  phone?: string;
  birthDate?: string;
};

export type GoogleLoginResponse =
  | {
      requiresProfileCompletion: true;
      completionToken: string;
      profile?: GoogleProfilePayload;
      missingFields?: string[];
    }
  | {
      token: string;
      user: StudentUser;
      message?: string;
    };

export type GoogleLoginResult =
  | { status: 'authenticated'; token: string; user: StudentUser }
  | {
      status: 'profile_required';
      completionToken: string;
      profile: GoogleProfilePayload;
    };

export async function googleLogin(idToken: string): Promise<GoogleLoginResult> {
  const data = await requestJson<GoogleLoginResponse>('/auth/google-login', {
    method: 'POST',
    body: JSON.stringify({ idToken })
  });

  if ('requiresProfileCompletion' in data && data.requiresProfileCompletion) {
    return {
      status: 'profile_required',
      completionToken: String(data.completionToken || '').trim(),
      profile: data.profile || {}
    };
  }

  const token = String((data as { token?: string }).token || '').trim();
  const user = (data as { user?: StudentUser }).user;
  if (!token || !user) {
    throw new Error('Google login failed.');
  }
  await setStoredAuth(token, 'user');
  return { status: 'authenticated', token, user };
}

export async function googleCompleteProfile(
  completionToken: string,
  phone: string,
  birthDate: string
) {
  const data = await requestJson<{ token: string; user: StudentUser }>('/auth/google-complete-profile', {
    method: 'POST',
    body: JSON.stringify({ completionToken, phone, birthDate })
  });
  await setStoredAuth(data.token, 'user');
  return data;
}

export type RegisterPayload = {
  phone: string;
  username: string;
  email?: string;
  class: string;
  city: string;
  birthDate: string;
  password: string;
};

export type RegisterCourseOption = {
  name: string;
  displayName: string;
};

export async function fetchRegisterCourses() {
  return requestJson<{ courses: RegisterCourseOption[] }>('/auth/register/courses');
}

export async function registerStudent(payload: RegisterPayload) {
  return requestJson<{ message: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function resetPassword(username: string, birthDate: string, password: string) {
  return requestJson<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ username, birthDate, password })
  });
}

export async function fetchCurrentStudent(token: string) {
  const data = await requestJson<{ user: StudentUser }>('/auth/me', { token });
  return data.user;
}

export async function fetchCurrentAdmin(token: string) {
  const data = await requestJson<{ admin: AdminUser }>('/auth/admin/me', { token });
  return data.admin;
}

const API_BASE = 'https://biomicshub-backend.onrender.com';

export async function uploadAvatar(token: string, role: AppRole, uri: string) {
  const path = role === 'admin' ? '/auth/admin/me/avatar' : '/auth/me/avatar';
  const form = new FormData();
  const name = uri.split('/').pop() || 'avatar.jpg';
  const ext = (name.split('.').pop() || 'jpg').toLowerCase();
  const type = ext === 'png' ? 'image/png' : 'image/jpeg';
  // React Native FormData file shape
  form.append('avatar', { uri, name, type } as unknown as Blob);

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && (data.error || data.message)) || 'Failed to upload photo.');
  }
  return data as { user?: { avatarUrl?: string }; admin?: { avatarUrl?: string } };
}
