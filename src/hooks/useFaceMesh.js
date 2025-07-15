// hooks/useFaceMesh.js
import { useEffect, useRef, useState, useCallback } from 'react';

export default function useFaceMesh(onResultsCallback) {
  const faceMeshRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    let isMounted = true;
    
    const loadDependencies = async () => {
      try {
        setLoadingProgress(10);
        
        // Load OpenCV if not already loaded
        if (!window.cv || !window.cv.Mat) {
          await loadOpenCV();
          if (!isMounted) return;
          setLoadingProgress(50);
        } else {
          setLoadingProgress(50);
        }

        // Load MediaPipe FaceMesh if not already loaded
        if (!window.FaceMesh) {
          await loadMediaPipe();
          if (!isMounted) return;
        }
        setLoadingProgress(80);

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

        // Wrap the callback to handle errors
        faceMesh.onResults((results) => {
          try {
            onResultsCallback(results);
          } catch (err) {
            console.error('Error in onResults callback:', err);
          }
        });

        if (!isMounted) return;

        faceMeshRef.current = faceMesh;
        setIsLoaded(true);
        setLoadingProgress(100);
        setError(null);

      } catch (err) {
        console.error('Failed to initialize FaceMesh:', err);
        if (isMounted) {
          setError(err);
          setIsLoaded(false);
        }
      }
    };

    loadDependencies();

    return () => {
      isMounted = false;
      if (faceMeshRef.current) {
        try {
          faceMeshRef.current.close();
        } catch (err) {
          console.warn('Error closing FaceMesh:', err);
        }
        faceMeshRef.current = null;
      }
      setIsLoaded(false);
    };
  }, [onResultsCallback]);

  // OpenCV loader with progress tracking
  const loadOpenCV = useCallback(() => {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.cv && window.cv.Mat) {
        resolve();
        return;
      }

      // Check if script already exists
      const existingScript = document.querySelector('script[src*="opencv.js"]');
      if (existingScript) {
        const checkCV = () => {
          if (window.cv && window.cv.Mat) {
            resolve();
          } else {
            setTimeout(checkCV, 100);
          }
        };
        checkCV();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
      script.async = true;
      
      script.onload = () => {
        const checkCV = () => {
          if (window.cv && window.cv.Mat) {
            resolve();
          } else {
            setTimeout(checkCV, 100);
          }
        };
        checkCV();
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load OpenCV.js'));
      };

      document.head.appendChild(script);
    });
  }, []);

  // MediaPipe loader
  const loadMediaPipe = useCallback(() => {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.FaceMesh) {
        resolve();
        return;
      }

      // Check if script already exists
      const existingScript = document.querySelector('script[src*="face_mesh.js"]');
      if (existingScript) {
        const checkFaceMesh = () => {
          if (window.FaceMesh) {
            resolve();
          } else {
            setTimeout(checkFaceMesh, 100);
          }
        };
        checkFaceMesh();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
      script.async = true;
      
      script.onload = () => {
        const checkFaceMesh = () => {
          if (window.FaceMesh) {
            resolve();
          } else {
            setTimeout(checkFaceMesh, 100);
          }
        };
        checkFaceMesh();
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load MediaPipe FaceMesh'));
      };

      document.head.appendChild(script);
    });
  }, []);

  return { 
    faceMeshRef, 
    isLoaded, 
    error, 
    loadingProgress 
  };
}