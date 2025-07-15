import { useCallback } from 'react';

export default function usePupilDetection() {
  const detectPupil = useCallback((video, landmarks) => {
    if (!window.cv || !landmarks) return null;

    const indices = [468, 469, 470, 471, 472]; // left eye iris
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = window.cv.matFromImageData(imageData);
    const gray = new window.cv.Mat();
    window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);

    // Calculate ROI
    const points = indices.map(i => landmarks[i]);
    const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length * canvas.width;
    const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length * canvas.height;
    const radius = Math.max(...points.map(p =>
      Math.sqrt(((p.x * canvas.width) - centerX) ** 2 + ((p.y * canvas.height) - centerY) ** 2)
    )) + 10;

    const x = Math.max(0, Math.floor(centerX - radius));
    const y = Math.max(0, Math.floor(centerY - radius));
    const width = Math.min(gray.cols - x, Math.floor(radius * 2));
    const height = Math.min(gray.rows - y, Math.floor(radius * 2));

    const roi = gray.roi(new window.cv.Rect(x, y, width, height));
    const blurred = new window.cv.Mat();
    const binary = new window.cv.Mat();
    window.cv.GaussianBlur(roi, blurred, new window.cv.Size(5, 5), 0);
    window.cv.threshold(blurred, binary, 40, 255, window.cv.THRESH_BINARY_INV);

    const contours = new window.cv.MatVector();
    const hierarchy = new window.cv.Mat();
    window.cv.findContours(binary, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE);

    let best = null;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = window.cv.contourArea(cnt);
      if (area > 20 && area < 300) {
        const moments = window.cv.moments(cnt);
        const cx = x + (moments.m10 / moments.m00);
        const cy = y + (moments.m01 / moments.m00);
        best = {
          center: { x: cx, y: cy },
          size: Math.sqrt(area / Math.PI) * 2
        };
      }
    }

    // Cleanup
    src.delete(); gray.delete(); roi.delete(); blurred.delete(); binary.delete(); contours.delete(); hierarchy.delete();

    return best;
  }, []);

  return detectPupil;
}