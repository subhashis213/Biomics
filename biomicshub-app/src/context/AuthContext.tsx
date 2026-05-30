import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AdminUser,
  AppRole,
  clearStoredAuth,
  fetchCurrentAdmin,
  fetchCurrentStudent,
  getStoredAuth,
  loginAdmin,
  loginAuto,
  loginStudent,
  StudentUser
} from '@/src/api/auth';
import { unregisterDevice } from '@/src/api/notifications';
import { getDevicePushToken, syncPushRegistration, watchPushRegistration } from '@/src/utils/push';

type AuthContextValue = {
  token: string;
  role: AppRole;
  student: StudentUser | null;
  admin: AdminUser | null;
  username: string;
  isLoading: boolean;
  loginAsStudent: (username: string, password: string) => Promise<void>;
  loginAsAdmin: (username: string, password: string) => Promise<void>;
  loginAuto: (username: string, password: string) => Promise<AppRole>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState('');
  const [role, setRole] = useState<AppRole>('user');
  const [student, setStudent] = useState<StudentUser | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const registerPush = useCallback(async (authToken: string) => {
    await syncPushRegistration(authToken);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getStoredAuth();
        if (!stored.token) return;
        if (stored.role === 'admin') {
          const profile = await fetchCurrentAdmin(stored.token);
          if (cancelled) return;
          setToken(stored.token);
          setRole('admin');
          setAdmin(profile);
        } else {
          const profile = await fetchCurrentStudent(stored.token);
          if (cancelled) return;
          setToken(stored.token);
          setRole('user');
          setStudent(profile);
        }
      } catch {
        await clearStoredAuth();
        if (!cancelled) {
          setToken('');
          setStudent(null);
          setAdmin(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    registerPush(token);
    return watchPushRegistration(token);
  }, [token, registerPush]);

  const loginAsStudent = useCallback(async (username: string, password: string) => {
    const result = await loginStudent(username, password);
    setToken(result.token);
    setRole('user');
    setStudent(result.user);
    setAdmin(null);
  }, []);

  const loginAsAdmin = useCallback(async (username: string, password: string) => {
    const result = await loginAdmin(username, password);
    setToken(result.token);
    setRole('admin');
    setAdmin(result.admin);
    setStudent(null);
  }, []);

  const doLoginAuto = useCallback(async (username: string, password: string) => {
    const result = await loginAuto(username, password);
    setToken(result.token);
    setRole(result.role);
    if (result.role === 'admin') {
      setAdmin(result.admin || null);
      setStudent(null);
    } else {
      setStudent(result.student || null);
      setAdmin(null);
    }
    return result.role;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    try {
      if (role === 'admin') {
        const profile = await fetchCurrentAdmin(token);
        setAdmin(profile);
      } else {
        const profile = await fetchCurrentStudent(token);
        setStudent(profile);
      }
    } catch {
      // ignore
    }
  }, [token, role]);

  const logout = useCallback(async () => {
    try {
      const deviceToken = await getDevicePushToken();
      if (deviceToken && token) await unregisterDevice(token, deviceToken);
    } catch {
      // ignore
    }
    await clearStoredAuth();
    setToken('');
    setStudent(null);
    setAdmin(null);
    setRole('user');
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      role,
      student,
      admin,
      username: role === 'admin' ? admin?.username || '' : student?.username || '',
      isLoading,
      loginAsStudent,
      loginAsAdmin,
      loginAuto: doLoginAuto,
      logout,
      refreshProfile
    }),
    [token, role, student, admin, isLoading, loginAsStudent, loginAsAdmin, doLoginAuto, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
