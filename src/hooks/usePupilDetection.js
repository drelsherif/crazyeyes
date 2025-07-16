// hooks/usePupilDetection.js - Advanced OpenCV Algorithms
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

  // Advanced Kalman filter with position and velocity tracking
  class AdvancedKalmanFilter {
    constructor(processNoise = 0.1, measurementNoise = 3) {
      this.dt = 1.0; // Time step
      this.processNoise = processNoise;
      this.measurementNoise = measurementNoise;
      
      // State: [x, y, size, vx, vy, vsize]
      this.state = new Array(6).fill(0);
      this.covariance = this.createIdentityMatrix(6, 100);
      this.initialized = false;
    }

    createIdentityMatrix(size, value = 1) {
      const matrix = [];
      for (let i = 0; i < size; i++) {
        matrix[i] = new Array(size).fill(0);
        matrix[i][i] = value;
      }
      return matrix;
    }

    update(measurement) {
      if (!this.initialized) {
        this.state[0] = measurement.x;
        this.state[1] = measurement.y;
        this.state[2] = measurement.size;
        this.state[3] = 0; // vx
        this.state[4] = 0; // vy
        this.state[5] = 0; // vsize
        this.initialized = true;
        return {
          x: this.state[0],
          y: this.state[1],
          size: this.state[2]
        };
      }

      // Predict step
      this.state[0] += this.state[3] * this.dt; // x += vx * dt
      this.state[1] += this.state[4] * this.dt; // y += vy * dt
      this.state[2] += this.state[5] * this.dt; // size += vsize * dt

      // Update step
      const innovation = [
        measurement.x - this.state[0],
        measurement.y - this.state[1],
        measurement.size - this.state[2]
      ];

      // Simple Kalman gain (simplified for performance)
      const gain = 0.3;
      
      this.state[0] += gain * innovation[0];
      this.state[1] += gain * innovation[1];
      this.state[2] += gain * innovation[2];
      
      // Update velocities
      this.state[3] = gain * innovation[0] / this.dt;
      this.state[4] = gain * innovation[1] / this.dt;
      this.state[5] = gain * innovation[2] / this.dt;

      return {
        x: this.state[0],
        y: this.state[1],
        size: this.state[2]
      };
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
    let src, gray, enhanced;
    
    try {
      src = window.cv.matFromImageData(imageData);
      gray = new window.cv.Mat();
      enhanced = new window.cv.Mat();
      
      // Convert to grayscale
      window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);
      
      // Apply histogram equalization for better contrast
      window.cv.equalizeHist(gray, enhanced);

      const results = {};

      // Define eye regions with more landmark points for better ROI
      const eyes = {
        left: { 
          indices: [468, 469, 470, 471, 472], // Iris landmarks
          eyeContour: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], // Eye contour
          center: 468 
        },
        right: { 
          indices: [473, 474, 475, 476, 477], // Iris landmarks
          eyeContour: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398], // Eye contour
          center: 473 
        }
      };

      // Process requested eyes
      const eyesToProcess = eyeType === 'both' ? ['left', 'right'] : [eyeType];

      eyesToProcess.forEach(eye => {
        if (!eyes[eye]) return;

        const result = analyzeEyeAdvanced(enhanced, landmarks, eyes[eye], canvas.width, canvas.height, eye);
        if (result) {
          // Initialize Kalman filter if needed
          if (!kalmanFilters.current[eye]) {
            kalmanFilters.current[eye] = new AdvancedKalmanFilter(0.1, 2);
          }

          // Apply advanced Kalman filtering
          const filtered = kalmanFilters.current[eye].update(result);
          
          results[eye] = {
            center: { x: filtered.x, y: filtered.y },
            size: filtered.size,
            rawSize: result.size,
            rawCenter: result.center,
            confidence: result.confidence,
            circularity: result.circularity,
            contrast: result.contrast,
            stability: calculateStability(result, previousPupils.current[eye])
          };
          
          // Store for stability calculation
          previousPupils.current[eye] = result;
        }
      });

      return Object.keys(results).length > 0 ? results : null;

    } catch (error) {
      console.error('[usePupilDetection] Error:', error);
      return null;
    } finally {
      if (src) src.delete();
      if (gray) gray.delete();
      if (enhanced) enhanced.delete();
    }
  }, []);

  const analyzeEyeAdvanced = (grayImage, landmarks, eyeConfig, imageWidth, imageHeight, eyeName) => {
    const { indices, eyeContour, center } = eyeConfig;
    
    try {
      // Calculate more precise ROI using eye contour
      const eyePoints = eyeContour.map(i => ({
        x: landmarks[i].x * imageWidth,
        y: landmarks[i].y * imageHeight
      }));
      
      // Find bounding box of eye
      const minX = Math.min(...eyePoints.map(p => p.x));
      const maxX = Math.max(...eyePoints.map(p => p.x));
      const minY = Math.min(...eyePoints.map(p => p.y));
      const maxY = Math.max(...eyePoints.map(p => p.y));
      
      // Add padding and ensure bounds
      const padding = 15;
      const x = Math.max(0, Math.floor(minX - padding));
      const y = Math.max(0, Math.floor(minY - padding));
      const width = Math.min(grayImage.cols - x, Math.floor(maxX - minX + 2 * padding));
      const height = Math.min(grayImage.rows - y, Math.floor(maxY - minY + 2 * padding));

      if (width <= 0 || height <= 0) return null;

      // Extract ROI
      const roi = grayImage.roi(new window.cv.Rect(x, y, width, height));
      
      // Multi-algorithm approach for robust detection
      const candidates = [];
      
      // Method 1: Starburst algorithm (simplified)
      const starburstResult = starburstPupilDetection(roi, width, height);
      if (starburstResult) candidates.push({ ...starburstResult, method: 'starburst' });
      
      // Method 2: Advanced thresholding with morphology
      const thresholdResult = advancedThresholdDetection(roi, width, height);
      if (thresholdResult) candidates.push({ ...thresholdResult, method: 'threshold' });
      
      // Method 3: Hough circles (if available)
      const houghResult = houghCircleDetection(roi, width, height);
      if (houghResult) candidates.push({ ...houghResult, method: 'hough' });
      
      // Method 4: Gradient-based detection
      const gradientResult = gradientBasedDetection(roi, width, height);
      if (gradientResult) candidates.push({ ...gradientResult, method: 'gradient' });

      roi.delete();

      if (candidates.length === 0) return null;

      // Select best candidate using multiple criteria
      const bestCandidate = selectBestCandidate(candidates);
      
      if (bestCandidate) {
        return {
          center: {
            x: x + bestCandidate.cx,
            y: y + bestCandidate.cy
          },
          size: bestCandidate.diameter,
          confidence: bestCandidate.confidence,
          circularity: bestCandidate.circularity,
          contrast: bestCandidate.contrast || 0,
          method: bestCandidate.method
        };
      }

      return null;

    } catch (error) {
      console.error(`[analyzeEyeAdvanced ${eyeName}] Error:`, error);
      return null;
    }
  };

  // Starburst algorithm implementation
  const starburstPupilDetection = (roi, width, height) => {
    try {
      const blurred = new window.cv.Mat();
      const sobel = new window.cv.Mat();
      const sobelX = new window.cv.Mat();
      const sobelY = new window.cv.Mat();
      
      // Preprocessing
      window.cv.GaussianBlur(roi, blurred, new window.cv.Size(5, 5), 1.5);
      
      // Calculate gradients
      window.cv.Sobel(blurred, sobelX, window.cv.CV_32F, 1, 0, 3);
      window.cv.Sobel(blurred, sobelY, window.cv.CV_32F, 0, 1, 3);
      window.cv.magnitude(sobelX, sobelY, sobel);
      
      // Find center of strongest gradients (simplified starburst)
      let maxGradient = 0;
      let centerX = width / 2;
      let centerY = height / 2;
      
      const stepSize = 2;
      for (let y = stepSize; y < height - stepSize; y += stepSize) {
        for (let x = stepSize; x < width - stepSize; x += stepSize) {
          const gradient = sobel.floatAt(y, x);
          if (gradient > maxGradient) {
            maxGradient = gradient;
            centerX = x;
            centerY = y;
          }
        }
      }
      
      // Estimate diameter based on gradient falloff
      let diameter = estimateDiameterFromGradients(sobel, centerX, centerY, width, height);
      
      // Calculate confidence based on gradient strength
      const avgGradient = calculateAverageGradient(sobel);
      const confidence = Math.min(1, maxGradient / (avgGradient * 3));
      
      blurred.delete();
      sobel.delete();
      sobelX.delete();
      sobelY.delete();
      
      return {
        cx: centerX,
        cy: centerY,
        diameter: diameter,
        confidence: confidence,
        circularity: 0.8 // Estimated for starburst
      };
      
    } catch (error) {
      console.error('[starburstPupilDetection] Error:', error);
      return null;
    }
  };

  // Advanced threshold detection with multiple thresholds
  const advancedThresholdDetection = (roi, width, height) => {
    try {
      const blurred = new window.cv.Mat();
      const binary = new window.cv.Mat();
      const morphed = new window.cv.Mat();
      const contours = new window.cv.MatVector();
      const hierarchy = new window.cv.Mat();
      
      window.cv.GaussianBlur(roi, blurred, new window.cv.Size(5, 5), 1.5);
      
      const bestResults = [];
      
      // Try multiple threshold values
      const thresholds = [30, 40, 50, 60, 70];
      
      for (const thresh of thresholds) {
        window.cv.threshold(blurred, binary, thresh, 255, window.cv.THRESH_BINARY_INV);
        
        // Morphological operations
        const kernel = window.cv.getStructuringElement(window.cv.MORPH_ELLIPSE, new window.cv.Size(3, 3));
        window.cv.morphologyEx(binary, morphed, window.cv.MORPH_CLOSE, kernel);
        window.cv.morphologyEx(morphed, morphed, window.cv.MORPH_OPEN, kernel);
        kernel.delete();
        
        // Find contours
        window.cv.findContours(morphed, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE);
        
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          const area = window.cv.contourArea(contour);
          
          if (area > 30 && area < 1000) {
            const moments = window.cv.moments(contour);
            if (moments.m00 === 0) continue;
            
            const cx = moments.m10 / moments.m00;
            const cy = moments.m01 / moments.m00;
            
            // Calculate circularity and other metrics
            const perimeter = window.cv.arcLength(contour, true);
            const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
            
            if (circularity > 0.3) {
              const diameter = 2 * Math.sqrt(area / Math.PI);
              const confidence = circularity * Math.min(1, area / 200);
              
              bestResults.push({
                cx, cy, diameter, confidence, circularity,
                area, threshold: thresh
              });
            }
          }
        }
        
        contours.delete();
        hierarchy.delete();
      }
      
      blurred.delete();
      binary.delete();
      morphed.delete();
      
      if (bestResults.length === 0) return null;
      
      // Return best result
      return bestResults.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
      
    } catch (error) {
      console.error('[advancedThresholdDetection] Error:', error);
      return null;
    }
  };

  // Hough Circle Detection
  const houghCircleDetection = (roi, width, height) => {
    try {
      const blurred = new window.cv.Mat();
      const circles = new window.cv.Mat();
      
      window.cv.GaussianBlur(roi, blurred, new window.cv.Size(9, 9), 2);
      
      // HoughCircles parameters optimized for pupils
      window.cv.HoughCircles(
        blurred, circles,
        window.cv.HOUGH_GRADIENT, 1, 20, // dp, minDist
        50, 30, // param1, param2
        5, 50   // minRadius, maxRadius
      );
      
      if (circles.cols > 0) {
        // Get the best circle (first one)
        const cx = circles.data32F[0];
        const cy = circles.data32F[1];
        const radius = circles.data32F[2];
        
        blurred.delete();
        circles.delete();
        
        return {
          cx, cy,
          diameter: radius * 2,
          confidence: 0.7,
          circularity: 0.9
        };
      }
      
      blurred.delete();
      circles.delete();
      return null;
      
    } catch (error) {
      // HoughCircles might not be available in all OpenCV.js builds
      return null;
    }
  };

  // Gradient-based detection
  const gradientBasedDetection = (roi, width, height) => {
    try {
      const blurred = new window.cv.Mat();
      const gradX = new window.cv.Mat();
      const gradY = new window.cv.Mat();
      const magnitude = new window.cv.Mat();
      
      window.cv.GaussianBlur(roi, blurred, new window.cv.Size(5, 5), 1.0);
      window.cv.Sobel(blurred, gradX, window.cv.CV_32F, 1, 0, 3);
      window.cv.Sobel(blurred, gradY, window.cv.CV_32F, 0, 1, 3);
      window.cv.magnitude(gradX, gradY, magnitude);
      
      // Find center of mass of strong gradients
      let totalWeight = 0;
      let weightedX = 0;
      let weightedY = 0;
      
      for (let y = 5; y < height - 5; y++) {
        for (let x = 5; x < width - 5; x++) {
          const mag = magnitude.floatAt(y, x);
          if (mag > 20) { // Threshold for significant gradients
            totalWeight += mag;
            weightedX += x * mag;
            weightedY += y * mag;
          }
        }
      }
      
      if (totalWeight > 0) {
        const centerX = weightedX / totalWeight;
        const centerY = weightedY / totalWeight;
        
        // Estimate diameter based on gradient distribution
        const diameter = estimateDiameterFromGradientDistribution(magnitude, centerX, centerY, width, height);
        
        blurred.delete();
        gradX.delete();
        gradY.delete();
        magnitude.delete();
        
        return {
          cx: centerX,
          cy: centerY,
          diameter: diameter,
          confidence: Math.min(1, totalWeight / 5000),
          circularity: 0.7
        };
      }
      
      blurred.delete();
      gradX.delete();
      gradY.delete();
      magnitude.delete();
      
      return null;
      
    } catch (error) {
      console.error('[gradientBasedDetection] Error:', error);
      return null;
    }
  };

  // Helper functions
  const estimateDiameterFromGradients = (gradientMat, centerX, centerY, width, height) => {
    let maxRadius = 0;
    const directions = 8;
    
    for (let i = 0; i < directions; i++) {
      const angle = (i * 2 * Math.PI) / directions;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      
      let radius = 0;
      for (let r = 1; r < 30; r++) {
        const x = Math.round(centerX + dx * r);
        const y = Math.round(centerY + dy * r);
        
        if (x < 0 || x >= width || y < 0 || y >= height) break;
        
        const gradient = gradientMat.floatAt(y, x);
        if (gradient < 10) break; // Found edge
        
        radius = r;
      }
      
      maxRadius = Math.max(maxRadius, radius);
    }
    
    return maxRadius * 2;
  };

  const calculateAverageGradient = (gradientMat) => {
    let sum = 0;
    let count = 0;
    const rows = gradientMat.rows;
    const cols = gradientMat.cols;
    
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        sum += gradientMat.floatAt(y, x);
        count++;
      }
    }
    
    return count > 0 ? sum / count : 0;
  };

  const estimateDiameterFromGradientDistribution = (magnitude, centerX, centerY, width, height) => {
    const distances = [];
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const mag = magnitude.floatAt(y, x);
        if (mag > 15) {
          const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
          distances.push(dist);
        }
      }
    }
    
    if (distances.length === 0) return 20;
    
    distances.sort((a, b) => a - b);
    const percentile90 = distances[Math.floor(distances.length * 0.9)];
    return percentile90 * 2;
  };

  const selectBestCandidate = (candidates) => {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    
    // Score candidates based on multiple criteria
    const scoredCandidates = candidates.map(candidate => {
      let score = 0;
      
      // Confidence weight
      score += candidate.confidence * 0.4;
      
      // Circularity weight
      score += candidate.circularity * 0.3;
      
      // Size reasonableness (prefer mid-range sizes)
      const sizeScore = candidate.diameter > 10 && candidate.diameter < 60 ? 1 : 0.5;
      score += sizeScore * 0.2;
      
      // Method preference (starburst and hough are generally more reliable)
      const methodBonus = candidate.method === 'starburst' ? 0.1 : 
                         candidate.method === 'hough' ? 0.1 : 0;
      score += methodBonus;
      
      return { ...candidate, score };
    });
    
    // Return highest scoring candidate
    return scoredCandidates.reduce((best, current) => 
      current.score > best.score ? current : best
    );
  };

  const calculateStability = (current, previous) => {
    if (!previous) return 0.5;
    
    const centerDist = Math.sqrt(
      (current.center.x - previous.center.x) ** 2 + 
      (current.center.y - previous.center.y) ** 2
    );
    const sizeDiff = Math.abs(current.size - previous.size);
    
    // Higher stability for smaller changes
    const centerStability = Math.max(0, 1 - centerDist / 10);
    const sizeStability = Math.max(0, 1 - sizeDiff / 5);
    
    return (centerStability + sizeStability) / 2;
  };

  return detectPupil;
}