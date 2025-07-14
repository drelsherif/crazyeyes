import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, CameraOff, RotateCcw, AlertCircle, ZoomIn, ZoomOut, Play, Square, BarChart3 } from 'lucide-react';

function App() {
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [isLoading, setIsLoading] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState('');
  const [zoom, setZoom] = useState(1);
  const [isMediaPipeLoaded, setIsMediaPipeLoaded] = useState(false);
  const [isMediaPipeInitialized, setIsMediaPipeInitialized] = useState(false);
  const [isOpenCVLoaded, setIsOpenCVLoaded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingData, setRecordingData] = useState([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showGraph, setShowGraph] = useState(false);
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const faceDetectionRef = useRef(null);
  const animationFrameRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const recordingStartTime = useRef(null);

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
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  // Load OpenCV
  useEffect(() => {
    const loadOpenCV = () => {
      console.log('Loading OpenCV...');
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
      script.async = true;
      script.onload = () => {
        console.log('OpenCV script loaded, waiting for cv to be ready...');
        // OpenCV needs time to initialize
        const checkCV = () => {
          if (window.cv && window.cv.Mat) {
            console.log('OpenCV is ready!');
            setIsOpenCVLoaded(true);
          } else {
            setTimeout(checkCV, 100);
          }
        };
        checkCV();
      };
      script.onerror = (error) => {
        console.error('Failed to load OpenCV:', error);
        setError('Failed to load OpenCV library');
      };
      document.head.appendChild(script);
    };

    loadOpenCV();
  }, []);

  // Load MediaPipe
  useEffect(() => {
    const loadMediaPipe = async () => {
      try {
        console.log('Loading MediaPipe scripts...');
        
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

  // Pupil detection using OpenCV
  const detectPupils = useCallback((landmarks) => {
    if (!window.cv || !videoRef.current || !landmarks) return null;

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = window.cv.matFromImageData(imageData);
      
      // Convert to grayscale
      const gray = new window.cv.Mat();
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);
      
      // Get eye regions from landmarks
      const leftEyeRegion = getEyeRegion(landmarks, 'left', canvas.width, canvas.height);
      const rightEyeRegion = getEyeRegion(landmarks, 'right', canvas.width, canvas.height);
      
      const leftPupilSize = measurePupilInRegion(gray, leftEyeRegion);
      const rightPupilSize = measurePupilInRegion(gray, rightEyeRegion);
      
      // Cleanup
      src.delete();
      gray.delete();
      
      return {
        left: leftPupilSize,
        right: rightPupilSize,
        timestamp: Date.now()
      };
    } catch (error) {
      console.warn('Pupil detection error:', error);
      return null;
    }
  }, []);

  // Get eye region from landmarks
  const getEyeRegion = (landmarks, eye, width, height) => {
    // Eye landmark indices
    const leftEyeIndices = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
    const rightEyeIndices = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
    
    const indices = eye === 'left' ? leftEyeIndices : rightEyeIndices;
    
    let minX = width, minY = height, maxX = 0, maxY = 0;
    
    indices.forEach(index => {
      const point = landmarks[index];
      const x = point.x * width;
      const y = point.y * height;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    
    // Add padding
    const padding = 10;
    return {
      x: Math.max(0, minX - padding),
      y: Math.max(0, minY - padding),
      width: Math.min(width - minX + padding, maxX - minX + 2 * padding),
      height: Math.min(height - minY + padding, maxY - minY + 2 * padding)
    };
  };

  // Measure pupil size in eye region
  const measurePupilInRegion = (grayMat, region) => {
    try {
      // Extract eye region
      const eyeROI = grayMat.roi(new window.cv.Rect(region.x, region.y, region.width, region.height));
      
      // Apply Gaussian blur
      const blurred = new window.cv.Mat();
      window.cv.GaussianBlur(eyeROI, blurred, new window.cv.Size(5, 5), 0);
      
      // Apply threshold to find dark regions (pupil)
      const thresh = new window.cv.Mat();
      window.cv.threshold(blurred, thresh, 50, 255, window.cv.THRESH_BINARY_INV);
      
      // Find contours
      const contours = new window.cv.MatVector();
      const hierarchy = new window.cv.Mat();
      window.cv.findContours(thresh, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE);
      
      let maxArea = 0;
      let pupilRadius = 0;
      
      // Find largest contour (likely the pupil)
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = window.cv.contourArea(contour);
        
        if (area > maxArea && area > 100) { // Filter small noise
          maxArea = area;
          // Estimate radius from area
          pupilRadius = Math.sqrt(area / Math.PI);
        }
      }
      
      // Cleanup
      eyeROI.delete();
      blurred.delete();
      thresh.delete();
      contours.delete();
      hierarchy.delete();
      
      return pupilRadius;
    } catch (error) {
      console.warn('Pupil measurement error:', error);
      return 0;
    }
  };

  // MediaPipe results handler
  const onFaceMeshResults = useCallback((results) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;

    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      drawIrisLandmarks(ctx, landmarks, canvas.width, canvas.height);
      
      // Detect pupils if OpenCV is loaded and recording
      if (isOpenCVLoaded && isRecording) {
        const pupilData = detectPupils(landmarks);
        if (pupilData) {
          const timeElapsed = (Date.now() - recordingStartTime.current) / 1000;
          setRecordingData(prev => [...prev, { ...pupilData, time: timeElapsed }]);
        }
      }
    }
  }, [isOpenCVLoaded, isRecording, detectPupils]);

  // Draw iris landmarks
  const drawIrisLandmarks = (ctx, landmarks, width, height) => {
    const leftIris = [468, 469, 470, 471, 472];
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
      processFrame();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isStreamActive, isMediaPipeInitialized, processFrame]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      recordingStartTime.current = Date.now();
      setRecordingTime(0);
      setRecordingData([]);
      
      recordingIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - recordingStartTime.current) / 1000;
        setRecordingTime(elapsed);
        
        if (elapsed >= 5) {
          stopRecording();
        }
      }, 100);
    } else {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }

    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, [isRecording]);

  const startRecording = () => {
    if (!isOpenCVLoaded) {
      setError('OpenCV not loaded yet. Please wait.');
      return;
    }
    setIsRecording(true);
    setShowGraph(false);
  };

  const stopRecording = () => {
    setIsRecording(false);
    setShowGraph(true);
  };

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
    setIsRecording(false);
    setShowGraph(false);
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
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="bg-gray-900 p-3 flex items-center justify-between safe-area-inset-top">
        <div className="flex items-center space-x-3">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <div>
            <h1 className="text-base font-bold">Pupil Tracker</h1>
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

      {/* Main Content */}
      <div className="p-4 space-y-6">
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
                  <p className="text-gray-400 mb-2 text-sm">Ready to track pupils</p>
                  <p className="text-xs text-gray-500">Phase 3: OpenCV + MediaPipe</p>
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
            
            {/* Recording indicator */}
            {isRecording && (
              <div className="absolute top-4 left-4">
                <div className="bg-red-600 text-white px-3 py-1 rounded-full flex items-center space-x-2">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium">REC {recordingTime.toFixed(1)}s</span>
                </div>
              </div>
            )}
            
            {/* Status indicator */}
            {isStreamActive && !isRecording && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                <div className="text-white text-xs bg-black bg-opacity-60 px-3 py-1 rounded-full backdrop-blur-sm flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>
                    Ready - OpenCV: {isOpenCVLoaded ? '✓' : '⏳'} MediaPipe: {isMediaPipeInitialized ? '✓' : '⏳'}
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
          <div className="flex items-center justify-center space-x-4">
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
          <div className="p-3 bg-red-900 border border-red-700 rounded-xl flex items-start space-x-2 max-w-2xl mx-auto">
            <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-100">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col items-center space-y-4">
          {!isStreamActive ? (
            <button
              onClick={startCamera}
              disabled={isLoading}
              className="flex items-center space-x-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-xl transition-all active:scale-95 font-medium text-lg"
            >
              <Camera size={20} />
              <span>{isLoading ? 'Starting...' : 'Start Pupil Tracking'}</span>
            </button>
          ) : (
            <div className="flex space-x-4">
              <button
                onClick={stopCamera}
                className="flex items-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl transition-all active:scale-95 font-medium"
              >
                <CameraOff size={18} />
                <span>Stop Camera</span>
              </button>
              
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={!isOpenCVLoaded || !isMediaPipeInitialized}
                  className="flex items-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-xl transition-all active:scale-95 font-medium"
                >
                  <Play size={18} />
                  <span>Record 5s</span>
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center space-x-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 rounded-xl transition-all active:scale-95 font-medium"
                >
                  <Square size={18} />
                  <span>Stop ({(5 - recordingTime).toFixed(1)}s)</span>
                </button>
              )}
              
              {recordingData.length > 0 && !isRecording && (
                <button
                  onClick={() => setShowGraph(!showGraph)}
                  className="flex items-center space-x-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl transition-all active:scale-95 font-medium"
                >
                  <BarChart3 size={18} />
                  <span>{showGraph ? 'Hide' : 'Show'} Graph</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Graph Display */}
        {showGraph && recordingData.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-4 max-w-2xl mx-auto">
            <h3 className="text-lg font-bold mb-4 text-center">Pupil Size Over Time</h3>
            <div className="relative h-64 bg-gray-800 rounded-lg p-4">
              <svg width="100%" height="100%" viewBox="0 0 400 200" className="overflow-visible">
                {/* Grid lines */}
                <defs>
                  <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 20" fill="none" stroke="#374151" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                
                {/* Data lines */}
                {recordingData.length > 1 && (
                  <>
                    {/* Left eye data */}
                    <polyline
                      fill="none"
                      stroke="#00ff00"
                      strokeWidth="2"
                      points={recordingData.map((d, i) => 
                        `${(d.time / 5) * 400},${200 - (d.left / 20) * 180}`
                      ).join(' ')}
                    />
                    {/* Right eye data */}
                    <polyline
                      fill="none"
                      stroke="#ff0000"
                      strokeWidth="2"
                      points={recordingData.map((d, i) => 
                        `${(d.time / 5) * 400},${200 - (d.right / 20) * 180}`
                      ).join(' ')}
                    />
                  </>
                )}
                
                {/* Labels */}
                <text x="10" y="15" fill="#9ca3af" fontSize="12">Pupil Size</text>
                <text x="350" y="195" fill="#9ca3af" fontSize="12">Time (s)</text>
              </svg>
            </div>
            <div className="flex justify-center space-x-6 mt-2">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span className="text-sm text-gray-300">Left Eye</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span className="text-sm text-gray-300">Right Eye</span>
              </div>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400">Left Eye Avg</p>
                <p className="text-lg font-bold text-green-400">
                  {recordingData.length > 0 ? 
                    (recordingData.reduce((sum, d) => sum + d.left, 0) / recordingData.length).toFixed(1) 
                    : '0'} px
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400">Right Eye Avg</p>
                <p className="text-lg font-bold text-red-400">
                  {recordingData.length > 0 ? 
                    (recordingData.reduce((sum, d) => sum + d.right, 0) / recordingData.length).toFixed(1) 
                    : '0'} px
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bottom spacer for scrolling */}
        <div className="h-20"></div>
      </div>

      {/* Bottom Safe Area */}
      <div className="safe-area-inset-bottom"></div>
    </div>
  );
}

export default App;