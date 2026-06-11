/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

interface EKGMonitorProps {
  currentBPM: number;
  triggerBeatSign: boolean; // Toggles on each beat to schedule an EKG sequence
  isLowHealth: boolean;     // Low health creates chaotic, erratic, or fast signals!
  isFlatline: boolean;      // Flatline creates a flat straight line!
}

export const EKGMonitor: React.FC<EKGMonitorProps> = ({
  currentBPM,
  triggerBeatSign,
  isLowHealth,
  isFlatline,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataPointsRef = useRef<number[]>([]);
  const beatIndexRef = useRef<number>(-1);
  const lastBeatSignRef = useRef<boolean>(triggerBeatSign);

  // Constants
  const maxPoints = 200;
  const baseline = 60; // middle of the canvas

  useEffect(() => {
    // Fill initial points with baseline + micro noise
    if (dataPointsRef.current.length === 0) {
      dataPointsRef.current = Array(maxPoints).fill(baseline);
    }
  }, []);

  // Handle a new beat trigger
  useEffect(() => {
    if (triggerBeatSign !== lastBeatSignRef.current && !isFlatline) {
      lastBeatSignRef.current = triggerBeatSign;
      beatIndexRef.current = 0; // Starts the EKG sequence
    }
  }, [triggerBeatSign, isFlatline]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrame: number;

    const updateAndRender = () => {
      const points = dataPointsRef.current;
      
      let nextY = baseline;

      if (isFlatline) {
        // Flatline has absolute minimal noise (near death) or just a dead-straight line
        nextY = baseline + (Math.random() - 0.5) * 0.4;
      } else {
        // Normal or low health
        // P-Q-R-S-T Sequence Generator
        const seqIndex = beatIndexRef.current;
        if (seqIndex >= 0) {
          // Structure of the wave sequence over e.g., 20 frames
          // Phase 0-3: P wave (small up bump)
          // Phase 4-5: Q wave (dip down)
          // Phase 6-8: R wave (huge sharp up spike)
          // Phase 9-11: S wave (sharp deep down dip)
          // Phase 12-18: T wave (gentle up curve)
          // Phase 19+: back to baseline
          if (seqIndex <= 3) {
            nextY = baseline - 4; // P
          } else if (seqIndex <= 5) {
            nextY = baseline + 3; // Q
          } else if (seqIndex <= 8) {
            // R: scale higher if low health (tachycardic alarm) or standard
            const spikeScale = isLowHealth ? 45 : 35;
            nextY = baseline - spikeScale; 
          } else if (seqIndex <= 11) {
            const dipScale = isLowHealth ? 20 : 15;
            nextY = baseline + dipScale; // S
          } else if (seqIndex <= 17) {
            nextY = baseline - 6; // T
          } else {
            nextY = baseline;
          }

          // Advance sequence
          beatIndexRef.current += 1;
          if (beatIndexRef.current > 25) {
            beatIndexRef.current = -1; // back to rest noise
          }
        } else {
          // Rest noise, slightly rougher if health is low
          const noiseFactor = isLowHealth ? 3 : 1;
          nextY = baseline + (Math.random() - 0.5) * noiseFactor;
        }
      }

      // Add of new point, shift left
      points.push(nextY);
      if (points.length > maxPoints) {
        points.shift();
      }

      // Render
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Grid Lines (hospital monitor look - frosted glass scanlines)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'; // Subtle scanlines
      ctx.lineWidth = 1;
      
      // Vertical grid lines
      for (let x = 0; x < canvas.width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      // Horizontal grid lines
      for (let y = 0; y < canvas.height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw active heartbeat line with a neon glow (Red/Emerald)
      ctx.shadowBlur = isFlatline ? 2 : (isLowHealth ? 16 : 10);
      ctx.shadowColor = isFlatline ? '#ff1a1a' : (isLowHealth ? '#f43f5e' : '#10b981');
      ctx.strokeStyle = isFlatline ? '#f87171' : (isLowHealth ? '#f43f5e' : '#34d399');
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const x = (i / (maxPoints - 1)) * canvas.width;
        if (i === 0) {
          ctx.moveTo(x, points[i]);
        } else {
          ctx.lineTo(x, points[i]);
        }
      }
      ctx.stroke();

      // Reset shadows
      ctx.shadowBlur = 0;

      // Draw vital text overlays
      ctx.font = 'bold 11px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = isFlatline ? '#f87171' : (isLowHealth ? '#f43f5e' : '#34d399');
      
      let statusText = 'ECG: مستقر (Stable)';
      if (isFlatline) statusText = 'ECG: توقف قلب (Asystole)';
      else if (isLowHealth) statusText = 'ECG: تسارع شديد (Tachycardia)';

      ctx.fillText(statusText, 10, 20);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(`RATE: ${currentBPM} BPM`, canvas.width - 90, 20);

      animFrame = requestAnimationFrame(updateAndRender);
    };

    animFrame = requestAnimationFrame(updateAndRender);

    return () => {
      cancelAnimationFrame(animFrame);
    };
  }, [currentBPM, isLowHealth, isFlatline]);

  return (
    <div id="ekg-container" className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden relative shadow-inner">
      <div className="absolute top-2 right-2 bg-red-500/10 text-red-500 text-[9px] px-1.5 py-0.5 rounded font-mono border border-red-500/20 flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${isFlatline ? 'bg-red-500' : 'bg-red-500 animate-pulse'}`} />
        {isFlatline ? 'OFFLINE' : 'LIVE FEED'}
      </div>
      <canvas
        ref={canvasRef}
        width={380}
        height={100}
        className="w-full h-24 block"
      />
    </div>
  );
};
