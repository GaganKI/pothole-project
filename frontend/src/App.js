import React, { useState } from 'react';
import CameraCapture from './components/CameraCapture';
import HeatmapView from './components/HeatmapView';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('camera');
  const [detectedPothole, setDetectedPothole] = useState(null);
  const [stats, setStats] = useState({
    totalDetected: 0,
    sessionDetected: 0
  });

  const handlePotholeDetected = (results) => {
    setDetectedPothole(results);
    setStats(prev => ({
      ...prev,
      sessionDetected: prev.sessionDetected + (results.potholes ? results.potholes.length : 0)
    }));
    
    // Auto-switch to heatmap to show the new detection
    setTimeout(() => {
      setActiveTab('heatmap');
    }, 2000);
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <h1>Smart Pothole Detection</h1>
        </div>
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-value">{stats.sessionDetected}</span>
            <span className="stat-label">Detected This Session</span>
          </div>
        </div>
      </header>

      <nav className="tab-navigation">
        <button 
          className={`tab-button ${activeTab === 'camera' ? 'active' : ''}`}
          onClick={() => setActiveTab('camera')}
        >
          📷 Camera Detection
        </button>
        <button 
          className={`tab-button ${activeTab === 'heatmap' ? 'active' : ''}`}
          onClick={() => setActiveTab('heatmap')}
        >
          🗺️ History
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'camera' && (
          <div className="tab-content">
            <div className="section-header">
            </div>
            <CameraCapture onPotholeDetected={handlePotholeDetected} />
          </div>
        )}

        {activeTab === 'heatmap' && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Pothole Density Heatmap</h2>
              <p>View all detected potholes on an interactive map with density visualization</p>
            </div>
            <HeatmapView newPothole={detectedPothole} />
          </div>
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-content">
          <p>&copy; 2025 Smart Pothole Detection System</p>
        </div>
      </footer>
    </div>
  );
}

export default App;