import React, { useEffect, useRef } from 'react';
import '@mediapipe/face_mesh';
import '@mediapipe/camera_utils';
import '@mediapipe/drawing_utils';
import { FaceMesh } from '@mediapipe/face_mesh';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const App = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    const canvasCtx = canvasElement.getContext('2d');

    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results) => {
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

      if (results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, { color: '#00FF00', lineWidth: 0.5 });
        drawLandmarks(canvasCtx, [landmarks[468]], { color: 'blue', radius: 3 });
        drawLandmarks(canvasCtx, [landmarks[473]], { color: 'blue', radius: 3 });
      }

      canvasCtx.restore();
    });

    const startCamera = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoElement.srcObject = stream;
      videoElement.play();

      const camera = new window.Camera(videoElement, {
        onFrame: async () => {
          await faceMesh.send({ image: videoElement });
        },
        width: 640,
        height: 480,
      });
      camera.start();
    };

    startCamera();
  }, []);

  return (
    <div className="relative w-full h-screen bg-black">
      <video ref={videoRef} className="hidden" playsInline></video>
      <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" width={640} height={480}></canvas>
    </div>
  );
};

export default App;
