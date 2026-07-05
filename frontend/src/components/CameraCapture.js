import React, { useRef, useState, useEffect } from 'react';
import { detectPotholes } from '../api/api';
import BoundingBoxDisplay from './BoundingBoxDisplay';

const CameraCapture = ({ onPotholeDetected }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [detectionResults, setDetectionResults] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLiveDetecting, setIsLiveDetecting] = useState(false);
  const [liveDetections, setLiveDetections] = useState([]);
  const [error, setError] = useState(null);
  const [location, setLocation] = useState(null);
  const [detectionMode, setDetectionMode] = useState('capture');
  const [currentSurvey, setCurrentSurvey] = useState('');
  const [surveyStarted, setSurveyStarted] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [surveyHistory, setSurveyHistory] = useState([]);
  const [surveyPotholes, setSurveyPotholes] = useState([]);
  const liveDetectionInterval = useRef(null);

  useEffect(() => {
  // Get user's live location with high accuracy
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        console.error('Error getting location:', error);
        setError('Location access denied. Please enable location services.');
        // Don't set any default location - wait for user to enable GPS
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }

    // Load survey history from localStorage (only for UI history, not pothole data)
    const savedHistory = localStorage.getItem('surveyHistory');
    if (savedHistory) {
      try {
        setSurveyHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Error loading survey history:', e);
      }
    }
  }, []);

  const startSurvey = () => {
    if (!currentSurvey.trim()) {
      setError('Please enter a survey name');
      return;
    }

    if (!location) {
      setError('Please wait for location access or enable location services');
      return;
    }

    const surveyData = {
      id: `survey_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: currentSurvey.trim(),
      startTime: new Date().toISOString(),
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        area: `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
      },
      status: 'active',
      potholesDetected: 0
    };

    setSurveyStarted(true);
    setShowModeSelection(true);
    setSurveyPotholes([]);
    
    // Save survey metadata to localStorage (just for UI history)
    const updatedHistory = [surveyData, ...surveyHistory.slice(0, 19)];
    setSurveyHistory(updatedHistory);
    localStorage.setItem('surveyHistory', JSON.stringify(updatedHistory));

    setError(null);
  };

  const stopSurvey = async () => {
    // Stop all detection activities first
    stopLiveDetection();
    stopCamera();
    
    // Update survey in history as completed
    const updatedHistory = surveyHistory.map(survey => 
      survey.name === currentSurvey && survey.status === 'active'
        ? { 
            ...survey, 
            endTime: new Date().toISOString(), 
            status: 'completed',
            potholesDetected: surveyPotholes.length
          }
        : survey
    );
    setSurveyHistory(updatedHistory);
    localStorage.setItem('surveyHistory', JSON.stringify(updatedHistory));
    
    // Reset all states
    setSurveyStarted(false);
    setShowModeSelection(false);
    setCurrentSurvey('');
    setSurveyPotholes([]);
    setDetectionResults(null);
    setCapturedImage(null);
    setLiveDetections([]);
  };

  const selectDetectionMode = (mode) => {
    setDetectionMode(mode);
    setShowModeSelection(false);
    startCamera();
  };

  // Function to save image to backend and get file path
  const saveImageToBackend = async (imageDataUrl) => {
    try {
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      
      const formData = new FormData();
      formData.append('image', blob, `pothole_${Date.now()}.jpg`);
      formData.append('survey_name', currentSurvey);
      
      // Call backend endpoint to save image
      const saveResponse = await fetch('/api/save-image', {
        method: 'POST',
        body: formData
      });
      
      if (saveResponse.ok) {
        const result = await saveResponse.json();
        return result.imagePath; // Return the file path where image is saved
      } else {
        console.error('Failed to save image to backend');
        return null;
      }
    } catch (error) {
      console.error('Error saving image:', error);
      return null;
    }
  };

  // OLD CODE - REMOVE savePotholurvey function entirely

// NEW CODE - ADD THIS
const savePotholeToDatabase = async (potholeData, imageData = null) => {
  const enhancedPothole = {
    ...potholeData,
    survey_name: currentSurvey,
    pothole_id: `PH_${currentSurvey.replace(/\s+/g, '_')}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`.toUpperCase(),
    detected_at: new Date().toISOString(),
    area: location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Unknown',
    latitude: location?.latitude || 0,
    longitude: location?.longitude || 0
  };

  // Add to current survey potholes
  setSurveyPotholes(prev => [...prev, enhancedPothole]);

  // Send to backend database
  try {
    const formData = new FormData();
    formData.append('pothole_data', JSON.stringify(enhancedPothole));
    
    if (imageData) {
      // Convert base64 to blob for image upload
      const response = await fetch(imageData);
      const blob = await response.blob();
      formData.append('pothole_image', blob, `${enhancedPothole.pothole_id}.jpg`);
    }

    const response = await fetch('/api/save_pothole', {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      console.log('Pothole saved to database successfully');
    } else {
      console.error('Failed to save pothole to database');
    }
  } catch (error) {
    console.error('Error saving pothole:', error);
  }

  // Update survey history (keep minimal data in localStorage)
  const updatedHistory = surveyHistory.map(survey => 
    survey.name === currentSurvey && survey.status === 'active'
      ? { 
          ...survey, 
          potholesDetected: (survey.potholesDetected || 0) + 1
        }
      : survey
  );
  setSurveyHistory(updatedHistory);
  localStorage.setItem('surveyHistory', JSON.stringify(updatedHistory));

  return enhancedPothole;
};

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment'
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
        setError(null);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Camera access denied or not available');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(imageDataUrl);
    setDetectionResults(null);
  };

  const startLiveDetection = async () => {
    if (!videoRef.current || !isStreaming) {
      setError('Camera must be started first');
      return;
    }

    if (!location) {
      setError('Location is required for pothole mapping');
      return;
    }

    setIsLiveDetecting(true);
    setError(null);

    if (liveDetectionInterval.current) {
      clearInterval(liveDetectionInterval.current);
    }

    liveDetectionInterval.current = setInterval(async () => {
      if (videoRef.current && isStreaming) {
        await performLiveDetection();
      }
    }, 2000);
  };

  const stopLiveDetection = () => {
    setIsLiveDetecting(false);
    setLiveDetections([]);
    
    if (liveDetectionInterval.current) {
      clearInterval(liveDetectionInterval.current);
      liveDetectionInterval.current = null;
    }

    if (liveCanvasRef.current) {
      const ctx = liveCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, liveCanvasRef.current.width, liveCanvasRef.current.height);
    }
  };

  // Replace the entire performLiveDetection function with this:
const performLiveDetection = async () => {
  if (!videoRef.current || !liveCanvasRef.current) return;

  try {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.6);
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    
    const formData = new FormData();
    formData.append('image', blob, 'live_frame.jpg');
    
    if (location) {
      formData.append('latitude', location.latitude);
      formData.append('longitude', location.longitude);
    }

    formData.append('survey_name', currentSurvey);
    formData.append('detection_type', 'live');

    const results = await detectPotholes(formData);
    
    if (results.potholes && results.potholes.length > 0) {
      const enhancedPotholes = [];
      
      for (const pothole of results.potholes) {
        const enhancedPothole = await savePotholeToDatabase({
          ...pothole,
          detection_type: 'live'
        }, imageDataUrl); // Save image to database
        
        enhancedPotholes.push(enhancedPothole);
      }

      setLiveDetections(enhancedPotholes);
      drawLiveDetections(enhancedPotholes);
    } else {
      setLiveDetections([]);
      clearLiveDetections();
    }
  } catch (err) {
    console.error('Live detection error:', err);
  }
};

  const drawLiveDetections = (detections) => {
    if (!liveCanvasRef.current || !videoRef.current) return;

    const canvas = liveCanvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach((pothole, index) => {
      if (pothole.bbox) {
        const [x, y, width, height] = pothole.bbox;
        const confidence = pothole.confidence;
        
        const alpha = Math.max(0.6, confidence);
        ctx.strokeStyle = `rgba(255, 50, 50, ${alpha})`;
        ctx.fillStyle = `rgba(255, 50, 50, ${alpha * 0.2})`;
        ctx.lineWidth = 3;
        
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        
        const label = `${pothole.pothole_id}: ${(confidence * 100).toFixed(1)}%`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        const textMetrics = ctx.measureText(label);
        ctx.fillRect(x, y - 30, textMetrics.width + 16, 25);
        
        ctx.fillStyle = 'rgba(255, 50, 50, 1)';
        ctx.font = 'bold 10px Arial';
        ctx.fillText(label, x + 8, y - 10);

        if (confidence > 0.7) {
          ctx.strokeStyle = `rgba(255, 255, 0, ${0.8 * Math.sin(Date.now() / 200)})`;
          ctx.lineWidth = 5;
          ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
        }
      }
    });
  };

  const clearLiveDetections = () => {
    if (liveCanvasRef.current) {
      const ctx = liveCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, liveCanvasRef.current.width, liveCanvasRef.current.height);
    }
  };

  const detectPotholesInImage = async () => {
  if (!capturedImage) return;

  setIsDetecting(true);
  setError(null);

  try {
    const response = await fetch(capturedImage);
    const blob = await response.blob();
    
    const formData = new FormData();
    formData.append('image', blob, 'captured_image.jpg');
    
    if (location) {
      formData.append('latitude', location.latitude);
      formData.append('longitude', location.longitude);
    }

    formData.append('survey_name', currentSurvey);
    formData.append('detection_type', 'capture');

    const results = await detectPotholes(formData);

    if (results.potholes && results.potholes.length > 0) {
      const enhancedPotholes = [];
      
      for (const pothole of results.potholes) {
        const enhancedPothole = await savePotholeToDatabase({
          ...pothole,
          detection_type: 'capture'
        }, capturedImage); // Save image to database
        
        enhancedPotholes.push(enhancedPothole);
      }

      const enhancedResults = { ...results, potholes: enhancedPotholes };
      setDetectionResults(enhancedResults);
    } else {
      setDetectionResults(results);
    }
  } catch (err) {
    console.error('Detection error:', err);
    setError('Failed to detect potholes. Please try again.');
  } finally {
    setIsDetecting(false);
  }
};

  const retakePhoto = () => {
    setCapturedImage(null);
    setDetectionResults(null);
    setError(null);
  };

  const goBackToModeSelection = () => {
    stopCamera();
    stopLiveDetection();
    setShowModeSelection(true);
    setCapturedImage(null);
    setDetectionResults(null);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      stopLiveDetection();
    };
  }, []);

  useEffect(() => {
    if (!isStreaming) {
      stopLiveDetection();
    }
  }, [isStreaming]);

  if (!surveyStarted) {
    return (
      <div className="camera-capture">
        <div className="survey-section">
          <div className="survey-header">
            <h3>📋 Start New Survey</h3>
          </div>

          <div className="survey-input-section">
            <div className="survey-input-group">
              <input
                type="text"
                placeholder="Enter survey/area name (e.g., 'Main Street Survey', 'Downtown Area')"
                value={currentSurvey}
                onChange={(e) => setCurrentSurvey(e.target.value)}
                className="survey-input"
                maxLength={50}
              />
              <button 
                onClick={startSurvey} 
                className="btn btn-success btn-large"
                disabled={!currentSurvey.trim() || !location}
              >
                🚀 Start Survey
              </button>
            </div>

            {location ? (
              <div className="location-info success">
                <p>📍 Location Ready: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>
              </div>
            ) : (
              <div className="location-info loading">
                <p>📍 Getting your location... Please wait or enable location services.</p>
              </div>
            )}
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showModeSelection) {
    return (
      <div className="camera-capture">
        <div className="survey-section">
          <div className="survey-header">
            <h3>📋 Survey: {currentSurvey}</h3>
            <button onClick={stopSurvey} className="btn btn-danger btn-sm">
              🛑 Stop Survey
            </button>
          </div>

          <div className="mode-selection-section">
            <h4>Choose Detection Mode:</h4>
            <div className="mode-selection-grid">
              <div 
                className="mode-selection-card"
                onClick={() => selectDetectionMode('live')}
              >
                <div className="mode-icon">📹</div>
                <h5>Live Detection</h5>
                <button className="btn btn-primary">Start Live Detection</button>
              </div>

              <div 
                className="mode-selection-card"
                onClick={() => selectDetectionMode('capture')}
              >
                <div className="mode-icon">📸</div>
                <h5>Capture Mode</h5>
                <button className="btn btn-success">Start Capture Mode</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-capture">
      {/* Active Survey Header */}
      <div className="active-survey-header">
        <div className="survey-status">
          <h3>📋 {currentSurvey} - {detectionMode === 'live' ? '📹 Live Detection' : '📸 Capture Mode'}</h3>
          <div className="survey-stats-inline">
            <span>Potholes: {surveyPotholes.length}</span>
            <span>Location: {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Getting location...'}</span>
          </div>
        </div>
        <div className="survey-actions">
          <button onClick={goBackToModeSelection} className="btn btn-secondary btn-sm">
            ⬅️ Change Mode
          </button>
          <button onClick={stopSurvey} className="btn btn-danger btn-sm">
            🛑 Stop Survey
          </button>
        </div>
      </div>

      <div className="camera-container">
        {!capturedImage ? (
          <div className="video-container">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-video"
            />
            {detectionMode === 'live' && isStreaming && (
              <canvas
                ref={liveCanvasRef}
                className="live-detection-overlay"
              />
            )}
            <canvas
              ref={canvasRef}
              style={{ display: 'none' }}
            />
            
            {detectionMode === 'live' && isLiveDetecting && liveDetections.length > 0 && (
              <div className="live-detection-info">
                <div className="detection-badge">
                  🚨 {liveDetections.length} Pothole{liveDetections.length !== 1 ? 's' : ''} Detected
                </div>
                {liveDetections.slice(0, 2).map((pothole, index) => (
                  <div key={index} className="live-pothole-id">
                    ID: {pothole.pothole_id}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="captured-image-container">
            <BoundingBoxDisplay
              imageSrc={capturedImage}
              detectionResults={detectionResults}
            />
          </div>
        )}
      </div>

      <div className="camera-controls">
        {!isStreaming && !capturedImage && (
          <button 
            onClick={startCamera} 
            className="btn btn-primary btn-large"
            disabled={!location}
          >
            <span className="btn-icon">📹</span>
            {location ? 'Start Camera' : 'Waiting for Location...'}
          </button>
        )}

        {isStreaming && !capturedImage && detectionMode === 'capture' && (
          <div className="capture-controls">
            <button onClick={captureImage} className="btn btn-success btn-large">
              <span className="btn-icon">📸</span>
              Capture Photo
            </button>
            <button onClick={stopCamera} className="btn btn-secondary">
              <span className="btn-icon">⏹️</span>
              Stop Camera
            </button>
          </div>
        )}

        {isStreaming && !capturedImage && detectionMode === 'live' && (
          <div className="live-controls">
            {!isLiveDetecting ? (
              <button 
                onClick={startLiveDetection} 
                className="btn btn-warning btn-large"
                disabled={!location}
              >
                <span className="btn-icon">🔍</span>
                {location ? 'Start Live Detection' : 'Waiting for Location...'}
              </button>
            ) : (
              <button onClick={stopLiveDetection} className="btn btn-danger btn-large">
                <span className="btn-icon">⏹️</span>
                Stop Live Detection
              </button>
            )}
            <button onClick={stopCamera} className="btn btn-secondary">
              <span className="btn-icon">⏹️</span>
              Stop Camera
            </button>
          </div>
        )}

        {capturedImage && (
          <div className="image-controls">
            <button 
              onClick={detectPotholesInImage} 
              disabled={isDetecting || !location}
              className="btn btn-primary btn-large"
            >
              <span className="btn-icon">{isDetecting ? '⏳' : '🔍'}</span>
              {isDetecting ? 'Analyzing...' : location ? 'Detect Potholes' : 'Waiting for Location...'}
            </button>
            <button onClick={retakePhoto} className="btn btn-secondary">
              <span className="btn-icon">🔄</span>
              Retake Photo
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      {detectionResults && detectionMode === 'capture' && (
        <div className="detection-summary">
          <div className="summary-header">
            <h3>✅ Detection Complete - Saved to Database</h3>
            <div className="detection-count">
              {detectionResults.potholes ? detectionResults.potholes.length : 0} Potholes Found
            </div>
          </div>
          
          {detectionResults.potholes && detectionResults.potholes.map((pothole, index) => (
            <div key={index} className="pothole-info">
              <div className="pothole-header">
                <span className="pothole-id">🆔 {pothole.pothole_id}</span>
                <span className="confidence-badge">
                  {(pothole.confidence * 100).toFixed(1)}% Confidence
                </span>
              </div>
              <div className="pothole-details">
                <div className="detail-item">
                  <span className="detail-label">📍 Location:</span>
                  <span className="detail-value">{pothole.area}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">🕐 Detected:</span>
                  <span className="detail-value">{new Date(pothole.detected_at).toLocaleString()}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">📋 Survey:</span>
                  <span className="detail-value">{pothole.survey_name}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">💾 Status:</span>
                  <span className="detail-value success">Saved to Database</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detectionMode === 'live' && isLiveDetecting && (
        <div className="live-stats">
          <div className="live-stats-header">
            <h4>Live Detection Status</h4>
            <div className="live-indicator">
              <div className="pulse"></div>
              SCANNING & SAVING - {currentSurvey}
            </div>
          </div>
          <div className="live-stats-content">
            <div className="stat-item">
              <span className="stat-label">Current Frame:</span>
              <span className="stat-value">{liveDetections.length} detections</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Survey Potholes:</span>
              <span className="stat-value">{surveyPotholes.length}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Status:</span>
              <span className="stat-value success">Saving to Database</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraCapture;