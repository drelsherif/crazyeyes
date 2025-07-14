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
  const [cameraPermission, setCameraPermission] = useState('prompt');
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [librariesLoaded, setLibrariesLoaded] = useState(false);
  
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

  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOSDevice(iOS);
    detectDeviceCapabilities();
    initializeLibraries();
    
    return () => {
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
      }
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      window.removeEventListener('devicemotion', handleMotionEvent);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleMotionEvent = (event) => {
    // Optional: Use motion data for stability analysis
    const accel = event.accelerationIncludingGravity || { x: 0, y: 0, z: 0 };
    const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
    
    // You could use this for head movement detection
    if (magnitude > 15) {
      console.log('High movement detected:', magnitude);
    }
  };

  const requestCameraPermission = async () => {
    try {
      setCameraPermission('requesting');
      setError(null);
      
      // Request motion sensor permissions first (iOS pattern from your app)
      if (isIOSDevice && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
          const motionPermission = await DeviceMotionEvent.requestPermission();
          if (motionPermission === 'granted') {
            window.addEventListener('devicemotion', handleMotionEvent, true);
          }
        } catch (motionErr) {
          console.log('Motion permission failed, continuing without motion data:', motionErr);
        }
      }
      
      // Add a small delay to ensure video element is rendered
      await new Promise(resolve => setTimeout(resolve, 200));
      
      await initializeCamera();
      
      // Start processing once camera is ready and libraries are loaded
      if (librariesLoaded && faceMeshRef.current) {
        startProcessingLoop();
      }
      
      setCameraPermission('granted');
      
    } catch (err) {
      console.error('Permission request failed:', err);
      setCameraPermission('denied');
      setError(err.message);
    }
  };

  const initializeCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported on this device/browser');
      }

      // Ensure video element exists
      if (!videoRef.current) {
        throw new Error('Video element not ready');
      }

      const constraints = {
        video: {
          width: { ideal: mobileConfig.videoWidth, max: 640 },
          height: { ideal: mobileConfig.videoHeight, max: 480 },
          frameRate: { ideal: 15, max: 30 },
          facingMode: 'user'
        },
        audio: false
      };
      
      console.log('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (!stream || !stream.getVideoTracks().length) {
        throw new Error('No video stream available');
      }
      
      console.log('Camera stream obtained, setting up video...');
      
      // Wait a bit for video element to be fully ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (!videoRef.current) {
        throw new Error('Video element became null after stream creation');
      }
      
      videoRef.current.srcObject = stream;
      
      return new Promise((resolve, reject) => {
        const video = videoRef.current;
        
        const onLoadedMetadata = () => {
          console.log('Video metadata loaded');
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          
          video.play().then(() => {
            console.log('Video playing successfully');
            resolve();
          }).catch(err => {
            console.error('Video play failed:', err);
            reject(new Error(`Video play failed: ${err.message}`));
          });
        };
        
        const onError = (err) => {
          console.error('Video error:', err);
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          reject(new Error('Video element error'));
        };
        
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('error', onError);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          video.removeEventListener('loadedmetadata', onLoadedMetadata);
          video.removeEventListener('error', onError);
          reject(new Error('Camera initialization timeout'));
        }, 10000);
      });
      
    } catch (err) {
      console.error('Camera error:', err);
      let errorMessage = 'Camera access failed. ';
      
      if (err.name === 'NotAllowedError') {
        errorMessage += 'Please allow camera permissions and refresh the page.';
      } else if (err.name === 'NotFoundError') {
        errorMessage += 'No camera found on this device.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage += 'Camera not supported by this browser.';
      } else {
        errorMessage += err.message || 'Unknown camera error.';
      }
      
      throw new Error(errorMessage);
    }
  };

  const loadOpenCV = async () => {
    try {
      console.log('Loading OpenCV...');
      
      if (window.cv && window.cv.Mat) {
        console.log('OpenCV already loaded');
        cvRef.current = window.cv;
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.5.0/opencv.js';
      document.head.appendChild(script);
      
      await new Promise((resolve, reject) => {
        script.onload = () => {
          console.log('OpenCV script loaded');
          resolve();
        };
        script.onerror = () => {
          console.error('OpenCV script failed to load');
          reject(new Error('OpenCV script failed to load'));
        };
        
        // Timeout after 20 seconds (OpenCV is large)
        setTimeout(() => {
          reject(new Error('OpenCV loading timeout'));
        }, 20000);
      });
      
      // Wait for OpenCV to be ready
      let attempts = 0;
      while ((!window.cv || !window.cv.Mat) && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
      }
      
      if (!window.cv || !window.cv.Mat) {
        throw new Error('OpenCV not available after loading');
      }
      
      cvRef.current = window.cv;
      console.log('OpenCV ready');
      
    } catch (err) {
      console.error('OpenCV loading error:', err);
      throw new Error(`OpenCV initialization failed: ${err.message}`);
    }
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
      console.log('Loading MediaPipe...');
      
      // Check if already loaded
      if (window.FaceMesh) {
        console.log('MediaPipe already loaded');
        return;
      }
      
      const faceMeshScript = document.createElement('script');
      faceMeshScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js';
      document.head.appendChild(faceMeshScript);
      
      await new Promise((resolve, reject) => {
        faceMeshScript.onload = () => {
          console.log('MediaPipe script loaded');
          resolve();
        };
        faceMeshScript.onerror = () => {
          console.error('MediaPipe script failed to load');
          reject(new Error('MediaPipe script failed to load'));
        };
        
        // Timeout after 15 seconds
        setTimeout(() => {
          reject(new Error('MediaPipe loading timeout'));
        }, 15000);
      });
      
      // Wait for FaceMesh to be available
      let attempts = 0;
      while (!window.FaceMesh && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!window.FaceMesh) {
        throw new Error('MediaPipe FaceMesh not available after loading');
      }
      
      console.log('MediaPipe FaceMesh available');
      
    } catch (err) {
      console.error('MediaPipe loading error:', err);
      throw new Error(`MediaPipe initialization failed: ${err.message}`);
    }
  };

  const initializeLibraries = async () => {
    try {
      console.log('Starting library initialization...');
      setIsLoading(true);
      setError(null);
      
      // Load libraries in parallel for better performance
      await Promise.all([
        loadMediaPipe(),
        loadOpenCV()
      ]);
      
      console.log('Libraries loaded, setting up MediaPipe...');
      
      // Now setup MediaPipe with the loaded library
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
      
      setLibrariesLoaded(true);
      setIsLoading(false);
      console.log('All libraries initialized successfully');
      
    } catch (err) {
      console.error('Error initializing libraries:', err);
      setError(`Failed to initialize: ${err.message}`);
      setIsLoading(false);
      setLibrariesLoaded(false);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-red-50 border border-red-200 rounded-lg m-4">
        <div className="text-center p-4">
          <div className="text-red-600 text-lg font-semibold mb-2">Error</div>
          <div className="text-red-500 text-sm mb-4">{error}</div>
          
          <div className="space-y-2">
            <button 
              onClick={resetAndRetry}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
          
          <div className="mt-4 text-xs text-gray-600">
            <p>Troubleshooting:</p>
            <p>• Make sure you're using Safari on iOS</p>
            <p>• Check Settings → Safari → Camera permissions</p>
            <p>• Try refreshing the page</p>
          </div>
        </div>
      </div>
    );
  }

  // Show loading screen while libraries load
  if (isLoading || !librariesLoaded) {
    return (
      <div className="flex items-center justify-center h-96 bg-blue-50 border border-blue-200 rounded-lg m-4">
        <div className="text-center p-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-blue-600 text-lg font-semibold">Loading...</div>
          <div className="text-blue-500 text-sm mt-2">
            {isLoading ? 'Initializing MediaPipe and OpenCV' : 'Setting up libraries...'}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            This may take 10-20 seconds on mobile
          </div>
        </div>
      </div>
    );
  }

  // Show camera permission prompt (iOS pattern from your app)
  if (cameraPermission === 'prompt') {
    return (
      <div className="max-w-md mx-auto p-4 bg-white rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-4 text-gray-800">
          Mobile Pupil Tracker
        </h1>
        
        <div className="text-center p-6 bg-blue-50 rounded-lg">
          <div className="text-6xl mb-4">👁️</div>
          <h2 className="text-xl font-semibold mb-4 text-gray-800">
            Camera Access Required
          </h2>
          <p className="text-gray-600 mb-6 text-sm">
            This app needs camera access to track your pupils. 
            Your camera data is processed locally and never sent to any server.
          </p>
          
          {isIOSDevice && (
            <div className="mb-4 p-4 bg-yellow-50 rounded-lg">
              <div className="text-sm text-yellow-800 font-medium mb-2">📱 iOS Device Detected</div>
              <div className="text-xs text-yellow-700">
                • Make sure you're using Safari browser<br/>
                • Tap "Allow" for both camera and motion permissions<br/>
                • Check Settings → Safari → Camera if needed
              </div>
            </div>
          )}
          
          <button
            onClick={requestCameraPermission}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Enable Camera & Motion Sensors
          </button>
        </div>
      </div>
    );
  }

  if (cameraPermission === 'requesting') {
    return (
      <div className="flex items-center justify-center h-96 bg-blue-50 border border-blue-200 rounded-lg m-4">
        <div className="text-center p-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-blue-600 text-lg font-semibold">Requesting Permissions...</div>
          <div className="text-blue-500 text-sm mt-2">Please allow camera and motion sensor access</div>
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
        <div>Device: {deviceInfo.isMobile ? 'Mobile' : 'Desktop'} {isIOSDevice ? '(iOS)' : ''}</div>
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