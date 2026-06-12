/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum NodeType {
  DISRUPTION = 'DISRUPTION', // Cyan/Yellow electrical disturbance (1-hit)
  CLOT = 'CLOT',             // Dark red jagged blood clot (2-hits, slower)
  VIRUS = 'VIRUS',            // Golden bio-threat (fast, sweeps orbitally)
  ARRHYTHMIA = 'ARRHYTHMIA',  // Orange erratic pulse (speed fluctuates, zig-zags)
  ADRENALINE = 'ADRENALINE',  // Bright green heartbeat boost (heals +15% Health)
  PACEMAKER = 'PACEMAKER',    // Bright cyan/blue stabilizer (slows down obstacle velocities for 5s)
  BIG_BACTERIA = 'BIG_BACTERIA', // Big green bacteria (3 hits, spawns small bacteria)
  SMALL_BACTERIA = 'SMALL_BACTERIA', // Smaller green bacteria (2 hits)
  FAST_GERM = 'FAST_GERM', // Extremely small, ultra-fast glowing violet germ (1 hit)
  GIANT_BOSS = 'GIANT_BOSS' // Huge boss bacteria for level 30 (10 hits, spawns helpers)
}

export interface GameNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  radius: number;
  angle: number;           // Spawn angle in radians
  distance: number;        // Current distance from the heart (starts at boundary, goes down to 0)
  speed: number;           // pixels/tick or speed factor
  health: number;          // Taps needed to destroy
  maxHealth: number;       // Original taps needed
  pulseScale: number;      // Visual organic scale
  color: string;
  lastSummonTime?: number; // timestamp of last spawn for big bacteria
}

export interface HitParticle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
  scale: number;
  isPerfect: boolean;
}

export interface CoreHeart {
  health: number;          // 0 to 100
  maxHealth: number;
  radius: number;
  pulseProgress: number;   // 0 to 1 scaling animation
  currentBPM: number;
}

export interface ScoreRecord {
  score: number;
  maxCombo: number;
  accuracy: number;
  date: string;
  playerName: string;
  gameMode?: 'ENDLESS' | 'TIMED';
}

export type GameState = 'START' | 'PLAYING' | 'GAMEOVER' | 'HOWTO' | 'LEVEL_COMPLETE';
