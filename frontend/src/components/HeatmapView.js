import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getAllPotholes } from '../api/api';

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom pothole icons based on severity
const getPotholeIcon = (severity) => {
  const colors = {
    minor: '#caec0aff',
    moderate: '#f59f0bff', 
    severe: '#ef4444',
    unknown: '#6b7280'
  };
  
  const color = colors[severity] || colors.unknown;
  
  return new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
      <svg width="25" height="25" viewBox="0 0 25 25" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12.5" cy="12.5" r="10" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="12.5" cy="12.5" r="6" fill="${color}"/>
        <text x="12.5" y="17" text-anchor="middle" fill="white" font-size="8" font-weight="bold">!</text>
      </svg>
    `),
    iconSize: [25, 25],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
};

// Heatmap layer component
const HeatmapLayer = ({ potholes }) => {
  const map = useMap();
  const heatmapRef = useRef(null);

  useEffect(() => {
    if (!potholes || potholes.length === 0) {
      if (heatmapRef.current) {
        map.removeLayer(heatmapRef.current);
        heatmapRef.current = null;
      }
      return;
    }

    // Remove existing heatmap
    if (heatmapRef.current) {
      map.removeLayer(heatmapRef.current);
    }

    // Check if L.heatLayer is available (from leaflet.heat plugin)
    if (typeof L.heatLayer === 'function') {
      // Create heat points with confidence as intensity
      const heatPoints = potholes.map(pothole => [
        pothole.latitude,
        pothole.longitude,
        Math.max(0.3, pothole.confidence || 0.5)
      ]);

      // Create heatmap layer
      heatmapRef.current = L.heatLayer(heatPoints, {
        radius: 25,
        blur: 20,
        maxZoom: 17,
        max: 1.0,
        gradient: {
          0.0: '#10b981',  // Green
          0.3: '#f59e0b',  // Amber  
          0.5: '#f97316',  // Orange
          0.7: '#ef4444',  // Red
          1.0: '#dc2626'   // Dark Red
        }
      });

      // Add to map
      heatmapRef.current.addTo(map);
    }

    return () => {
      if (heatmapRef.current) {
        map.removeLayer(heatmapRef.current);
      }
    };
  }, [map, potholes]);

  return null;
};

const HeatmapView = ({ newPothole }) => {
  const [potholes, setPotholes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [selectedSurvey, setSelectedSurvey] = useState('all');
  const [surveyList, setSurveyList] = useState([]);
  const [surveyHistory, setSurveyHistory] = useState([]);
  const [filteredPotholes, setFilteredPotholes] = useState([]);
  const [center, setCenter] = useState([20.5937, 78.9629]);
  const [userLocation, setUserLocation] = useState(null); // Fallback to India center// Center of India
  const [zoom, setZoom] = useState(5); // Zoom level for India view

  useEffect(() => {
    loadSurveyHistory();
    fetchPotholes();
  }, []);

  useEffect(() => {
  // Get user's actual location for map centering
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userCoords = [position.coords.latitude, position.coords.longitude];
        setUserLocation(userCoords);
        setCenter(userCoords);
        setZoom(12); // Zoom closer for user location
      },
      (error) => {
        console.error('Error getting user location for map:', error);
        // Keep India center as fallback
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 300000
      }
    );
  }
}, []);

  useEffect(() => {
    // Load potholes from localStorage for completed surveys
    loadPotholesFromStorage();
  }, [surveyHistory]);

  useEffect(() => {
    // Filter potholes based on selected survey
    if (selectedSurvey === 'all') {
      setFilteredPotholes(potholes);
    } else {
      setFilteredPotholes(potholes.filter(p => p.survey_name === selectedSurvey));
    }
  }, [potholes, selectedSurvey]);

  useEffect(() => {
    // Extract unique surveys from potholes
    const surveys = [...new Set(potholes.map(p => p.survey_name).filter(Boolean))];
    setSurveyList(surveys);
  }, [potholes]);

  const loadSurveyHistory = () => {
    const savedHistory = localStorage.getItem('surveyHistory');
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory);
        setSurveyHistory(history);
      } catch (e) {
        console.error('Error loading survey history:', e);
      }
    }
  };

  const loadPotholesFromStorage = () => {
    // Load potholes from completed surveys stored in localStorage
    const allStoredPotholes = [];
    
    surveyHistory.forEach(survey => {
      if (survey.status === 'completed' && survey.potholes) {
        allStoredPotholes.push(...survey.potholes);
      }
    });
    
    if (allStoredPotholes.length > 0) {
      setPotholes(prevPotholes => {
        // Merge with existing potholes, avoiding duplicates
        const existingIds = new Set(prevPotholes.map(p => p.pothole_id));
        const newPotholes = allStoredPotholes.filter(p => !existingIds.has(p.pothole_id));
        return [...prevPotholes, ...newPotholes];
      });
    }
  };

  const removeSurveyFromHistory = (surveyId) => {
    const updatedHistory = surveyHistory.filter(survey => survey.id !== surveyId);
    setSurveyHistory(updatedHistory);
    localStorage.setItem('surveyHistory', JSON.stringify(updatedHistory));
    
    // Remove potholes associated with this survey
    const removedSurvey = surveyHistory.find(s => s.id === surveyId);
    if (removedSurvey) {
      setPotholes(prevPotholes => 
        prevPotholes.filter(p => p.survey_name !== removedSurvey.name)
      );
      
      // If the removed survey was currently selected, reset to 'all'
      if (selectedSurvey === removedSurvey.name) {
        setSelectedSurvey('all');
      }
    }
  };

  const fetchPotholes = async () => {
    try {
      setLoading(true);
      const data = await getAllPotholes();
      setPotholes(prevPotholes => {
        // Merge database potholes with localStorage potholes
        const dbPotholes = data.potholes || [];
        const existingIds = new Set(prevPotholes.map(p => p.pothole_id || p.id));
        const newDbPotholes = dbPotholes.filter(p => !existingIds.has(p.pothole_id || p.id));
        return [...prevPotholes, ...newDbPotholes];
      });
    } catch (err) {
      setError('Failed to load pothole data');
      console.error('Error fetching potholes:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getSeverityFromConfidence = (confidence, depth) => {
    if (depth && depth > 0.15) return 'severe';
    if (confidence > 0.8) return 'severe';
    if (confidence > 0.6 || (depth && depth > 0.08)) return 'moderate';
    return 'minor';
  };

  const getSurveyStats = () => {
    const stats = {};
    potholes.forEach(pothole => {
      const survey = pothole.survey_name || 'Unknown Survey';
      if (!stats[survey]) {
        stats[survey] = {
          total: 0,
          severe: 0,
          moderate: 0,
          minor: 0,
          latestDetection: null
        };
      }
      stats[survey].total++;
      const severity = getSeverityFromConfidence(pothole.confidence, pothole.depth);
      stats[survey][severity]++;
      
      if (!stats[survey].latestDetection || new Date(pothole.detected_at) > new Date(stats[survey].latestDetection)) {
        stats[survey].latestDetection = pothole.detected_at;
      }
    });
    return stats;
  };

  const focusOnUserLocation = () => {
  if (userLocation) {
    // Use already obtained user location
    setCenter(userLocation);
    setZoom(12);
  } else if (navigator.geolocation) {
    // Get fresh location
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = [position.coords.latitude, position.coords.longitude];
        setCenter(coords);
        setUserLocation(coords);
        setZoom(12);
      },
      (error) => {
        console.error('Error getting location:', error);
        alert('Unable to get your location. Please enable GPS.');
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 60000
      }
    );
  }
};

  const resetToIndiaView = () => {
    setCenter([20.5937, 78.9629]);
    setZoom(5);
  };

  if (loading) {
    return (
      <div className="heatmap-loading">
        <div className="loading-spinner"></div>
        <p>Loading pothole data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="heatmap-error">
        <p>{error}</p>
        <button onClick={fetchPotholes} className="btn btn-primary">
          Retry
        </button>
      </div>
    );
  }

  const surveyStats = getSurveyStats();

  return (
    <div className="heatmap-view">
      {/* Clean Map Controls */}
      <div className="map-controls-clean">
        <div className="controls-row">
          <div className="filter-control">
            <label>Filter by Survey:</label>
            <select 
              value={selectedSurvey}
              onChange={(e) => setSelectedSurvey(e.target.value)}
              className="survey-select-clean"
            >
              <option value="all">All Surveys ({potholes.length})</option>
              {surveyList.map(survey => (
                <option key={survey} value={survey}>
                  {survey} ({potholes.filter(p => p.survey_name === survey).length})
                </option>
              ))}
            </select>
          </div>

          <div className="display-controls">
            <label className="checkbox-control">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
              />
              <span>Heatmap</span>
            </label>
            
            <label className="checkbox-control">
              <input
                type="checkbox"
                checked={showMarkers}
                onChange={(e) => setShowMarkers(e.target.checked)}
              />
              <span>Markers</span>
            </label>
          </div>

          <div className="action-controls">
            <button onClick={focusOnUserLocation} className="btn-control">
              📍 My Location
            </button>
            <button onClick={resetToIndiaView} className="btn-control">
              🇮🇳 India View
            </button>
            <button onClick={() => { loadSurveyHistory(); fetchPotholes(); }} className="btn-control">
              🔄 Refresh
            </button>
          </div>
        </div>
        
        <div className="stats-row">
          <div className="current-display">
            Showing: <strong>{filteredPotholes.length}</strong> of <strong>{potholes.length}</strong> potholes
          </div>
        </div>
      </div>

      {/* Smaller India Map */}
      <div className="map-container-small">
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: '400px', width: '100%' }}
          scrollWheelZoom={true}
          key={`${center[0]}-${center[1]}-${zoom}`}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {showHeatmap && <HeatmapLayer potholes={filteredPotholes} />}
          
          {showMarkers && filteredPotholes.map((pothole) => {
            const severity = getSeverityFromConfidence(pothole.confidence, pothole.depth);
            return (
              <Marker
                key={pothole.pothole_id || pothole.id}
                position={[pothole.latitude, pothole.longitude]}
                icon={getPotholeIcon(severity)}
              >
                <Popup maxWidth={350}>
                  <div className="pothole-popup">
                    <div className="popup-header">
                      <h4>🕳️ Pothole Details</h4>
                      <span className={`severity-badge-popup severity-${severity}`}>
                        {severity.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="popup-content">
                      <div className="popup-section">
                        <h5>🆔 Identification</h5>
                        <p><strong>ID:</strong> {pothole.pothole_id || pothole.id}</p>
                        <p><strong>Survey:</strong> {pothole.survey_name || 'Unknown'}</p>
                        <p><strong>Detection Type:</strong> 
                          <span className={`detection-type ${pothole.detection_type}`}>
                            {pothole.detection_type === 'live' ? '📹 Live' : '📸 Capture'}
                          </span>
                        </p>
                      </div>

                      <div className="popup-section">
                        <h5>📊 Metrics</h5>
                        <p><strong>Confidence:</strong> 
                          <span className="confidence-score">
                            {(pothole.confidence * 100).toFixed(1)}%
                          </span>
                        </p>
                        {pothole.depth && (
                          <p><strong>Estimated Depth:</strong> {pothole.depth.toFixed(2)} units</p>
                        )}
                        <p><strong>Area:</strong> {pothole.area || 'Not specified'}</p>
                      </div>

                      <div className="popup-section">
                        <h5>📍 Location & Time</h5>
                        <p><strong>Coordinates:</strong> {pothole.latitude.toFixed(6)}, {pothole.longitude.toFixed(6)}</p>
                        <p><strong>Detected:</strong> {formatDate(pothole.detected_at)}</p>
                      </div>

                      {pothole.image_data && (
                        <div className="popup-section">
                          <h5>📷 Image</h5>
                          <div className="popup-image">
                            <img
                              src={pothole.image_data}
                              alt="Pothole"
                              style={{ maxWidth: '100%', maxHeight: '150px', borderRadius: '8px' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Survey History and Management Section */}
      <div className="survey-management-clean">
        <div className="management-header">
          <h3>📋 Survey History & Management</h3>
        </div>

        {/* Survey Statistics - Clean Layout */}
        {Object.keys(surveyStats).length > 0 && (
          <div className="survey-stats-clean">
            <h4>Survey Statistics</h4>
            <div className="stats-grid-clean">
              {Object.entries(surveyStats).map(([surveyName, stats]) => (
                <div 
                  key={surveyName} 
                  className={`stat-card-clean ${selectedSurvey === surveyName ? 'active' : ''}`}
                  onClick={() => setSelectedSurvey(surveyName)}
                >
                  <div className="stat-header">
                    <h5>{surveyName}</h5>
                    <span className="total-badge">{stats.total}</span>
                  </div>
                  <div className="stat-breakdown">
                    <span className="severity-stat severe">{stats.severe} Severe</span>
                    <span className="severity-stat moderate">{stats.moderate} Moderate</span>
                    <span className="severity-stat minor">{stats.minor} Minor</span>
                  </div>
                  <div className="stat-date">
                    {stats.latestDetection ? formatDate(stats.latestDetection) : 'No data'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Surveys - Compact Layout */}
        <div className="recent-surveys-clean">
          <h4>Recent Survey Sessions</h4>
          {surveyHistory.length === 0 ? (
            <div className="no-surveys-clean">
              <p>No surveys found. Start a new survey from the Camera Detection tab.</p>
            </div>
          ) : (
            <div className="surveys-grid-clean">
              {surveyHistory.map((survey) => (
                <div key={survey.id} className="survey-card-clean">
                  <div className="survey-card-header">
                    <div className="survey-info">
                      <h5>{survey.name}</h5>
                      <div className="survey-meta">
                        <span className={`status-tag status-${survey.status}`}>
                          {survey.status === 'completed' ? '✅' : '🔄'}
                        </span>
                        <span className="survey-time">
                          {formatDate(survey.startTime)}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => removeSurveyFromHistory(survey.id)}
                      className="btn-remove"
                      title="Remove survey"
                    >
                      🗑️
                    </button>
                  </div>
                  
                  <div className="survey-stats-compact">
                    <div className="stat-compact">
                      <span className="stat-num">{survey.potholesDetected || 0}</span>
                      <span className="stat-text">Potholes</span>
                    </div>
                    {survey.location && (
                      <div className="stat-compact">
                        <span className="stat-text">📍 {survey.location.area}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="survey-actions-compact">
                    <button 
                      onClick={() => setSelectedSurvey(survey.name)}
                      className={`btn-compact ${selectedSurvey === survey.name ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {selectedSurvey === survey.name ? 'Viewing' : 'View Map'}
                    </button>
                    
                    <button 
                      onClick={() => {
                        const surveyPotholes = potholes.filter(p => p.survey_name === survey.name);
                        if (surveyPotholes.length > 0) {
                          const data = surveyPotholes.map(p => ({
                            ID: p.pothole_id || p.id,
                            Survey: p.survey_name,
                            Latitude: p.latitude,
                            Longitude: p.longitude,
                            Confidence: (p.confidence * 100).toFixed(1) + '%',
                            Severity: getSeverityFromConfidence(p.confidence, p.depth),
                            DetectedAt: p.detected_at,
                            Area: p.area
                          }));
                          
                          const csv = [
                            Object.keys(data[0]).join(','),
                            ...data.map(row => Object.values(row).map(val => `"${val}"`).join(','))
                          ].join('\n');
                          
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${survey.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }
                      }}
                      className="btn-compact btn-export"
                      disabled={!potholes.some(p => p.survey_name === survey.name)}
                    >
                      📊 CSV
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clean Legend Section */}
        <div className="legend-clean">
          <div className="legend-sections">
            <div className="legend-section">
              <h4>🗺️ Heatmap Colors</h4>
              <div className="legend-items-clean">
                <div className="legend-item-clean">
                  <span className="legend-dot" style={{ background: '#10b981' }}></span>
                  <span>Low Density</span>
                </div>
                <div className="legend-item-clean">
                  <span className="legend-dot" style={{ background: '#f59e0b' }}></span>
                  <span>Medium Density</span>
                </div>
                <div className="legend-item-clean">
                  <span className="legend-dot" style={{ background: '#ef4444' }}></span>
                  <span>High Density</span>
                </div>
              </div>
            </div>

            <div className="legend-section">
              <h4>🔍 Severity Markers</h4>
              <div className="legend-items-clean">
                <div className="legend-item-clean">
                  <span className="legend-marker minor"></span>
                  <span>Minor</span>
                </div>
                <div className="legend-item-clean">
                  <span className="legend-marker moderate"></span>
                  <span>Moderate</span>
                </div>
                <div className="legend-item-clean">
                  <span className="legend-marker severe"></span>
                  <span>Severe</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeatmapView;