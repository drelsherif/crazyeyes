import React, { useEffect, useRef } from "react";
import "./index.css";

const App = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const faceMesh = new window.FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results) => {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.multiFaceLandmarks) {
        for (const landmarks of results.multiFaceLandmarks) {
          window.drawConnectors(ctx, landmarks, window.FACEMESH_TESSELATION, {
            color: "#00FF00",
            lineWidth: 0.5,
          });

          window.drawLandmarks(ctx, landmarks, {
            color: "#FF0000",
            lineWidth: 1,
          });

          const measureDiameter = (lm, a, b) => {
            const dx = (lm[a].x - lm[b].x) * canvas.width;
            const dy = (lm[a].y - lm[b].y) * canvas.height;
            return Math.sqrt(dx * dx + dy * dy);
          };

          const leftDiameter = measureDiameter(landmarks, 469, 471);
          const rightDiameter = measureDiameter(landmarks, 474, 476);

          const leftCenter = landmarks[468];
          const rightCenter = landmarks[473];

          ctx.fillStyle = "#00BFFF";
          ctx.beginPath();
          ctx.arc(
            leftCenter.x * canvas.width,
            leftCenter.y * canvas.height,
            4,
            0,
            2 * Math.PI
          );
          ctx.fill();

          ctx.beginPath();
          ctx.arc(
            rightCenter.x * canvas.width,
            rightCenter.y * canvas.height,
            4,
            0,
            2 * Math.PI
          );
          ctx.fill();

          ctx.fillStyle = "#FFFFFF";
          ctx.font = "14px Arial";
          ctx.fillText(
            `Left: ${leftDiameter.toFixed(1)} px`,
            leftCenter.x * canvas.width + 10,
            leftCenter.y * canvas.height
          );
          ctx.fillText(
            `Right: ${rightDiameter.toFixed(1)} px`,
            rightCenter.x * canvas.width + 10,
            rightCenter.y * canvas.height
          );
        }
      }

      ctx.restore();
    });

    const camera = new window.Camera(video, {
      onFrame: async () => {
        await faceMesh.send({ image: video });
      },
      width: 640,
      height: 480,
    });
    camera.start();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black">
      <video
        ref={videoRef}
        className="absolute top-0 left-0 opacity-0"
        autoPlay
        playsInline
        width="640"
        height="480"
      ></video>
      <canvas
        ref={canvasRef}
        className="border border-white"
        width="640"
        height="480"
      ></canvas>
    </div>
  );
};

export default App;