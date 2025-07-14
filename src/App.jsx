import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, CameraOff, RotateCcw, AlertCircle, ZoomIn, ZoomOut } from 'lucide-react';

function App() {
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [isLoading, setIsLoading] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState('');
  const [zoom, setZoom] = useState(1);
  const [isMediaPipeLoaded, setIsMediaPipeLoaded] = useState(false);
  const [isMediaPipeInitialized, setIsMediaPipeInitialized] = useState(false);
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const faceDetectionRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Detect device type
  useEffect(() => {
    const getUserAgent = () => {
      const ua = navigator.userAgent;
      if (/iPad|iPhone|iPod/.test(ua)) {
        return 'iOS Device';
      } else if (/Android/.test(ua)) {
        return 'Android Device';
      } else {
        return 'Desktop/Other';
      }
    };
    setDeviceInfo(getUserAgent());

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Load MediaPipe
  useEffect(() => {
    const loadMediaPipe = async () => {
      try {
        console.log('Loading MediaPipe scripts...');
        
        // Load MediaPipe Face Mesh script
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
        script.crossOrigin = 'anonymous';
        
        script.onload = () => {
          console.log('MediaPipe script loaded successfully');
          setIsMediaPipeLoaded(true);
        };
        
        script.onerror = (error) => {
          console.error('Failed to load MediaPipe script:', error);
          setError('Failed to load MediaPipe libraries');
        };
        
        document.head.appendChild(script);
      } catch (err) {
        console.error('Error in loadMediaPipe:', err);
        setError('Failed to initialize MediaPipe');
      }
    };

    loadMediaPipe();
  }, []);

  // Initialize MediaPipe Face Mesh
  useEffect(() => {
    if (!isMediaPipeLoaded || !window.FaceMesh) {
      console.log('MediaPipe not ready yet:', { isMediaPipeLoaded, FaceMesh: !!window.FaceMesh });
      return;
    }

    const initializeMediaPipe = async () => {
      try {
        console.log('Initializing MediaPipe Face Mesh...');
        
        const faceMesh = new window.FaceMesh({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
          }
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        faceMesh.onResults(onFaceMeshResults);
        faceDetectionRef.current = faceMesh;
        
        console.log('MediaPipe Face Mesh initialized successfully');
        setIsMediaPipeInitialized(true);
      } catch (err) {
        console.error('Failed to initialize MediaPipe:', err);
        setError('Failed to initialize face detection');
      }
    };

    initializeMediaPipe();
  }, [isMediaPipeLoaded]);

  // MediaPipe results handler
  const onFaceMeshResults = useCallback((results) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;

    // Set canvas size to match video display size
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      drawIrisLandmarks(ctx, landmarks, canvas.width, canvas.height);
    }
  }, []);

  // Draw iris landmarks with better visibility
  const drawIrisLandmarks = (ctx, landmarks, width, height) => {
    // Left eye iris landmarks (indices 468-472)
    const leftIris = [468, 469, 470, 471, 472];
    // Right eye iris landmarks (indices 473-477)  
    const rightIris = [473, 474, 475, 476, 477];

    // Draw left iris
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
    
    ctx.beginPath();
    leftIris.forEach((index, i) => {
      const point = landmarks[index];
      const x = point.x * width;
      const y = point.y * height;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw right iris
    ctx.strokeStyle = '#ff0000';
    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
    
    ctx.beginPath();
    rightIris.forEach((index, i) => {
      const point = landmarks[index];
      const x = point.x * width;
      const y = point.y * height;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw center points
    ctx.fillStyle = '#00ff00';
    const leftCenter = landmarks[468];
    ctx.beginPath();
    ctx.arc(leftCenter.x * width, leftCenter.y * height, 4, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = '#ff0000';
    const rightCenter = landmarks[473];
    ctx.beginPath();
    ctx.arc(rightCenter.x * width, rightCenter.y * height, 4, 0, 2 * Math.PI);
    ctx.fill();
  };

  // Process video frame for MediaPipe
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !faceDetectionRef.current || !isMediaPipeInitialized || !isStreamActive) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState >= 2) {
      try {
        await faceDetectionRef.current.send({ image: video });
      } catch (err) {
        console.warn('MediaPipe processing error:', err);
      }
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [isMediaPipeInitialized, isStreamActive]);

  // Start MediaPipe processing
  useEffect(() => {
    if (isStreamActive && isMediaPipeInitialized) {
      console.log('Starting MediaPipe processing loop');
      processFrame();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isStreamActive, isMediaPipeInitialized, processFrame]);

  const startCamera = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      if (!videoRef.current) {
        throw new Error('Video element not found');
      }

      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: false
      };

      console.log('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      videoRef.current.autoplay = true;
      
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Video load timeout')), 10000);
        
        videoRef.current.onloadedmetadata = () => {
          clearTimeout(timeoutId);
          console.log('Video loaded successfully');
          resolve();
        };
        
        videoRef.current.onerror = (e) => {
          clearTimeout(timeoutId);
          reject(new Error('Video load error'));
        };
      });

      try {
        await videoRef.current.play();
      } catch (playError) {
        console.warn('Auto-play failed:', playError);
      }

      setIsStreamActive(true);
      console.log('Camera started successfully');
      
    } catch (err) {
      console.error('Camera error:', err);
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      let errorMessage = 'Failed to access camera. ';
      if (err.name === 'NotAllowedError') {
        errorMessage += 'Camera permission denied.';
      } else if (err.name === 'NotFoundError') {
        errorMessage += 'No camera found.';
      } else {
        errorMessage += err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreamActive(false);
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    if (isStreamActive) {
      startCamera();
    }
  };

  const handleVideoError = (e) => {
    console.error('Video error:', e);
    setError('Video playback error occurred.');
  };

  return (
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 p-3 flex items-center justify-between flex-shrink-0 safe-area-inset-top">
        <div className="flex items-center space-x-3">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <div>
            <h1 className="text-base font-bold">Iris Tracker</h1>
            <p className="text-xs text-gray-400">{deviceInfo}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={switchCamera}
            className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors active:scale-95"
            disabled={isLoading}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {/* Main Video Container */}
      <div className="flex-1 flex flex-col justify-center p-4 min-h-0">
        {/* Video Viewer */}
        <div className="relative w-full max-w-2xl mx-auto aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            webkit-playsinline="true"
            muted
            autoPlay
            onError={handleVideoError}
            style={{
              transform: `scaleX(${facingMode === 'user' ? -1 : 1}) scale(${zoom})`,
              transformOrigin: 'center center'
            }}
          />
          
          {/* Canvas overlay for MediaPipe landmarks */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{
              transform: `scaleX(${facingMode === 'user' ? -1 : 1}) scale(${zoom})`,
              transformOrigin: 'center center'
            }}
          />
          
          {/* Status Overlays */}
          <div className="absolute inset-0 pointer-events-none">
            {!isStreamActive && !isLoading && (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <Camera size={48} className="mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-400 mb-2 text-sm">Ready to track iris</p>
                  <p className="text-xs text-gray-500">Click start to begin</p>
                </div>
              </div>
            )}
            
            {isLoading && (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-400 text-sm">Starting camera...</p>
                </div>
              </div>
            )}
            
            {/* Status indicator when active */}
            {isStreamActive && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                <div className="text-white text-xs bg-black bg-opacity-60 px-3 py-1 rounded-full backdrop-blur-sm flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>
                    {isMediaPipeInitialized ? 'Iris Tracking Active' : 'Loading MediaPipe...'}
                  </span>
                </div>
              </div>
            )}
            
            {/* Zoom indicator */}
            {zoom !== 1 && (
              <div className="absolute top-4 right-4">
                <div className="text-white text-xs bg-black bg-opacity-60 px-2 py-1 rounded backdrop-blur-sm">
                  {zoom.toFixed(1)}x
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Zoom Slider */}
        {isStreamActive && (
          <div className="mt-4 flex items-center justify-center space-x-4">
            <ZoomOut size={16} className="text-gray-400" />
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-400 w-8">1x</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-32 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <span className="text-xs text-gray-400 w-8">3x</span>
            </div>
            <ZoomIn size={16} className="text-gray-400" />
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded-xl flex items-start space-x-2 max-w-2xl mx-auto">
            <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-100">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="mt-4 flex justify-center">
          {!isStreamActive ? (
            <button
              onClick={startCamera}
              disabled={isLoading}
              className="flex items-center space-x-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-xl transition-all active:scale-95 font-medium text-lg"
            >
              <Camera size={20} />
              <span>{isLoading ? 'Starting...' : 'Start Iris Tracking'}</span>
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="flex items-center space-x-2 px-8 py-4 bg-red-600 hover:bg-red-700 rounded-xl transition-all active:scale-95 font-medium text-lg"
            >
              <CameraOff size={20} />
              <span>Stop Camera</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom Safe Area */}
      <div className="safe-area-inset-bottom"></div>
    </div>
  );
}

export default App;