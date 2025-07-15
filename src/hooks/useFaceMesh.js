import { useEffect, useRef } from 'react';

export default function useFaceMesh(onResultsCallback) {
  const faceMeshRef = useRef(null);

  useEffect(() => {
    const loadDependencies = async () => {
      // Load OpenCV
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
        script.onload = () => {
          const check = () => (window.cv && window.cv.Mat) ? resolve() : setTimeout(check, 100);
          check();
        };
        script.onerror = reject;
        document.body.appendChild(script);
      });

      // Load MediaPipe FaceMesh
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });

      // Initialize FaceMesh
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

      faceMesh.onResults(onResultsCallback);
      faceMeshRef.current = faceMesh;
    };

    loadDependencies();
    return () => { faceMeshRef.current = null; };
  }, [onResultsCallback]);

  return faceMeshRef;
}