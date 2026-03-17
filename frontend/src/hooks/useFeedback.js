import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { requestJson } from '../api';

const TOAST_MS = 5000;
const FADE_MS = 280;

/**
 * Manages feedback form state using React Hook Form.
 * Handles toast notification lifecycle (auto-dismiss + fade).
 */
export function useFeedback() {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { rating: '5', message: '' }
  });

  const [inlineError, setInlineError] = useState(null);
  const [toast, setToast] = useState(null);
  const [isToastDismissing, setIsToastDismissing] = useState(false);

  useEffect(() => {
    if (!toast) { setIsToastDismissing(false); return; }
    setIsToastDismissing(false);
    const fade = setTimeout(() => setIsToastDismissing(true), Math.max(0, TOAST_MS - FADE_MS));
    const hide = setTimeout(() => { setToast(null); setIsToastDismissing(false); }, TOAST_MS);
    return () => { clearTimeout(fade); clearTimeout(hide); };
  }, [toast]);

  async function onSubmit(values) {
    setInlineError(null);
    try {
      await requestJson('/feedback', {
        method: 'POST',
        body: JSON.stringify({ rating: Number(values.rating), message: values.message.trim() })
      });
      reset();
      setToast({ type: 'success', text: 'Thank you. Your feedback was submitted.' });
    } catch (err) {
      setInlineError(err.message);
    }
  }

  return {
    register,
    handleFeedbackSubmit: handleSubmit(onSubmit),
    isSubmittingFeedback: isSubmitting,
    feedbackInlineError: inlineError,
    feedbackToast: toast,
    isFeedbackToastDismissing: isToastDismissing,
    dismissFeedbackToast: () => setToast(null)
  };
}
