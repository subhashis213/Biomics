import { useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { syncPushRegistration, watchPushRegistration } from '@/src/utils/push';

/** Ensures the logged-in user's phone registers its FCM token with the backend. */
export function usePushRegistration() {
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    syncPushRegistration(token);
    return watchPushRegistration(token);
  }, [token]);
}
