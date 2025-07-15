// src/utils/pupilAnalyzer.js
export function analyzePupilRegion(videoEl, landmarks) {
  if (!window.cv || !videoEl || !landmarks?.length) return null;

  const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = videoEl.videoWidth;
  ctx.canvas.height = videoEl.videoHeight;
  ctx.drawImage(videoEl, 0, 0);

  const nose = landmarks.find(l => l.name === 'nose');
  const leftIris = landmarks.find(l => l.name === 'leftIris');
  if (!nose || !leftIris) return null;

  const irisX = leftIris.x * videoEl.videoWidth;
  const irisY = leftIris.y * videoEl.videoHeight;
  const size = 50;

  const imageData = ctx.getImageData(irisX - size / 2, irisY - size / 2, size, size);
  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const thresh = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.threshold(blurred, thresh, 30, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let pupilContour = null;

    for (let i = 0; i < contours.size(); i++) {
      const area = cv.contourArea(contours.get(i));
      if (area > maxArea) {
        maxArea = area;
        pupilContour = contours.get(i);
      }
    }

    if (pupilContour) {
      const ellipse = cv.fitEllipse(pupilContour);
      return ellipse.size.width; // diameter as pupil size
    }
  } catch (err) {
    console.error('[pupilAnalyzer] OpenCV error:', err);
  } finally {
    src.delete(); gray.delete(); blurred.delete(); thresh.delete();
    contours.delete(); hierarchy.delete();
  }

  return null;
}
