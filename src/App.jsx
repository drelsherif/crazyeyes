import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, CameraOff, RotateCcw, AlertCircle, ZoomIn, ZoomOut, Play, Square, BarChart3, Eye } from 'lucide-react';

// Basic 1D Kalman Filter implementation
// This filter will smooth noisy measurements over time.
class KalmanFilter {
  constructor(Q, R) {
    this.Q = Q; // Process noise covariance
    this.R = R; // Measurement noise covariance
    this.x = 0; // State estimate (e.g., position, size)
    this.P = 1; // Error covariance
  }

  // Initialize the filter with an initial state
  init(initial_state) {
    this.x = initial_state;
    this.P = 1; // High initial uncertainty
  }

  // Predict the next state based on the current state
  predict() {
    // No external control input (u) or state transition (A) in this simple model,
    // so predicted state is current state.
    // Predicted error covariance: P_k = P_{k-1} + Q
    this.P = this.P + this.Q;
  }

  // Update the state estimate using a new measurement
  update(measurement) {
    // Kalman Gain: K = P / (P + R)
    const K = this.P / (this.P + this.R);
    // Updated state estimate: x_k = x_{k-1} + K * (measurement - x_{k-1})
    this.x = this.x + K * (measurement - this.x);
    // Updated error covariance: P_k = (1 - K) * P_{k-1}
    this.P = (1 - K) * this.P;
    return this.x;
  }
}

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
  const [currentPupilData, setCurrentPupilData] = useState(null);
  const [focusMode, setFocusMode] = useState('both'); // 'both', 'left', 'right'
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const faceDetectionRef = useRef(null);
  const animationFrameRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const recordingStartTime = useRef(null);

  // Kalman filter instances for left eye (x, y, size) and right eye (x, y, size)
  const kfLeftX = useRef(new KalmanFilter(0.1, 10)); // Q=process noise, R=measurement noise
  const kfLeftY = useRef(new KalmanFilter(0.1, 10));
  const kfLeftSize = useRef(new KalmanFilter(0.1, 10));
  const kfRightX = useRef(new KalmanFilter(0.1, 10));
  const kfRightY = useRef(new KalmanFilter(0.1, 10));
  const kfRightSize = useRef(new KalmanFilter(0.1, 10));

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
      // Cleanup streams and animation frames on component unmount
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

  // Load OpenCV library
  useEffect(() => {
    const loadOpenCV = () => {
      console.log('Loading OpenCV...');
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
      script.async = true;
      script.onload = () => {
        console.log('OpenCV script loaded, waiting for cv to be ready...');
        const checkCV = () => {
          if (window.cv && window.cv.Mat) {
            console.log('OpenCV is ready!');
            setIsOpenCVLoaded(true);
          } else {
            setTimeout(checkCV, 100); // Wait for cv to be fully initialized
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

  // Load MediaPipe Face Mesh library
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

  // Initialize MediaPipe Face Mesh model
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
          refineLandmarks: true, // Crucial for obtaining iris landmarks (indices 468-477)
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

  // Helper function to calculate the bounding circle for a set of landmarks
  const getIrisBoundingCircle = useCallback((landmarks, indices, width, height) => {
    if (!landmarks || indices.length === 0) return null;

    let sumX = 0, sumY = 0;
    let validPoints = 0;

    // Calculate center of the iris landmarks
    indices.forEach(index => {
      const point = landmarks[index];
      if (point) {
        const x = point.x * width;
        const y = point.y * height;
        sumX += x;
        sumY += y;
        validPoints++;
      }
    });

    if (validPoints === 0) return null;

    const centerX = sumX / validPoints;
    const centerY = sumY / validPoints;
    
    // Calculate radius based on the furthest point from the center
    let maxDistance = 0;
    indices.forEach(index => {
      const point = landmarks[index];
      if (point) {
        const x = point.x * width;
        const y = point.y * height;
        const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        maxDistance = Math.max(maxDistance, dist);
      }
    });

    // Add a small buffer to the radius to ensure the pupil is fully contained
    const radius = maxDistance + 2; 

    return { centerX, centerY, radius };
  }, []);

  // Core pupil detection logic using OpenCV
  const getEyeRegionAndPupil = useCallback((grayMat, landmarks, eye, width, height) => {
    try {
      // MediaPipe Iris Landmarks for precise ROI
      const irisIndices = eye === 'left' ? [468, 469, 470, 471, 472] : [473, 474, 475, 476, 477];
      
      const irisCircle = getIrisBoundingCircle(landmarks, irisIndices, width, height);

      if (!irisCircle) {
        console.log(`No valid iris circle found for ${eye} eye.`);
        return { size: 0, center: null, region: null, confidence: 0 };
      }

      // Define ROI based on the iris bounding circle with minimal padding
      const padding = focusMode === eye ? 5 : 3; 
      const eyeRegion = {
        x: Math.max(0, Math.floor(irisCircle.centerX - irisCircle.radius - padding)),
        y: Math.max(0, Math.floor(irisCircle.centerY - irisCircle.radius - padding)),
        width: Math.min(width - Math.floor(irisCircle.centerX - irisCircle.radius - padding), Math.floor(irisCircle.radius * 2 + 2 * padding)),
        height: Math.min(height - Math.floor(irisCircle.centerY - irisCircle.radius - padding), Math.floor(irisCircle.radius * 2 + 2 * padding))
      };
      
      // Ensure ROI is not too small
      if (eyeRegion.width < 10 || eyeRegion.height < 10) { 
        console.log(`Eye region too small for ${eye} eye:`, eyeRegion);
        return { size: 0, center: null, region: eyeRegion, confidence: 0 };
      }
      
      const eyeROI = grayMat.roi(new window.cv.Rect(eyeRegion.x, eyeRegion.y, eyeRegion.width, eyeRegion.height));
      
      // Apply Gaussian blur to reduce noise
      const blurred = new window.cv.Mat();
      const blurSize = focusMode === eye ? 7 : 5; // More blur for focused eye
      window.cv.GaussianBlur(eyeROI, blurred, new window.cv.Size(blurSize, blurSize), 0);
      
      // Adaptive thresholding to isolate dark pupil
      const thresh = new window.cv.Mat();
      const thresholdValue = focusMode === eye ? 30 : 35; // Lower threshold for darker pupil
      window.cv.adaptiveThreshold(blurred, thresh, 255, window.cv.ADAPTIVE_THRESH_GAUSSIAN_C, window.cv.THRESH_BINARY_INV, 11, 2);
      
      // Morphological operations (closing then opening) to refine pupil shape
      const kernelSize = focusMode === eye ? 3 : 2; 
      const kernel = window.cv.getStructuringElement(window.cv.MORPH_ELLIPSE, new window.cv.Size(kernelSize, kernelSize));
      let morphed = new window.cv.Mat(); 
      window.cv.morphologyEx(thresh, morphed, window.cv.MORPH_CLOSE, kernel);
      
      if (focusMode === eye) {
        const opened = new window.cv.Mat();
        window.cv.morphologyEx(morphed, opened, window.cv.MORPH_OPEN, kernel);
        morphed.delete(); 
        morphed = opened; 
      }
      
      // Find contours in the morphed image
      const contours = new window.cv.MatVector();
      const hierarchy = new window.cv.Mat();
      window.cv.findContours(morphed, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE);
      
      let bestPupil = { size: 0, center: null };
      let maxScore = 0;
      let confidence = 0;
      
      // Define acceptable pupil area range within the iris ROI
      const minArea = focusMode === eye ? 8 : 15; 
      const maxArea = focusMode === eye ? 600 : 400; 
      
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = window.cv.contourArea(contour);
        
        if (area > minArea && area < maxArea) {
          const moments = window.cv.moments(contour);
          const perimeter = window.cv.arcLength(contour, true);
          // Calculate circularity (1 for perfect circle, 0 for line)
          const circularity = perimeter === 0 ? 0 : 4 * Math.PI * area / (perimeter * perimeter); 
          
          let centerX = 0, centerY = 0;
          if (moments.m00 !== 0) {
            centerX = moments.m10 / moments.m00;
            centerY = moments.m01 / moments.m00;
          }
          
          let currentScore = area * circularity;
          
          // Factor in proximity to iris center for higher confidence
          // Calculate distance from detected pupil center (relative to ROI) to iris circle center (relative to ROI)
          const pupilRelativeX = centerX;
          const pupilRelativeY = centerY;
          const irisCircleRelativeX = irisCircle.radius + padding; // Iris circle center relative to ROI top-left
          const irisCircleRelativeY = irisCircle.radius + padding;
          
          const distFromIrisCenter = Math.sqrt(
            Math.pow(pupilRelativeX - irisCircleRelativeX, 2) + 
            Math.pow(pupilRelativeY - irisCircleRelativeY, 2)
          );
          
          // Max allowed distance from iris center for a good pupil detection
          const maxAllowedDist = irisCircle.radius * 0.5; 
          
          if (distFromIrisCenter <= maxAllowedDist) {
            currentScore *= (1 + (1 - (distFromIrisCenter / maxAllowedDist)) * 0.5); // Boost score if central
          } else {
            currentScore *= 0.5; // Penalize if too far off-center
          }

          const minCircularity = focusMode === eye ? 0.4 : 0.5; // Stricter circularity requirement
          if (currentScore > maxScore && circularity > minCircularity) {
            maxScore = currentScore;
            bestPupil = {
              size: Math.sqrt(area / Math.PI) * 2,
              center: {
                x: eyeRegion.x + centerX, // Convert back to full video coordinates
                y: eyeRegion.y + centerY
              }
            };
            // Confidence based on normalized score (adjust scaling factor as needed)
            confidence = Math.min(100, Math.floor((currentScore / (focusMode === eye ? 1500 : 1000)) * 100)); 
          }
        }
        contour.delete(); // Release memory for each contour
      }
      
      // Cleanup OpenCV Mats
      eyeROI.delete();
      blurred.delete();
      thresh.delete();
      kernel.delete();
      morphed.delete(); 
      contours.delete();
      hierarchy.delete();
      
      return {
        size: bestPupil.size,
        center: bestPupil.center,
        region: eyeRegion,
        confidence: confidence
      };
      
    } catch (error) {
      console.error(`Error processing ${eye} eye:`, error);
      return { size: 0, center: null, region: null, confidence: 0 };
    }
  }, [focusMode, getIrisBoundingCircle]);

  // Main pupil detection function, integrates Kalman Filters
  const detectPupils = useCallback((landmarks) => {
    if (!window.cv || !videoRef.current || !landmarks) {
      console.log('OpenCV not ready or no landmarks');
      return null;
    }

    try {
      const video = videoRef.current;
      
      // Create a temporary canvas to draw the current video frame
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      
      tempCtx.drawImage(video, 0, 0);
      
      // Convert canvas image data to OpenCV Mat
      const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const src = window.cv.matFromImageData(imageData);
      
      // Convert to grayscale for pupil detection
      const gray = new window.cv.Mat();
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);
      
      let result = { timestamp: Date.now() };
      
      // Process left eye
      if (focusMode === 'both' || focusMode === 'left') {
        const rawLeftPupil = getEyeRegionAndPupil(gray, landmarks, 'left', tempCanvas.width, tempCanvas.height);
        
        if (rawLeftPupil && rawLeftPupil.center) {
          // Initialize Kalman filters if this is the first valid detection
          if (kfLeftX.current.x === 0 && rawLeftPupil.center.x !== 0) kfLeftX.current.init(rawLeftPupil.center.x);
          if (kfLeftY.current.x === 0 && rawLeftPupil.center.y !== 0) kfLeftY.current.init(rawLeftPupil.center.y);
          if (kfLeftSize.current.x === 0 && rawLeftPupil.size !== 0) kfLeftSize.current.init(rawLeftPupil.size);

          // Predict and update Kalman filters with raw measurements
          kfLeftX.current.predict();
          kfLeftY.current.predict();
          kfLeftSize.current.predict();

          const filteredX = kfLeftX.current.update(rawLeftPupil.center.x);
          const filteredY = kfLeftY.current.update(rawLeftPupil.center.y);
          const filteredSize = kfLeftSize.current.update(rawLeftPupil.size);

          result.left = {
            size: filteredSize,
            center: { x: filteredX, y: filteredY },
            region: rawLeftPupil.region,
            confidence: rawLeftPupil.confidence
          };
        } else {
          result.left = { size: 0, center: null, region: null, confidence: 0 };
        }
      }
      
      // Process right eye
      if (focusMode === 'both' || focusMode === 'right') {
        const rawRightPupil = getEyeRegionAndPupil(gray, landmarks, 'right', tempCanvas.width, tempCanvas.height);

        if (rawRightPupil && rawRightPupil.center) {
          // Initialize Kalman filters if this is the first valid detection
          if (kfRightX.current.x === 0 && rawRightPupil.center.x !== 0) kfRightX.current.init(rawRightPupil.center.x);
          if (kfRightY.current.x === 0 && rawRightPupil.center.y !== 0) kfRightY.current.init(rawRightPupil.center.y);
          if (kfRightSize.current.x === 0 && rawRightPupil.size !== 0) kfRightSize.current.init(rawRightPupil.size);

          // Predict and update Kalman filters with raw measurements
          kfRightX.current.predict();
          kfRightY.current.predict();
          kfRightSize.current.predict();

          const filteredX = kfRightX.current.update(rawRightPupil.center.x);
          const filteredY = kfRightY.current.update(rawRightPupil.center.y);
          const filteredSize = kfRightSize.current.update(rawRightPupil.size);

          result.right = {
            size: filteredSize,
            center: { x: filteredX, y: filteredY },
            region: rawRightPupil.region,
            confidence: rawRightPupil.confidence
          };
        } else {
          result.right = { size: 0, center: null, region: null, confidence: 0 };
        }
      }
      
      // Fill in default values for non-focused eyes if only one eye is tracked
      if (focusMode === 'left') {
        result.right = { size: 0, center: null, region: null, confidence: 0 };
      } else if (focusMode === 'right') {
        result.left = { size: 0, center: null, region: null, confidence: 0 };
      }
      
      src.delete();
      gray.delete();
      
      return result;
      
    } catch (error) {
      console.error('Pupil detection error:', error);
      return null;
    }
  }, [focusMode, getEyeRegionAndPupil]);

  // Draws pupil overlays with confidence-based coloring and text
  const drawPupilOverlays = useCallback((ctx, pupilData, videoWidth, videoHeight, canvasWidth, canvasHeight) => {
    const scaleX = canvasWidth / videoWidth;
    const scaleY = canvasHeight / videoHeight;
    
    // Helper to get color based on confidence
    const getConfidenceColor = (confidence) => {
      if (confidence > 80) return '#00ff00'; // High confidence: green
      if (confidence > 50) return '#ffff00'; // Medium confidence: yellow
      return '#ff0000'; // Low confidence: red
    };

    // Draw left pupil (only if tracking)
    if ((focusMode === 'both' || focusMode === 'left') && pupilData.left?.center && pupilData.left.size > 0) {
      const leftX = pupilData.left.center.x * scaleX;
      const leftY = pupilData.left.center.y * scaleY;
      const leftRadius = (pupilData.left.size / 2) * Math.min(scaleX, scaleY);
      const leftConfidence = pupilData.left.confidence || 0;
      
      const isLeftFocused = focusMode === 'left';
      const strokeColor = getConfidenceColor(leftConfidence);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isLeftFocused ? 3 : 2;
      ctx.fillStyle = `${strokeColor.replace('rgb', 'rgba').replace(')', ', 0.3)')}`; // Semi-transparent fill

      ctx.beginPath();
      ctx.arc(leftX, leftY, leftRadius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      
      // Center dot
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(leftX, leftY, isLeftFocused ? 3 : 2, 0, 2 * Math.PI);
      ctx.fill();
      
      // Confidence text
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${leftConfidence}%`, leftX, leftY + leftRadius + 12);
    }
    
    // Draw right pupil (only if tracking)
    if ((focusMode === 'both' || focusMode === 'right') && pupilData.right?.center && pupilData.right.size > 0) {
      const rightX = pupilData.right.center.x * scaleX;
      const rightY = pupilData.right.center.y * scaleY;
      const rightRadius = (pupilData.right.size / 2) * Math.min(scaleX, scaleY);
      const rightConfidence = pupilData.right.confidence || 0;
      
      const isRightFocused = focusMode === 'right';
      const strokeColor = getConfidenceColor(rightConfidence);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isRightFocused ? 3 : 2;
      ctx.fillStyle = `${strokeColor.replace('rgb', 'rgba').replace(')', ', 0.3)')}`; // Semi-transparent fill
      
      ctx.beginPath();
      ctx.arc(rightX, rightY, rightRadius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(rightX, rightY, isRightFocused ? 3 : 2, 0, 2 * Math.PI);
      ctx.fill();

      // Confidence text
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${rightConfidence}%`, rightX, rightY + rightRadius + 12);
    }
  }, [focusMode]);

  // Draws iris landmarks as circles (viewfinder)
  const drawIrisLandmarks = useCallback((ctx, landmarks, width, height) => {
    const leftIrisIndices = [468, 469, 470, 471, 472];
    const rightIrisIndices = [473, 474, 475, 476, 477];

    // Draw left iris circle (dimmed if not focused)
    if (focusMode === 'both' || focusMode === 'left') {
      const leftIrisCircle = getIrisBoundingCircle(landmarks, leftIrisIndices, width, height);
      if (leftIrisCircle) {
        const isLeftFocused = focusMode === 'left';
        ctx.strokeStyle = isLeftFocused ? '#00ff00' : '#006600'; // Green for left iris
        ctx.lineWidth = isLeftFocused ? 3 : 2;
        ctx.fillStyle = isLeftFocused ? 'rgba(0, 255, 0, 0.15)' : 'rgba(0, 255, 0, 0.05)';
        
        ctx.beginPath();
        ctx.arc(leftIrisCircle.centerX, leftIrisCircle.centerY, leftIrisCircle.radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Center point
        ctx.fillStyle = isLeftFocused ? '#00ff00' : '#006600';
        ctx.beginPath();
        ctx.arc(leftIrisCircle.centerX, leftIrisCircle.centerY, isLeftFocused ? 4 : 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Draw right iris circle (dimmed if not focused)
    if (focusMode === 'both' || focusMode === 'right') {
      const rightIrisCircle = getIrisBoundingCircle(landmarks, rightIrisIndices, width, height);
      if (rightIrisCircle) {
        const isRightFocused = focusMode === 'right';
        ctx.strokeStyle = isRightFocused ? '#ff0000' : '#660000'; // Red for right iris
        ctx.lineWidth = isRightFocused ? 3 : 2;
        ctx.fillStyle = isRightFocused ? 'rgba(255, 0, 0, 0.15)' : 'rgba(255, 0, 0, 0.05)';
        
        ctx.beginPath();
        ctx.arc(rightIrisCircle.centerX, rightIrisCircle.centerY, rightIrisCircle.radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isRightFocused ? '#ff0000' : '#660000';
        ctx.beginPath();
        ctx.arc(rightIrisCircle.centerX, rightIrisCircle.centerY, isRightFocused ? 4 : 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }, [focusMode, getIrisBoundingCircle]);

  // MediaPipe results handler - draws overlays and triggers pupil detection
  // This function needs to be after drawIrisLandmarks and drawPupilOverlays
  const onFaceMeshResults = useCallback((results) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;

    // Adjust canvas size to match video element's displayed size for correct overlay scaling
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous drawings

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      
      // Draw iris landmarks as circles (viewfinder)
      drawIrisLandmarks(ctx, landmarks, canvas.width, canvas.height);
      
      // Detect pupils if OpenCV is loaded
      if (isOpenCVLoaded) {
        const pupilData = detectPupils(landmarks);
        if (pupilData) {
          setCurrentPupilData(pupilData); // Update state for debug display
          
          // Draw pupil overlays (smoothed)
          drawPupilOverlays(ctx, pupilData, video.videoWidth, video.videoHeight, canvas.width, canvas.height);
          
          // Record data if recording is active
          if (isRecording) {
            const timeElapsed = (Date.now() - recordingStartTime.current) / 1000;
            let dataPoint = {
              time: timeElapsed,
              timestamp: pupilData.timestamp
            };
            
            // Add pupil data based on focus mode
            if (focusMode === 'both') {
              dataPoint.left = pupilData.left?.size || 0;
              dataPoint.right = pupilData.right?.size || 0;
            } else if (focusMode === 'left') {
              dataPoint.left = pupilData.left?.size || 0;
              dataPoint.right = 0; // Not tracking
            } else if (focusMode === 'right') {
              dataPoint.left = 0; // Not tracking
              dataPoint.right = pupilData.right?.size || 0;
            }
            
            setRecordingData(prev => {
              const newData = [...prev, dataPoint];
              return newData;
            });
          }
        }
      }
    }
  }, [isOpenCVLoaded, isRecording, detectPupils, focusMode, drawIrisLandmarks, drawPupilOverlays]); // Dependencies are correct after reordering

  // Process video frame for MediaPipe
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !faceDetectionRef.current || !isMediaPipeInitialized || !isStreamActive) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    if (video.readyState >= 2) { // Ensure video is ready before sending to MediaPipe
      try {
        await faceDetectionRef.current.send({ image: video });
      } catch (err) {
        console.warn('MediaPipe processing error:', err);
      }
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [isMediaPipeInitialized, isStreamActive]);

  // Start MediaPipe processing loop when stream and MediaPipe are ready
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

  // Recording timer logic
  useEffect(() => {
    if (isRecording) {
      recordingStartTime.current = Date.now();
      setRecordingTime(0);
      setRecordingData([]); // Clear data at the start of a new recording
      setShowGraph(false); // Hide graph when starting a new recording
      
      recordingIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - recordingStartTime.current) / 1000;
        setRecordingTime(elapsed);
        
        if (elapsed >= 5) { // Stop recording after 5 seconds
          stopRecording();
        }
      }, 100); // Update recording time every 100ms
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
  }, [isRecording, stopRecording]); // Dependency on isRecording and stopRecording

  const startRecording = () => {
    if (!isOpenCVLoaded) {
      setError('OpenCV not loaded yet. Please wait.');
      return;
    }
    if (!isMediaPipeInitialized) {
      setError('MediaPipe not initialized yet. Please wait.');
      return;
    }
    console.log(`Starting recording in ${focusMode} mode...`);
    setIsRecording(true);
  };

  const stopRecording = useCallback(() => {
    console.log('Stopping recording...');
    setIsRecording(false);
    // Show graph immediately after recording stops if there's data
    if (recordingData.length > 0) {
      setShowGraph(true);
    } else {
      setShowGraph(false); // Ensure graph is hidden if no data was recorded
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
  }, [recordingData.length]); // Add recordingData.length as a dependency for stopRecording

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
      
      // Wait for video metadata to load
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

      // Attempt to play video
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
    setShowGraph(false); // Hide graph when camera is stopped
    setRecordingData([]); // Clear recording data when camera is stopped
    setCurrentPupilData(null); // Clear pupil debug data
    
    // Reset Kalman filters when camera stops
    kfLeftX.current = new KalmanFilter(0.1, 10);
    kfLeftY.current = new KalmanFilter(0.1, 10);
    kfLeftSize.current = new KalmanFilter(0.1, 10);
    kfRightX.current = new KalmanFilter(0.1, 10);
    kfRightY.current = new KalmanFilter(0.1, 10);
    kfRightSize.current = new KalmanFilter(0.1, 10);
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    if (isStreamActive) {
      // Restart camera with new facing mode
      startCamera();
    }
  };

  const handleVideoError = (e) => {
    console.error('Video error:', e);
    setError('Video playback error occurred.');
  };

  const getFocusModeLabel = () => {
    switch (focusMode) {
      case 'both': return 'Both Eyes';
      case 'left': return 'Left Eye Only';
      case 'right': return 'Right Eye Only';
      default: return 'Both Eyes';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="bg-gray-900 p-3 flex items-center justify-between safe-area-inset-top">
        <div className="flex items-center space-x-3">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <div>
            <h1 className="text-base font-bold text-lg md:text-xl">Pupil Tracker</h1>
            <p className="text-xs md:text-sm text-gray-400">{deviceInfo} • {getFocusModeLabel()}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={switchCamera}
            className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors active:scale-95"
            disabled={isLoading}
            aria-label="Switch Camera"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-6 md:p-6 lg:p-8">
        {/* Focus Mode Selector */}
        {isStreamActive && (
          <div className="flex justify-center">
            <div className="bg-gray-900 rounded-xl p-1 flex flex-wrap justify-center gap-1 md:gap-2">
              <button
                onClick={() => setFocusMode('both')}
                className={`flex items-center space-x-1 md:space-x-2 px-3 py-2 md:px-4 md:py-2 rounded-lg transition-all text-sm md:text-base font-medium ${
                  focusMode === 'both' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <Eye size={16} />
                <span>Both Eyes</span>
              </button>
              <button
                onClick={() => setFocusMode('left')}
                className={`flex items-center space-x-1 md:space-x-2 px-3 py-2 md:px-4 md:py-2 rounded-lg transition-all text-sm md:text-base font-medium ${
                  focusMode === 'left' 
                    ? 'bg-cyan-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <div className="w-4 h-4 border-2 border-current rounded-full"></div>
                <span>Left Only</span>
              </button>
              <button
                onClick={() => setFocusMode('right')}
                className={`flex items-center space-x-1 md:space-x-2 px-3 py-2 md:px-4 md:py-2 rounded-lg transition-all text-sm md:text-base font-medium ${
                  focusMode === 'right' 
                    ? 'bg-yellow-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                <div className="w-4 h-4 border-2 border-current rounded-full"></div>
                <span>Right Only</span>
              </button>
            </div>
          </div>
        )}

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
          <div className="absolute inset-0 pointer-events-none p-2 md:p-4">
            {!isStreamActive && !isLoading && (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <Camera size={48} className="mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-400 mb-2 text-sm md:text-base">Ready to track pupils</p>
                  <p className="text-xs md:text-sm text-gray-500">Phase 3: OpenCV + MediaPipe</p>
                </div>
              </div>
            )}
            
            {isLoading && (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-400 text-sm md:text-base">Starting camera...</p>
                </div>
              </div>
            )}
            
            {/* Real-time pupil size display (top-left) */}
            {currentPupilData && isStreamActive && (
              <div className="absolute top-4 left-4">
                <div className="bg-black bg-opacity-60 text-white px-3 py-2 rounded-lg text-xs md:text-sm backdrop-blur-sm">
                  <div className="text-xs md:text-sm text-gray-300 mb-2">
                    Tracking: {getFocusModeLabel()}
                  </div>
                  {(focusMode === 'both' || focusMode === 'left') && (
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                      <span>Left: {currentPupilData.left?.size?.toFixed(1) || '0'}px ({currentPupilData.left?.confidence || 0}%)</span>
                    </div>
                  )}
                  {(focusMode === 'both' || focusMode === 'right') && (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                      <span>Right: {currentPupilData.right?.size?.toFixed(1) || '0'}px ({currentPupilData.right?.confidence || 0}%)</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Recording indicator */}
            {isRecording && (
              <div className="absolute top-4 right-4">
                <div className="bg-red-600 text-white px-3 py-1 rounded-full flex items-center space-x-2">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  <span className="text-sm md:text-base font-medium">REC {recordingTime.toFixed(1)}s</span>
                </div>
              </div>
            )}
            
            {/* Status indicator */}
            {isStreamActive && !isRecording && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                <div className="text-white text-xs md:text-sm bg-black bg-opacity-60 px-3 py-1 rounded-full backdrop-blur-sm flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>
                    OpenCV: {isOpenCVLoaded ? '✓' : '⏳'} MediaPipe: {isMediaPipeInitialized ? '✓' : '⏳'}
                  </span>
                </div>
              </div>
            )}
            
            {/* Zoom indicator */}
            {zoom !== 1 && (
              <div className="absolute bottom-4 right-4">
                <div className="text-white text-xs md:text-sm bg-black bg-opacity-60 px-2 py-1 rounded backdrop-blur-sm">
                  {zoom.toFixed(1)}x
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Zoom Slider */}
        {isStreamActive && (
          <div className="flex items-center justify-center space-x-2 md:space-x-4">
            <ZoomOut size={16} className="text-gray-400" />
            <div className="flex items-center space-x-2 w-full max-w-xs">
              <span className="text-xs text-gray-400 w-8 text-right">1x</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-grow h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
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
              className="flex items-center space-x-2 px-6 py-3 md:px-8 md:py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-xl transition-all active:scale-95 font-medium text-base md:text-lg"
            >
              <Camera size={20} />
              <span>{isLoading ? 'Starting...' : 'Start Pupil Tracking'}</span>
            </button>
          ) : (
            <div className="flex flex-wrap justify-center gap-3 md:gap-4">
              <button
                onClick={stopCamera}
                className="flex items-center space-x-2 px-4 py-2 md:px-6 md:py-3 bg-red-600 hover:bg-red-700 rounded-xl transition-all active:scale-95 font-medium text-sm md:text-base"
              >
                <CameraOff size={18} />
                <span>Stop Camera</span>
              </button>
              
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={!isOpenCVLoaded || !isMediaPipeInitialized}
                  className="flex items-center space-x-2 px-4 py-2 md:px-6 md:py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-xl transition-all active:scale-95 font-medium text-sm md:text-base"
                >
                  <Play size={18} />
                  <span>Record 5s ({getFocusModeLabel()})</span>
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center space-x-2 px-4 py-2 md:px-6 md:py-3 bg-orange-600 hover:bg-orange-700 rounded-xl transition-all active:scale-95 font-medium text-sm md:text-base"
                >
                  <Square size={18} />
                  <span>Stop ({(5 - recordingTime).toFixed(1)}s)</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pupil Debug Display */}
        {isStreamActive && currentPupilData && (
          <div className="bg-gray-900 rounded-xl p-4 max-w-2xl mx-auto border border-gray-700">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-center text-gray-300">
              👁️ Pupil Debug Data
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {(focusMode === 'both' || focusMode === 'left') && (
                <div className="bg-gray-800 p-3 rounded-lg flex flex-col space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                    <span className="font-medium text-cyan-400">Left Eye:</span>
                  </div>
                  <p className="ml-4 text-gray-200">Size: {currentPupilData.left?.size?.toFixed(2) || 'N/A'} px</p>
                  <p className="ml-4 text-gray-200">Center X: {currentPupilData.left?.center?.x?.toFixed(2) || 'N/A'}</p>
                  <p className="ml-4 text-gray-200">Center Y: {currentPupilData.left?.center?.y?.toFixed(2) || 'N/A'}</p>
                  <p className="ml-4 text-gray-200">Confidence: {currentPupilData.left?.confidence?.toFixed(0) || '0'}%</p>
                  <p className="ml-4 text-gray-500 text-xs">ROI: x:{currentPupilData.left?.region?.x}, y:{currentPupilData.left?.region?.y}, w:{currentPupilData.left?.region?.width}, h:{currentPupilData.left?.region?.height}</p>
                </div>
              )}
              {(focusMode === 'both' || focusMode === 'right') && (
                <div className="bg-gray-800 p-3 rounded-lg flex flex-col space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                    <span className="font-medium text-yellow-400">Right Eye:</span>
                  </div>
                  <p className="ml-4 text-gray-200">Size: {currentPupilData.right?.size?.toFixed(2) || 'N/A'} px</p>
                  <p className="ml-4 text-gray-200">Center X: {currentPupilData.right?.center?.x?.toFixed(2) || 'N/A'}</p>
                  <p className="ml-4 text-gray-200">Center Y: {currentPupilData.right?.center?.y?.toFixed(2) || 'N/A'}</p>
                  <p className="ml-4 text-gray-200">Confidence: {currentPupilData.right?.confidence?.toFixed(0) || '0'}%</p>
                  <p className="ml-4 text-gray-500 text-xs">ROI: x:{currentPupilData.right?.region?.x}, y:{currentPupilData.right?.region?.y}, w:{currentPupilData.right?.region?.width}, h:{currentPupilData.right?.region?.height}</p>
                </div>
              )}
            </div>
            {((focusMode === 'both' && (!currentPupilData.left?.size && !currentPupilData.right?.size)) ||
              (focusMode === 'left' && !currentPupilData.left?.size) ||
              (focusMode === 'right' && !currentPupilData.right?.size)) && (
              <p className="text-center text-sm text-gray-500 mt-4">
                No pupil detected. Try adjusting lighting, camera position, or zoom.
              </p>
            )}
          </div>
        )}

        {/* Results Section - Visible after recording if data exists */}
        {!isRecording && recordingData.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-4 max-w-2xl mx-auto border-2 border-green-600">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg md:text-xl font-bold text-green-400">
                📊 Recording Results - {getFocusModeLabel()}
              </h3>
              <button
                onClick={() => setShowGraph(!showGraph)}
                className="flex items-center space-x-2 px-3 py-1 md:px-4 md:py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-all active:scale-95 font-medium text-sm"
              >
                <BarChart3 size={16} />
                <span>{showGraph ? 'Hide Graph' : 'Show Graph'}</span>
              </button>
            </div>

            {/* Quick Stats */}
            <div className={`grid ${focusMode === 'both' ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mb-4`}>
              {(focusMode === 'both' || focusMode === 'left') && (
                <div className="bg-gray-800 rounded-lg p-4 text-center border border-cyan-500">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <div className="w-3 h-3 bg-cyan-400 rounded-full"></div>
                    <span className="text-sm md:text-base font-medium text-cyan-400">Left Eye</span>
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-cyan-400">
                    {recordingData.length > 0 ? 
                      (recordingData.reduce((sum, d) => sum + (d.left || 0), 0) / recordingData.length).toFixed(1) 
                      : '0'}px
                  </p>
                  <p className="text-xs md:text-sm text-gray-400 mt-1">Average Size</p>
                </div>
              )}
              {(focusMode === 'both' || focusMode === 'right') && (
                <div className="bg-gray-800 rounded-lg p-4 text-center border border-yellow-500">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                    <span className="text-sm md:text-base font-medium text-yellow-400">Right Eye</span>
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-yellow-400">
                    {recordingData.length > 0 ? 
                      (recordingData.reduce((sum, d) => sum + (d.right || 0), 0) / recordingData.length).toFixed(1) 
                      : '0'}px
                  </p>
                  <p className="text-xs md:text-sm text-gray-400 mt-1">Average Size</p>
                </div>
              )}
            </div>

            {/* Recording Summary */}
            <div className="bg-gray-800 rounded-lg p-3 mb-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg md:text-xl font-bold text-green-400">{recordingData.length}</p>
                  <p className="text-xs md:text-sm text-gray-400">Data Points</p>
                </div>
                <div>
                  <p className="text-lg md:text-xl font-bold text-blue-400">
                    {recordingData.length > 0 ? recordingData[recordingData.length - 1].time.toFixed(1) : 0}s
                  </p>
                  <p className="text-xs md:text-sm text-gray-400">Duration</p>
                </div>
                <div>
                  <p className="text-lg md:text-xl font-bold text-purple-400">
                    {recordingData.length > 0 ? (recordingData.length / 5).toFixed(1) : 0}/s
                  </p>
                  <p className="text-xs md:text-sm text-gray-400">Sample Rate</p>
                </div>
              </div>
            </div>

            {/* Graph Toggle Hint */}
            {!showGraph && (
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-2">
                  🎯 Click "Show Graph" above to visualize pupil size changes over time
                </p>
              </div>
            )}
          </div>
        )}

        {/* Graph Display - Render only if showGraph is true and recordingData exists */}
        {showGraph && recordingData.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-4 max-w-2xl mx-auto">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-center">
              Pupil Size Over Time - {getFocusModeLabel()}
            </h3>
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
                    {/* Left eye data - only if tracking left */}
                    {(focusMode === 'both' || focusMode === 'left') && (
                      <polyline
                        fill="none"
                        stroke="#00ffff"
                        strokeWidth={focusMode === 'left' ? 4 : 3}
                        points={recordingData.map((d, i) => 
                          `${(d.time / 5) * 400},${200 - Math.min((d.left / 50) * 180, 180)}`
                        ).join(' ')}
                      />
                    )}
                    {/* Right eye data - only if tracking right */}
                    {(focusMode === 'both' || focusMode === 'right') && (
                      <polyline
                        fill="none"
                        stroke="#ffff00"
                        strokeWidth={focusMode === 'right' ? 4 : 3}
                        points={recordingData.map((d, i) => 
                          `${(d.time / 5) * 400},${200 - Math.min((d.right / 50) * 180, 180)}`
                        ).join(' ')}
                      />
                    )}
                  </>
                )}
                
                {/* Labels */}
                <text x="10" y="15" fill="#9ca3af" fontSize="12">Pupil Size (px)</text>
                <text x="320" y="195" fill="#9ca3af" fontSize="12">Time (s)</text>
              </svg>
            </div>
            
            {/* Legend - only show relevant eyes */}
            <div className="flex justify-center space-x-6 mt-2">
              {(focusMode === 'both' || focusMode === 'left') && (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-cyan-400 rounded"></div>
                  <span className="text-sm text-gray-300">Left Eye</span>
                </div>
              )}
              {(focusMode === 'both' || focusMode === 'right') && (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-400 rounded"></div>
                  <span className="text-sm text-gray-300">Right Eye</span>
                </div>
              )}
            </div>
            
            {/* Stats - only show relevant eyes */}
            <div className={`grid ${focusMode === 'both' ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mt-4`}>
              {(focusMode === 'both' || focusMode === 'left') && (
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400">Left Eye Avg</p>
                  <p className="text-lg font-bold text-cyan-400">
                    {recordingData.length > 0 ? 
                      (recordingData.reduce((sum, d) => sum + (d.left || 0), 0) / recordingData.length).toFixed(1) 
                      : '0'} px
                  </p>
                </div>
              )}
              {(focusMode === 'both' || focusMode === 'right') && (
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400">Right Eye Avg</p>
                  <p className="text-lg font-bold text-yellow-400">
                    {recordingData.length > 0 ? 
                      (recordingData.reduce((sum, d) => sum + (d.right || 0), 0) / recordingData.length).toFixed(1) 
                      : '0'} px
                  </p>
                </div>
              )}
            </div>
            
            {/* Data points info */}
            <div className="mt-4 text-center">
              <p className="text-xs text-gray-400">
                Recorded {recordingData.length} data points over {recordingData.length > 0 ? recordingData[recordingData.length - 1].time.toFixed(1) : 0}s
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Focus Mode: {getFocusModeLabel()}
              </p>
            </div>
          </div>
        )}

        {/* Debug Info - Show if no data was recorded (only if stream is active and not recording) */}
        {!isRecording && recordingData.length === 0 && isStreamActive && (
          <div className="bg-yellow-900 border border-yellow-600 rounded-xl p-4 max-w-2xl mx-auto">
            <div className="flex items-start space-x-3">
              <AlertCircle size={20} className="text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-yellow-400 mb-2">No Recording Data</h4>
                <p className="text-sm text-yellow-100 mb-2">
                  If you just completed a recording but don't see results, try:
                </p>
                <ul className="text-sm text-yellow-100 space-y-1 list-disc list-inside">
                  <li>Make sure your face is well-lit and clearly visible</li>
                  <li>Position yourself so both eyes are in the camera view</li>
                  <li>Wait for both OpenCV ✓ and MediaPipe ✓ to be ready</li>
                  <li>Try recording again with better lighting</li>
                </ul>
                <p className="text-xs text-yellow-200 mt-2">
                  Debug: Check browser console (F12) for detailed error messages
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