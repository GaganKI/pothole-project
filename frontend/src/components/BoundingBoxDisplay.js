import React, { useRef, useEffect, useState } from 'react';

const BoundingBoxDisplay = ({ imageSrc, detectionResults }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    const drawBoundingBoxes = () => {
      const canvas = canvasRef.current;
      const image = imageRef.current;

      if (!canvas || !image) return;

      const ctx = canvas.getContext('2d');

      // Set canvas dimensions to match image
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw bounding boxes
      // Draw bounding boxes safely
        if (detectionResults?.potholes && Array.isArray(detectionResults.potholes)) {
            detectionResults.potholes.forEach((pothole, index) => {
          const { bbox, confidence } = pothole;
          const [x, y, width, height] = bbox;

          // Set box style based on confidence
          const alpha = Math.max(0.3, confidence);
          ctx.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
          ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.2})`;
          ctx.lineWidth = 3;

          // Draw bounding box
          ctx.fillRect(x, y, width, height);
          ctx.strokeRect(x, y, width, height);

          // Draw confidence label
          const label = `Pothole ${index + 1}: ${(confidence * 100).toFixed(1)}%`;
          ctx.font = '14px Arial';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          const textWidth = ctx.measureText(label).width;
          ctx.fillRect(x, y - 25, textWidth + 10, 20);

          ctx.fillStyle = 'black';
          ctx.fillText(label, x + 5, y - 8);
        });
      }
    };

    if (imageLoaded) {
      drawBoundingBoxes();
    }
  }, [imageLoaded, detectionResults]);

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const getCanvasStyle = () => {
    if (!imageRef.current) return {};

    const image = imageRef.current;
    return {
      width: '100%',
      height: 'auto',
      maxWidth: '640px',
      aspectRatio: `${image.naturalWidth} / ${image.naturalHeight}`
    };
  };

  return (
    <div className="bounding-box-display" style={{ position: 'relative' }}>
      <img
        ref={imageRef}
        src={imageSrc}
        alt="Captured"
        onLoad={handleImageLoad}
        style={{
          width: '100%',
          height: 'auto',
          maxWidth: '640px',
          display: 'block'
        }}
      />

      {imageLoaded && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            ...getCanvasStyle()
          }}
        />
      )}
    </div>
  );
};

export default BoundingBoxDisplay;