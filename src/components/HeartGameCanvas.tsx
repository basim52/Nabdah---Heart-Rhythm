/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from 'react';
import { GameNode, HitParticle, FloatingText, NodeType } from '../types';

interface HeartGameCanvasProps {
  nodes: GameNode[];
  particles: HitParticle[];
  floatingTexts: FloatingText[];
  heartHealth: number;
  currentBPM: number;
  beatScale: number; // Values around 1.0 to 1.3 representing standard beat scaling
  isOnBeat: boolean;  // Indicator if we are currently inside the Perfect timing zone
  score: number;
  combo: number;
  onTapNode: (id: string, isPerfect: boolean, tapX: number, tapY: number) => void;
  onMissNode: (id: string) => void;
  isPaused: boolean;
  currentLevel?: number;
  gameMode?: 'ENDLESS' | 'TIMED' | 'LEVELS';
}

export const HeartGameCanvas: React.FC<HeartGameCanvasProps> = ({
  nodes,
  particles,
  floatingTexts,
  heartHealth,
  currentBPM,
  beatScale,
  isOnBeat,
  score,
  combo,
  onTapNode,
  onMissNode,
  isPaused,
  currentLevel = 1,
  gameMode = 'ENDLESS',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Center is determined inside the render loop
  const heartBaseRadius = 38;

  // Shockwave structures for Perfect hits
  interface Shockwave {
    id: string;
    cx: number;
    cy: number;
    radius: number;
    maxRadius: number;
    alpha: number;
    color: string;
    lineWidth: number;
  }
  const shockwavesRef = useRef<Shockwave[]>([]);
  const processedPerfectsRef = useRef<Set<string>>(new Set());

  // Background blood flow particle system (Vein simulation)
  interface VeinParticle {
    angle: number;
    distance: number;
    speed: number;
    size: number;
    opacity: number;
    pulseOffset: number;
  }
  const veinParticlesRef = useRef<VeinParticle[]>([]);

  // Listen to floatingTexts changes to trigger a new perfect shockwave
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    floatingTexts.forEach((ft) => {
      if (ft.isPerfect && !processedPerfectsRef.current.has(ft.id)) {
        processedPerfectsRef.current.add(ft.id);
        
        // Add a premium, expanding pulse shockwave centered at the heart
        shockwavesRef.current.push({
          id: ft.id,
          cx,
          cy,
          radius: 15,
          maxRadius: canvas.width * 0.75, // Expands outer diameter past the target ring
          alpha: 1.0,
          color: '#10b981', // Neon perfect green
          lineWidth: 4,
        });
      }
    });

    // Prune expired ID references
    const activeIds = new Set(floatingTexts.map(ft => ft.id));
    processedPerfectsRef.current.forEach((id) => {
      if (!activeIds.has(id)) {
        processedPerfectsRef.current.delete(id);
      }
    });
  }, [floatingTexts]);

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrame: number;

    const drawHeart = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, health: number) => {
      ctx.save();
      
      // Determine heart color based on health
      // Healthy: vibrant red-magenta glowing
      // Injured: deep orange-red
      // Dying: dark brownish-grayish red
      let fillStyle = '#ef4444'; // Red
      let shadowColor = '#f43f5e';
      
      if (health < 30) {
        // Danger dying
        fillStyle = '#991b1b'; // dark brick red
        shadowColor = '#ef4444';
      } else if (health < 60) {
        // Warning
        fillStyle = '#f97316'; // orange-red
        shadowColor = '#f97316';
      }

      ctx.shadowBlur = 15 * (1 + (beatScale - 1) * 3); // Glimmer with the pulse
      ctx.shadowColor = shadowColor;
      
      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      
      // Traditional parametric heart equation or custom Bezier curve
      // For precise local space rendering, translate to cx, cy
      ctx.translate(cx, cy);
      ctx.scale(size / 30, size / 30); // scale factor

      // Heart Path starting from centerline top dip
      ctx.moveTo(0, -10);
      ctx.bezierCurveTo(12, -22, 26, -10, 26, 6);
      ctx.bezierCurveTo(26, 20, 10, 30, 0, 42);
      ctx.bezierCurveTo(-10, 30, -26, 20, -26, 6);
      ctx.bezierCurveTo(-26, -10, -12, -22, 0, -10);
      
      ctx.fill();
      
      // Decorative EKG Pulse Line across the heart (makes it super high-tech!)
      if (health > 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-16, 2);
        ctx.lineTo(-8, 2);
        ctx.lineTo(-4, -6);
        ctx.lineTo(0, 12);
        ctx.lineTo(4, -14);
        ctx.lineTo(8, 4);
        ctx.lineTo(12, 2);
        ctx.lineTo(16, 2);
        ctx.stroke();
      }

      ctx.restore();
    };

    const runFrame = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      const isMutatedEnv = gameMode === 'LEVELS' && currentLevel && currentLevel >= 31;

      // Clear dark cyber grid background matching Frosted Glass '#0a0505'
      ctx.fillStyle = isMutatedEnv ? '#02030a' : '#0a0505'; 
      ctx.fillRect(0, 0, w, h);

      // Light ambient Glow Pulse centered at the heart that intensifies with BPM and beats
      if (heartHealth > 0) {
        ctx.save();
        // Normalize BPM factor between 60 & 144 BPM
        const bpmFactor = Math.min(1, Math.max(0, (currentBPM - 60) / 84)); 
        // Sync opacity with the heart scale (pulsing with beatScale) and make it stronger with higher BPM
        const alpha = (0.02 + bpmFactor * 0.15) * (beatScale - 0.9);
        
        const glowGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, w * 0.65);
        if (isMutatedEnv) {
          // Cyber glow: neon violet and emerald
          glowGrad.addColorStop(0, `rgba(${Math.round(80 + bpmFactor * 90)}, 20, ${Math.round(200 + bpmFactor * 55)}, ${alpha * 1.4})`);
          glowGrad.addColorStop(1, 'rgba(2, 3, 10, 0)');
        } else {
          // Fade from a dark digital blood-red/neon-rose glow to absolute black
          glowGrad.addColorStop(0, `rgba(${Math.round(20 + bpmFactor * 100)}, 10, 20, ${alpha})`);
          glowGrad.addColorStop(1, 'rgba(10, 5, 5, 0)');
        }
        
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // Floating Cyber nano metrics in background
      if (isMutatedEnv && heartHealth > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(6, 182, 212, 0.12)'; // Neon Cyan translucent
        ctx.font = '7px monospace, sans-serif';
        ctx.textAlign = 'left';
        
        const headerScanValue = Math.round(80 + Math.sin(Date.now() / 1000) * 15);
        ctx.fillText(`NANO_SYS_STATUS: ACTIVE`, 15, 20);
        ctx.fillText(`MUTATION_STABILIZER: v5.1`, 15, 30);
        ctx.fillText(`BIO_PROBE_READOUT: ${headerScanValue}%`, 15, 40);
        
        ctx.textAlign = 'right';
        ctx.fillText(`PROT_MATRIX: 512-BIT`, w - 15, 20);
        ctx.fillText(`THERAPY_CORE: STABLE`, w - 15, 30);
        ctx.fillText(`CYBER_INFECT_LOCKED: YES`, w - 15, 40);
        ctx.restore();
      }

      // HELPER: Compute dynamic venous color smoothly transitioning based on BPM
      const getVeinColor = (bpm: number, alphaMultiplier: number) => {
        if (isMutatedEnv) {
          // Mutated environment cybernetic neon cyan/purple
          return `rgba(6, 182, 212, ${alphaMultiplier})`;
        }
        if (bpm <= 72) {
          // Healthy deep blood-red/magenta
          return `rgba(185, 28, 28, ${alphaMultiplier})`;
        } else if (bpm <= 110) {
          // Accelerated orange-crimson
          const ratio = (bpm - 72) / (110 - 72);
          const rInt = Math.round(185 + (249 - 185) * ratio);
          const gInt = Math.round(28 + (115 - 28) * ratio);
          const bInt = Math.round(28 + (22 - 28) * ratio);
          return `rgba(${rInt}, ${gInt}, ${bInt}, ${alphaMultiplier})`;
        } else {
          // Critical golden-yellow hyper pulse state
          const ratio = Math.min(1, (bpm - 110) / 30);
          const rInt = Math.round(249 + (251 - 249) * ratio);
          const gInt = Math.round(115 + (191 - 115) * ratio);
          const bInt = Math.round(22 + (36 - 22) * ratio);
          return `rgba(${rInt}, ${gInt}, ${bInt}, ${alphaMultiplier})`;
        }
      };

      // Initialize background blood-flow vein particles if first run
      if (veinParticlesRef.current.length === 0) {
        const temp: VeinParticle[] = [];
        for (let i = 0; i < 55; i++) {
          const channelIdx = Math.floor(Math.random() * 8);
          const baseAngle = (channelIdx * Math.PI) / 4;
          temp.push({
            angle: baseAngle + (Math.random() - 0.5) * 0.05, // flow within the vein width
            distance: 40 + Math.random() * 190,
            speed: 0.4 + Math.random() * 1.2,
            size: 1.0 + Math.random() * 2.2,
            opacity: 0.12 + Math.random() * 0.48,
            pulseOffset: Math.random() * Math.PI * 2,
          });
        }
        veinParticlesRef.current = temp;
      }

      // DRAW BIO-VEIN GLOWING CHANNELS (High-tech blood conduits)
      if (heartHealth > 0) {
        ctx.save();
        // Background vein conduit lines pulse on the beats and glow brighter as the BPM accelerates
        const conduitAlpha = 0.06 + Math.max(0, (currentBPM - 72) / 72) * 0.12 + (beatScale - 1) * 0.14;
        const conduitColor = getVeinColor(currentBPM, conduitAlpha);
        
        ctx.strokeStyle = conduitColor;
        ctx.lineWidth = 1.0 + (currentBPM / 72) * 0.8 + (beatScale - 1) * 4.0;
        
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
          ctx.beginPath();
          // Spawn from edges of active field and route directly into the beating central chambers
          ctx.moveTo(cx + Math.cos(angle) * (w * 0.65), cy + Math.sin(angle) * (w * 0.65));
          ctx.lineTo(cx + Math.cos(angle) * (heartBaseRadius * beatScale * 0.8), cy + Math.sin(angle) * (heartBaseRadius * beatScale * 0.8));
          ctx.stroke();
        }
        ctx.restore();

        // RENDER CYCLING VEIN BLOOD FLOW PARTICLES (Red blood cells marching to the heart)
        ctx.save();
        const flowSpeedMultiplier = currentBPM / 72; // Flow speed is directly mapped to active BPM!
        
        veinParticlesRef.current.forEach((vp) => {
          // Flow inwards toward the heart
          vp.distance -= vp.speed * flowSpeedMultiplier * 0.65;
          
          // Recycle cellular elements once they enter the cardiac state
          const heartLim = heartBaseRadius * beatScale * 0.85;
          if (vp.distance <= heartLim) {
            vp.distance = w * 0.52 + Math.random() * w * 0.14; // respawn outwardly
            const chIdx = Math.floor(Math.random() * 8);
            vp.angle = (chIdx * Math.PI) / 4 + (Math.random() - 0.5) * 0.05;
          }

          const px = cx + Math.cos(vp.angle) * vp.distance;
          const py = cy + Math.sin(vp.angle) * vp.distance;

          // Organic oscillation modeling cell elasticity
          const pulsingSize = vp.size * (1 + Math.sin(Date.now() / 160 + vp.pulseOffset) * 0.18);
          // Calculate the exact gradient responsive color
          const activeCellColor = getVeinColor(currentBPM, vp.opacity);

          ctx.fillStyle = activeCellColor;
          ctx.beginPath();
          ctx.arc(px, py, pulsingSize, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }

      // Draw light sonar rings pulsing from heart (Rhythm guidelines - frosted theme)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      
      // Rhythm rings matching the heartbeat
      const rings = [0.4, 0.7, 1.0];
      rings.forEach(r => {
        const ringRadius = (w * 0.4) * r * (1 + (beatScale - 1) * 0.15);
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Perfect Rhythm Tap Zone Indicator Ring
      // Tapping balls inside/near this boundary makes hitting easy
      ctx.shadowBlur = isOnBeat ? 20 : 0;
      ctx.shadowColor = isOnBeat ? '#ff1a1a' : 'transparent';
      ctx.strokeStyle = isOnBeat ? 'rgba(255, 26, 26, 0.6)' : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = isOnBeat ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.35, 0, Math.PI * 2); // 35% of width is ideal target zone
      ctx.stroke();
      ctx.shadowBlur = 0; // reset

      // Visual Perfect prompt text when beat indicator is active
      if (isOnBeat && heartHealth > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.font = 'bold 9px ui-monospace, SFMono-Regular, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚡ انقر الآن (TAP NOW) ⚡', cx, cy + 85);
        ctx.restore();
      }

      // Draw orbit guide lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      // Draw 8 radial guide axes
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * (w / 2), cy + Math.sin(angle) * (h / 2));
        ctx.stroke();
      }
      ctx.setLineDash([]); // clear dash

      // RENDER SHOCKWAVES EXPANDING FROM CENTER (For Perfect ratings)
      shockwavesRef.current = shockwavesRef.current.filter((sw) => {
        // Expand the main shockwave radius per frame
        sw.radius += 5.5;
        
        // Compute progress-based decay of transparency and outer stroke width
        const progress = sw.radius / sw.maxRadius;
        sw.alpha = Math.max(0, 1 - progress);
        sw.lineWidth = Math.max(0.75, 4.5 * (1 - progress));

        if (progress >= 1 || sw.alpha <= 0) {
          return false; // Prune completed wave
        }

        ctx.save();
        
        // Inner glowing core shockwave
        ctx.shadowBlur = 15;
        ctx.shadowColor = sw.color;
        ctx.strokeStyle = `rgba(16, 185, 129, ${sw.alpha * 0.95})`; // Perfect green core
        ctx.lineWidth = sw.lineWidth;
        ctx.beginPath();
        ctx.arc(sw.cx, sw.cy, sw.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Secondary outer soft energetic ripple
        ctx.strokeStyle = `rgba(52, 211, 153, ${sw.alpha * 0.4})`; // Lighter emerald tint
        ctx.lineWidth = sw.lineWidth * 0.5;
        ctx.beginPath();
        ctx.arc(sw.cx, sw.cy, sw.radius + 14, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
        return true;
      });

      // RENDER THE BEATING HEART IN THE CENTER
      const displaySize = heartBaseRadius * beatScale;
      
      // Add custom visual nano-mesh ring around heart if mutated
      if (isMutatedEnv && heartHealth > 0) {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#06b6d4';
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, displaySize * 1.5, 0, Math.PI * 2);
        ctx.stroke();

        // Second dotted scanner ring
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.6)'; // purple
        ctx.beginPath();
        ctx.arc(cx, cy, displaySize * 1.8 + Math.sin(Date.now() / 200) * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      drawHeart(ctx, cx, cy, displaySize, heartHealth);

      // RENDER THREAT NODES
      nodes.forEach((node) => {
        // Calculate dynamic coordinate based on progress distance from center
        const nx = cx + Math.cos(node.angle) * node.distance;
        const ny = cy + Math.sin(node.angle) * node.distance;

        // Draw node approach trail line (laser trail pointing to heart)
        ctx.strokeStyle = `${node.color}33`; // 20% alpha
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.lineTo(cx + Math.cos(node.angle) * (heartBaseRadius * 0.8), cy + Math.sin(node.angle) * (heartBaseRadius * 0.8));
        ctx.stroke();

        ctx.save();
        // Give glowing aura to nodes
        ctx.shadowBlur = 8;
        ctx.shadowColor = node.color;
        
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(nx, ny, node.radius * node.pulseScale, 0, Math.PI * 2);
        ctx.fill();

        // Details inside the nodes based on type
        if (node.type === NodeType.CLOT) {
          // Sharp core details for clots
          ctx.strokeStyle = '#ffffffaa';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius * 0.4, 0, Math.PI * 2);
          ctx.stroke();
          
          // Draw rough spikes around clot
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1;
          for (let i = 0; i < 8; i++) {
            const spikeAngle = (i / 8) * Math.PI * 2 + (Date.now() / 200);
            const outsideX = nx + Math.cos(spikeAngle) * (node.radius * 1.3);
            const outsideY = ny + Math.sin(spikeAngle) * (node.radius * 1.3);
            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.lineTo(outsideX, outsideY);
            ctx.stroke();
          }
        } else if (node.type === NodeType.VIRUS) {
          // Bio hazard star design
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(nx, ny, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (node.type === NodeType.BIG_BACTERIA) {
          // Big biological green bacterium with rotating tentacles and double core
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
          ctx.lineWidth = 1.5;
          const numTentacles = 6;
          for (let i = 0; i < numTentacles; i++) {
            const rotAngle = (i / numTentacles) * Math.PI * 2 + (Date.now() / 350);
            const midDist = node.radius * 1.3 + Math.sin(Date.now() / 150 + i) * 3;
            const endX = nx + Math.cos(rotAngle) * midDist;
            const endY = ny + Math.sin(rotAngle) * midDist;
            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.quadraticCurveTo(
              nx + Math.cos(rotAngle + 0.3) * (node.radius * 0.8),
              ny + Math.sin(rotAngle + 0.3) * (node.radius * 0.8),
              endX,
              endY
            );
            ctx.stroke();
            
            // Draw a little tip
            ctx.fillStyle = '#4ade80';
            ctx.beginPath();
            ctx.arc(endX, endY, 2, 0, Math.PI * 2);
            ctx.fill();
          }

          // Inner yellow/green core details
          ctx.strokeStyle = '#ffffffaa';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius * 0.45, 0, Math.PI * 2);
          ctx.stroke();
        } else if (node.type === NodeType.SMALL_BACTERIA) {
          // Small biological green bacterium with tiny rotating tails
          ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
          ctx.lineWidth = 1.0;
          const numTentacles = 4;
          for (let i = 0; i < numTentacles; i++) {
            const rotAngle = (i / numTentacles) * Math.PI * 2 + (Date.now() / 250);
            const midDist = node.radius * 1.25 + Math.sin(Date.now() / 100 + i) * 2;
            const endX = nx + Math.cos(rotAngle) * midDist;
            const endY = ny + Math.sin(rotAngle) * midDist;
            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.lineTo(endX, endY);
            ctx.stroke();
          }
        } else if (node.type === NodeType.ARRHYTHMIA) {
          // High speed flashing warning detail
          ctx.strokeStyle = '#ffffffdd';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          // Visual thunder bolt inside the node
          ctx.moveTo(nx - 3, ny - 4);
          ctx.lineTo(nx + 1, ny - 1);
          ctx.lineTo(nx - 2, ny + 1);
          ctx.lineTo(nx + 3, ny + 5);
          ctx.stroke();

          // Flashing warning spikes
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.7)';
          ctx.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            const warningAngle = (i / 4) * Math.PI * 2 + (Date.now() / 150);
            const edgeX = nx + Math.cos(warningAngle) * (node.radius * 1.4);
            const edgeY = ny + Math.sin(warningAngle) * (node.radius * 1.4);
            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.lineTo(edgeX, edgeY);
            ctx.stroke();
          }
        } else if (node.type === NodeType.ADRENALINE) {
          // Green medicine cross represent restoration
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          // Horizontal cross bar
          ctx.moveTo(nx - 4, ny);
          ctx.lineTo(nx + 4, ny);
          // Vertical cross bar
          ctx.moveTo(nx, ny - 4);
          ctx.lineTo(nx, ny + 4);
          ctx.stroke();
        } else if (node.type === NodeType.PACEMAKER) {
          // Concentric circular orbit
          ctx.strokeStyle = '#ffffffcc';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius * 0.45, 0, Math.PI * 2);
          ctx.stroke();

          // Smooth planetary satellites
          ctx.fillStyle = '#38bdf8';
          for (let i = 0; i < 3; i++) {
            const satAngle = (i / 3) * Math.PI * 2 + (Date.now() / 250);
            const satX = nx + Math.cos(satAngle) * (node.radius * 0.9);
            const satY = ny + Math.sin(satAngle) * (node.radius * 0.9);
            ctx.beginPath();
            ctx.arc(satX, satY, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (node.type === NodeType.FAST_GERM) {
          // Extremely fast violet germ with glowing tail and high speed trails
          ctx.strokeStyle = 'rgba(217, 70, 239, 0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          // Draw a small lightning/tail pointing away from the center
          const angleToHeart = Math.atan2(ny - cy, nx - cx);
          const backX = nx + Math.cos(angleToHeart) * (node.radius * 1.5);
          const backY = ny + Math.sin(angleToHeart) * (node.radius * 1.5);
          ctx.moveTo(nx, ny);
          ctx.lineTo(backX, backY);
          ctx.stroke();

          ctx.fillStyle = '#fdf4ff';
          ctx.beginPath();
          ctx.arc(nx, ny, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (node.type === NodeType.GIANT_BOSS) {
          // Huge boss bacteria with pulsing shield rings, 3 red glowing nuclei, and organic rotating spikes
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius * 1.25 + Math.sin(Date.now() / 100) * 3, 0, Math.PI * 2);
          ctx.stroke();

          // Pulsing inner shield
          ctx.strokeStyle = '#a855f7';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius * 0.85, 0, Math.PI * 2);
          ctx.stroke();

          // Waving scary organic spikes
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2;
          const spikesCount = 10;
          for (let i = 0; i < spikesCount; i++) {
            const angle = (i / spikesCount) * Math.PI * 2 + (Date.now() / 400);
            const spikeLength = node.radius * 1.4 + Math.sin(Date.now() / 120 + i) * 5;
            const sx = nx + Math.cos(angle) * spikeLength;
            const sy = ny + Math.sin(angle) * spikeLength;
            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.lineTo(sx, sy);
            ctx.stroke();

            // Tiny dangerous tips
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(sx, sy, 3, 0, Math.PI * 2);
            ctx.fill();
          }

          // 3 scary red eyes
          ctx.fillStyle = '#ef4444';
          const eyeOffsets = [
            { dx: -4, dy: -3 },
            { dx: 4, dy: -3 },
            { dx: 0, dy: 4 }
          ];
          eyeOffsets.forEach(eye => {
            ctx.beginPath();
            ctx.arc(nx + eye.dx, ny + eye.dy, 2.5, 0, Math.PI * 2);
            ctx.fill();
            // shiny point
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(nx + eye.dx - 0.7, ny + eye.dy - 0.7, 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ef4444'; // restore for remaining eyes
          });
        } else if (node.type === NodeType.MUTATED_RETROVIRUS) {
          // MUTATED_RETROVIRUS: Pink/orange triangle with rotating RNA strand, and slithery golden tentacles
          ctx.save();
          ctx.translate(nx, ny);
          const drawAngle = Date.now() / 300;
          ctx.rotate(drawAngle);
          
          // Draw triangle
          ctx.fillStyle = '#ec4899'; // Hot pink
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, -node.radius * 1.2);
          ctx.lineTo(node.radius, node.radius * 0.8);
          ctx.lineTo(-node.radius, node.radius * 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Rotating RNA/genetic thread inside
          ctx.strokeStyle = '#f59e0b'; // Gold
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let x = -node.radius * 0.6; x <= node.radius * 0.6; x += 2) {
            const y = Math.sin(x * 0.4 + Date.now() / 100) * (node.radius * 0.3);
            if (x === -node.radius * 0.6) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.restore();

          // 3 long slithery golden tentacles waving behind (opposite to approach path)
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          const backAngle = Math.atan2(ny - cy, nx - cx);
          for (let i = -1; i <= 1; i++) {
            const tentAngle = backAngle + (i * 0.25) + Math.sin(Date.now() / 120 + i) * 0.15;
            const tx = nx + Math.cos(tentAngle) * (node.radius * 1.6);
            const ty = ny + Math.sin(tentAngle) * (node.radius * 1.6);
            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.quadraticCurveTo(
              nx + Math.cos(backAngle) * (node.radius * 1.0),
              ny + Math.sin(backAngle) * (node.radius * 1.0),
              tx,
              ty
            );
            ctx.stroke();
          }
        } else if (node.type === NodeType.CYBER_NANO_PHAGE) {
          // CYBER_NANO_PHAGE: Golden hexagonal landing capsule with spider-like needle legs
          ctx.save();
          ctx.translate(nx, ny);
          ctx.rotate(Math.atan2(ny - cy, nx - cx) - Math.PI / 2); // points toward the heart

          // Hexagonal Cap
          ctx.fillStyle = '#eab308'; // Glowing yellow
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const hx = Math.cos(angle) * node.radius;
            const hy = Math.sin(angle) * (node.radius * 0.82);
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Spider legs (6 legs planting back)
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 1.5;
          const legs = [-1.4, -0.8, -0.2, 0.2, 0.8, 1.4];
          legs.forEach((legOffset, lIdx) => {
            const legAngle = Math.PI + legOffset + Math.sin(Date.now() / 80 + lIdx) * 0.2;
            const jX = Math.cos(legAngle) * (node.radius * 0.9);
            const jY = Math.sin(legAngle) * (node.radius * 0.9);
            const tX = Math.cos(legAngle) * (node.radius * 1.8 + Math.sin(Date.now() / 150) * 3);
            const tY = Math.sin(legAngle) * (node.radius * 1.8);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(jX, jY);
            ctx.lineTo(tX, tY);
            ctx.stroke();
          });

          // Glowing internal laser eye
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(0, -node.radius * 0.2, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (node.type === NodeType.PLASMA_SPORE) {
          // PLASMA_SPORE: Hot orange sphere with a shifting outer corona and bio-luminescent hairs
          ctx.save();
          // Corona aura
          const coronaGrad = ctx.createRadialGradient(nx, ny, 2, nx, ny, node.radius * 1.7);
          coronaGrad.addColorStop(0, '#f97316'); // Orange
          coronaGrad.addColorStop(0.5, 'rgba(239, 68, 68, 0.4)'); // Red translucent
          coronaGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
          ctx.fillStyle = coronaGrad;
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius * 1.7, 0, Math.PI * 2);
          ctx.fill();

          // Central core
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius * 0.6, 0, Math.PI * 2);
          ctx.fill();

          // 8 outer waving bio-luminescent fiber tips
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.6)';
          ctx.lineWidth = 1.5;
          for (let i = 0; i < 8; i++) {
            const fiberAngle = (i / 8) * Math.PI * 2 + (Date.now() / 180);
            const fDist = node.radius * 1.1 + Math.sin(Date.now() / 110 + i) * 4;
            const fx = nx + Math.cos(fiberAngle) * fDist;
            const fy = ny + Math.sin(fiberAngle) * fDist;

            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.lineTo(fx, fy);
            ctx.stroke();

            // Tip dot
            ctx.fillStyle = '#fb7185';
            ctx.beginPath();
            ctx.arc(fx, fy, 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else if (node.type === NodeType.CROWN_CORONAVIRUS) {
          // CROWN_CORONAVIRUS: Heavy purple sphere with long crown spikes that swell/contract
          ctx.save();
          const scaleOsc = 1 + Math.sin(Date.now() / 150) * 0.12;
          const drawRadius = node.radius * scaleOsc;
          
          // Outer spikes with crown spheres at tips
          ctx.strokeStyle = '#a855f7'; // Purple
          ctx.lineWidth = 2;
          const crownSpikes = 12;
          for (let i = 0; i < crownSpikes; i++) {
            const spikeAngle = (i / crownSpikes) * Math.PI * 2 + (Date.now() / 500);
            const sl = drawRadius * 1.4;
            const sx = nx + Math.cos(spikeAngle) * sl;
            const sy = ny + Math.sin(spikeAngle) * sl;

            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.lineTo(sx, sy);
            ctx.stroke();

            // Crown tip
            ctx.fillStyle = '#ec4899'; // Magenta
            ctx.beginPath();
            ctx.arc(sx, sy, 3, 0, Math.PI * 2);
            ctx.fill();
          }

          // Main body core
          ctx.fillStyle = '#7c3aed'; // Violet
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(nx, ny, drawRadius * 0.95, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Inner virus core pattern
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.beginPath();
          ctx.arc(nx, ny, drawRadius * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (node.type === NodeType.NANO_MEGA_BOSS) {
          // NANO_MEGA_BOSS: Ultimate heavy level 60 metal machine core, 3 outer spinning red gear blades, double shield
          ctx.save();
          // Concentric outer laser shields
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)'; // Cyan
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius * 1.6 + Math.sin(Date.now() / 80) * 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)'; // Red
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius * 1.35, 0, Math.PI * 2);
          ctx.stroke();

          // Outer spinning red gear blades
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          const bladeCount = 3;
          const bladeAngleOffset = Date.now() / 250;
          for (let i = 0; i < bladeCount; i++) {
            const angle = (i / bladeCount) * Math.PI * 2 + bladeAngleOffset;
            const bX = nx + Math.cos(angle) * (node.radius * 1.45);
            const bY = ny + Math.sin(angle) * (node.radius * 1.45);
            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.lineTo(bX, bY);
            ctx.stroke();

            // Large sharp blade tip
            ctx.fillStyle = '#f87171';
            ctx.beginPath();
            ctx.arc(bX, bY, 5, 0, Math.PI * 2);
            ctx.fill();
          }

          // Central armored metal block
          ctx.fillStyle = '#374151'; // Charcoal armor
          ctx.strokeStyle = '#22d3ee'; // Cyber cyan trim
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Heavy glowing red reactor core in center
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius * 0.45, 0, Math.PI * 2);
          ctx.fill();

          // Floating neon mechanical scan cross
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(nx - node.radius * 0.3, ny);
          ctx.lineTo(nx + node.radius * 0.3, ny);
          ctx.moveTo(nx, ny - node.radius * 0.3);
          ctx.lineTo(nx, ny + node.radius * 0.3);
          ctx.stroke();

          ctx.restore();
        } else {
          // Standard electric disruption ring
          ctx.strokeStyle = '#ffffff88';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius * 0.6, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Show HP counter if health > 1 (e.g. 2-hit blood clot)
        if (node.health > 1) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(node.health.toString(), nx, ny);
        }

        ctx.restore();

        // Check for Collision with heart
        const currHeartLimit = (heartBaseRadius * beatScale) - 4;
        if (node.distance <= currHeartLimit) {
          // Trigger collision miss sequence
          onMissNode(node.id);
        }
      });

      // RENDER PARTICLES (SPARK EXPLOSIONS)
      particles.forEach((p) => {
        ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // RENDER FLOATING SCORE TEXT FEEDBACKS
      floatingTexts.forEach((ft) => {
        ctx.save();
        ctx.fillStyle = ft.color;
        ctx.textAlign = 'center';
        
        // Dynamic fonts
        if (ft.isPerfect) {
          ctx.font = `bold ${Math.round(14 * ft.scale)}px "Space Grotesk", Inter, sans-serif`;
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#10b981';
        } else {
          ctx.font = `bold ${Math.round(10 * ft.scale)}px Inter, sans-serif`;
        }
        
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      });

      // Render combo pulse gauge overlay at the absolute top corner on top of canvas
      if (combo > 2 && heartHealth > 0) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 12px "Space Grotesk", sans-serif';
        // Add metallic pulse to combo
        const comboPulse = 1 + Math.sin(Date.now() / 100) * 0.05;
        ctx.translate(15, 25);
        ctx.scale(comboPulse, comboPulse);
        ctx.fillText(`⚡ ${combo}x متتالي`, 0, 0);
        ctx.restore();
      }

      // If Heart stops beating, render overlay
      if (heartHealth <= 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, w, h);
        
        ctx.fillStyle = '#f87171';
        ctx.textAlign = 'center';
        ctx.font = 'bold 18px "Space Grotesk", Inter, sans-serif';
        ctx.fillText('توقف النبض (FLATLINE)', cx, cy - 10);
        
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText('اختر "أعد تفعيل القلب" لإنعاش المريض', cx, cy + 15);
      }

      animFrame = requestAnimationFrame(runFrame);
    };

    animFrame = requestAnimationFrame(runFrame);

    return () => {
      cancelAnimationFrame(animFrame);
    };
  }, [nodes, particles, floatingTexts, heartHealth, currentBPM, beatScale, isOnBeat, score, combo, onMissNode]);

  // Handle Touch/Click events
  const processTap = (clientX: number, clientY: number) => {
    if (isPaused || heartHealth <= 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const tapX = ((clientX - rect.left) / rect.width) * canvas.width;
    const tapY = ((clientY - rect.top) / rect.height) * canvas.height;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    let matchedNode: GameNode | null = null;
    let closestDistForTap = Infinity;
    const tapHitboxRadius = 34;

    nodes.forEach((node) => {
      const nx = cx + Math.cos(node.angle) * node.distance;
      const ny = cy + Math.sin(node.angle) * node.distance;

      const dx = tapX - nx;
      const dy = tapY - ny;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= node.radius + tapHitboxRadius) {
        if (dist < closestDistForTap) {
          closestDistForTap = dist;
          matchedNode = node;
        }
      }
    });

    if (matchedNode) {
      const node: GameNode = matchedNode;
      onTapNode(node.id, isOnBeat, tapX, tapY);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Left click only
    if (e.button !== 0) return;
    processTap(e.clientX, e.clientY);
  };

  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // Multi-touch helper
    if (e.changedTouches) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        processTap(touch.clientX, touch.clientY);
      }
    }
  };

  return (
    <div id="canvas-wrapper" className="w-full relative aspect-square max-w-[380px] mx-auto rounded-3xl overflow-hidden border border-white/10 backdrop-blur-xl bg-white/5 shadow-2xl">
      <canvas
        id="heart-game-canvas"
        ref={canvasRef}
        width={380}
        height={380}
        onMouseDown={handleCanvasClick}
        onTouchStart={handleCanvasTouchStart}
        className="w-full h-full block cursor-pointer transition-transform duration-100 active:scale-[0.99]"
      />
    </div>
  );
};
