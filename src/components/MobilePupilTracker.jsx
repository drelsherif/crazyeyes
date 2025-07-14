import React, { useRef, useEffect, useState, useCallback } from 'react';

const MobilePupilTracker = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEye, setSelectedEye] = useState('left');
  const [pupilData, setPupilData] = useState(null);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fps, setFps] = useState(0);
  const [deviceInfo, setDeviceInfo] = useState({});
  
  // Refs for libraries and optimization
  const faceMeshRef = useRef(null);
  const cvRef = useRef(null);
  const processingTimeoutRef = useRef(null);
  const fpsCounterRef = useRef({ frames: 0, lastTime: Date.now() });
  
  // Mobile optimization settings
  const mobileConfig = {
    videoWidth: 320,
    videoHeight: 240,
    processingInterval: 100,
    maxFaces: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
    pupilMinArea: 50,
    blurKernelSize: 3
  };

  const detectDeviceCapabilities = () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    setDeviceInfo({
      isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      hasWebGL: !!gl,
      cores: navigator.hardwareConcurrency || 4,
      memory: navigator.deviceMemory || 'unknown',
      userAgent: navigator.userAgent
    });
  };

  const initializeCamera = async () => {
    try {
      const constraints = {
        video: {
          width: { ideal: mobileConfig.videoWidth },
          height: { ideal: mobileConfig.videoHeight },
          frameRate: { ideal: 15, max: 30 },
          facingMode: 'user'
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoRef.current.srcObject = stream;
      
      return new Promise((resolve) => {
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          resolve();
        };
      });
      
    } catch (err) {
      throw new Error('Camera access failed. Please allow camera permissions.');
    }
  };

  const loadOpenCV = async () => {
    return new Promise((resolve, reject) => {
      if (window.cv && window.cv.Mat) {
        cvRef.current = window.cv;
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.5.0/opencv.js';
      
      script.onload = () => {
        const checkOpenCV = () => {
          if (window.cv && window.cv.Mat) {
            cvRef.current = window.cv;
            resolve();
          } else {
            setTimeout(checkOpenCV, 100);
          }
        };
        checkOpenCV();
      };
      
      script.onerror = () => reject(new Error('OpenCV failed to load'));
      document.head.appendChild(script);
    });
  };

  const updateFPS = () => {
    const now = Date.now();
    const counter = fpsCounterRef.current;
    counter.frames++;
    
    if (now - counter.lastTime >= 1000) {
      setFps(counter.frames);
      counter.frames = 0;
      counter.lastTime = now;
    }
  };

  const getEyeRegion = (landmarks, eyeIndices, width, height) => {
    if (!landmarks || eyeIndices.length === 0) return null;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const sampledIndices = eyeIndices.filter((_, index) => index % 2 === 0);
    
    sampledIndices.forEach(index => {
      const landmark = landmarks[index];
      const x = landmark.x * width;
      const y = landmark.y * height;
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    
    const padding = 5;
    return {
      x: Math.max(0, minX - padding),
      y: Math.max(0, minY - padding),
      width: Math.min(width, maxX - minX + 2 * padding),
      height: Math.min(height, maxY - minY + 2 * padding)
    };
  };

  // Define analyzePupilMobile before it's used
  const analyzePupilMobile = useCallback((eyeRegion) => {
    if (!cvRef.current || !videoRef.current) return;
    
    try {
      const cv = cvRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      const imageData = ctx.getImageData(eyeRegion.x, eyeRegion.y, eyeRegion.width, eyeRegion.height);
      const src = cv.matFromImageData(imageData);
      
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      
      const blurred = new cv.Mat();
      const kSize = new cv.Size(mobileConfig.blurKernelSize, mobileConfig.blurKernelSize);
      cv.GaussianBlur(gray, blurred, kSize, 0);
      
      const thresh = new cv.Mat();
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
      
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      
      let bestContour = null;
      let bestArea = 0;
      
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);
        
        if (area > bestArea && area > mobileConfig.pupilMinArea) {
          bestContour = contour;
          bestArea = area;
        }
      }
      
      if (bestContour) {
        const moments = cv.moments(bestContour);
        if (moments.m00 > 0) {
          const centerX = moments.m10 / moments.m00;
          const centerY = moments.m01 / moments.m00;
          
          const pupilX = eyeRegion.x + centerX;
          const pupilY = eyeRegion.y + centerY;
          
          ctx.fillStyle = '#ff0000';
          ctx.beginPath();
          ctx.arc(pupilX, pupilY, 2, 0, 2 * Math.PI);
          ctx.fill();
          
          setPupilData({
            x: pupilX,
            y: pupilY,
            area: bestArea,
            eyeRegion: eyeRegion,
            timestamp: Date.now()
          });
        }
      }
      
      src.delete();
      gray.delete();
      blurred.delete();
      thresh.delete();
      contours.delete();
      hierarchy.delete();
      
    } catch (err) {
      console.error('Pupil analysis error:', err);
    }
  }, [mobileConfig.blurKernelSize, mobileConfig.pupilMinArea]);

  const onFaceMeshResults = useCallback((results) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      
      const eyeIndices = selectedEye === 'left' 
        ? [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
        : [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
      
      const eyeRegion = getEyeRegion(landmarks, eyeIndices, canvas.width, canvas.height);
      
      if (eyeRegion) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1;
        ctx.strokeRect(eyeRegion.x, eyeRegion.y, eyeRegion.width, eyeRegion.height);
        
        analyzePupilMobile(eyeRegion);
      }
    }
  }, [selectedEye, analyzePupilMobile]);

  const startProcessingLoop = () => {
    const processFrame = async () => {
      if (faceMeshRef.current && videoRef.current && !isProcessing) {
        try {
          setIsProcessing(true);
          await faceMeshRef.current.send({ image: videoRef.current });
          updateFPS();
        } catch (err) {
          console.error('Processing error:', err);
        } finally {
          setIsProcessing(false);
        }
      }
      
      processingTimeoutRef.current = setTimeout(processFrame, mobileConfig.processingInterval);
    };
    
    processFrame();
  };

  const loadMediaPipe = async () => {
    try {
      const faceMeshScript = document.createElement('script');
      faceMeshScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js';
      document.head.appendChild(faceMeshScript);
      
      await new Promise((resolve, reject) => {
        faceMeshScript.onload = resolve;
        faceMeshScript.onerror = reject;
      });
      
      const faceMesh = new window.FaceMesh({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
        }
      });
      
      faceMesh.setOptions({
        maxNumFaces: mobileConfig.maxFaces,
        refineLandmarks: false,
        minDetectionConfidence: mobileConfig.minDetectionConfidence,
        minTrackingConfidence: mobileConfig.minTrackingConfidence
      });
      
      faceMesh.onResults(onFaceMeshResults);
      faceMeshRef.current = faceMesh;
      
      startProcessingLoop();
      
    } catch (err) {
      throw new Error('MediaPipe initialization failed');
    }
  };

  const initializeLibraries = async () => {
    try {
      setIsLoading(true);
      
      await initializeCamera();
      await loadMediaPipe();
      await loadOpenCV();
      
      setIsLoading(false);
      
    } catch (err) {
      console.error('Error initializing libraries:', err);
      setError(`Failed to initialize: ${err.message}`);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    detectDeviceCapabilities();
    initializeLibraries();
    
    return () => {
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
      }
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-red-50 border border-red-200 rounded-lg m-4">
        <div className="text-center p-4">
          <div className="text-red-600 text-lg font-semibold mb-2">Error</div>
          <div className="text-red-500 text-sm">{error}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 bg-blue-50 border border-blue-200 rounded-lg m-4">
        <div className="text-center p-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-blue-600 text-lg font-semibold">Loading...</div>
          <div className="text-blue-500 text-sm mt-2">Optimizing for mobile device</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-4 bg-white rounded-lg shadow-lg">
      <h1 className="text-2xl font-bold text-center mb-4 text-gray-800">
        Mobile Pupil Tracker
      </h1>
      
      <div className="mb-4 text-xs text-gray-600 bg-gray-50 p-2 rounded">
        <div>Device: {deviceInfo.isMobile ? 'Mobile' : 'Desktop'}</div>
        <div>FPS: {fps} | Processing: {isProcessing ? 'Active' : 'Idle'}</div>
      </div>
      
      <div className="mb-4 flex justify-center space-x-2">
        <button
          onClick={() => setSelectedEye('left')}
          className={`px-3 py-1 text-sm rounded font-semibold transition-colors ${
            selectedEye === 'left' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          Left Eye
        </button>
        <button
          onClick={() => setSelectedEye('right')}
          className={`px-3 py-1 text-sm rounded font-semibold transition-colors ${
            selectedEye === 'right' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          Right Eye
        </button>
      </div>
      
      <div className="relative mb-4">
        <video
          ref={videoRef}
          className="hidden"
          width={mobileConfig.videoWidth}
          height={mobileConfig.videoHeight}
          autoPlay
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          width={mobileConfig.videoWidth}
          height={mobileConfig.videoHeight}
          className="w-full border border-gray-300 rounded-lg"
          style={{ maxHeight: '300px' }}
        />
      </div>
      
      {pupilData && (
        <div className="bg-gray-50 p-3 rounded-lg text-sm">
          <h3 className="font-semibold text-gray-800 mb-2">
            Pupil Data ({selectedEye} eye)
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="font-medium">Position:</span> 
              <div>({pupilData.x.toFixed(0)}, {pupilData.y.toFixed(0)})</div>
            </div>
            <div>
              <span className="font-medium">Area:</span> 
              <div>{pupilData.area.toFixed(0)} px²</div>
            </div>
          </div>
        </div>
      )}
      
      <div className="mt-4 text-xs text-gray-600 bg-blue-50 p-3 rounded-lg">
        <h4 className="font-semibold mb-1">Mobile Tips:</h4>
        <ul className="space-y-1">
          <li>• Hold device steady at arm's length</li>
          <li>• Ensure good lighting on your face</li>
          <li>• Close other apps for better performance</li>
          <li>• Green box = eye region, red dot = pupil</li>
        </ul>
      </div>
    </div>
  );
};

export default MobilePupilTracker;