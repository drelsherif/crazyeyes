// hooks/usePupilDetection.js - Fixed Detection & Sizing
import { useCallback, useRef } from 'react';

export default function usePupilDetection() {
  const kalmanFilters = useRef({
    left: null,
    right: null
  });
  
  const previousPupils = useRef({
    left: null,
    right: null
  });

  // Lighter Kalman filter - less smoothing to allow more responsiveness
  class SimpleKalmanFilter {
    constructor(processNoise = 0.3, measurementNoise = 1.5) {
      this.Q = processNoise;   // Increased for more responsiveness
      this.R = measurementNoise; // Reduced for more trust in measurements
      this.x = 0;
      this.P = 1;
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

      // Define eye regions - focus on iris landmarks for more precise ROI
      const eyes = {
        left: { indices: [468, 469, 470, 471, 472], center: 468 },
        right: { indices: [473, 474, 475, 476, 477], center: 473 }
      };

      // Process requested eyes
      const eyesToProcess = eyeType === 'both' ? ['left', 'right'] : [eyeType];

      eyesToProcess.forEach(eye => {
        if (!eyes[eye]) return;

        const result = analyzePupilPrecise(gray, landmarks, eyes[eye], canvas.width, canvas.height);
        if (result && result.size > 0) {
          // Initialize Kalman filter if needed
          if (!kalmanFilters.current[eye]) {
            kalmanFilters.current[eye] = {
              size: new SimpleKalmanFilter(0.2, 1.0),
              x: new SimpleKalmanFilter(0.1, 0.5),
              y: new SimpleKalmanFilter(0.1, 0.5)
            };
          }

          // Apply separate Kalman filtering to each component
          const filteredSize = kalmanFilters.current[eye].size.update(result.size);
          const filteredX = kalmanFilters.current[eye].x.update(result.center.x);
          const filteredY = kalmanFilters.current[eye].y.update(result.center.y);
          
          results[eye] = {
            center: { x: filteredX, y: filteredY },
            size: filteredSize,
            rawSize: result.size,
            rawCenter: result.center,
            confidence: result.confidence,
            circularity: result.circularity,
            method: result.method || 'threshold'
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

  const analyzePupilPrecise = (grayImage, landmarks, eyeConfig, imageWidth, imageHeight) => {
    const { indices, center } = eyeConfig;
    
    try {
      // Calculate iris center from MediaPipe landmarks
      const irisPoints = indices.map(i => landmarks[i]);
      const irisCenterX = irisPoints.reduce((sum, p) => sum + p.x, 0) / irisPoints.length * imageWidth;
      const irisCenterY = irisPoints.reduce((sum, p) => sum + p.y, 0) / irisPoints.length * imageHeight;
      
      // Calculate iris radius from landmarks for proper ROI sizing
      const irisRadius = Math.max(...irisPoints.map(p => 
        Math.sqrt(((p.x * imageWidth) - irisCenterX) ** 2 + ((p.y * imageHeight) - irisCenterY) ** 2)
      ));
      
      // ROI should be smaller and centered on iris - pupil is typically 15-40% of iris diameter
      const roiSize = Math.max(20, Math.min(50, irisRadius * 1.2)); // Smaller ROI focused on pupil area
      
      const x = Math.max(0, Math.floor(irisCenterX - roiSize / 2));
      const y = Math.max(0, Math.floor(irisCenterY - roiSize / 2));
      const width = Math.min(grayImage.cols - x, Math.floor(roiSize));
      const height = Math.min(grayImage.rows - y, Math.floor(roiSize));

      if (width <= 0 || height <= 0) return null;

      // Extract ROI
      const roi = grayImage.roi(new window.cv.Rect(x, y, width, height));
      
      // Try multiple pupil detection methods
      const methods = [
        () => detectPupilByAdaptiveThreshold(roi, width, height),
        () => detectPupilByOtsu(roi, width, height),
        () => detectPupilByMinValue(roi, width, height),
        () => detectPupilByContrastThreshold(roi, width, height)
      ];

      let bestResult = null;
      let bestScore = 0;

      for (const method of methods) {
        try {
          const result = method();
          if (result && result.confidence > bestScore) {
            bestScore = result.confidence;
            bestResult = result;
          }
        } catch (err) {
          console.warn('Pupil detection method failed:', err);
        }
      }

      roi.delete();

      if (bestResult) {
        return {
          center: {
            x: x + bestResult.cx,
            y: y + bestResult.cy
          },
          size: bestResult.diameter,
          confidence: bestResult.confidence,
          circularity: bestResult.circularity,
          method: bestResult.method
        };
      }

      return null;

    } catch (error) {
      console.error('[analyzePupilPrecise] Error:', error);
      return null;
    }
  };

  // Method 1: Adaptive threshold focusing on darkest regions
  const detectPupilByAdaptiveThreshold = (roi, width, height) => {
    const blurred = new window.cv.Mat();
    const binary = new window.cv.Mat();
    const contours = new window.cv.MatVector();
    const hierarchy = new window.cv.Mat();

    try {
      // Light blur to reduce noise
      window.cv.GaussianBlur(roi, blurred, new window.cv.Size(3, 3), 1);
      
      // Adaptive threshold to find dark regions (pupils)
      window.cv.adaptiveThreshold(
        blurred, binary, 255,
        window.cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        window.cv.THRESH_BINARY_INV, // INV to make dark regions white
        7, 3
      );

      // Find contours
      window.cv.findContours(binary, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE);

      let bestPupil = null;
      let bestScore = 0;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = window.cv.contourArea(contour);
        
        // Pupil should be smaller - typically 8-25 pixels diameter in this ROI
        if (area < 15 || area > 400) continue;

        const moments = window.cv.moments(contour);
        if (moments.m00 === 0) continue;

        const cx = moments.m10 / moments.m00;
        const cy = moments.m01 / moments.m00;
        
        // Check circularity
        const perimeter = window.cv.arcLength(contour, true);
        const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
        
        // Distance from ROI center (pupils are usually central in iris)
        const centerDist = Math.sqrt((cx - width/2)**2 + (cy - height/2)**2);
        const centerScore = Math.max(0, 1 - centerDist / (width/4));
        
        // Score based on circularity, area, and centrality
        const score = circularity * 0.6 + centerScore * 0.4;
        
        if (score > bestScore && circularity > 0.4) {
          bestScore = score;
          const diameter = 2 * Math.sqrt(area / Math.PI);
          
          bestPupil = {
            cx, cy, diameter,
            confidence: score,
            circularity: circularity,
            method: 'adaptive'
          };
        }
      }

      return bestPupil;

    } finally {
      blurred.delete();
      binary.delete();
      contours.delete();
      hierarchy.delete();
    }
  };

  // Method 2: Otsu thresholding for automatic threshold selection
  const detectPupilByOtsu = (roi, width, height) => {
    const blurred = new window.cv.Mat();
    const binary = new window.cv.Mat();
    const contours = new window.cv.MatVector();
    const hierarchy = new window.cv.Mat();

    try {
      window.cv.GaussianBlur(roi, blurred, new window.cv.Size(3, 3), 1);
      
      // Otsu's method for automatic thresholding
      const threshold = window.cv.threshold(blurred, binary, 0, 255, 
        window.cv.THRESH_BINARY_INV + window.cv.THRESH_OTSU);

      window.cv.findContours(binary, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE);

      let bestPupil = null;
      let bestScore = 0;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = window.cv.contourArea(contour);
        
        if (area < 15 || area > 400) continue;

        const moments = window.cv.moments(contour);
        if (moments.m00 === 0) continue;

        const cx = moments.m10 / moments.m00;
        const cy = moments.m01 / moments.m00;
        
        const perimeter = window.cv.arcLength(contour, true);
        const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
        
        const centerDist = Math.sqrt((cx - width/2)**2 + (cy - height/2)**2);
        const centerScore = Math.max(0, 1 - centerDist / (width/4));
        
        const score = circularity * 0.7 + centerScore * 0.3;
        
        if (score > bestScore && circularity > 0.3) {
          bestScore = score;
          const diameter = 2 * Math.sqrt(area / Math.PI);
          
          bestPupil = {
            cx, cy, diameter,
            confidence: score * 0.9, // Slightly lower confidence for Otsu
            circularity: circularity,
            method: 'otsu'
          };
        }
      }

      return bestPupil;

    } finally {
      blurred.delete();
      binary.delete();
      contours.delete();
      hierarchy.delete();
    }
  };

  // Method 3: Find darkest region (pupil is typically the darkest part)
  const detectPupilByMinValue = (roi, width, height) => {
    try {
      const blurred = new window.cv.Mat();
      window.cv.GaussianBlur(roi, blurred, new window.cv.Size(5, 5), 1.5);

      // Find minimum value location (darkest point)
      const minMaxLoc = window.cv.minMaxLoc(blurred);
      const darkestX = minMaxLoc.minLoc.x;
      const darkestY = minMaxLoc.minLoc.y;
      const darkestValue = minMaxLoc.minVal;

      blurred.delete();

      // Estimate pupil size based on darkness gradient
      let radius = 5;
      const centerValue = roi.ucharAt(darkestY, darkestX);
      
      // Expand outward until brightness increases significantly
      for (let r = 1; r < 15; r++) {
        let avgBrightness = 0;
        let count = 0;
        
        // Sample around circle at radius r
        for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 8) {
          const x = Math.round(darkestX + r * Math.cos(angle));
          const y = Math.round(darkestY + r * Math.sin(angle));
          
          if (x >= 0 && x < width && y >= 0 && y < height) {
            avgBrightness += roi.ucharAt(y, x);
            count++;
          }
        }
        
        if (count > 0) {
          avgBrightness /= count;
          
          // If brightness increases significantly, we've found the pupil edge
          if (avgBrightness > centerValue + 25) {
            radius = r;
            break;
          }
        }
      }

      const diameter = radius * 2;
      const confidence = Math.min(1, (255 - darkestValue) / 100); // Higher confidence for darker pupils

      return {
        cx: darkestX,
        cy: darkestY,
        diameter: diameter,
        confidence: confidence,
        circularity: 0.8, // Assume reasonable circularity
        method: 'minval'
      };

    } catch (error) {
      return null;
    }
  };

  // Method 4: Contrast-based detection
  const detectPupilByContrastThreshold = (roi, width, height) => {
    try {
      // Calculate mean intensity
      const mean = window.cv.mean(roi);
      const avgIntensity = mean[0];
      
      // Use threshold well below average to catch dark pupils
      const threshold = Math.max(20, avgIntensity * 0.4);

      const binary = new window.cv.Mat();
      const contours = new window.cv.MatVector();
      const hierarchy = new window.cv.Mat();

      window.cv.threshold(roi, binary, threshold, 255, window.cv.THRESH_BINARY_INV);

      window.cv.findContours(binary, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE);

      let bestPupil = null;
      let bestScore = 0;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = window.cv.contourArea(contour);
        
        if (area < 15 || area > 400) continue;

        const moments = window.cv.moments(contour);
        if (moments.m00 === 0) continue;

        const cx = moments.m10 / moments.m00;
        const cy = moments.m01 / moments.m00;
        
        const perimeter = window.cv.arcLength(contour, true);
        const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
        
        const centerDist = Math.sqrt((cx - width/2)**2 + (cy - height/2)**2);
        const centerScore = Math.max(0, 1 - centerDist / (width/4));
        
        const score = circularity * 0.6 + centerScore * 0.4;
        
        if (score > bestScore && circularity > 0.3) {
          bestScore = score;
          const diameter = 2 * Math.sqrt(area / Math.PI);
          
          bestPupil = {
            cx, cy, diameter,
            confidence: score,
            circularity: circularity,
            method: 'contrast'
          };
        }
      }

      binary.delete();
      contours.delete();
      hierarchy.delete();

      return bestPupil;

    } catch (error) {
      return null;
    }
  };

  return detectPupil;
}