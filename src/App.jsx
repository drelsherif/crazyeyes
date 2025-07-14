// === src/App.jsx ===
import React, { useState, useRef, useEffect } from 'react';
import { Camera, CameraOff, RotateCcw, AlertCircle } from 'lucide-react';

function App() {
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('user'); // Start with front camera
  const [isLoading, setIsLoading] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState('');
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);

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

    // Cleanup on unmount
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Request camera access with constraints optimized for Safari/mobile
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
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        // Set video attributes for Safari/mobile optimization
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.setAttribute('muted', 'true');
        videoRef.current.setAttribute('autoplay', 'true');
        
        // Additional Safari-specific optimizations
        videoRef.current.style.objectFit = 'cover';
        videoRef.current.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
        
        setIsStreamActive(true);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      let errorMessage = 'Failed to access camera. ';
      
      if (err.name === 'NotAllowedError') {
        errorMessage += 'Camera permission denied. Please allow camera access and try again.';
      } else if (err.name === 'NotFoundError') {
        errorMessage += 'No camera found on this device.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage += 'Camera not supported on this device.';
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
      startCamera(); // Restart with new facing mode
    }
  };

  const handleVideoError = (e) => {
    console.error('Video error:', e);
    setError('Video playback error occurred.');
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 p-3 flex items-center justify-between flex-shrink-0 safe-area-inset-top">
        <div className="flex items-center space-x-3">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <div>
            <h1 className="text-base font-bold">Iris Camera PWA</h1>
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

      {/* Large Video Viewer */}
      <div className="flex-1 flex flex-col p-3 min-h-0">
        <div className="flex-1 flex items-center justify-center">
          <div className="relative w-full max-w-lg mx-auto h-full max-h-96">
            {isStreamActive ? (
              <div className="relative bg-gray-900 rounded-2xl overflow-hidden shadow-2xl h-full">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  webkit-playsinline="true"
                  muted
                  autoPlay
                  onError={handleVideoError}
                  style={{
                    transform: facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)',
                    WebkitTransform: facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)'
                  }}
                />
                
                {/* Overlay for future landmarks */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="w-full h-full flex items-end justify-center p-4">
                    <div className="text-white text-xs bg-black bg-opacity-60 px-3 py-1 rounded-full backdrop-blur-sm">
                      Phase 1: Front Camera Active
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-900 rounded-2xl p-8 text-center h-full flex flex-col items-center justify-center">
                <Camera size={48} className="mx-auto mb-4 text-gray-400" />
                <p className="text-gray-400 mb-2 text-sm">
                  {isLoading ? 'Starting front camera...' : 'Front camera ready'}
                </p>
                <p className="text-xs text-gray-500">
                  Optimized for Safari & PWA
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-3 p-3 bg-red-900 border border-red-700 rounded-xl flex items-start space-x-2">
            <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-100">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="mt-4 flex justify-center space-x-3 flex-shrink-0">
          {!isStreamActive ? (
            <button
              onClick={startCamera}
              disabled={isLoading}
              className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-xl transition-all active:scale-95 font-medium"
            >
              <Camera size={18} />
              <span>{isLoading ? 'Starting...' : 'Start Front Camera'}</span>
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="flex items-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl transition-all active:scale-95 font-medium"
            >
              <CameraOff size={18} />
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