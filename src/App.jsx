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

      console.log('Video element available:', !!videoRef.current);
      
      if (!videoRef.current) {
        throw new Error('Video element not found');
      }

      // Request camera access with constraints optimized for Safari/mobile
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: false
      };

      console.log('Requesting camera with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Stream obtained:', stream);
      console.log('Video tracks:', stream.getVideoTracks());
      console.log('Stream active:', stream.active);
      
      // Store the stream
      streamRef.current = stream;
      
      // Set the video source directly
      videoRef.current.srcObject = stream;
      
      // Set video attributes
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      videoRef.current.autoplay = true;
      
      // Force video to load
      videoRef.current.load();
      
      // Wait for loadedmetadata event
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('Video load timeout')), 10000);
        
        videoRef.current.onloadedmetadata = () => {
          clearTimeout(timeoutId);
          console.log('Video metadata loaded, dimensions:', videoRef.current.videoWidth, videoRef.current.videoHeight);
          resolve();
        };
        
        videoRef.current.onerror = (e) => {
          clearTimeout(timeoutId);
          reject(new Error('Video load error: ' + e.message));
        };
      });
      
      // Now try to play
      try {
        await videoRef.current.play();
        console.log('Video is now playing');
      } catch (playError) {
        console.warn('Auto-play failed, but video should still work:', playError);
      }
      
      // Set transform after everything is loaded
      videoRef.current.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
      
      // Update state to show camera is active
      setIsStreamActive(true);
      
      console.log('Video setup complete');
      
    } catch (err) {
      console.error('Error accessing camera:', err);
      
      // Clean up stream on error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      let errorMessage = 'Failed to access camera. ';
      
      if (err.name === 'NotAllowedError') {
        errorMessage += 'Camera permission denied. Please allow camera access and try again.';
      } else if (err.name === 'NotFoundError') {
        errorMessage += 'No camera found on this device.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage += 'Camera not supported on this device.';
      } else if (err.name === 'NotReadableError') {
        errorMessage += 'Camera is being used by another application.';
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
            {/* Video element always visible */}
            <div className="relative bg-gray-900 rounded-2xl overflow-hidden shadow-2xl h-full">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                webkit-playsinline="true"
                muted
                autoPlay
                onLoadedMetadata={() => console.log('Video metadata loaded')}
                onCanPlay={() => console.log('Video can play')}
                onPlay={() => console.log('Video started playing')}
                onError={handleVideoError}
                style={{
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)',
                  WebkitTransform: facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)',
                  backgroundColor: '#1f2937' // Fallback background
                }}
              />
              
              {/* Overlay status */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="w-full h-full flex items-center justify-center">
                  {!isStreamActive && !isLoading && (
                    <div className="text-center">
                      <Camera size={48} className="mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-400 mb-2 text-sm">Front camera ready</p>
                      <p className="text-xs text-gray-500">Click start to begin</p>
                    </div>
                  )}
                  {isLoading && (
                    <div className="text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-gray-400 text-sm">Starting camera...</p>
                    </div>
                  )}
                </div>
                
                {/* Status indicator when active */}
                {isStreamActive && (
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                    <div className="text-white text-xs bg-black bg-opacity-60 px-3 py-1 rounded-full backdrop-blur-sm flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span>Phase 1: Camera Active</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
          
          {/* Debug button */}
          <button
            onClick={() => {
              console.log('=== DEBUG INFO ===');
              console.log('Video element:', videoRef.current);
              console.log('Video srcObject:', videoRef.current?.srcObject);
              console.log('Stream:', streamRef.current);
              console.log('Stream active:', streamRef.current?.active);
              console.log('Video paused:', videoRef.current?.paused);
              console.log('Video ready state:', videoRef.current?.readyState);
              console.log('Video dimensions:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
              console.log('Video element size:', videoRef.current?.offsetWidth, 'x', videoRef.current?.offsetHeight);
              console.log('isStreamActive:', isStreamActive);
              console.log('==================');
            }}
            className="px-4 py-3 bg-gray-600 hover:bg-gray-500 rounded-xl transition-all active:scale-95 text-sm"
          >
            Debug
          </button>
        </div>
      </div>

      {/* Bottom Safe Area */}
      <div className="safe-area-inset-bottom"></div>
    </div>
  );
}

export default App;