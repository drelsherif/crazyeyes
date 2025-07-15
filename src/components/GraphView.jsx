import React from "react";

function GraphView({ data }) {
  return (
    <div className="my-8">
      <h2 className="text-lg font-semibold mb-2">Pupil Size Over Time</h2>
      <svg width="400" height="200" className="border border-white rounded bg-gray-800">
        <polyline
          fill="none"
          stroke="cyan"
          strokeWidth="2"
          points={data.map((d, i) =>
            `${(i / (data.length - 1)) * 400},${200 - d}`
          ).join(" ")}
        />
      </svg>
    </div>
  );
}

export default GraphView;

