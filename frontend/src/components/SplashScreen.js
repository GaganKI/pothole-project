import React, { useEffect, useState } from 'react';

/* Splash screen shown for ~2s on first load.
   Uses the same SVG logo as the app icon.
   No dependencies — pure CSS animation. */

export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState('enter'); // enter → hold → exit

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'),  400);
    const t2 = setTimeout(() => setPhase('exit'),  2000);
    const t3 = setTimeout(() => onDone(),          2500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#D4960A',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20,
      opacity: phase === 'exit' ? 0 : 1,
      transition: phase === 'exit' ? 'opacity 0.45s ease-out' : 'none',
    }}>
      {/* Logo mark */}
      <div style={{
        transform: phase === 'enter' ? 'scale(0.7)' : 'scale(1)',
        opacity:   phase === 'enter' ? 0 : 1,
        transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
      }}>
        <svg width="96" height="96" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
          {/* White background circle for contrast on amber */}
          <rect width="512" height="512" rx="112" fill="rgba(0,0,0,0.12)"/>
          {/* Road */}
          <rect x="156" y="80" width="200" height="352" rx="12" fill="#2C2C2C"/>
          {/* Lane dashes */}
          <rect x="246" y="100" width="20" height="48" rx="4" fill="rgba(255,255,255,0.5)"/>
          <rect x="246" y="168" width="20" height="48" rx="4" fill="rgba(255,255,255,0.5)"/>
          {/* Pothole */}
          <ellipse cx="256" cy="300" rx="68" ry="52" fill="#1a1a1a"/>
          <ellipse cx="256" cy="302" rx="58" ry="44" fill="#111"/>
          <ellipse cx="254" cy="304" rx="44" ry="34" fill="#0a0a0a"/>
          <path d="M208 280 Q220 268 238 272 Q248 260 268 266 Q284 258 300 270 Q316 268 324 282"
            stroke="#555" stroke-width="4" fill="none" stroke-linecap="round"/>
          {/* Bbox corners — white on splash */}
          <path d="M178 252 L178 232 L198 232" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M314 232 L334 232 L334 252" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M178 348 L178 368 L198 368" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M314 368 L334 368 L334 348" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="246" y="380" width="20" height="32" rx="4" fill="rgba(255,255,255,0.5)"/>
        </svg>
      </div>

      {/* App name */}
      <div style={{
        textAlign: 'center',
        opacity:   phase === 'enter' ? 0 : 1,
        transform: phase === 'enter' ? 'translateY(8px)' : 'translateY(0)',
        transition: 'opacity 0.35s ease 0.15s, transform 0.35s ease 0.15s',
      }}>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 28, fontWeight: 700,
          color: '#fff',
          letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>
          SmartRoad
        </div>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 13, fontWeight: 400,
          color: 'rgba(255,255,255,0.7)',
          marginTop: 5,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Road Monitoring
        </div>
      </div>

      {/* Loading dots */}
      <div style={{
        display: 'flex', gap: 6,
        opacity: phase === 'hold' ? 1 : 0,
        transition: 'opacity 0.3s ease 0.3s',
        marginTop: 8,
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'rgba(255,255,255,0.6)',
            animation: `splashDot 1s ease-in-out ${i * 0.15}s infinite`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes splashDot {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50%       { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}