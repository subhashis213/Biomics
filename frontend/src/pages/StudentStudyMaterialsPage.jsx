import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import AppShell from '../components/AppShell';
import { useCourseData } from '../hooks/useCourseData';
import { downloadMaterial, fetchMaterialBlobUrl } from '../api';
import './StudentStudyMaterialsPage.css';

export default function StudentStudyMaterialsPage() {
  const navigate = useNavigate();
  const { videos, isLoading } = useCourseData();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [viewingPdfUrl, setViewingPdfUrl] = useState(null);
  const [isFetchingPdf, setIsFetchingPdf] = useState(false);

  const allMaterials = useMemo(() => {
    if (!videos) return [];
    const mats = [];
    videos.forEach(video => {
      if (video.materials && video.materials.length > 0) {
        video.materials.forEach(material => {
          mats.push({ 
            ...material, 
            _videoId: video._id, 
            videoTitle: video.title, 
            module: video.module,
            batch: video.batch || 'General'
          });
        });
      }
    });
    return mats;
  }, [videos]);

  const batches = useMemo(() => {
    return Array.from(new Set(allMaterials.map(m => m.batch)));
  }, [allMaterials]);

  const filteredMaterials = useMemo(() => {
    let result = allMaterials;
    if (selectedBatch) {
      result = result.filter(m => m.batch === selectedBatch);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => 
        (m.name || '').toLowerCase().includes(q) || 
        (m.filename || '').toLowerCase().includes(q) ||
        (m.videoTitle || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [allMaterials, selectedBatch, searchQuery]);

  const handleDownload = async (material) => {
    try {
      await downloadMaterial(material._videoId, material.filename || material.name);
    } catch (error) {
      console.error('Failed to download material', error);
      alert(`Download Error: ${error.message || 'Failed to download material. Please try again.'}`);
    }
  };

  const handleView = async (material) => {
    if (material.url) {
      window.open(material.url, '_blank');
      return;
    }
    
    setIsFetchingPdf(true);
    try {
      const url = await fetchMaterialBlobUrl(material._videoId, material.filename || material.name);
      setViewingPdfUrl(url);
    } catch (error) {
      console.error('Failed to load PDF for viewing', error);
      alert(`View Error: ${error.message || 'Failed to load PDF. Please try again.'}`);
    } finally {
      setIsFetchingPdf(false);
    }
  };

  const closePdfViewer = () => {
    if (viewingPdfUrl) {
      URL.revokeObjectURL(viewingPdfUrl);
      setViewingPdfUrl(null);
    }
  };

  return (
    <AppShell>
      <div className="student-dashboard">
        <header className="sd-header">
          <div className="sd-header-content">
            <button type="button" className="link-btn" onClick={() => navigate(-1)} style={{ marginBottom: '16px', display: 'inline-block' }}>
              &larr; Back
            </button>
            <h1>Study Materials</h1>
            <p>Access all your available study materials securely.</p>
          </div>
        </header>

        <main className="sd-main">
          <div className="sd-content" style={{ maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
            
            <div className="sm-controls">
              {selectedBatch ? (
                <button className="secondary-btn back-to-batches-btn" onClick={() => setSelectedBatch(null)}>
                  &larr; Back to Batches
                </button>
              ) : (
                <div style={{ flex: 1 }}></div> // placeholder for layout
              )}
              
              <div className="sm-search">
                <input 
                  type="text" 
                  placeholder="Search materials by name or lecture..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <section className="study-materials-grid">
              {isLoading ? (
                <p>Loading materials...</p>
              ) : allMaterials.length === 0 ? (
                <p className="empty-state">No study materials found for your account.</p>
              ) : !selectedBatch && !searchQuery.trim() ? (
                // Batch Folders View
                batches.map((batch, idx) => (
                  <div key={idx} className="study-material-card card batch-folder" onClick={() => setSelectedBatch(batch)}>
                    <div className="smc-icon">📁</div>
                    <div className="smc-info">
                      <h4>{batch}</h4>
                      <p className="smc-meta">{allMaterials.filter(m => m.batch === batch).length} files</p>
                    </div>
                    <div className="smc-actions">
                      <button className="primary-btn" style={{ width: '100%' }}>Open Folder</button>
                    </div>
                  </div>
                ))
              ) : filteredMaterials.length === 0 ? (
                <p className="empty-state">No materials match your search.</p>
              ) : (
                // Materials View
                filteredMaterials.map((mat, idx) => (
                  <div key={idx} className="study-material-card card">
                    <div className="smc-icon">📄</div>
                    <div className="smc-info">
                      <h4>{mat.name || mat.filename || 'Study Material'}</h4>
                      <p className="smc-meta">{mat.videoTitle} &bull; {mat.batch}</p>
                    </div>
                    <div className="smc-actions">
                      <button className="primary-btn" onClick={() => handleView(mat)} disabled={isFetchingPdf}>
                        {isFetchingPdf ? 'Loading...' : 'View'}
                      </button>
                      <button className="secondary-btn" onClick={() => handleDownload(mat)}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style={{ marginRight: '8px', verticalAlign: 'text-bottom' }}>
                          <path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
                        </svg>
                        Download
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </main>
        
        {viewingPdfUrl && createPortal(
          <div className="pdf-viewer-overlay" onClick={closePdfViewer}>
            <div className="pdf-viewer-modal" onClick={e => e.stopPropagation()}>
              <div className="pdf-viewer-header">
                <h3>Document Viewer</h3>
                <button className="close-btn" onClick={closePdfViewer}>&times;</button>
              </div>
              <iframe 
                src={viewingPdfUrl} 
                title="PDF Viewer" 
                className="pdf-iframe" 
                frameBorder="0"
              />
            </div>
          </div>,
          document.body
        )}
      </div>
    </AppShell>
  );
}
