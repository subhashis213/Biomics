import { useState } from 'react';

export default function ModuleManager({ 
  course, 
  modules = [], 
  selectedModule, 
  onModuleSelect, 
  onModuleCreate,
  isProcessing = false 
}) {
  const [newModuleName, setNewModuleName] = useState('');
  // Auto-open the create form when the course has no modules yet
  const [showCreateForm, setShowCreateForm] = useState(modules.length === 0);
  const [createError, setCreateError] = useState(null);

  function handleCreateModule(e) {
    e.preventDefault();
    
    if (!newModuleName.trim()) {
      setCreateError('Module name cannot be empty');
      return;
    }

    if (modules.some(m => m.toLowerCase() === newModuleName.toLowerCase())) {
      setCreateError('Module already exists');
      return;
    }

    onModuleCreate(newModuleName.trim());
    setNewModuleName('');
    setShowCreateForm(false);
    setCreateError(null);
  }

  return (
    <div className="module-manager">
      <div className="module-manager-header">
        <h3>Select or Create Module</h3>
        <p className="subtitle">Organize your content by modules within {course}</p>
      </div>

      {/* Existing Modules Grid */}
      {modules.length > 0 && (
        <div className="modules-section">
          <h4 className="modules-section-title">Available Modules</h4>
          <div className="modules-grid">
            {modules.map((module) => (
              <button
                key={module}
                type="button"
                className={`module-chip ${selectedModule === module ? 'module-chip-active' : ''}`}
                onClick={() => onModuleSelect(module)}
                disabled={isProcessing}
              >
                <span className="module-chip-icon">📚</span>
                <span className="module-chip-label">{module}</span>
                {selectedModule === module && <span className="module-chip-checkmark">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create New Module Section */}
      {!showCreateForm ? (
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
              onChange={(e) => {
                setNewModuleName(e.target.value);
                setCreateError(null);
              }}
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
              onClick={() => {
                setShowCreateForm(false);
                setNewModuleName('');
                setCreateError(null);
              }}
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={isProcessing || !newModuleName.trim()}
            >
              {isProcessing ? 'Creating...' : 'Create Module'}
            </button>
          </div>
        </form>
      )}

      {/* Selection Indicator */}
      {selectedModule && (
        <div className="module-selected-indicator">
          <span className="indicator-icon">✓</span>
          <span>Selected: <strong>{selectedModule}</strong></span>
        </div>
      )}
    </div>
  );
}
