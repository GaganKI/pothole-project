import React, { useState, useEffect } from 'react';
import CameraCapture from './components/CameraCapture';
import HeatmapView from './components/HeatmapView';
import SplashScreen from './components/SplashScreen';
import './index.css';

const TABS = [
  { id: 'detect', label: 'Detection' },
  { id: 'map',    label: 'Map'       },
  { id: 'home',   label: 'About'     },
];

function Header({ activeTab, setActiveTab }) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu when tab changes
  useEffect(() => { setMenuOpen(false); }, [activeTab]);

  return (
    <>
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 54,
        background: 'rgba(247,243,236,0.95)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(0,0,0,0.09)',
        display: 'flex', alignItems: 'center',
        padding: '0 16px',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto' }}>
          {/* Logo — road with pothole + bbox corners */}
          <svg width="30" height="30" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0, borderRadius: 7 }}>
            <rect width="512" height="512" rx="96" fill="#D4960A"/>
            <rect x="156" y="80" width="200" height="352" rx="12" fill="#2C2C2C"/>
            <rect x="246" y="100" width="20" height="44" rx="4" fill="rgba(255,255,255,0.45)"/>
            <rect x="246" y="164" width="20" height="44" rx="4" fill="rgba(255,255,255,0.45)"/>
            <ellipse cx="256" cy="300" rx="66" ry="50" fill="#1a1a1a"/>
            <ellipse cx="255" cy="303" rx="48" ry="36" fill="#0a0a0a"/>
            <path d="M178 252 L178 234 L196 234" stroke="white" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M316 234 L334 234 L334 252" stroke="white" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M178 348 L178 366 L196 366" stroke="white" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M316 366 L334 366 L334 348" stroke="white" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <rect x="246" y="378" width="20" height="32" rx="4" fill="rgba(255,255,255,0.45)"/>
          </svg>

          <div>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600, fontSize: 15,
              color: '#1A1714', lineHeight: 1.1,
              letterSpacing: '-0.01em',
            }}>SmartRoad</div>
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 400, fontSize: 11,
              color: '#A89F96', lineHeight: 1,
            }}>Road Monitoring</div>
          </div>
        </div>

        {/* Desktop nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}
          className="desktop-nav">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13, fontWeight: 500,
                color: activeTab === t.id ? '#D4960A' : '#6B6258',
                background: activeTab === t.id ? 'rgba(212,150,10,0.09)' : 'transparent',
                border: 'none', padding: '6px 13px',
                borderRadius: 6, cursor: 'pointer',
                transition: 'color 0.15s, background 0.15s',
              }}
            >{t.label}</button>
          ))}
        </nav>

        {/* Hamburger — mobile only */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className="hamburger-btn"
          style={{
            display: 'none', // shown via CSS
            background: 'transparent', border: 'none',
            padding: 8, cursor: 'pointer',
            flexDirection: 'column', gap: 4.5,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {[0,1,2].map(i => (
            <span key={i} style={{
              display: 'block', width: 20, height: 2,
              background: '#1A1714', borderRadius: 1,
              transition: 'transform 0.2s, opacity 0.15s',
              transform: menuOpen && i === 0 ? 'rotate(45deg) translate(3px, 3px)'
                       : menuOpen && i === 2 ? 'rotate(-45deg) translate(3px, -3px)'
                       : 'none',
              opacity: menuOpen && i === 1 ? 0 : 1,
            }} />
          ))}
        </button>
      </header>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="mobile-menu" style={{
          position: 'fixed', top: 54, left: 0, right: 0, zIndex: 99,
          background: 'rgba(247,243,236,0.98)',
          borderBottom: '1px solid rgba(0,0,0,0.09)',
          padding: '4px 16px 12px',
        }}>
          {TABS.map(t => (
            <button key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                fontFamily: "'Inter', sans-serif",
                fontSize: 15,
                fontWeight: activeTab === t.id ? 600 : 400,
                color: activeTab === t.id ? '#D4960A' : '#1A1714',
                background: 'transparent', border: 'none',
                padding: '11px 4px',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                cursor: 'pointer',
              }}
            >{t.label}</button>
          ))}
        </div>
      )}
    </>
  );
}

function AboutScreen() {
  return (
    <div className="page-content">
      <div className="page-inner" style={{ maxWidth: 600 }}>
        <h1 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 22, fontWeight: 600,
          color: '#1A1714', margin: '0 0 4px',
        }}>SmartRoad</h1>
        <p style={{ fontSize: 14, color: '#A89F96', margin: '0 0 20px' }}>
          Road pothole detection and mapping.
        </p>

        {[
          {
            title: 'About',
            rows: null,
            text: 'SmartRoad detects potholes in real time using a custom-trained YOLOv8m model, estimates depth and severity using MiDaS, and stores detections in a PostGIS geospatial database for road health monitoring.',
          },
          {
            title: 'Model',
            rows: [
              ['Architecture', 'YOLOv8m + FPN/PAN'],
              ['Training instances', '19,096'],
              ['Epochs', '200'],
              ['mAP@50', '0.462'],
              ['Recall', '0.66'],
              ['Depth model', 'MiDaS v2.1 small'],
            ],
          },
          {
            title: 'Stack',
            rows: [
              ['Frontend', 'React 18 + Leaflet (Vercel)'],
              ['Backend', 'Flask + Gunicorn (HF Spaces)'],
              ['ML', 'PyTorch + Ultralytics'],
              ['Database', 'PostgreSQL + PostGIS (Neon)'],
            ],
          },
        ].map(section => (
          <div key={section.title} className="card-padded" style={{ marginBottom: 10 }}>
            <p style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 13, fontWeight: 600,
              color: '#1A1714', margin: '0 0 10px',
            }}>{section.title}</p>
            {section.text && (
              <p style={{ fontSize: 14, lineHeight: 1.75, color: '#6B6258', margin: 0 }}>
                {section.text}
              </p>
            )}
            {section.rows && (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <tbody>
                  {section.rows.map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <td style={{ padding: '7px 0', color: '#A89F96', width: '50%' }}>{k}</td>
                      <td style={{ padding: '7px 0', color: '#1A1714', fontWeight: 500 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [splashDone,  setSplashDone]  = useState(false);
  const [activeTab,   setActiveTab]   = useState('detect');
  const [newPothole,  setNewPothole]  = useState(null);

  // Only show splash on true first load — not on hot reload in dev
  const [showSplash] = useState(() => {
    if (process.env.NODE_ENV === 'development') return false;
    return !sessionStorage.getItem('smartroad_launched');
  });

  const handleSplashDone = () => {
    sessionStorage.setItem('smartroad_launched', '1');
    setSplashDone(true);
  };

  if (showSplash && !splashDone) {
    return <SplashScreen onDone={handleSplashDone} />;
  }

  return (
    <>
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      {activeTab === 'detect' && (
        <div className="page-content">
          <div className="page-inner">
            <CameraCapture onPotholeDetected={p => setNewPothole(p)} />
          </div>
        </div>
      )}

      {activeTab === 'map' && (
        <div className="page-content">
          <div className="page-inner">
            <HeatmapView newPothole={newPothole} />
          </div>
        </div>
      )}

      {activeTab === 'home' && <AboutScreen />}
    </>
  );
}