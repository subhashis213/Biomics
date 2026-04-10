import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { clearClipboard, formatClipboardAge, readClipboard } from '../utils/questionClipboard';

/**
 * QuestionClipboardModal
 *
 * Props:
 *   open        {boolean}
 *   onClose     {() => void}
 *   onPaste     {(questions: Question[], mode: 'replace'|'append') => void}
 */
export default function QuestionClipboardModal({ open, onClose, onPaste }) {
  const [clipboard, setClipboard] = useState(null);
  const [selected, setSelected] = useState([]);  // indices of selected questions
  const [mode, setMode] = useState('append');     // 'replace' | 'append'
  const [previewing, setPreviewing] = useState(false);

  // Refresh clipboard data every time modal opens
  useEffect(() => {
    if (!open) return;
    const data = readClipboard();
    setClipboard(data);
    setSelected(data ? data.questions.map((_, i) => i) : []); // select all by default
    setMode('append');
    setPreviewing(false);
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function toggleSelect(i) {
    setSelected((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  }

  function selectAll() {
    setSelected(clipboard ? clipboard.questions.map((_, i) => i) : []);
  }

  function selectNone() {
    setSelected([]);
  }

  function handlePaste() {
    if (!clipboard || selected.length === 0) return;
    const questions = selected
      .sort((a, b) => a - b)
      .map((i) => clipboard.questions[i]);
    onPaste(questions, mode);
    onClose();
  }

  function handleClearClipboard() {
    clearClipboard();
    setClipboard(null);
    setSelected([]);
  }

  const sourceLabel = {
    'Quiz Builder': '📝 Quiz Builder',
    'Monthly Mock Exam': '📅 Monthly Mock Exam',
    'Topic Test Builder': '🧪 Topic Test Builder',
    'Full Mock Builder': '📋 Full Mock Builder'
  }[clipboard?.source] || clipboard?.source || 'Unknown';

  return createPortal(
    <div className="qcb-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qcb-modal" role="dialog" aria-modal="true" aria-label="Paste questions from clipboard">

        {/* ── Header ── */}
        <div className="qcb-header">
          <div className="qcb-header-left">
            <span className="qcb-header-icon">📋</span>
            <div>
              <h3 className="qcb-title">Question Clipboard</h3>
              {clipboard ? (
                <p className="qcb-subtitle">
                  From <strong>{sourceLabel}</strong>
                  {clipboard.sourceTitle && clipboard.sourceTitle !== clipboard.source
                    ? <> — <em>{clipboard.sourceTitle}</em></>
                    : null}
                  <span className="qcb-age"> · {formatClipboardAge(clipboard.copiedAt)}</span>
                </p>
              ) : (
                <p className="qcb-subtitle">No questions copied yet</p>
              )}
            </div>
          </div>
          <button type="button" className="qcb-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {!clipboard ? (
          <div className="qcb-empty">
            <span className="qcb-empty-icon">📭</span>
            <p>Clipboard is empty.</p>
            <p className="qcb-empty-hint">
              Go to any builder, click <strong>Copy Questions</strong>, then come back here to paste.
            </p>
            <button type="button" className="secondary-btn" onClick={onClose}>Close</button>
          </div>
        ) : (
          <>
            {/* ── Stats bar ── */}
            <div className="qcb-stats-bar">
              <span className="qcb-stat-badge">
                <span className="qcb-stat-num">{clipboard.questions.length}</span> question{clipboard.questions.length !== 1 ? 's' : ''} in clipboard
              </span>
              <span className="qcb-stat-badge qcb-selected-badge">
                <span className="qcb-stat-num">{selected.length}</span> selected
              </span>
              <div className="qcb-select-actions">
                <button type="button" className="qcb-link-btn" onClick={selectAll}>Select all</button>
                <span className="qcb-divider">·</span>
                <button type="button" className="qcb-link-btn" onClick={selectNone}>None</button>
              </div>
            </div>

            {/* ── Paste mode ── */}
            <div className="qcb-mode-row">
              <span className="qcb-mode-label">Paste mode:</span>
              <label className={`qcb-mode-chip${mode === 'append' ? ' active' : ''}`}>
                <input
                  type="radio" name="qcb-mode" value="append"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                />
                ➕ Append to existing
              </label>
              <label className={`qcb-mode-chip${mode === 'replace' ? ' active' : ''}`}>
                <input
                  type="radio" name="qcb-mode" value="replace"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                🔄 Replace all questions
              </label>
            </div>

            {/* ── Question list ── */}
            <div className="qcb-question-list">
              {clipboard.questions.map((q, i) => {
                const isSelected = selected.includes(i);
                return (
                  <label key={i} className={`qcb-question-row${isSelected ? ' selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(i)}
                      className="qcb-checkbox"
                    />
                    <div className="qcb-question-body">
                      <div className="qcb-question-head">
                        <span className="qcb-q-num">Q{i + 1}</span>
                        <span className="qcb-q-correct">✓ {['A', 'B', 'C', 'D'][q.correctIndex]}</span>
                      </div>
                      <p className={`qcb-q-text${previewing ? '' : ' qcb-q-text-clamped'}`}>{q.question || <em>No question text</em>}</p>
                      {previewing && (
                        <div className="qcb-options-preview">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className={`qcb-opt${oi === q.correctIndex ? ' correct' : ''}`}>
                              <span className="qcb-opt-lbl">{['A', 'B', 'C', 'D'][oi]}</span>
                              {opt || <em>—</em>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {/* ── Toggle preview ── */}
            <button type="button" className="qcb-link-btn qcb-preview-toggle" onClick={() => setPreviewing((p) => !p)}>
              {previewing ? '▲ Hide options preview' : '▼ Show options preview'}
            </button>

            {/* ── Footer actions ── */}
            <div className="qcb-footer">
              <button type="button" className="qcb-danger-link-btn" onClick={handleClearClipboard}>
                🗑 Clear clipboard
              </button>
              <div className="qcb-footer-right">
                <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
                <button
                  type="button"
                  className="primary-btn"
                  disabled={selected.length === 0}
                  onClick={handlePaste}
                >
                  Paste {selected.length} Question{selected.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
