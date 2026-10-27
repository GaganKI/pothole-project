import React, { useRef, useState, useEffect, useCallback } from 'react';
import { detectPotholes } from '../api/api';
import BoundingBoxDisplay from './BoundingBoxDisplay';
import SurveyHistoryDialog from './SurveyHistoryDialog';

// ─── Helpers ──────────────────────────────────────────────────────────────
const sanitiseName = (s) =>
  s.replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, '').trim().substring(0, 50);

// const formatDate = (d) => {
//   if (!d) return '—';
//   const dt = new Date(d);
//   return isNaN(dt.getTime()) ? '—' : dt.toLocaleString();
// };

const isValidCoord = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
  !(lat === 0 && lng === 0);

const sevClass = (s) => {
  const u = (s || '').toUpperCase();
  if (u === 'SEVERE' || u === 'CRITICAL') return 'sev sev-severe';
  if (u === 'MODERATE') return 'sev sev-moderate';
  if (u === 'MINOR')    return 'sev sev-minor';
  return 'sev sev-unknown';
};

const savePotholeToApi = async (formData) => {
  const { savePothole } = await import('../api/api');
  return savePothole(formData);
};

// ─── Main ─────────────────────────────────────────────────────────────────
export default function CameraCapture({ onPotholeDetected }) {
  // refs
  const videoRef          = useRef(null);
  const canvasRef         = useRef(null);   // hidden — capture / live processing
  const overlayCanvasRef  = useRef(null);   // live bbox overlay
  const isProcessing      = useRef(false);
  const recentlySaved     = useRef(new Set());
  const liveInterval      = useRef(null);
  const watchId           = useRef(null);

  // state
  const [streaming,       setStreaming]       = useState(false);
  const [capturedImage,   setCapturedImage]   = useState(null);
  const [detectionResult, setDetectionResult] = useState(null);
  const [detecting,       setDetecting]       = useState(false);
  const [liveDetections,  setLiveDetections]  = useState([]);
  const [liveActive,      setLiveActive]      = useState(false);
  const [location,        setLocation]        = useState(null);
  const [locError,        setLocError]        = useState(null);
  const [error,           setError]           = useState(null);
  const [mode,            setMode]            = useState(null); // 'capture' | 'live'
  const [surveyName,      setSurveyName]      = useState('');
  const [surveyActive,    setSurveyActive]    = useState(false);
  const [surveyPotholes,  setSurveyPotholes]  = useState([]);
  const [surveyHistory,   setSurveyHistory]   = useState([]);
  const [cameraError,     setCameraError]     = useState(null);

  // ── Load survey history ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      const h = localStorage.getItem('surveyHistory');
      if (h) setSurveyHistory(JSON.parse(h));
    } catch { /* ignore */ }
  }, []);

  // ── Location watch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported');
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocError(null);
      },
      (err) => {
        console.warn('GPS error:', err.message);
        setLocError('GPS unavailable');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera helpers ───────────────────────────────────────────────────────
  const stopLive = useCallback(() => {
    setLiveActive(false);
    setLiveDetections([]);
    if (liveInterval.current) {
      clearInterval(liveInterval.current);
      liveInterval.current = null;
    }
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setStreaming(false);
    stopLive();
  }, [stopLive]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (!streaming) stopLive();
  }, [streaming, stopLive]);

  // ── Start camera ─────────────────────────────────────────────────────────
  // Supports both desktop (user-facing or environment) and mobile (environment)
  const startCamera = useCallback(async () => {
    setError(null);
    setCameraError(null);

    // Try environment camera first (rear on mobile), fall back to any camera
    const constraints = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: true, audio: false },
    ];

    let stream = null;
    for (const c of constraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (e) {
        if (e.name === 'NotAllowedError') {
          setCameraError('Camera permission denied. Click "Allow" when prompted, or check your browser settings.');
          return;
        }
        // try next constraint
      }
    }

    if (!stream) {
      setCameraError('No camera found. Make sure a camera is connected and not in use by another application.');
      return;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current.play().catch(e => {
          console.warn('Video play error:', e);
          setCameraError(`Video playback error: ${e.message}`);
        });
        setStreaming(true);
      };
    }
  }, []);

  // ── Draw bounding boxes on overlay canvas ────────────────────────────────
  const drawLiveBboxes = useCallback((potholes) => {
    const canvas = overlayCanvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    canvas.width  = video.videoWidth  || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const COLS = {
      SEVERE: '#CC0000', CRITICAL: '#CC0000',
      MODERATE: '#C06000', MINOR: '#008000', UNKNOWN: '#666666',
    };

    potholes.forEach((p, idx) => {
      const raw = p.bbox_xyxy;
      if (!Array.isArray(raw) || raw.length < 4) return;
      const [x1, y1, x2, y2] = raw;
      const w = x2 - x1, h = y2 - y1;
      const sev = (p.severity || 'UNKNOWN').toUpperCase();
      const col = COLS[sev] || COLS.UNKNOWN;
      const cs  = Math.min(w, h, 16);

      // Corner brackets
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.lineCap = 'square';
      [
        [[x1,y1+cs],[x1,y1],[x1+cs,y1]],
        [[x2-cs,y1],[x2,y1],[x2,y1+cs]],
        [[x1,y2-cs],[x1,y2],[x1+cs,y2]],
        [[x2-cs,y2],[x2,y2],[x2,y2-cs]],
      ].forEach(pts => {
        ctx.beginPath();
        pts.forEach(([x,y], i) => i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y));
        ctx.stroke();
      });

      // Label
      const label = `${idx+1} ${sev} ${Math.round((p.confidence||0)*100)}%`;
      ctx.font = '11px Inter, sans-serif';
      const tw = ctx.measureText(label).width;
      const ly = y1 >= 18 ? y1 - 18 : y1 + 2;
      ctx.fillStyle = col;
      ctx.fillRect(x1, ly, tw + 8, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x1 + 4, ly + 12);
    });
  }, []);

  // ── Save pothole to DB ────────────────────────────────────────────────────
  const saveToDb = useCallback(async (potholeData, imageDataUrl = null) => {
    const coordKey = isValidCoord(location?.latitude, location?.longitude)
      ? `${location.latitude.toFixed(4)}_${location.longitude.toFixed(4)}`
      : null;

    if (coordKey && recentlySaved.current.has(coordKey)) {
      return null; // dedup
    }
    if (coordKey) {
      recentlySaved.current.add(coordKey);
      setTimeout(() => recentlySaved.current.delete(coordKey), 30000);
    }

    const enhanced = {
      ...potholeData,
      survey_name: surveyName,
      pothole_id:  `PH_${surveyName.replace(/\s+/g,'_')}_${Date.now()}_${Math.random().toString(36).substr(2,5)}`.toUpperCase(),
      detected_at: new Date().toISOString(),
      latitude:    location?.latitude  ?? null,
      longitude:   location?.longitude ?? null,
      area:        isValidCoord(location?.latitude, location?.longitude)
        ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
        : 'Unknown',
    };

    try {
      const fd = new FormData();
      fd.append('pothole_data', JSON.stringify(enhanced));
      if (imageDataUrl) {
        const blob = await (await fetch(imageDataUrl)).blob();
        fd.append('pothole_image', blob, `${enhanced.pothole_id}.jpg`);
      }
      const result = await savePotholeToApi(fd);
      const savedToDb = !!(result?.success);
      const final = { ...enhanced, savedToDb };

      setSurveyPotholes(prev => [...prev, final]);
      if (savedToDb) {
        setSurveyHistory(prev => {
          const updated = prev.map(s =>
            s.name === surveyName && s.status === 'active'
              ? { ...s, count: (s.count || 0) + 1 }
              : s
          );
          try { localStorage.setItem('surveyHistory', JSON.stringify(updated)); } catch {}
          return updated;
        });
      }
      if (onPotholeDetected) onPotholeDetected(final);
      return final;
    } catch (e) {
      console.error('Save error:', e);
      const final = { ...enhanced, savedToDb: false };
      setSurveyPotholes(prev => [...prev, final]);
      return final;
    }
  }, [surveyName, location, onPotholeDetected]);

  // ── Live detection ────────────────────────────────────────────────────────
  const performLiveDetection = useCallback(async () => {
    if (isProcessing.current) return;
    if (!videoRef.current || !canvasRef.current) return;
    if (!videoRef.current.videoWidth) return; // video not ready

    isProcessing.current = true;
    try {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      const imgUrl = canvas.toDataURL('image/jpeg', 0.7);
      const blob   = await (await fetch(imgUrl)).blob();
      const fd     = new FormData();
      fd.append('image', blob, 'live_frame.jpg');
      if (isValidCoord(location?.latitude, location?.longitude)) {
        fd.append('latitude',  location.latitude);
        fd.append('longitude', location.longitude);
      }
      fd.append('survey_name',    surveyName);
      fd.append('detection_type', 'live');

      const results = await detectPotholes(fd);

      if (results?.potholes?.length > 0) {
        // Draw immediately — don't wait for DB
        drawLiveBboxes(results.potholes);
        setLiveDetections(results.potholes);
        // Save to DB in background — non-blocking
        results.potholes.forEach(p => {
          saveToDb({ ...p, detection_type: 'live' }, imgUrl)
            .catch(e => console.warn('Background save failed:', e));
        });
      } else {
        setLiveDetections([]);
        if (overlayCanvasRef.current) {
          const ctx = overlayCanvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
        }
      }
    } catch (e) {
      console.error('Live detection error:', e);
    } finally {
      isProcessing.current = false;
    }
  }, [location, surveyName, drawLiveBboxes, saveToDb]);

  // ── Capture and detect ────────────────────────────────────────────────────
  const captureAndDetect = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setError(null);

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const imgUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(imgUrl);
    setDetecting(true);
    setDetectionResult(null);

    try {
      const blob = await (await fetch(imgUrl)).blob();
      const fd   = new FormData();
      fd.append('image', blob, 'capture.jpg');
      if (isValidCoord(location?.latitude, location?.longitude)) {
        fd.append('latitude',  location.latitude);
        fd.append('longitude', location.longitude);
      }
      if (surveyActive) fd.append('survey_name', surveyName);

      const results = await detectPotholes(fd);
      setDetectionResult(results);

      if (surveyActive && results?.potholes?.length > 0) {
        for (const p of results.potholes) {
          await saveToDb(p, imgUrl);
        }
      }
    } catch (e) {
      setError(`Detection failed: ${e.message}`);
    } finally {
      setDetecting(false);
    }
  }, [location, surveyActive, surveyName, saveToDb]);

  // ── Survey controls ───────────────────────────────────────────────────────
  const startSurvey = () => {
    const name = sanitiseName(surveyName);
    if (!name) { setError('Enter a survey name.'); return; }
    setSurveyName(name);
    setSurveyActive(true);
    setSurveyPotholes([]);
    setError(null);
    const entry = {
      name, status: 'active',
      started: new Date().toISOString(),
      count: 0,
    };
    setSurveyHistory(prev => {
      const u = [entry, ...prev].slice(0, 20);
      try { localStorage.setItem('surveyHistory', JSON.stringify(u)); } catch {}
      return u;
    });
  };

  const stopSurvey = () => {
    if (surveyPotholes.length > 0) {
      if (!window.confirm(`Stop survey "${surveyName}"? ${surveyPotholes.length} pothole(s) recorded.`)) return;
    }
    setSurveyActive(false);
    stopCamera();
    setMode(null);
    setSurveyHistory(prev => {
      const u = prev.map(s =>
        s.name === surveyName && s.status === 'active'
          ? { ...s, status: 'completed', ended: new Date().toISOString(), count: surveyPotholes.length }
          : s
      );
      try { localStorage.setItem('surveyHistory', JSON.stringify(u)); } catch {}
      return u;
    });
  };

  const selectMode = async (m) => {
    setMode(m);
    setError(null);
    setCapturedImage(null);
    setDetectionResult(null);
    setLiveDetections([]);
    await startCamera();
  };

  const startLive = () => {
    setLiveActive(true);
    liveInterval.current = setInterval(performLiveDetection, 1500);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* Page title */}
      <div style={{ marginBottom: 16 }}>
        <h1 className="section-title">Detection</h1>
        <p className="section-sub">
          {surveyActive
            ? `Survey: ${surveyName} · ${surveyPotholes.length} pothole${surveyPotholes.length !== 1 ? 's' : ''} recorded`
            : 'Start a survey session to record detections to the database.'}
        </p>
      </div>

      {/* Error */}
      {(error || cameraError) && (
        <div className="error-banner">
          <span>⚠</span>
          <span>{error || cameraError}</span>
          <button className="error-dismiss" onClick={() => { setError(null); setCameraError(null); }}>×</button>
        </div>
      )}

      {/* Status bar */}
      <div className="status-bar" style={{ marginBottom: 14 }}>
        <div className="status-item">
          <span className={`gps-dot ${location ? '' : locError ? 'off' : 'warn'}`} />
          <span>
            {location
              ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
              : locError || 'Acquiring GPS…'}
          </span>
        </div>
        {surveyActive && (
          <div className="status-item">
            <span className="gps-dot" style={{ background: '#D4960A' }} />
            <span>{surveyName}</span>
          </div>
        )}
        {streaming && (
          <div className="status-item" style={{ marginLeft: 'auto' }}>
            <span className="gps-dot" />
            <span>Camera active</span>
          </div>
        )}
      </div>

      {/* Survey setup */}
      {!surveyActive ? (
        <div className="card-padded" style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#1C1C1E' }}>
            Survey name
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="e.g. Main Road, Highway 275…"
              value={surveyName}
              onChange={e => setSurveyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startSurvey()}
              maxLength={50}
            />
            <button className="btn btn-primary" onClick={startSurvey}>
              Start
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>
            You can also use detection without a survey — potholes won't be saved.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'rgba(212,150,10,0.06)',
          border: '1px solid rgba(212,150,10,0.2)',
          borderRadius: 8, marginBottom: 12,
        }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1C1E' }}>{surveyName}</span>
            <span style={{ fontSize: 12, color: '#888', marginLeft: 10 }}>
              {surveyPotholes.length} detected
            </span>
          </div>
          <button className="btn btn-danger btn-sm" onClick={stopSurvey}>Stop</button>
        </div>
      )}

      {/* Mode selection */}
      {surveyActive && !mode && (
        <div className="mode-grid" style={{ marginBottom: 12 }}>
          <div className="mode-card" onClick={() => selectMode('capture')}>
            <div className="mode-card-title">📸 Capture</div>
            <div className="mode-card-desc">Take a photo and analyse it</div>
          </div>
          <div className="mode-card" onClick={() => selectMode('live')}>
            <div className="mode-card-title">🎥 Live</div>
            <div className="mode-card-desc">Continuous real-time scanning</div>
          </div>
        </div>
      )}

      {/* Quick detect without survey */}
      {!surveyActive && !mode && (
        <div style={{ marginBottom: 12 }}>
          <button
            className="btn btn-outline"
            onClick={() => selectMode('capture')}
            style={{ fontSize: 13 }}
          >
            Quick detect (no survey)
          </button>
        </div>
      )}

      {/* Camera area */}
      {mode && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="camera-wrap">
            {/* Hidden canvas for capture/processing */}
            <canvas ref={canvasRef} className="camera-hidden-canvas" />

            {/* Video */}
            <video
              ref={videoRef}
              className="camera-video"
              autoPlay
              playsInline
              muted
            />

            {/* Live overlay */}
            <canvas ref={overlayCanvasRef} className="camera-overlay-canvas" />

            {/* Placeholder when not streaming */}
            {!streaming && !cameraError && (
              <div className="camera-placeholder">
                <div className="camera-placeholder-icon">📷</div>
                <div className="camera-placeholder-text">Starting camera…</div>
              </div>
            )}

            {/* Camera error */}
            {cameraError && (
              <div className="camera-placeholder">
                <div className="camera-placeholder-icon">⚠️</div>
                <div className="camera-placeholder-text" style={{ textAlign: 'center', padding: '0 16px' }}>
                  {cameraError}
                </div>
              </div>
            )}

            {/* Detecting overlay */}
            {detecting && (
              <div className="detecting-overlay">
                <div className="detecting-box">
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E' }}>Analysing…</div>
                  <p>YOLOv8m running inference</p>
                </div>
              </div>
            )}

            {/* Scan line when live */}
            {liveActive && (
              <div className="scan-line-wrap">
                <div className="scan-line" />
              </div>
            )}

            {/* Live count */}
            {liveActive && liveDetections.length > 0 && (
              <div style={{ position: 'absolute', top: 10, right: 10 }}>
                <span className="sev sev-severe" style={{ fontSize: 12 }}>
                  {liveDetections.length} detected
                </span>
              </div>
            )}
          </div>

          {/* Camera controls */}
          <div className="controls-row">
            {mode === 'capture' && (
              <button
                className="btn btn-primary"
                onClick={captureAndDetect}
                disabled={!streaming || detecting}
              >
                {detecting ? 'Analysing…' : 'Capture & Detect'}
              </button>
            )}
            {mode === 'live' && !liveActive && (
              <button
                className="btn btn-primary"
                onClick={startLive}
                disabled={!streaming}
              >
                Start Scanning
              </button>
            )}
            {mode === 'live' && liveActive && (
              <button className="btn btn-danger" onClick={stopLive}>
                Stop Scanning
              </button>
            )}
            <button
              className="btn btn-outline btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => { stopCamera(); setMode(null); setCapturedImage(null); setDetectionResult(null); }}
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Detection result */}
      {capturedImage && mode === 'capture' && (
        <div className="card" style={{ marginBottom: 12 }}>
          <BoundingBoxDisplay imageSrc={capturedImage} detectionResults={detectionResult} />

          {detectionResult && (
            <div style={{ padding: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1C1E', marginBottom: 10 }}>
                {detectionResult.potholes?.length > 0
                  ? `${detectionResult.potholes.length} pothole${detectionResult.potholes.length !== 1 ? 's' : ''} detected`
                  : 'No potholes detected'}
              </p>

              {detectionResult.potholes?.map((p, i) => (
                <div className="detection-item" key={i}>
                  <div className="detection-num">{i + 1}</div>
                  <div className="detection-info">
                    <span className={sevClass(p.severity)}>{(p.severity || 'Unknown').toLowerCase()}</span>
                    <div className="detection-conf">
                      Confidence {Math.round((p.confidence || 0) * 100)}%
                      {p.depth_estimate_m != null && ` · Depth ${(p.depth_estimate_m * 100).toFixed(1)} cm`}
                      {p.savedToDb !== undefined && (
                        <span style={{ marginLeft: 6, color: p.savedToDb ? '#22A060' : '#CC0000' }}>
                          {p.savedToDb ? '· Saved' : '· Not saved'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <SurveyHistoryDialog surveys={surveyHistory} />
    </div>
  );
}