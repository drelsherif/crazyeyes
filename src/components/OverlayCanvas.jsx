// components/OverlayCanvas.jsx - Properly Aligned Overlays
import React, { useRef, useEffect, memo } from 'react';

const OverlayCanvas = memo(({ 
  videoRef, 
  landmarks, 
  showLeftEye = true, 
  showRightEye = true, 
  pupilData,
  zoomLevel = 1,
  isFlipped = false
}) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !landmarks) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Match video dimensions
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply the same transform as the video to keep overlays aligned
    if (isFlipped) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);
    }

    // Very thin line widths that won't block the pupil
    const thinLineWidth = Math.max(0.5, zoomLevel * 0.3);
    const extraThinLineWidth = Math.max(0.3, zoomLevel * 0.2);
    const pointSize = Math.max(1, zoomLevel * 0.8);
    const fontSize = Math.max(8, zoomLevel * 6);

    // MediaPipe iris landmark indices
    const leftIrisIndices = [468, 469, 470, 471, 472];
    const rightIrisIndices = [473, 474, 475, 476, 477];

    // Helper function to draw minimal pupil indicator
    const drawMinimalPupilIndicator = (irisIndices, pupilSize, color = '#00BFFF', label = '') => {
      if (irisIndices.length === 0) return;

      // Calculate iris center using original landmark coordinates
      const centerX = irisIndices.reduce((sum, i) => sum + landmarks[i].x, 0) / irisIndices.length * canvas.width;
      const centerY = irisIndices.reduce((sum, i) => sum + landmarks[i].y, 0) / irisIndices.length * canvas.height;

      // Draw iris landmarks for debugging at high zoom
      if (zoomLevel >= 3) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;
        irisIndices.forEach(i => {
          const x = landmarks[i].x * canvas.width;
          const y = landmarks[i].y * canvas.height;
          ctx.beginPath();
          ctx.arc(x, y, pointSize * 0.7, 0, 2 * Math.PI);
          ctx.fill();
        });
        ctx.globalAlpha = 1.0;
      }

      // Only draw a tiny center dot - no blocking elements
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, pointSize, 0, 2 * Math.PI);
      ctx.fill();

      // Draw pupil circle if size is available - very thin line
      if (pupilSize && pupilSize > 0) {
        ctx.strokeStyle = color;
        ctx.lineWidth = extraThinLineWidth;
        ctx.globalAlpha = 0.6; // Semi-transparent
        ctx.beginPath();
        ctx.arc(centerX, centerY, (pupilSize / 2), 0, 2 * Math.PI);
        ctx.stroke();
        ctx.globalAlpha = 1.0; // Reset alpha

        // Position text outside the pupil area to avoid blocking
        const textOffset = (pupilSize / 2) + 15;
        let textX = centerX + textOffset;
        let textY = centerY - textOffset;
        
        // When flipped, we need to account for text positioning
        if (isFlipped) {
          // Text will be flipped too, so we need to adjust positioning
          textX = centerX - textOffset - (fontSize * 2);
        }
        
        // Adjust text position if it would go off screen
        const effectiveCanvasWidth = isFlipped ? canvas.width : canvas.width;
        if (!isFlipped && textX + (fontSize * 3) > effectiveCanvasWidth) {
          textX = centerX - textOffset - (fontSize * 3);
        }
        if (textY - fontSize < 0) {
          textY = centerY + textOffset + fontSize;
        }

        // Small text with background for readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        const textWidth = fontSize * 3;
        ctx.fillRect(textX - 2, textY - fontSize, textWidth, fontSize + 4);
        
        ctx.fillStyle = color;
        ctx.font = `${fontSize}px Arial`;
        
        // For flipped canvas, we need to flip text back to be readable
        if (isFlipped) {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.fillText(`${label}:${pupilSize.toFixed(1)}`, -textX - textWidth + 2, textY);
          ctx.restore();
        } else {
          ctx.fillText(`${label}:${pupilSize.toFixed(1)}`, textX, textY);
        }
      }

      // Minimal crosshair - only show at high zoom and keep very small
      if (zoomLevel > 2) {
        ctx.strokeStyle = color;
        ctx.lineWidth = extraThinLineWidth;
        ctx.globalAlpha = 0.4;
        const crossSize = pointSize * 2;
        ctx.beginPath();
        ctx.moveTo(centerX - crossSize, centerY);
        ctx.lineTo(centerX + crossSize, centerY);
        ctx.moveTo(centerX, centerY - crossSize);
        ctx.lineTo(centerX, centerY + crossSize);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    };

    // Optional: Very subtle eye outline (only visible at low zoom)
    const drawSubtleEyeHint = (irisIndices, color) => {
      if (zoomLevel > 1.5) return; // Hide at higher zoom to reduce clutter

      const centerX = irisIndices.reduce((sum, i) => sum + landmarks[i].x, 0) / irisIndices.length * canvas.width;
      const centerY = irisIndices.reduce((sum, i) => sum + landmarks[i].y, 0) / irisIndices.length * canvas.height;

      // Just a tiny circle to indicate eye region
      ctx.strokeStyle = color;
      ctx.lineWidth = extraThinLineWidth;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 25, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    };

    // Draw minimal indicators
    if (showLeftEye) {
      drawSubtleEyeHint(leftIrisIndices, '#00BFFF');
      const leftPupilSize = pupilData?.left?.size || null;
      drawMinimalPupilIndicator(leftIrisIndices, leftPupilSize, '#00BFFF', 'L');
    }
    
    if (showRightEye) {
      drawSubtleEyeHint(rightIrisIndices, '#FF00FF');
      const rightPupilSize = pupilData?.right?.size || null;
      drawMinimalPupilIndicator(rightIrisIndices, rightPupilSize, '#FF00FF', 'R');
    }

    // Restore canvas context if flipped
    if (isFlipped) {
      ctx.restore();
    }

    // UI elements that should NOT be flipped (fixed position overlays)
    // Minimal zoom indicator (smaller and less intrusive)
    if (zoomLevel > 1) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(canvas.width - 60, 10, 50, 20);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `${Math.max(10, fontSize)}px Arial`;
      ctx.fillText(`${zoomLevel.toFixed(1)}x`, canvas.width - 55, 24);
    }

    // Show confidence info only at very high zoom (fixed position)
    if (zoomLevel >= 3 && pupilData) {
      const displayDetailedInfo = (data, x, y, color) => {
        if (!data) return;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(x - 5, y - 35, 80, 40);
        
        ctx.fillStyle = color;
        ctx.font = `${fontSize - 1}px Arial`;
        ctx.fillText(`Conf: ${(data.confidence * 100).toFixed(0)}%`, x, y - 20);
        ctx.fillText(`Circ: ${data.circularity?.toFixed(2) || 'N/A'}`, x, y - 5);
      };

      if (showLeftEye && pupilData.left) {
        displayDetailedInfo(pupilData.left, 10, 60, '#00BFFF');
      }
      
      if (showRightEye && pupilData.right) {
        displayDetailedInfo(pupilData.right, 10, 110, '#FF00FF');
      }
    }

    // Debug indicator to show flip status (fixed position)
    if (isFlipped) {
      ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
      ctx.fillRect(10, canvas.height - 30, 80, 20);
      ctx.fillStyle = '#00FF00';
      ctx.font = '10px Arial';
      ctx.fillText('ALIGNED', 15, canvas.height - 16);
    }

  }, [landmarks, videoRef, showLeftEye, showRightEye, pupilData, zoomLevel, isFlipped]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 10 }}
    />
  );
});

OverlayCanvas.displayName = 'OverlayCanvas';

export default OverlayCanvas;