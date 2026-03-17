import { MAX_MATERIAL_MB } from '../constants';
import ProgressBar from './ProgressBar';

export default function MaterialManager({ video, progress, message, selectedFile, onFileSelect, onUpload, onRemove, disableRemove = false }) {
  return (
    <section className="materials-panel">
      <div className="panel-heading-row">
        <h4>Study Materials</h4>
        <span className="optional-note">Optional PDF, max {MAX_MATERIAL_MB}MB</span>
      </div>
      <div className="materials-list">
        {video.materials?.length ? (
          video.materials.map((material) => (
            <div className="material-row" key={material.filename}>
              <span>{material.name}</span>
              <button type="button" className="danger-text-btn" onClick={() => onRemove(video._id, material.filename)} disabled={disableRemove}>
                Remove
              </button>
            </div>
          ))
        ) : (
          <p className="empty-note">No materials uploaded yet.</p>
        )}
      </div>
      <div className="material-upload-row">
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(event) => onFileSelect(video._id, event.target.files?.[0] || null)}
        />
        <button type="button" className="primary-btn" disabled={!selectedFile} onClick={() => onUpload(video._id)}>
          Upload PDF
        </button>
      </div>
      {selectedFile ? <p className="file-name">Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)}MB)</p> : <p className="file-name">Select a PDF to enable upload (max {MAX_MATERIAL_MB}MB).</p>}
      {typeof progress === 'number' ? <ProgressBar percent={progress} label={`Uploading ${progress}%`} /> : null}
      {message ? <p className={`inline-message ${message.type}`}>{message.text}</p> : null}
    </section>
  );
}
