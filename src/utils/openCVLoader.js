// utils/openCVLoader.js
let openCVLoaded = false;
let openCVPromise = null;

export const loadOpenCV = () => {
  if (openCVLoaded) return Promise.resolve();
  if (openCVPromise) return openCVPromise;

  openCVPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
    script.async = true;
    
    script.onload = () => {
      const checkCV = () => {
        if (window.cv && window.cv.Mat) {
          openCVLoaded = true;
          resolve();
        } else {
          setTimeout(checkCV, 100);
        }
      };
      checkCV();
    };
    
    script.onerror = () => reject(new Error('Failed to load OpenCV'));
    document.head.appendChild(script);
  });

  return openCVPromise;
};