import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStorageStatsAdmin } from '../api';
import AppShell from '../components/AppShell';
import StatCard from '../components/StatCard';
import useAutoDismissMessage from '../hooks/useAutoDismissMessage';

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const scaled = bytes / (1024 ** power);
  return `${scaled >= 100 || power === 0 ? Math.round(scaled) : scaled.toFixed(1)} ${units[power]}`;
}

function formatPercent(value) {
  const safe = Number(value || 0);
  if (!Number.isFinite(safe)) return '0%';
  return `${Math.round(safe * 10) / 10}%`;
}

function formatSnapshot(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getStorageGuidance(atlas, atlasMetricsAvailable) {
  if (!atlasMetricsAvailable) {
    if (atlas?.configured && atlas?.error) {
      return {
        level: 'watch',
        title: 'Atlas plan data unavailable',
        message: atlas.error
      };
    }

    return {
      level: 'watch',
      title: 'Plan data pending',
      message: 'Atlas plan capacity is not available yet. MongoDB footprint is still being tracked below.'
    };
  }

  return {
    level: atlas.healthLevel || 'safe',
    title: atlas.healthTitle || 'Storage health',
    message: atlas.healthMessage || 'Atlas storage health is available.'
  };
}

export default function AdminStorageMonitorPage() {
  const navigate = useNavigate();
  const [storageStats, setStorageStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshPulse, setRefreshPulse] = useState(false);
  const [banner, setBanner] = useState(null);

  useAutoDismissMessage(banner, setBanner);

  async function loadStorageStats({ silent = false } = {}) {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetchStorageStatsAdmin();
      setStorageStats(response || null);
    } catch (error) {
      setBanner({ type: 'error', text: error.message || 'Failed to load storage stats.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadStorageStats();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadStorageStats({ silent: true });
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  function triggerRefreshPulse() {
    setRefreshPulse(false);
    window.requestAnimationFrame(() => {
      setRefreshPulse(true);
      window.setTimeout(() => setRefreshPulse(false), 720);
    });
  }

  async function handleManualRefresh() {
    await loadStorageStats({ silent: true });
    triggerRefreshPulse();
  }

  const database = storageStats?.database || {};
  const atlas = storageStats?.atlas || {};
  const connection = storageStats?.connection || {};
  const topCollections = Array.isArray(storageStats?.topCollections) ? storageStats.topCollections : [];
  const allCollections = Array.isArray(storageStats?.collections) ? storageStats.collections : [];
  const atlasMetricsAvailable = Boolean(atlas.available) && Number(atlas.planCapacityBytes || 0) > 0;
  const diskMetricsAvailable = database.diskMetricsAvailable !== false && Number(database.fsTotalSizeBytes || 0) > 0;
  const storageGuidance = getStorageGuidance(atlas, atlasMetricsAvailable);

  const storageFootprint = useMemo(() => {
    const storageSize = Number(database.storageSizeBytes || 0);
    const dataSize = Number(database.dataSizeBytes || 0);
    const totalIndexSize = Number(database.totalIndexSizeBytes || 0);
    const fsTotal = Number(database.fsTotalSizeBytes || 0);
    const fsUsed = Number(database.fsUsedSizeBytes || 0);
    return {
      dataVsStoragePercent: storageSize > 0 ? (dataSize / storageSize) * 100 : 0,
      indexVsStoragePercent: storageSize > 0 ? (totalIndexSize / storageSize) * 100 : 0,
      diskUsagePercent: fsTotal > 0 ? (fsUsed / fsTotal) * 100 : 0
    };
  }, [database.dataSizeBytes, database.fsTotalSizeBytes, database.fsUsedSizeBytes, database.storageSizeBytes, database.totalIndexSizeBytes]);

  const heroConsumedValue = atlasMetricsAvailable ? atlas.consumedBytes : database.totalSizeBytes || database.storageSizeBytes;
  const heroLimitValue = atlasMetricsAvailable ? atlas.planCapacityBytes : database.storageSizeBytes;
  const heroRemainingValue = atlasMetricsAvailable ? atlas.remainingEstimateBytes : 0;

  return (
    <AppShell
      title="Storage Monitor"
      subtitle="Live MongoDB usage and collection footprint for admins"
      roleLabel="Admin"
      showThemeSwitch
      actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`secondary-btn workspace-refresh-btn${refreshing ? ' is-loading' : ''}${refreshPulse ? ' is-done' : ''}`}
            onClick={handleManualRefresh}
            disabled={refreshing}
          >
            <span className="workspace-refresh-btn-icon" aria-hidden="true">↻</span>
            {refreshing ? 'Refreshing...' : refreshPulse ? 'Updated' : 'Refresh'}
          </button>
          <button type="button" className="secondary-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
      )}
    >
      <main className="admin-workspace-page storage-monitor-page">
        <section className="workspace-hero workspace-hero-storage">
          <div>
            <p className="eyebrow">MongoDB Monitor</p>
            <h2>Track total storage, consumed storage and collection growth</h2>
            <p className="subtitle">This workspace refreshes automatically every 15 seconds so admins can see total plan capacity, consumed storage, remaining space and collection hotspots on both web and Android layouts.</p>
            <div className="storage-monitor-meta-row">
              <span className="storage-monitor-meta-pill">Status: {connection.status || 'unknown'}</span>
              <span className="storage-monitor-meta-pill">DB: {connection.databaseName || 'mongodb'}</span>
              {atlasMetricsAvailable ? <span className="storage-monitor-meta-pill">Total Plan: {formatBytes(atlas.planCapacityBytes)}</span> : null}
              <span className="storage-monitor-meta-pill">Updated: {formatSnapshot(storageStats?.snapshotAt)}</span>
            </div>
          </div>
          <div className="workspace-hero-stats storage-monitor-hero-stats">
            <StatCard label="Collections" value={database.collections || 0} />
            <StatCard label={atlasMetricsAvailable ? 'Consumed' : 'Documents'} value={atlasMetricsAvailable ? formatBytes(heroConsumedValue) : database.documents || 0} />
            <StatCard label={atlasMetricsAvailable ? 'Total Storage' : 'Storage'} value={formatBytes(heroLimitValue)} />
            <StatCard label={atlasMetricsAvailable ? 'Remaining' : 'Indexes'} value={atlasMetricsAvailable ? formatBytes(heroRemainingValue) : formatBytes(database.totalIndexSizeBytes)} />
          </div>
        </section>

        {banner ? <p className={`banner ${banner.type}`}>{banner.text}</p> : null}

        <section className={`card storage-monitor-guidance-card storage-monitor-guidance-${storageGuidance.level}`}>
          <div>
            <p className="eyebrow">Storage Guidance</p>
            <h3>{storageGuidance.title}</h3>
            <p className="subtitle">{storageGuidance.message}</p>
          </div>
          <div className="storage-monitor-guidance-pills">
            <span className="storage-monitor-guidance-pill">Consumed: {formatBytes(heroConsumedValue)}</span>
            <span className="storage-monitor-guidance-pill">Total: {formatBytes(heroLimitValue)}</span>
            {atlasMetricsAvailable ? <span className="storage-monitor-guidance-pill">Usage: {formatPercent(atlas.usagePercent)}</span> : null}
          </div>
        </section>

        <section className="storage-monitor-grid">
          <article className="card storage-monitor-spotlight">
            <div className="storage-monitor-spotlight-copy">
              <p className="eyebrow">Storage Overview</p>
              <h3>{formatBytes(heroLimitValue)}</h3>
              <p className="subtitle">{atlasMetricsAvailable ? 'Total Atlas storage offered for this cluster.' : 'Allocated MongoDB storage across collections.'}</p>
            </div>
            <div className="storage-monitor-rings" aria-hidden="true">
              <div className="storage-monitor-ring storage-monitor-ring-data">
                <span>{atlasMetricsAvailable ? formatPercent(atlas.usagePercent) : formatPercent(storageFootprint.dataVsStoragePercent)}</span>
                <small>{atlasMetricsAvailable ? 'Used' : 'Data'}</small>
              </div>
              <div className="storage-monitor-ring storage-monitor-ring-index">
                <span>{atlasMetricsAvailable ? formatBytes(atlas.remainingEstimateBytes) : formatPercent(storageFootprint.indexVsStoragePercent)}</span>
                <small>{atlasMetricsAvailable ? 'Left' : 'Indexes'}</small>
              </div>
            </div>
          </article>

          <article className="card storage-monitor-health-card">
            <p className="eyebrow">Connection</p>
            <div className="storage-monitor-health-list">
              <div><span>Mongo Status</span><strong>{connection.status || 'unknown'}</strong></div>
              <div><span>Host</span><strong>{connection.host || 'localhost'}{connection.port ? `:${connection.port}` : ''}</strong></div>
              <div><span>Avg Document</span><strong>{formatBytes(database.avgDocumentSizeBytes)}</strong></div>
              <div><span>Indexes</span><strong>{database.indexCount || 0}</strong></div>
            </div>
          </article>

          <article className="card storage-monitor-disk-card">
            <p className="eyebrow">{atlasMetricsAvailable ? 'Atlas Plan Usage' : 'Disk Consumption'}</p>
            {atlasMetricsAvailable ? (
              <div className="storage-monitor-progress-block">
                <div className="storage-monitor-progress-head">
                  <strong>{formatBytes(atlas.consumedBytes || atlas.usedEstimateBytes)}</strong>
                  <span>of {formatBytes(atlas.planCapacityBytes)} used</span>
                </div>
                <div className="storage-monitor-progress-track">
                  <div className="storage-monitor-progress-fill" style={{ width: `${Math.min(100, Number(atlas.usagePercent || 0))}%` }} />
                </div>
                <p className="subtitle">Remaining {formatBytes(atlas.remainingEstimateBytes)}. {atlas.note || 'Atlas quota pulled from Atlas Admin API.'}</p>
              </div>
            ) : diskMetricsAvailable ? (
              <div className="storage-monitor-progress-block">
                <div className="storage-monitor-progress-head">
                  <strong>{formatBytes(database.fsUsedSizeBytes)}</strong>
                  <span>of {formatBytes(database.fsTotalSizeBytes)} used</span>
                </div>
                <div className="storage-monitor-progress-track">
                  <div className="storage-monitor-progress-fill" style={{ width: `${Math.min(100, storageFootprint.diskUsagePercent)}%` }} />
                </div>
                <p className="subtitle">Filesystem usage reported by MongoDB.</p>
              </div>
            ) : (
              <div className="storage-monitor-unavailable-block">
                <strong>Disk metrics unavailable</strong>
                <p className="subtitle">{atlas.configured && atlas.error ? atlas.error : 'Your MongoDB host is not returning filesystem totals for this connection, so this panel cannot calculate disk consumption reliably.'}</p>
              </div>
            )}
          </article>
        </section>

        <section className="storage-monitor-stats-grid">
          <StatCard label={atlasMetricsAvailable ? 'Atlas Remaining' : 'Data Size'} value={formatBytes(atlasMetricsAvailable ? atlas.remainingEstimateBytes : database.dataSizeBytes)} />
          <StatCard label={atlasMetricsAvailable ? 'Data Size' : 'Index Size'} value={formatBytes(atlasMetricsAvailable ? database.dataSizeBytes : database.totalIndexSizeBytes)} />
          <StatCard label={atlasMetricsAvailable ? 'Index Size' : 'File Size'} value={formatBytes(atlasMetricsAvailable ? database.totalIndexSizeBytes : database.fileSizeBytes)} />
          <StatCard label={atlasMetricsAvailable ? 'Usage' : 'Views'} value={atlasMetricsAvailable ? formatPercent(atlas.usagePercent) : database.views || 0} />
        </section>

        {atlas.configured ? (
          <section className="card storage-monitor-panel workspace-panel">
            <div className="section-header compact">
              <div>
                <p className="eyebrow">Atlas Capacity</p>
                <h3>{atlasMetricsAvailable ? 'Plan quota versus current database footprint' : 'Atlas plan data is configured'}</h3>
                <p className="subtitle">Cluster {atlas.clusterName || 'Atlas'} {atlas.clusterType ? `• ${atlas.clusterType}` : ''} {atlas.providerName ? `• ${atlas.providerName}` : ''}</p>
              </div>
              <StatCard label="Atlas State" value={atlas.stateName || 'unknown'} />
            </div>
            {atlasMetricsAvailable ? (
              <div className="storage-monitor-meta-row">
                <span className="storage-monitor-meta-pill">Total: {formatBytes(atlas.planCapacityBytes)}</span>
                <span className="storage-monitor-meta-pill">Consumed: {formatBytes(atlas.consumedBytes || atlas.usedEstimateBytes)}</span>
                <span className="storage-monitor-meta-pill">Remaining: {formatBytes(atlas.remainingEstimateBytes)}</span>
                <span className="storage-monitor-meta-pill">Usage: {formatPercent(atlas.usagePercent)}</span>
              </div>
            ) : (
              <p className="subtitle">{atlas.error || 'Atlas is configured, but the plan capacity is not available yet. Refresh after deployment completes.'}</p>
            )}
          </section>
        ) : null}

        <section className="card storage-monitor-panel workspace-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Top Collections</p>
              <h3>Largest collections by allocated storage</h3>
            </div>
            <StatCard label="Tracked" value={topCollections.length} />
          </div>

          {loading ? (
            <div className="ts-loading-state">
              <div className="ts-loading-spinner" />
              <p>Loading MongoDB storage overview...</p>
            </div>
          ) : !topCollections.length ? (
            <p className="empty-note">No collection stats are available right now.</p>
          ) : (
            <div className="storage-collection-grid">
              {topCollections.map((collection) => (
                <article key={collection.name} className="storage-collection-card">
                  <div className="storage-collection-head">
                    <div>
                      <p className="storage-collection-name">{collection.name}</p>
                      <span className="storage-collection-count">{collection.documentCount} docs</span>
                    </div>
                    <span className="storage-collection-size">{formatBytes(collection.storageSizeBytes)}</span>
                  </div>
                  <div className="storage-collection-track">
                    <div className="storage-collection-fill" style={{ width: `${Math.min(100, collection.usagePercent || 0)}%` }} />
                  </div>
                  <div className="storage-collection-meta">
                    <span>Data {formatBytes(collection.dataSizeBytes)}</span>
                    <span>Indexes {formatBytes(collection.totalIndexSizeBytes)}</span>
                    <span>Usage {formatPercent(collection.usagePercent)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card storage-monitor-panel workspace-panel">
          <div className="section-header compact">
            <div>
              <p className="eyebrow">Collection Table</p>
              <h3>Detailed MongoDB collection usage</h3>
            </div>
            <StatCard label="All Collections" value={allCollections.length} />
          </div>

          <div className="analytics-section-scroll">
            {!allCollections.length && !loading ? (
              <p className="empty-note">No detailed collection stats available.</p>
            ) : (
              <div className="analytics-table-wrap storage-monitor-table-wrap">
                <table className="analytics-table storage-monitor-table">
                  <thead>
                    <tr>
                      <th>Collection</th>
                      <th>Documents</th>
                      <th>Data Size</th>
                      <th>Storage Size</th>
                      <th>Index Size</th>
                      <th>Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allCollections.map((collection) => (
                      <tr key={collection.name}>
                        <td>
                          <strong>{collection.name}</strong>
                        </td>
                        <td>{collection.documentCount}</td>
                        <td>{formatBytes(collection.dataSizeBytes)}</td>
                        <td>{formatBytes(collection.storageSizeBytes)}</td>
                        <td>{formatBytes(collection.totalIndexSizeBytes)}</td>
                        <td>
                          <span className="storage-table-usage-pill">{formatPercent(collection.usagePercent)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}