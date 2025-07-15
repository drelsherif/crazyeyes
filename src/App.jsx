import { useEffect, useRef } from "react";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let camera = null;

    const onResults = (results) => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      // Mirror image
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

          // Pupil landmarks (iris detection)
          // Left: 468–473, Right: 473–478
          const leftPupil = landmarks[468];
          const rightPupil = landmarks[473];

          ctx.fillStyle = "#00BFFF";
          if (leftPupil)
            ctx.beginPath(),
              ctx.arc(
                leftPupil.x * canvas.width,
                leftPupil.y * canvas.height,
                4,
                0,
                2 * Math.PI
              ),
              ctx.fill();
          if (rightPupil)
            ctx.beginPath(),
              ctx.arc(
                rightPupil.x * canvas.width,
                rightPupil.y * canvas.height,
                4,
                0,
                2 * Math.PI
              ),
              ctx.fill();
        }
      }

      ctx.restore();
    };

    const setupCameraAndMesh = async () => {
      const video = videoRef.current;

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
      faceMesh.onResults(onResults);

      camera = new window.Camera(video, {
        onFrame: async () => {
          await faceMesh.send({ image: video });
        },
        width: 640,
        height: 480,
      });
      camera.start();
    };

    setupCameraAndMesh();

    return () => {
      if (camera) camera.stop();
    };
  }, []);

  return (
    <div className="w-full h-screen bg-black flex items-center justify-center">
      <div className="relative w-[640px] h-[480px]">
        <video
          ref={videoRef}
          className="absolute w-full h-full object-cover"
          autoPlay
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          className="absolute w-full h-full"
          width={640}
          height={480}
        />
      </div>
    </div>
  );
}
