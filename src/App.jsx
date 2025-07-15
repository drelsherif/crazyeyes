import React, { useState, useRef } from 'react';
import Header from './components/Header';
import VideoPlayer from './components/VideoPlayer';
import RecorderControls from './components/RecorderControls';
import GraphView from './components/GraphView';
import KalmanFilter from './utils/KalmanFilter';
import { analyzePupilRegion } from './utils/pupilAnalyzer';

function App() {
  const [recording, setRecording] = useState(false);
  const [recordedSizes, setRecordedSizes] = useState([]);
  const kalman = useRef(new KalmanFilter());

  const handleLandmarks = (landmarks) => {
    const video = document.querySelector('video');
    const size = analyzePupilRegion(video, landmarks);
    if (size && recording) {
      const smoothed = kalman.current.update(size);
      setRecordedSizes(prev => [...prev, smoothed]);
    }
  };

  const handleStart = () => {
    setRecordedSizes([]);
    setRecording(true);
  };

  const handleStop = () => {
    setRecording(false);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="p-4">
        <VideoPlayer onLandmarks={handleLandmarks} />
        <RecorderControls onStart={handleStart} onStop={handleStop} isRecording={recording} />
        {recordedSizes.length > 0 && <GraphView data={recordedSizes} />}
      </main>
    </div>
  );
}

export default App;