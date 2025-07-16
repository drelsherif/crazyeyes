// components/VideoPlayer.jsx - Fixed Camera Flip (Natural View)
import React, { useRef, useState, useCallback, useEffect } from 'react';
import useCamera from '../hooks/useCamera';
import useFaceMesh from '../hooks/useFaceMesh';
import usePupilDetection from '../hooks/usePupilDetection';
import OverlayCanvas from './OverlayCanvas';

function VideoPlayer({ onPupilData }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [landmarks, setLandmarks] = useState(null);
  const [pupilData, setPupilData] = useState(null);
  const [eyeMode, setEyeMode] = useState('both'); // 'left', 'right', 'both'
  const [showOverlay, setShowOverlay] = useState(true);
  
  // Zoom controls
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCenter, setZoomCenter] = useState({ x: 50, y: 50 }); // Percentage from top-left
  const [autoZoom, setAutoZoom] = useState(false);
  
  const detectPupil = usePupilDetection();

  const { faceMeshRef, isLoaded, error } = useFaceMesh(useCallback((results) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const newLandmarks = results.multiFaceLandmarks[0];
      setLandmarks(newLandmarks);
      
      // Auto-zoom to eye region if enabled
      if (autoZoom && newLandmarks) {
        updateAutoZoomCenter(newLandmarks);
      }
      
      // Detect pupils based on current eye mode
      if (videoRef.current && newLandmarks) {
        const pupilResults = detectPupil(videoRef.current, newLandmarks, eyeMode);
        if (pupilResults) {
          setPupilData(pupilResults);
          if (onPupilData) {
            onPupilData(pupilResults);
          }
        }
      }
    }
  }, [detectPupil, eyeMode, onPupilData, autoZoom]));

  // Update zoom center based on selected eye mode
  const updateAutoZoomCenter = useCallback((landmarks) => {
    if (!landmarks) return;

    let targetX = 50, targetY = 50;

    if (eyeMode === 'left') {
      // Focus on left eye (landmarks around 468-472)
      // Note: Since we're flipping horizontally, left eye appears on left side
      const leftEyePoints = [468, 469, 470, 471, 472];
      const avgX = leftEyePoints.reduce((sum, i) => sum + landmarks[i].x, 0) / leftEyePoints.length;
      const avgY = leftEyePoints.reduce((sum, i) => sum + landmarks[i].y, 0) / leftEyePoints.length;
      // Flip X coordinate for natural view
      targetX = (1 - avgX) * 100;
      targetY = avgY * 100;
    } else if (eyeMode === 'right') {
      // Focus on right eye (landmarks around 473-477)
      const rightEyePoints = [473, 474, 475, 476, 477];
      const avgX = rightEyePoints.reduce((sum, i) => sum + landmarks[i].x, 0) / rightEyePoints.length;
      const avgY = rightEyePoints.reduce((sum, i) => sum + landmarks[i].y, 0) / rightEyePoints.length;
      // Flip X coordinate for natural view
      targetX = (1 - avgX) * 100;
      targetY = avgY * 100;
    } else {
      // Focus on center between both eyes
      const leftEyePoints = [468, 469, 470, 471, 472];
      const rightEyePoints = [473, 474, 475, 476, 477];
      const leftAvgX = leftEyePoints.reduce((sum, i) => sum + landmarks[i].x, 0) / leftEyePoints.length;
      const leftAvgY = leftEyePoints.reduce((sum, i) => sum + landmarks[i].y, 0) / leftEyePoints.length;
      const rightAvgX = rightEyePoints.reduce((sum, i) => sum + landmarks[i].x, 0) / rightEyePoints.length;
      const rightAvgY = rightEyePoints.reduce((sum, i) => sum + landmarks[i].y, 0) / rightEyePoints.length;
      // Flip X coordinate for natural view
      targetX = (1 - ((leftAvgX + rightAvgX) / 2)) * 100;
      targetY = ((leftAvgY + rightAvgY) / 2) * 100;
    }

    // Smooth transition to new center
    setZoomCenter(prev => ({
      x: prev.x * 0.9 + targetX * 0.1,
      y: prev.y * 0.9 + targetY * 0.1
    }));
  }, [eyeMode]);

  const handleFrame = useCallback(async (video) => {
    if (faceMeshRef.current && video.readyState >= 2 && isLoaded) {
      try {
        await faceMeshRef.current.send({ image: video });
      } catch (error) {
        console.error('FaceMesh processing error:', error);
      }
    }
  }, [faceMeshRef, isLoaded]);

  useCamera(videoRef, handleFrame);

  // Handle manual zoom center adjustment (click to focus)
  // Need to account for the horizontal flip
  const handleVideoClick = useCallback((event) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    // Flip the X coordinate since video is horizontally flipped
    const x = 100 - ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    
    setZoomCenter({ x, y });
    setAutoZoom(false); // Disable auto-zoom when manually setting center
  }, []);

  // Zoom presets
  const zoomPresets = [
    { label: '1x', value: 1 },
    { label: '1.5x', value: 1.5 },
    { label: '2x', value: 2 },
    { label: '3x', value: 3 },
    { label: '4x', value: 4 },
    { label: '5x', value: 5 }
  ];

  // Calculate transform style for zoom (includes horizontal flip)
  const getTransformStyle = () => {
    const translateX = (50 - zoomCenter.x) * zoomLevel;
    const translateY = (50 - zoomCenter.y) * zoomLevel;
    
    return {
      transform: `scaleX(-1) scale(${zoomLevel}) translate(${translateX}%, ${translateY}%)`,
      transformOrigin: 'center center',
      transition: autoZoom ? 'transform 0.3s ease-out' : 'transform 0.1s ease-out'
    };
  };

  if (error) {
    return (
      <div className="text-red-500 text-center p-4">
        Error loading face detection: {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      {/* Eye Mode Controls */}
      <div className="flex items-center space-x-4 bg-gray-800 p-3 rounded-lg">
        <span className="text-sm font-medium">Track:</span>
        {['both', 'left', 'right'].map(mode => (
          <button
            key={mode}
            onClick={() => setEyeMode(mode)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              eyeMode === mode 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
            }`}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)} Eye{mode === 'both' ? 's' : ''}
          </button>
        ))}
        
        <div className="w-px h-6 bg-gray-600"></div>
        
        <button
          onClick={() => setShowOverlay(!showOverlay)}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            showOverlay 
              ? 'bg-green-600 text-white' 
              : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
          }`}
        >
          {showOverlay ? 'Hide' : 'Show'} Overlay
        </button>
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center space-x-4 bg-gray-800 p-3 rounded-lg">
        <span className="text-sm font-medium">Zoom:</span>
        
        {/* Zoom Slider */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400">1x</span>
          <input
            type="range"
            min="1"
            max="5"
            step="0.1"
            value={zoomLevel}
            onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
            className="w-32 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(zoomLevel - 1) / 4 * 100}%, #4b5563 ${(zoomLevel - 1) / 4 * 100}%, #4b5563 100%)`
            }}
          />
          <span className="text-xs text-gray-400">5x</span>
        </div>

        {/* Zoom Presets */}
        <div className="flex space-x-1">
          {zoomPresets.map(preset => (
            <button
              key={preset.value}
              onClick={() => setZoomLevel(preset.value)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                Math.abs(zoomLevel - preset.value) < 0.1
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-gray-600"></div>

        {/* Auto-zoom toggle */}
        <button
          onClick={() => setAutoZoom(!autoZoom)}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            autoZoom 
              ? 'bg-orange-600 text-white' 
              : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
          }`}
        >
          Auto-Focus
        </button>

        {/* Reset zoom */}
        <button
          onClick={() => {
            setZoomLevel(1);
            setZoomCenter({ x: 50, y: 50 });
            setAutoZoom(false);
          }}
          className="px-3 py-1 rounded text-sm font-medium bg-gray-600 text-gray-200 hover:bg-gray-500 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Mirror Mode Indicator */}
      <div className="text-xs text-green-400 bg-green-900 px-3 py-1 rounded">
        📱 Natural View: Left eye on left, right eye on right
      </div>

      {/* Zoom Info */}
      {zoomLevel > 1 && (
        <div className="text-xs text-gray-400 text-center">
          {zoomLevel.toFixed(1)}x zoom • Center: ({zoomCenter.x.toFixed(0)}%, {zoomCenter.y.toFixed(0)}%)
          {autoZoom && ' • Auto-focus enabled'}
          <br />
          <span className="text-gray-500">Click on video to set zoom center</span>
        </div>
      )}

      {/* Video Display */}
      <div 
        ref={containerRef}
        className="relative aspect-video max-w-3xl mx-auto bg-gray-800 rounded-lg overflow-hidden shadow-lg cursor-crosshair"
        onClick={handleVideoClick}
        style={{ cursor: zoomLevel > 1 ? 'crosshair' : 'default' }}
      >
        <div style={getTransformStyle()}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
            autoPlay
          />
          {showOverlay && (
            <OverlayCanvas 
              videoRef={videoRef} 
              landmarks={landmarks}
              showLeftEye={eyeMode === 'both' || eyeMode === 'left'}
              showRightEye={eyeMode === 'both' || eyeMode === 'right'}
              pupilData={pupilData}
              zoomLevel={zoomLevel}
              isFlipped={true}
            />
          )}
        </div>
        
        {/* Zoom Center Indicator */}
        {zoomLevel > 1 && !autoZoom && (
          <div 
            className="absolute w-2 h-2 bg-red-500 rounded-full pointer-events-none"
            style={{
              left: `${100 - zoomCenter.x}%`, // Flip position for display
              top: `${zoomCenter.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 20
            }}
          />
        )}
      </div>

      {/* Status Display */}
      <div className="flex space-x-6 text-sm">
        <div className={`px-3 py-1 rounded ${isLoaded ? 'bg-green-800' : 'bg-yellow-800'}`}>
          FaceMesh: {isLoaded ? 'Ready' : 'Loading...'}
        </div>
        
        {pupilData && (
          <>
            {pupilData.left && (
              <div className="bg-blue-800 px-3 py-1 rounded">
                L: {pupilData.left.size.toFixed(1)}px ({(pupilData.left.confidence * 100).toFixed(0)}%)
              </div>
            )}
            {pupilData.right && (
              <div className="bg-purple-800 px-3 py-1 rounded">
                R: {pupilData.right.size.toFixed(1)}px ({(pupilData.right.confidence * 100).toFixed(0)}%)
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default VideoPlayer;