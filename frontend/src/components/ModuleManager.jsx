import { useState } from 'react';

export default function ModuleManager({
  course,
  modules = [],
  selectedModule,
  onModuleSelect,
  onModuleCreate,
  onModuleDelete,
  isProcessing = false,
  modalMessage,
  onClearMessage
}) {
  const [newModuleName, setNewModuleName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(modules.length === 0);
  const [createError, setCreateError] = useState(null);
  const [confirmDeleteModule, setConfirmDeleteModule] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleCreateModule(e) {
    e.preventDefault();
    if (!newModuleName.trim()) { setCreateError('Module name cannot be empty'); return; }
    if (modules.some(m => m.toLowerCase() === newModuleName.toLowerCase())) {
      setCreateError('Module already exists'); return;
    }
    try {
      await onModuleCreate(newModuleName.trim());
      setNewModuleName('');
      setShowCreateForm(false);
      setCreateError(null);
    } catch {
      setCreateError('Failed to create module');
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteModule || isDeleting) return;
    setIsDeleting(true);
    try {
      await onModuleDelete(confirmDeleteModule);
    } finally {
      setIsDeleting(false);
      setConfirmDeleteModule(null);
    }
  }

  return (
    <div className="module-manager">
      <div className="module-manager-header">
        <h3>Select or Create Module</h3>
        <p className="subtitle">Organise your content by modules within {course}</p>
      </div>

      {/* Inline message */}
      {modalMessage && (
        <div className={`module-manager-msg module-manager-msg--${modalMessage.type}`}>
          <span>{modalMessage.text}</span>
          {onClearMessage && (
            <button type="button" className="msg-close-btn" onClick={onClearMessage} aria-label="Dismiss">✕</button>
          )}
        </div>
      )}

      {/* Delete confirmation panel */}
      {confirmDeleteModule && (
        <div className="module-delete-confirm">
          <div className="module-delete-confirm-icon">🗑️</div>
          <div className="module-delete-confirm-body">
            <p className="module-delete-confirm-title">Delete <strong>&quot;{confirmDeleteModule}&quot;</strong>?</p>
            <p className="module-delete-confirm-sub">All lectures and quizzes in this module will be permanently removed.</p>
          </div>
          <div className="module-delete-confirm-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setConfirmDeleteModule(null)}
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger-btn"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Yes, Delete'}
            </button>
          </div>
        </div>
      )}

      {/* Existing Modules Grid */}
      {modules.length > 0 && !confirmDeleteModule && (
        <div className="modules-section">
          <h4 className="modules-section-title">Available Modules</h4>
          <div className="modules-grid">
            {modules.map((module) => (
              <div key={module} className="module-chip-wrap">
                <button
                  type="button"
                  className={`module-chip ${selectedModule === module ? 'module-chip-active' : ''}`}
                  onClick={() => onModuleSelect(module)}
                  disabled={isProcessing}
                >
                  <span className="module-chip-icon">📚</span>
                  <span className="module-chip-label">{module}</span>
                  {selectedModule === module && <span className="module-chip-checkmark">✓</span>}
                </button>
                <button
                  type="button"
                  className="module-chip-delete"
                  title={`Delete module "${module}"`}
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteModule(module); if (onClearMessage) onClearMessage(); }}
                  disabled={isProcessing}
                  aria-label={`Delete module ${module}`}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create New Module */}
      {!confirmDeleteModule && (
        !showCreateForm ? (
          <button
            type="button"
            className="create-module-btn"
            onClick={() => setShowCreateForm(true)}
            disabled={isProcessing}
          >
            <span className="create-icon">+</span>
            <span className="create-text">Create New Module</span>
          </button>
        ) : (
          <form className="create-module-form" onSubmit={handleCreateModule}>
            <div className="form-group">
              <label>Module Name</label>
              <input
                type="text"
                value={newModuleName}
                onChange={(e) => { setNewModuleName(e.target.value); setCreateError(null); }}
                placeholder="e.g., Chapter 1, Unit A, Topic 1"
                autoFocus
                disabled={isProcessing}
              />
            </div>
            {createError && <p className="form-error">{createError}</p>}
            <div className="form-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => { setShowCreateForm(false); setNewModuleName(''); setCreateError(null); }}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-btn"
                disabled={isProcessing || !newModuleName.trim()}
              >
                {isProcessing ? 'Creating…' : 'Create Module'}
              </button>
            </div>
          </form>
        )
      )}

      {/* Selection Indicator */}
      {selectedModule && !confirmDeleteModule && (
        <div className="module-selected-indicator">
          <span className="indicator-icon">✓</span>
          <span>Selected: <strong>{selectedModule}</strong></span>
        </div>
      )}
    </div>
  );
}
