import React from 'react';

function RecorderControls({ onStart, onStop, isRecording }) {
  return (
    <div className="flex justify-center mt-4 space-x-4">
      <button
        onClick={onStart}
        className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
        disabled={isRecording}
      >
        Start Recording
      </button>
      <button
        onClick={onStop}
        className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
        disabled={!isRecording}
      >
        Stop Recording
      </button>
    </div>
  );
}

export default RecorderControls;