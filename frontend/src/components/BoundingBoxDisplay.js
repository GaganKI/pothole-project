import React, { useRef, useEffect } from 'react';

const SEV_COLORS = {
  SEVERE:   '#CC0000',
  CRITICAL: '#CC0000',
  MODERATE: '#C06000',
  MINOR:    '#008000',
  UNKNOWN:  '#666666',
};

export default function BoundingBoxDisplay({ imageSrc, detectionResults }) {
  const canvasRef = useRef(null);
  const imgRef    = useRef(null);

  useEffect(() => {
    if (!imageSrc || !canvasRef.current || !imgRef.current) return;

    const img    = imgRef.current;
    const canvas = canvasRef.current;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      canvas.width  = img.naturalWidth  || img.width  || 640;
      canvas.height = img.naturalHeight || img.height || 480;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const potholes = detectionResults?.potholes ?? [];
      if (!potholes.length) return;

      // Scale factors if image display size differs from natural size
      const scaleX = canvas.width  / (img.width  || canvas.width);
      const scaleY = canvas.height / (img.height || canvas.height);

      potholes.forEach((p, idx) => {
        // Backend sends bbox_xyxy: [x1, y1, x2, y2]
        const raw = p.bbox_xyxy;
        if (!Array.isArray(raw) || raw.length < 4) return;

        const x1 = raw[0] * scaleX;
        const y1 = raw[1] * scaleY;
        const x2 = raw[2] * scaleX;
        const y2 = raw[3] * scaleY;
        const w  = x2 - x1;
        const h  = y2 - y1;

        const sev  = (p.severity || 'UNKNOWN').toUpperCase();
        const col  = SEV_COLORS[sev] || SEV_COLORS.UNKNOWN;
        const conf = Math.round((p.confidence || 0) * 100);
        const cs   = Math.min(w, h, 20); // corner bracket size

        ctx.strokeStyle = col;
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = 'square';

        // Draw corner brackets (not a full rect — less obtrusive)
        const corners = [
          [[x1, y1 + cs], [x1, y1],     [x1 + cs, y1]],      // top-left
          [[x2 - cs, y1], [x2, y1],     [x2, y1 + cs]],      // top-right
          [[x1, y2 - cs], [x1, y2],     [x1 + cs, y2]],      // bottom-left
          [[x2 - cs, y2], [x2, y2],     [x2, y2 - cs]],      // bottom-right
        ];

        corners.forEach(pts => {
          ctx.beginPath();
          pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
          ctx.stroke();
        });

        // Label
        const label = `${idx + 1}  ${sev}  ${conf}%`;
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        const textW = ctx.measureText(label).width;
        const padX  = 6, padY = 4, labelH = 18;
        const ly    = y1 > labelH + 2 ? y1 - labelH - 2 : y2 + 2;

        // Label background
        ctx.fillStyle = col;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x1, ly, textW + padX * 2, labelH, 3);
        } else {
          ctx.rect(x1, ly, textW + padX * 2, labelH);
        }
        ctx.fill();

        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x1 + padX, ly + labelH - padY);

        // Depth if available
        if (p.depth_estimate_m != null) {
          const depthLabel = `${(p.depth_estimate_m * 100).toFixed(1)} cm`;
          const dw = ctx.measureText(depthLabel).width;
          const dy = ly > labelH + 2 ? ly - labelH - 2 : ly + labelH + 2;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x1, dy, dw + padX * 2, labelH, 3);
          } else {
            ctx.rect(x1, dy, dw + padX * 2, labelH);
          }
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(depthLabel, x1 + padX, dy + labelH - padY);
        }
      });
    };

    if (img.complete && img.naturalWidth > 0) {
      draw();
    } else {
      img.addEventListener('load', draw);
      return () => img.removeEventListener('load', draw);
    }
  }, [imageSrc, detectionResults]);

  if (!imageSrc) return null;

  return (
    <div style={{ position: 'relative', width: '100%', background: '#111', lineHeight: 0 }}>
      <img
        ref={imgRef}
        src={imageSrc}
        alt="Detection result"
        style={{ width: '100%', maxHeight: 480, objectFit: 'contain', display: 'block' }}
        onError={e => { e.target.style.opacity = '0.3'; }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}