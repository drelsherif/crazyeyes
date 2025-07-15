// hooks/usePupilDetection.js
import { useCallback, useRef } from 'react';

export default function usePupilDetection() {
  const kalmanFilters = useRef({
    left: null,
    right: null
  });

  // Simple Kalman filter implementation
  class SimpleKalmanFilter {
    constructor(Q = 0.1, R = 5) {
      this.Q = Q; // Process noise
      this.R = R; // Measurement noise
      this.x = 0; // State
      this.P = 1; // Covariance
      this.initialized = false;
    }

    update(measurement) {
      if (!this.initialized) {
        this.x = measurement;
        this.initialized = true;
        return this.x;
      }

      // Predict
      this.P += this.Q;

      // Update
      const K = this.P / (this.P + this.R);
      this.x += K * (measurement - this.x);
      this.P *= (1 - K);

      return this.x;
    }
  }

  const detectPupil = useCallback((video, landmarks, eyeType = 'both') => {
    if (!window.cv || !landmarks || !video.videoWidth) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let src, gray;
    
    try {
      src = window.cv.matFromImageData(imageData);
      gray = new window.cv.Mat();
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);

      const results = {};

      // Define eye regions
      const eyes = {
        left: { indices: [468, 469, 470, 471, 472], center: 468 },
        right: { indices: [473, 474, 475, 476, 477], center: 473 }
      };

      // Process requested eyes
      const eyesToProcess = eyeType === 'both' ? ['left', 'right'] : [eyeType];

      eyesToProcess.forEach(eye => {
        if (!eyes[eye]) return;

        const result = analyzeSingleEye(gray, landmarks, eyes[eye], canvas.width, canvas.height);
        if (result) {
          // Initialize Kalman filter if needed
          if (!kalmanFilters.current[eye]) {
            kalmanFilters.current[eye] = new SimpleKalmanFilter(0.1, 3);
          }

          // Apply Kalman filtering to pupil size
          const filteredSize = kalmanFilters.current[eye].update(result.size);
          
          results[eye] = {
            ...result,
            size: filteredSize,
            rawSize: result.size
          };
        }
      });

      return Object.keys(results).length > 0 ? results : null;

    } catch (error) {
      console.error('[usePupilDetection] Error:', error);
      return null;
    } finally {
      if (src) src.delete();
      if (gray) gray.delete();
    }
  }, []);

  const analyzeSingleEye = (grayImage, landmarks, eyeConfig, imageWidth, imageHeight) => {
    const { indices, center } = eyeConfig;
    
    try {
      // Calculate eye region center and size
      const points = indices.map(i => landmarks[i]);
      const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length * imageWidth;
      const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length * imageHeight;
      
      // Calculate dynamic ROI size based on eye landmarks
      const distances = points.map(p => 
        Math.sqrt(Math.pow((p.x * imageWidth) - centerX, 2) + Math.pow((p.y * imageHeight) - centerY, 2))
      );
      const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
      const roiSize = Math.max(30, Math.min(80, avgDistance * 2.5));

      // Define ROI bounds
      const x = Math.max(0, Math.floor(centerX - roiSize / 2));
      const y = Math.max(0, Math.floor(centerY - roiSize / 2));
      const width = Math.min(grayImage.cols - x, Math.floor(roiSize));
      const height = Math.min(grayImage.rows - y, Math.floor(roiSize));

      if (width <= 0 || height <= 0) return null;

      // Extract ROI
      const roi = grayImage.roi(new window.cv.Rect(x, y, width, height));
      
      // Enhanced preprocessing pipeline
      const blurred = new window.cv.Mat();
      const adaptive = new window.cv.Mat();
      const morphed = new window.cv.Mat();
      const contours = new window.cv.MatVector();
      const hierarchy = new window.cv.Mat();

      try {
        // Multi-step preprocessing for robust detection
        
        // 1. Gaussian blur to reduce noise
        window.cv.GaussianBlur(roi, blurred, new window.cv.Size(5, 5), 1.5);
        
        // 2. Adaptive threshold for varying lighting
        window.cv.adaptiveThreshold(
          blurred, adaptive, 255,
          window.cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          window.cv.THRESH_BINARY_INV,
          11, 4
        );
        
        // 3. Morphological operations to clean up
        const kernel = window.cv.getStructuringElement(window.cv.MORPH_ELLIPSE, new window.cv.Size(3, 3));
        window.cv.morphologyEx(adaptive, morphed, window.cv.MORPH_CLOSE, kernel);
        window.cv.morphologyEx(morphed, morphed, window.cv.MORPH_OPEN, kernel);
        kernel.delete();
        
        // 4. Find contours
        window.cv.findContours(
          morphed, contours, hierarchy,
          window.cv.RETR_EXTERNAL,
          window.cv.CHAIN_APPROX_SIMPLE
        );

        // 5. Find best pupil candidate
        let bestPupil = null;
        let bestScore = 0;

        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          const area = window.cv.contourArea(contour);
          
          // Area filtering based on expected pupil size
          if (area < 20 || area > 500) continue;

          // Calculate contour properties
          const moments = window.cv.moments(contour);
          if (moments.m00 === 0) continue;

          const cx = moments.m10 / moments.m00;
          const cy = moments.m01 / moments.m00;
          
          // Check if contour is roughly circular
          const perimeter = window.cv.arcLength(contour, true);
          const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
          
          // Distance from expected center (iris center)
          const expectedCx = width / 2;
          const expectedCy = height / 2;
          const distanceFromCenter = Math.sqrt(
            Math.pow(cx - expectedCx, 2) + Math.pow(cy - expectedCy, 2)
          );
          
          // Scoring function (higher is better)
          const score = circularity * area / (1 + distanceFromCenter / 10);
          
          if (score > bestScore && circularity > 0.4) {
            bestScore = score;
            const diameter = 2 * Math.sqrt(area / Math.PI);
            
            bestPupil = {
              center: {
                x: x + cx,
                y: y + cy
              },
              size: diameter,
              area: area,
              circularity: circularity,
              confidence: Math.min(1, score / 50) // Normalize confidence
            };
          }
        }

        return bestPupil;

      } finally {
        // Cleanup OpenCV matrices
        roi.delete();
        blurred.delete();
        adaptive.delete();
        morphed.delete();
        contours.delete();
        hierarchy.delete();
      }

    } catch (error) {
      console.error('[analyzeSingleEye] Error:', error);
      return null;
    }
  };

  return detectPupil;
}