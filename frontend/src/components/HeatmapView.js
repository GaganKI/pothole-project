import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { getAllPotholes } from '../api/api';

// ─── Fix Leaflet default icons ─────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl:       require('leaflet/dist/images/marker-icon.png'),
  shadowUrl:     require('leaflet/dist/images/marker-shadow.png'),
});

// ─── Helpers ──────────────────────────────────────────────────────────────
const isValidCoord = (lat, lng) =>
  typeof lat === 'number' && typeof lng === 'number' &&
  lat >= -90 && lat <= 90 &&
  lng >= -180 && lng <= 180 &&
  !(lat === 0 && lng === 0);

const formatDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleString();
};

const SEV_COLORS = {
  SEVERE: '#CC0000', CRITICAL: '#CC0000',
  MODERATE: '#C06000', MINOR: '#008000',
};

const sevColor = (s) => SEV_COLORS[(s || '').toUpperCase()] || '#666';

const createMarkerIcon = (severity) => {
  const col = sevColor(severity);
  return L.divIcon({
    className: '',
    html: `<div style="
      width:12px;height:12px;border-radius:50%;
      background:${col};border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
};

// ─── Sub-components ────────────────────────────────────────────────────────
const MapViewUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom); }, [center, zoom, map]);
  return null;
};

const HeatLayer = ({ potholes }) => {
  const map    = useMap();
  const layRef = useRef(null);

  useEffect(() => {
    if (typeof L.heatLayer !== 'function') return;

    const pts = potholes
      .filter(p => isValidCoord(p.latitude, p.longitude))
      .map(p => [p.latitude, p.longitude, Math.max(0.3, p.confidence || 0.5)]);

    if (layRef.current) {
      layRef.current.setLatLngs(pts);
    } else {
      layRef.current = L.heatLayer(pts, {
        radius: 26, blur: 18, maxZoom: 17,
        gradient: { 0.2: '#22A060', 0.5: '#C06000', 0.85: '#CC0000' },
      }).addTo(map);
    }

    return () => {
      if (layRef.current) {
        map.removeLayer(layRef.current);
        layRef.current = null;
      }
    };
  }, [potholes, map]);

  return null;
};

// ─── Main ──────────────────────────────────────────────────────────────────
export default function HeatmapView({ newPothole }) {
  const [potholes,    setPotholes]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [center,      setCenter]      = useState([12.2958, 76.6394]);
  const [zoom,        setZoom]        = useState(13);
  const [showHeat,    setShowHeat]    = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [filterSev,   setFilterSev]   = useState('ALL');
  const [filterSurvey,setFilterSurvey]= useState('ALL');
  const [lastFetch,   setLastFetch]   = useState(null);

  const autoRef = useRef(null);
  const mountedRef = useRef(true);
  const failCount  = useRef(0);

  // Set to false on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────
  const fetchPotholes = useCallback(async () => {
    try {
      const data = await getAllPotholes();

      // Guard: don't update state if component unmounted
      if (!mountedRef.current) return;

      if (data?.success && Array.isArray(data.potholes)) {
        setPotholes(data.potholes);
        setLastFetch(new Date());
        setError(null);
        const first = data.potholes.find(p => isValidCoord(p.latitude, p.longitude));
        if (first) setCenter([first.latitude, first.longitude]);
      } else {
        if (mountedRef.current) {
          setError('API returned unexpected response.');
        }
      }
    } catch (e) {
      if (!mountedRef.current) return; // unmounted — don't update state
      const msg = e?.message || 'Network error';
      setError(`Could not load data: ${msg}`);
      throw e; // re-throw so polling can count failures
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []); // no deps — uses refs which are stable
  // eslint-disable-next-line react-hooks/exhaustive-deps

  useEffect(() => { fetchPotholes(); }, [fetchPotholes]);

  // Auto-refresh every 30s — with failure backoff
  useEffect(() => {
    // Clear any stale interval
    if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
    }

    failCount.current = 0;

    autoRef.current = setInterval(async () => {
      if (!mountedRef.current) {
        clearInterval(autoRef.current);
        autoRef.current = null;
        return;
      }

      try {
        await fetchPotholes();
        failCount.current = 0;
      } catch {
        failCount.current += 1;

        if (failCount.current >= 5) {
          clearInterval(autoRef.current);
          autoRef.current = null;

          if (mountedRef.current) {
            setError('Auto-refresh stopped after 5 failures. Click Refresh to retry.');
          }
        }
      }
    }, 30000);

    return () => {
      if (autoRef.current) {
        clearInterval(autoRef.current);
        autoRef.current = null;
      }
    };
  }, [fetchPotholes]);

  // New pothole from live detection
  useEffect(() => {
    if (!newPothole) return;

    if (isValidCoord(newPothole.latitude, newPothole.longitude)) {
      setPotholes(prev => {
        const exists = prev.some(p => p.pothole_id === newPothole.pothole_id);
        return exists ? prev : [newPothole, ...prev];
      });

      setCenter([newPothole.latitude, newPothole.longitude]);
      setZoom(16);
    }
  }, [newPothole]);

  // ── Derived ────────────────────────────────────────────────────────────
  const surveys = useMemo(
    () => ['ALL', ...new Set(potholes.map(p => p.survey_name).filter(Boolean))],
    [potholes]
  );

  const filtered = useMemo(() =>
    potholes.filter(p => {
      const sm = filterSev === 'ALL' ||
        (p.severity || '').toUpperCase() === filterSev;

      const sv = filterSurvey === 'ALL' ||
        p.survey_name === filterSurvey;

      return sm && sv;
    }),
    [potholes, filterSev, filterSurvey]
  );

  const validFiltered = useMemo(
    () => filtered.filter(p => isValidCoord(p.latitude, p.longitude)),
    [filtered]
  );

  const stats = useMemo(() => {
    const t = potholes.length;

    const countSev = (s) =>
      potholes.filter(p => (p.severity || '').toUpperCase() === s).length;

    return {
      total:    t,
      severe:   potholes.filter(p =>
        ['SEVERE', 'CRITICAL'].includes(
          (p.severity || '').toUpperCase()
        )
      ).length,
      moderate: countSev('MODERATE'),
      minor:    countSev('MINOR'),
    };
  }, [potholes]);

  // ── Locate user ────────────────────────────────────────────────────────
  const locateUser = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        if (!mountedRef.current) return;

        setCenter([pos.coords.latitude, pos.coords.longitude]);
        setZoom(15);
      },
      () => {
        if (!mountedRef.current) return;

        setError('Could not get location.');
      }
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Title */}
      <div style={{ marginBottom: 14 }}>
        <h1 className="section-title">Road Map</h1>

        <p className="section-sub">
          {loading
            ? 'Loading…'
            : `${potholes.length} pothole${potholes.length !== 1 ? 's' : ''} recorded`}

          {lastFetch && (
            <span style={{ marginLeft: 8, color: '#bbb' }}>
              · {lastFetch.toLocaleTimeString()}
            </span>
          )}
        </p>
      </div>

      {/* Stats */}
      <div className="stats-row">
        {[
          { v: stats.total,    l: 'Total',    c: '#1C1C1E' },
          { v: stats.severe,   l: 'Severe',   c: '#CC0000' },
          { v: stats.moderate, l: 'Moderate', c: '#C06000' },
          { v: stats.minor,    l: 'Minor',    c: '#008000' },
        ].map((s, i) => (
          <div className="stat-box" key={i}>
            <div
              className="stat-box-value"
              style={{ color: s.c }}
            >
              {s.v}
            </div>

            <div className="stat-box-label">
              {s.l}
            </div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="error-banner">
          <span>⚠</span>

          <span>{error}</span>

          <button
            className="error-dismiss"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Filters and controls */}
      <div className="filter-row">
        <select
          className="input btn-sm"
          style={{ width: 'auto', padding: '6px 10px' }}
          value={filterSev}
          onChange={e => setFilterSev(e.target.value)}
        >
          <option value="ALL">All severities</option>
          <option value="SEVERE">Severe</option>
          <option value="MODERATE">Moderate</option>
          <option value="MINOR">Minor</option>
        </select>

        <select
          className="input btn-sm"
          style={{ width: 'auto', padding: '6px 10px' }}
          value={filterSurvey}
          onChange={e => setFilterSurvey(e.target.value)}
        >
          {surveys.map(s => (
            <option key={s} value={s}>
              {s === 'ALL' ? 'All surveys' : s}
            </option>
          ))}
        </select>

        <button
          className="btn btn-outline btn-sm"
          onClick={() => setShowHeat(h => !h)}
          style={{ opacity: showHeat ? 1 : 0.45 }}
        >
          Heatmap {showHeat ? 'on' : 'off'}
        </button>

        <button
          className="btn btn-outline btn-sm"
          onClick={() => setShowMarkers(m => !m)}
          style={{ opacity: showMarkers ? 1 : 0.45 }}
        >
          Markers {showMarkers ? 'on' : 'off'}
        </button>

        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: 6
          }}
        >
          <button
            className="btn btn-outline btn-sm"
            onClick={locateUser}
          >
            Locate me
          </button>

          <button
            className="btn btn-outline btn-sm"
            onClick={fetchPotholes}
            disabled={loading}
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="map-wrap">
        {loading ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#888',
              fontSize: 14,
            }}
          >
            Loading map…
          </div>
        ) : (
          <MapContainer
            center={center}
            zoom={zoom}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <MapViewUpdater
              center={center}
              zoom={zoom}
            />

            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {showHeat && (
              <HeatLayer potholes={validFiltered} />
            )}

            {showMarkers && validFiltered.map((p, i) => (
              <Marker
                key={p.pothole_id || i}
                position={[p.latitude, p.longitude]}
                icon={createMarkerIcon(p.severity)}
              >
                <Popup maxWidth={240}>
                  <div
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 13
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: 6,
                        color: sevColor(p.severity),
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        fontSize: 11,
                      }}
                    >
                      {p.severity || 'Unknown'} pothole
                    </div>

                    {[
                      [
                        'Confidence',
                        `${Math.round((p.confidence || 0) * 100)}%`
                      ],
                      p.depth != null &&
                        ['Depth', `${(p.depth * 100).toFixed(1)} cm`],
                      ['Survey', p.survey_name || '—'],
                      ['Status', p.status || 'detected'],
                      ['Detected', formatDate(p.detected_at)],
                      [
                        'Coords',
                        `${p.latitude?.toFixed(4)}, ${p.longitude?.toFixed(4)}`
                      ],
                    ]
                      .filter(Boolean)
                      .map(([k, v]) => (
                        <div
                          key={k}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '3px 0',
                            borderBottom:
                              '1px solid rgba(0,0,0,0.05)',
                            gap: 12,
                          }}
                        >
                          <span
                            style={{
                              color: '#888',
                              flexShrink: 0
                            }}
                          >
                            {k}
                          </span>

                          <span
                            style={{
                              fontWeight: 500,
                              textAlign: 'right',
                              wordBreak: 'break-all'
                            }}
                          >
                            {v}
                          </span>
                        </div>
                      ))}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Legend */}
      <div
        className="legend"
        style={{ marginTop: 10 }}
      >
        {[
          { col: '#CC0000', label: 'Severe' },
          { col: '#C06000', label: 'Moderate' },
          { col: '#008000', label: 'Minor' },
          { col: '#666',    label: 'Unknown' },
        ].map(l => (
          <div
            className="legend-item"
            key={l.label}
          >
            <div
              className="legend-dot"
              style={{ background: l.col }}
            />

            <span>{l.label}</span>
          </div>
        ))}

        <span
          style={{
            marginLeft: 'auto',
            color: '#aaa',
            fontSize: 11
          }}
        >
          Showing {validFiltered.length} of {potholes.length}
        </span>
      </div>
    </div>
  );
}