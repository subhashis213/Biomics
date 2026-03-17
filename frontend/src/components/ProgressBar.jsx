export default function ProgressBar({ percent, label }) {
  return (
    <div className="progress-box">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="progress-value">{label || `${percent}%`}</span>
    </div>
  );
}
