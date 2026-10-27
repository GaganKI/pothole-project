import React, { useState } from 'react';

/* Survey history shown as clickable cards.
   Clicking a card opens a dialog with full details.
   No external dependencies. */

const formatDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleString();
};

const formatDuration = (start, end) => {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  if (isNaN(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
};

function SurveyDialog({ survey, onClose }) {
  if (!survey) return null;
  const duration = formatDuration(survey.started, survey.ended);

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 0 0',
      }}
    >
      {/* Sheet */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 540,
          background: '#fff',
          borderRadius: '16px 16px 0 0',
          padding: '20px 20px 32px',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        {/* Handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(0,0,0,0.15)',
          margin: '0 auto 16px',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 18, fontWeight: 600,
              color: '#1C1C1E', margin: 0, lineHeight: 1.2,
            }}>
              {survey.name}
            </h2>
            <span style={{
              display: 'inline-block', marginTop: 5,
              fontSize: 11, fontWeight: 600, padding: '2px 8px',
              borderRadius: 4, textTransform: 'uppercase',
              background: survey.status === 'active' ? 'rgba(34,160,96,0.1)' : 'rgba(0,0,0,0.06)',
              color: survey.status === 'active' ? '#22A060' : '#888',
            }}>
              {survey.status}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(0,0,0,0.06)', border: 'none',
              width: 28, height: 28, borderRadius: '50%',
              cursor: 'pointer', fontSize: 16, color: '#666',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >×</button>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8, marginBottom: 20,
        }}>
          {[
            { v: survey.count || 0,        l: 'Potholes' },
            { v: duration || '—',          l: 'Duration' },
            { v: survey.status || '—',     l: 'Status'   },
          ].map(s => (
            <div key={s.l} style={{
              background: '#F8F6F1', borderRadius: 8,
              padding: '10px', textAlign: 'center',
            }}>
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 18, fontWeight: 600,
                color: '#D4960A', lineHeight: 1.1,
              }}>{s.v}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Details table */}
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            {[
              ['Started',  formatDate(survey.started)],
              survey.ended && ['Ended', formatDate(survey.ended)],
              survey.location && ['Location', `${survey.location.lat?.toFixed(4)}, ${survey.location.lng?.toFixed(4)}`],
            ].filter(Boolean).map(([k, v]) => (
              <tr key={k} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <td style={{ padding: '8px 0', color: '#888', width: '40%' }}>{k}</td>
                <td style={{ padding: '8px 0', color: '#1C1C1E', fontWeight: 500 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          onClick={onClose}
          style={{
            display: 'block', width: '100%', marginTop: 20,
            padding: '11px', borderRadius: 8,
            background: '#F8F6F1', border: 'none',
            fontSize: 14, fontWeight: 500, color: '#1C1C1E',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function SurveyHistoryDialog({ surveys }) {
  const [selected, setSelected] = useState(null);

  if (!surveys || surveys.length === 0) return null;

  return (
    <div className="card-padded" style={{ marginTop: 16 }}>
      <p style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 13, fontWeight: 600,
        color: '#1C1C1E', margin: '0 0 10px',
      }}>
        Survey history
      </p>

      {/* Cards grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {surveys.slice(0, 10).map((s, i) => (
          <button
            key={i}
            onClick={() => setSelected(s)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px',
              background: '#F8F6F1',
              border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: 8, cursor: 'pointer',
              textAlign: 'left', width: '100%',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F0EDE5'; e.currentTarget.style.borderColor = 'rgba(212,150,10,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F8F6F1'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)'; }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#1C1C1E' }}>{s.name}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {formatDate(s.started)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 18, fontWeight: 600, color: '#D4960A', lineHeight: 1,
                }}>
                  {s.count || 0}
                </div>
                <div style={{ fontSize: 10, color: '#aaa' }}>potholes</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 6px',
                borderRadius: 4, textTransform: 'uppercase',
                background: s.status === 'active' ? 'rgba(34,160,96,0.1)' : 'rgba(0,0,0,0.05)',
                color: s.status === 'active' ? '#22A060' : '#aaa',
              }}>
                {s.status}
              </span>
              <span style={{ fontSize: 16, color: '#ccc' }}>›</span>
            </div>
          </button>
        ))}
      </div>

      {/* Dialog */}
      {selected && (
        <SurveyDialog survey={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}