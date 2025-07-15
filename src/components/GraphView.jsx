// components/GraphView.jsx
import React from "react";

function GraphView({ data }) {
  if (!data || data.length === 0) return null;

  const width = 600;
  const height = 300;
  const margin = { top: 20, right: 80, bottom: 40, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Extract pupil sizes
  const leftSizes = data.map(d => d.left).filter(size => size !== null);
  const rightSizes = data.map(d => d.right).filter(size => size !== null);
  const allSizes = [...leftSizes, ...rightSizes];

  if (allSizes.length === 0) return null;

  const minSize = Math.min(...allSizes);
  const maxSize = Math.max(...allSizes);
  const range = maxSize - minSize;
  const padding = range * 0.1;

  const yMin = Math.max(0, minSize - padding);
  const yMax = maxSize + padding;

  // Create scale functions
  const xScale = (index) => (index / (data.length - 1)) * chartWidth;
  const yScale = (value) => chartHeight - ((value - yMin) / (yMax - yMin)) * chartHeight;

  // Generate path data for left eye
  const leftPath = data
    .map((d, i) => d.left !== null ? `${xScale(i)},${yScale(d.left)}` : null)
    .filter(point => point !== null)
    .join(' L');

  // Generate path data for right eye
  const rightPath = data
    .map((d, i) => d.right !== null ? `${xScale(i)},${yScale(d.right)}` : null)
    .filter(point => point !== null)
    .join(' L');

  // Generate Y-axis ticks
  const yTicks = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const value = yMin + (yMax - yMin) * (i / tickCount);
    yTicks.push({
      value: value,
      y: yScale(value),
      label: value.toFixed(1)
    });
  }

  // Generate X-axis ticks (time-based)
  const xTicks = [];
  const xTickCount = Math.min(10, data.length);
  for (let i = 0; i < xTickCount; i++) {
    const index = Math.floor(i * (data.length - 1) / (xTickCount - 1));
    if (index < data.length) {
      const timestamp = data[index].timestamp;
      const time = new Date(timestamp).toLocaleTimeString();
      xTicks.push({
        x: xScale(index),
        label: time.split(':').slice(1).join(':') // Show MM:SS
      });
    }
  }

  return (
    <div className="my-8 bg-gray-800 p-4 rounded-lg">
      <h2 className="text-lg font-semibold mb-4 text-center">Pupil Size Over Time</h2>
      
      {/* Statistics Bar */}
      <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
        <div className="text-center">
          <p className="text-gray-400">Duration</p>
          <p className="font-bold">
            {data.length > 0 ? 
              `${Math.round((data[data.length - 1].timestamp - data[0].timestamp) / 1000)}s` : 
              '0s'
            }
          </p>
        </div>
        <div className="text-center">
          <p className="text-gray-400">Samples</p>
          <p className="font-bold">{data.length}</p>
        </div>
        <div className="text-center">
          <p className="text-blue-400">Left Range</p>
          <p className="font-bold text-blue-300">
            {leftSizes.length > 0 ? 
              `${Math.min(...leftSizes).toFixed(1)} - ${Math.max(...leftSizes).toFixed(1)}` : 
              'N/A'
            }
          </p>
        </div>
        <div className="text-center">
          <p className="text-purple-400">Right Range</p>
          <p className="font-bold text-purple-300">
            {rightSizes.length > 0 ? 
              `${Math.min(...rightSizes).toFixed(1)} - ${Math.max(...rightSizes).toFixed(1)}` : 
              'N/A'
            }
          </p>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="flex justify-center">
        <svg width={width} height={height} className="border border-gray-600 rounded bg-gray-900">
          {/* Chart background */}
          <rect 
            x={margin.left} 
            y={margin.top} 
            width={chartWidth} 
            height={chartHeight} 
            fill="#1f2937" 
            stroke="#374151" 
            strokeWidth="1"
          />
          
          {/* Grid lines */}
          <g transform={`translate(${margin.left}, ${margin.top})`}>
            {/* Horizontal grid lines */}
            {yTicks.map((tick, i) => (
              <line
                key={i}
                x1={0}
                y1={tick.y}
                x2={chartWidth}
                y2={tick.y}
                stroke="#374151"
                strokeWidth="0.5"
                opacity="0.5"
              />
            ))}
            
            {/* Vertical grid lines */}
            {xTicks.map((tick, i) => (
              <line
                key={i}
                x1={tick.x}
                y1={0}
                x2={tick.x}
                y2={chartHeight}
                stroke="#374151"
                strokeWidth="0.5"
                opacity="0.5"
              />
            ))}
          </g>

          {/* Y-axis */}
          <g transform={`translate(${margin.left}, ${margin.top})`}>
            <line x1={0} y1={0} x2={0} y2={chartHeight} stroke="#9ca3af" strokeWidth="2"/>
            {yTicks.map((tick, i) => (
              <g key={i}>
                <line x1={-5} y1={tick.y} x2={0} y2={tick.y} stroke="#9ca3af" strokeWidth="1"/>
                <text x={-10} y={tick.y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
                  {tick.label}
                </text>
              </g>
            ))}
            <text x={-40} y={chartHeight / 2} textAnchor="middle" fontSize="12" fill="#9ca3af" transform={`rotate(-90, -40, ${chartHeight / 2})`}>
              Pupil Size (px)
            </text>
          </g>

          {/* X-axis */}
          <g transform={`translate(${margin.left}, ${margin.top + chartHeight})`}>
            <line x1={0} y1={0} x2={chartWidth} y2={0} stroke="#9ca3af" strokeWidth="2"/>
            {xTicks.map((tick, i) => (
              <g key={i}>
                <line x1={tick.x} y1={0} x2={tick.x} y2={5} stroke="#9ca3af" strokeWidth="1"/>
                <text x={tick.x} y={18} textAnchor="middle" fontSize="10" fill="#9ca3af">
                  {tick.label}
                </text>
              </g>
            ))}
            <text x={chartWidth / 2} y={35} textAnchor="middle" fontSize="12" fill="#9ca3af">
              Time
            </text>
          </g>

          {/* Data lines */}
          <g transform={`translate(${margin.left}, ${margin.top})`}>
            {/* Left eye line */}
            {leftPath && (
              <path
                d={`M ${leftPath}`}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            
            {/* Right eye line */}
            {rightPath && (
              <path
                d={`M ${rightPath}`}
                fill="none"
                stroke="#a855f7"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data points */}
            {data.map((d, i) => (
              <g key={i}>
                {d.left !== null && (
                  <circle
                    cx={xScale(i)}
                    cy={yScale(d.left)}
                    r="3"
                    fill="#3b82f6"
                    stroke="#1e40af"
                    strokeWidth="1"
                  />
                )}
                {d.right !== null && (
                  <circle
                    cx={xScale(i)}
                    cy={yScale(d.right)}
                    r="3"
                    fill="#a855f7"
                    stroke="#7c3aed"
                    strokeWidth="1"
                  />
                )}
              </g>
            ))}
          </g>

          {/* Legend */}
          <g transform={`translate(${width - margin.right + 10}, ${margin.top + 20})`}>
            <rect x={0} y={0} width={60} height={40} fill="#1f2937" stroke="#374151" rx="4"/>
            <line x1={5} y1={10} x2={20} y2={10} stroke="#3b82f6" strokeWidth="2"/>
            <circle cx={12.5} cy={10} r="2" fill="#3b82f6"/>
            <text x={25} y={14} fontSize="10" fill="#3b82f6">Left</text>
            <line x1={5} y1={25} x2={20} y2={25} stroke="#a855f7" strokeWidth="2"/>
            <circle cx={12.5} cy={25} r="2" fill="#a855f7"/>
            <text x={25} y={29} fontSize="10" fill="#a855f7">Right</text>
          </g>
        </svg>
      </div>
    </div>
  );
}

export default GraphView;

