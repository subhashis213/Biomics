import { useEffect } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { syncPushRegistration, watchPushRegistration } from '@/src/utils/push';

/** Ensures the logged-in user's phone registers its FCM token with the backend. */
export function usePushRegistration() {
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;

    syncPushRegistration(token);
    const retry1 = setTimeout(() => syncPushRegistration(token), 2500);
    const retry2 = setTimeout(() => syncPushRegistration(token), 6000);
    const unwatch = watchPushRegistration(token);

    return () => {
      clearTimeout(retry1);
      clearTimeout(retry2);
      unwatch();
    };
  }, [token]);
}
