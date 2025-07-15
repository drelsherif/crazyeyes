import React, { useRef, useState, useCallback } from 'react';
import useCamera from '../hooks/useCamera';
import useFaceMesh from '../hooks/useFaceMesh';
import usePupilDetection from '../hooks/usePupilDetection';
import OverlayCanvas from './OverlayCanvas';

function VideoPlayer({ onLandmarks }) {
  const videoRef = useRef(null);
  const [landmarks, setLandmarks] = useState(null);
  const detectPupil = usePupilDetection();

  const faceMeshRef = useFaceMesh(results => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      setLandmarks(results.multiFaceLandmarks[0]);
    }
  });

  const handleFrame = useCallback(async (video) => {
    if (faceMeshRef.current && video.readyState >= 2) {
      await faceMeshRef.current.send({ image: video });
      if (landmarks && onLandmarks) {
        const pupil = detectPupil(video, landmarks);
        if (pupil) onLandmarks(pupil);
      }
    }
  }, [faceMeshRef, landmarks, detectPupil, onLandmarks]);

  useCamera(videoRef, handleFrame);

  return (
    <div className="relative aspect-video max-w-3xl mx-auto bg-gray-800 rounded-lg overflow-hidden shadow-lg">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        muted
        playsInline
        autoPlay
      />
      <OverlayCanvas videoRef={videoRef} landmarks={landmarks} />
    </div>
  );
}

export default VideoPlayer;