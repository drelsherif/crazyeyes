import React from 'react';

function GraphView({ data }) {
  return (
    <div className="bg-gray-900 text-white p-4 rounded-lg shadow mt-4">
      <h2 className="text-lg font-semibold mb-2">Pupil Size Over Time</h2>
      <svg width="100%" height="200" viewBox="0 0 400 200">
        <rect width="100%" height="100%" fill="#1f2937" />
        {data.length > 1 && (
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            points={data.map((d, i) =>
              \`\${(i / (data.length - 1)) * 400},\${200 - d}\`
            ).join(" ")}
          />
        )}
      </svg>
    </div>
  );
}

export default GraphView;