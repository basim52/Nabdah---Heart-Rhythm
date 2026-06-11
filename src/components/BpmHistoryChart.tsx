import React, { useMemo } from 'react';
import * as d3 from 'd3';

interface BpmHistoryChartProps {
  history: number[];
}

export const BpmHistoryChart: React.FC<BpmHistoryChartProps> = ({ history }) => {
  // Ensure we have at least 2 points to draw a line
  const chartData = useMemo(() => {
    if (history.length === 0) {
      return [72, 72];
    }
    if (history.length === 1) {
      return [history[0], history[0]];
    }
    return history;
  }, [history]);

  // Dimension helpers for the responsive SVG viewBox
  const width = 450;
  const height = 150;
  const margin = { top: 15, right: 20, bottom: 25, left: 35 };

  const {
    linePath,
    areaPath,
    points,
    minVal,
    maxVal,
    yScale,
    xScale,
    yTicks,
    xTicks,
  } = useMemo(() => {
    // 1. Min and Max bounds of the BPM
    const historyMin = Math.min(...chartData);
    const historyMax = Math.max(...chartData);

    // Set nice round bounds for Y-axis (between 60 and 160)
    const minVal = Math.max(50, historyMin - 5);
    const maxVal = Math.min(160, historyMax + 10);

    // 2. Define Scales
    const xScale = d3.scaleLinear()
      .domain([0, chartData.length - 1])
      .range([margin.left, width - margin.right]);

    const yScale = d3.scaleLinear()
      .domain([minVal, maxVal])
      .range([height - margin.bottom, margin.top]);

    // 3. Define Generator functions
    const lineGenerator = d3.line<number>()
      .x((_, idx) => xScale(idx))
      .y((d) => yScale(d))
      .curve(d3.curveMonotoneX);

    const areaGenerator = d3.area<number>()
      .x((_, idx) => xScale(idx))
      .y0(height - margin.bottom)
      .y1((d) => yScale(d))
      .curve(d3.curveMonotoneX);

    const linePath = lineGenerator(chartData) || '';
    const areaPath = areaGenerator(chartData) || '';

    // Create point objects for custom overlay dots
    const points = chartData.map((d, index) => ({
      x: xScale(index),
      y: yScale(d),
      val: d,
      index,
    }));

    // Generate neat ticks for Y axis
    const yTicks = yScale.ticks(4);
    // Generate neat ticks for X axis
    const maxTicks = Math.min(6, chartData.length);
    const xTicks = xScale.ticks(maxTicks).map(Math.round);

    return {
      linePath,
      areaPath,
      points,
      minVal,
      maxVal,
      yScale,
      xScale,
      yTicks,
      xTicks,
    };
  }, [chartData, margin.left, margin.right, margin.top, margin.bottom, width, height]);

  // Determine critical high heart rate styles
  const currentMaxBpm = Math.max(...chartData);
  const isHighBpmThreat = currentMaxBpm > 115;
  const strokeColor = isHighBpmThreat ? '#f43f5e' : '#f97316'; // Crimson red or Orange glow
  const gradientId = 'bpmAreaGradient';
  const glowFilterId = 'bpmLineGlow';

  return (
    <div id="bpm-chart-panel" className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4 text-right space-y-2">
      <div className="flex justify-between items-center border-b border-white/5 pb-1.5 mb-2">
        <span className="text-[10px] font-mono text-white/40 font-bold uppercase tracking-wider">
          CARDIAC RATE LOG (BPM)
        </span>
        <h4 className="text-[11px] text-white/70 font-semibold font-sans flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          مخطط تطور سرعة نبضات القلب
        </h4>
      </div>

      <div className="relative w-full h-[150px] overflow-hidden">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* DEFINITIONS AND FILTERS */}
          <defs>
            {/* Area Gradient */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
            </linearGradient>

            {/* Glowing filter for neon lines */}
            <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={strokeColor} floodOpacity="0.8" />
            </filter>
          </defs>

          {/* GRID LINES LAYER */}
          <g className="opacity-20">
            {yTicks.map((tick, i) => (
              <line
                key={`y-grid-${i}`}
                x1={margin.left}
                y1={yScale(tick)}
                x2={width - margin.right}
                y2={yScale(tick)}
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeDasharray="2,4"
              />
            ))}
          </g>

          {/* AXIS LABELS LAYER */}
          {/* Y-Axis scale label */}
          <g className="text-[9px] font-mono fill-white/40">
            {yTicks.map((tick, i) => (
              <text
                key={`y-label-${i}`}
                x={margin.left - 6}
                y={yScale(tick) + 3}
                textAnchor="end"
              >
                {tick}
              </text>
            ))}
          </g>

          {/* X-Axis time division labels */}
          <g className="text-[8px] font-mono fill-white/30">
            {xTicks.map((tick, i) => {
              if (tick >= chartData.length) return null;
              return (
                <text
                  key={`x-label-${i}`}
                  x={xScale(tick)}
                  y={height - margin.bottom + 14}
                  textAnchor="middle"
                >
                  {tick * 1.5}ث {/* Represent seconds (since recorded every 1.5s) */}
                </text>
              );
            })}
          </g>

          {/* AREA CHART PATH */}
          <path
            d={areaPath}
            fill={`url(#${gradientId})`}
          />

          {/* LINE CHART PATH */}
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            filter={`url(#${glowFilterId})`}
          />

          {/* KEY MILESTONE DOTS */}
          {points.length > 0 && (
            <g>
              {/* Highlight minimum BPM achieved point in blue/cyan */}
              {(() => {
                const minBpmIdx = chartData.indexOf(Math.min(...chartData));
                const pt = points[minBpmIdx];
                if (!pt) return null;
                return (
                  <g key="min-bpm-point">
                    <circle cx={pt.x} cy={pt.y} r="5" fill="#06b6d4" className="animate-pulse" />
                    <circle cx={pt.x} cy={pt.y} r="2.5" fill="#ffffff" />
                  </g>
                );
              })()}

              {/* Highlight Peak Max BPM reached in glowing crimson/red */}
              {(() => {
                const maxBpmIdx = chartData.lastIndexOf(Math.max(...chartData));
                const pt = points[maxBpmIdx];
                if (!pt) return null;
                return (
                  <g key="max-bpm-point">
                    <circle cx={pt.x} cy={pt.y} r="5" fill="#ef4444" className="animate-pulse" />
                    <circle cx={pt.x} cy={pt.y} r="2.5" fill="#ffffff" />
                  </g>
                );
              })()}
            </g>
          )}
        </svg>
      </div>

      <div className="flex justify-between items-center text-[10px] text-white/50 px-1 font-mono pt-1">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          <span>الحد الأدنى: <strong>{Math.min(...chartData)} BPM</strong></span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span>ذروة النبض: <strong className="text-red-400">{Math.max(...chartData)} BPM</strong></span>
        </div>
      </div>
    </div>
  );
};
