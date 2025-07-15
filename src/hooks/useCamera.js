import { useEffect, useRef } from 'react';

export default function useCamera(videoRef, onFrame) {
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        const loop = async () => {
          if (videoRef.current && onFrame) {
            await onFrame(videoRef.current);
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.error('Camera error:', err);
      }
    };

    startCamera();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [videoRef, onFrame]);

  return null;
}