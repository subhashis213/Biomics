import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AdminUser,
  AppRole,
  clearStoredAuth,
  fetchCurrentAdmin,
  fetchCurrentStudent,
  getStoredAuth,
  googleCompleteProfile,
  googleLogin,
  GoogleLoginResult,
  loginAdmin,
  loginAuto,
  loginStudent,
  setStoredAuth,
  StudentUser
} from '@/src/api/auth';
import { syncPushRegistration, watchPushRegistration } from '@/src/utils/push';

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
  loginWithGoogleIdToken: (idToken: string) => Promise<GoogleLoginResult>;
  loginWithGoogleResult: (result: GoogleLoginResult) => Promise<GoogleLoginResult>;
  completeGoogleProfile: (completionToken: string, phone: string, birthDate: string) => Promise<void>;
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
    await syncPushRegistration(result.token);
  }, []);

  const loginAsAdmin = useCallback(async (username: string, password: string) => {
    const result = await loginAdmin(username, password);
    setToken(result.token);
    setRole('admin');
    setAdmin(result.admin);
    setStudent(null);
    await syncPushRegistration(result.token);
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
    await syncPushRegistration(result.token);
    return result.role;
  }, []);

  const loginWithGoogleIdToken = useCallback(async (idToken: string): Promise<GoogleLoginResult> => {
    const result = await googleLogin(idToken);
    if (result.status === 'authenticated') {
      setToken(result.token);
      setRole('user');
      setStudent(result.user);
      setAdmin(null);
      await syncPushRegistration(result.token);
    }
    return result;
  }, []);

  const loginWithGoogleResult = useCallback(async (result: GoogleLoginResult): Promise<GoogleLoginResult> => {
    if (result.status === 'authenticated') {
      await setStoredAuth(result.token, 'user');
      const profile =
        result.user.username.trim().length > 0
          ? result.user
          : await fetchCurrentStudent(result.token);
      setToken(result.token);
      setRole('user');
      setStudent(profile);
      setAdmin(null);
      await syncPushRegistration(result.token);
      return { status: 'authenticated', token: result.token, user: profile };
    }
    return result;
  }, []);

  const completeGoogleProfile = useCallback(async (completionToken: string, phone: string, birthDate: string) => {
    const result = await googleCompleteProfile(completionToken, phone, birthDate);
    setToken(result.token);
    setRole('user');
    setStudent(result.user);
    setAdmin(null);
    await syncPushRegistration(result.token);
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
    // Keep the FCM token on the server — role/username refresh on next login.
    await clearStoredAuth();
    setToken('');
    setStudent(null);
    setAdmin(null);
    setRole('user');
  }, []);

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
      loginWithGoogleIdToken,
      loginWithGoogleResult,
      completeGoogleProfile,
      logout,
      refreshProfile
    }),
    [token, role, student, admin, isLoading, loginAsStudent, loginAsAdmin, doLoginAuto, loginWithGoogleIdToken, loginWithGoogleResult, completeGoogleProfile, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
