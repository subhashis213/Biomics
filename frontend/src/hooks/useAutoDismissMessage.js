import { useEffect } from 'react';

export default function useAutoDismissMessage(message, setMessage, durationMs = 3000) {
  useEffect(() => {
    if (!message || message.type !== 'success') return;

    const timeoutId = setTimeout(() => {
      setMessage((current) => (current?.type === 'success' ? null : current));
    }, durationMs);

    return () => clearTimeout(timeoutId);
  }, [message, setMessage, durationMs]);
}
