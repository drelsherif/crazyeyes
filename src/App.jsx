import React, { useEffect, useRef } from 'react';
import './App.css';

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Initialize camera once
  useEffect(() => {
    const setupCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (error) {
        console.error('Camera error:', error);
      }
    };

    setupCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Run OpenCV or draw loop
  useEffect(() => {
    const process = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (video && canvas && ctx && video.readyState === 4) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw current video frame onto canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // TODO: Add OpenCV pupil detection logic here
        // Example: analyzePupilRegion(canvas)
      }

      requestAnimationFrame(process);
    };

    requestAnimationFrame(process);
  }, []);

  return (
    <div className="app">
      <h1>Iris Pupil Tracker</h1>
      <div className="video-wrapper">
        <video ref={videoRef} className="video" playsInline muted></video>
        <canvas ref={canvasRef} className="canvas" />
      </div>
    </div>
  );
}

export default App;
