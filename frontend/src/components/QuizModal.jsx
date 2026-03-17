import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Full-screen modal overlay for the quiz.
 * Shows an exit-confirmation card inside the modal when the user
 * tries to leave while a quiz is in progress.
 */
export function QuizModal({
  open,
  title,
  onClose,
  children,
  showExitConfirm,
  onCancelExit,
  onConfirmExit,
}) {
  // Lock body scroll while modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close / trigger exit-confirm on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const modal = (
    <div
      className="quiz-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="quiz-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-modal-title"
      >
        <div className="quiz-modal-header">
          <h2 id="quiz-modal-title" className="quiz-modal-title">{title}</h2>
          <button
            type="button"
            className="quiz-modal-close-btn"
            onClick={onClose}
            aria-label="Exit quiz"
          >
            ✕ Exit
          </button>
        </div>

        <div className={`quiz-modal-body${showExitConfirm ? ' quiz-modal-body--dimmed' : ''}`}>
          {children}
        </div>

        {showExitConfirm ? (
          <div
            className="quiz-exit-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="quiz-exit-title"
          >
            <div className="quiz-exit-card">
              <div className="quiz-exit-icon" aria-hidden="true">⚠️</div>
              <h3 id="quiz-exit-title">Exit Quiz?</h3>
              <p>
                Are you sure you want to exit?<br />
                Your marked answers will not be saved.
              </p>
              <div className="quiz-exit-actions">
                <button type="button" className="primary-btn" onClick={onCancelExit}>
                  Continue Quiz
                </button>
                <button type="button" className="danger-btn" onClick={onConfirmExit}>
                  Yes, Exit
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
