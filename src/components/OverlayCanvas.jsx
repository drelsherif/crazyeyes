import React, { useRef, useEffect } from 'react';

function OverlayCanvas({ videoRef, landmarks }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !landmarks) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw iris landmarks
    ctx.fillStyle = 'cyan';
    const indices = [468, 469, 470, 471, 472, 473, 474, 475, 476, 477];
    indices.forEach((i) => {
      const pt = landmarks[i];
      if (pt) {
        ctx.beginPath();
        ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 2.5, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }, [landmarks, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

export default OverlayCanvas;