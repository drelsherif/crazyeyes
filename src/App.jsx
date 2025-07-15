// App.jsx
import React, { useState, useCallback } from "react";
import "./index.css";
import VideoPlayer from "./components/VideoPlayer";
import Header from "./components/Header";
import GraphView from "./components/GraphView";
import RecorderControls from "./components/RecorderControls";

const App = () => {
  const [pupilHistory, setPupilHistory] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [currentPupilData, setCurrentPupilData] = useState(null);

  // Handle new pupil data from VideoPlayer
  const handlePupilData = useCallback((data) => {
    setCurrentPupilData(data);
    
    // If recording, add to history
    if (isRecording) {
      const timestamp = Date.now();
      const entry = {
        timestamp,
        left: data.left?.size || null,
        right: data.right?.size || null,
        leftConfidence: data.left?.confidence || null,
        rightConfidence: data.right?.confidence || null,
      };
      
      setPupilHistory(prev => [...prev, entry]);
    }
  }, [isRecording]);

  // Recording controls
  const startRecording = () => {
    setIsRecording(true);
    setPupilHistory([]);
  };

  const stopRecording = () => {
    setIsRecording(false);
  };

  // Calculate average pupil sizes for display
  const getAverageSizes = () => {
    if (pupilHistory.length === 0) return { left: 0, right: 0 };
    
    const leftSizes = pupilHistory.filter(h => h.left !== null).map(h => h.left);
    const rightSizes = pupilHistory.filter(h => h.right !== null).map(h => h.right);
    
    const avgLeft = leftSizes.length > 0 ? leftSizes.reduce((a, b) => a + b, 0) / leftSizes.length : 0;
    const avgRight = rightSizes.length > 0 ? rightSizes.reduce((a, b) => a + b, 0) / rightSizes.length : 0;
    
    return { left: avgLeft, right: avgRight };
  };

  const averages = getAverageSizes();

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        {/* Main Video Player */}
        <VideoPlayer onPupilData={handlePupilData} />
        
        {/* Recording Controls */}
        <div className="mt-6">
          <RecorderControls
            onStart={startRecording}
            onStop={stopRecording}
            isRecording={isRecording}
          />
        </div>

        {/* Current Measurements Display */}
        {currentPupilData && (
          <div className="mt-6 bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Current Measurements</h3>
            <div className="grid grid-cols-2 gap-4">
              {currentPupilData.left && (
                <div className="bg-blue-900 p-3 rounded">
                  <h4 className="font-medium text-blue-300">Left Eye</h4>
                  <p className="text-xl font-bold">{currentPupilData.left.size.toFixed(1)} px</p>
                  <p className="text-sm text-gray-300">
                    Confidence: {(currentPupilData.left.confidence * 100).toFixed(0)}%
                  </p>
                  <p className="text-sm text-gray-300">
                    Circularity: {currentPupilData.left.circularity?.toFixed(2) || 'N/A'}
                  </p>
                </div>
              )}
              
              {currentPupilData.right && (
                <div className="bg-purple-900 p-3 rounded">
                  <h4 className="font-medium text-purple-300">Right Eye</h4>
                  <p className="text-xl font-bold">{currentPupilData.right.size.toFixed(1)} px</p>
                  <p className="text-sm text-gray-300">
                    Confidence: {(currentPupilData.right.confidence * 100).toFixed(0)}%
                  </p>
                  <p className="text-sm text-gray-300">
                    Circularity: {currentPupilData.right.circularity?.toFixed(2) || 'N/A'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recording Status and Statistics */}
        {isRecording && (
          <div className="mt-6 bg-red-900 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="font-semibold">Recording...</span>
            </div>
            <p className="text-sm">Samples collected: {pupilHistory.length}</p>
          </div>
        )}

        {/* Session Statistics */}
        {pupilHistory.length > 0 && (
          <div className="mt-6 bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Session Statistics</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-gray-400">Samples</p>
                <p className="text-xl font-bold">{pupilHistory.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Avg Left</p>
                <p className="text-xl font-bold text-blue-400">
                  {averages.left.toFixed(1)} px
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Avg Right</p>
                <p className="text-xl font-bold text-purple-400">
                  {averages.right.toFixed(1)} px
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Graph View */}
        {pupilHistory.length > 1 && (
          <div className="mt-6">
            <GraphView data={pupilHistory} />
          </div>
        )}
      </div>
    </div>
  );
};

export default App;