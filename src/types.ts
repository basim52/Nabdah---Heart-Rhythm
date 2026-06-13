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
  GIANT_BOSS = 'GIANT_BOSS', // Huge boss bacteria for level 30 (10 hits, spawns helpers)
  MUTATED_RETROVIRUS = 'MUTATED_RETROVIRUS', // Fast, translucent shape with long tendrils (Level 31+)
  CYBER_NANO_PHAGE = 'CYBER_NANO_PHAGE',     // Apollo-shaped yellow/neon, teleports in erratic steps (Level 31+)
  PLASMA_SPORE = 'PLASMA_SPORE',             // Glowing hot coral sphere with shifting tentacles (Level 31+)
  CROWN_CORONAVIRUS = 'CROWN_CORONAVIRUS',   // Large spiked purple virus, needs 3 hits and swells in size (Level 31+)
  NANO_MEGA_BOSS = 'NANO_MEGA_BOSS',         // Huge mechanical megaboss for Level 60 (15 hits!)
  ARTERIAL_CLOT = 'ARTERIAL_CLOT',           // Critical blood clot in the red arteries (3-hits, gets bigger as it nears heart)
  VEIN_THROMBUS = 'VEIN_THROMBUS',           // Sleek dark blue thrombus sliding in the veins (fast, 2-hits, zigzags)
  ATHEROMA_PLAQUE = 'ATHEROMA_PLAQUE',       // Golden fatty plaque blocking blood vessels (needs 4 heavy taps)
  CORONARY_EMBOLUS_BOSS = 'CORONARY_EMBOLUS_BOSS', // The sovereign Pulmonary/Coronary embolus blocking all valves (Level 90, 20 hits!)
  LIFESTYLE_BURGER = 'LIFESTYLE_BURGER',     // Fatty burger (harmful lifestyle element)
  LIFESTYLE_SALT = 'LIFESTYLE_SALT',         // Salt/Chips (harmful lifestyle element)
  LIFESTYLE_CIGARETTE = 'LIFESTYLE_CIGARETTE', // Cigarette (harmful lifestyle element)
  LIFESTYLE_STRESS = 'LIFESTYLE_STRESS',     // Stress (harmful lifestyle element)
  LIFESTYLE_APPLE = 'LIFESTYLE_APPLE',       // Apple (healthy lifestyle element)
  LIFESTYLE_WATER = 'LIFESTYLE_WATER',        // Water (healthy lifestyle element)
  LIFESTYLE_DOUBLE_BURGER = 'LIFESTYLE_DOUBLE_BURGER', // Double fat burger (2 hits, harmful)
  LIFESTYLE_DOUBLE_SALT = 'LIFESTYLE_DOUBLE_SALT',     // Double salt/sodium overdose (2 hits, harmful)
  LIFESTYLE_LATE_NIGHT = 'LIFESTYLE_LATE_NIGHT',       // Late nights/Sleeplessness (fast, zigzags, harmful)
  LIFESTYLE_SEDENTARY = 'LIFESTYLE_SEDENTARY',         // Lack of exercise/Couch potato (3 hits, grows bigger, harmful)
  LIFESTYLE_SLEEP = 'LIFESTYLE_SLEEP',                 // Adequate sleep (heals, gives points, healthy)
  LIFESTYLE_EXERCISE = 'LIFESTYLE_EXERCISE'           // Sports & Exercise (gives big speed/points, healthy)
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
  gameMode?: 'ENDLESS' | 'TIMED' | 'LEVELS' | 'LIFESTYLE';
}

export type GameState = 'START' | 'PLAYING' | 'GAMEOVER' | 'HOWTO' | 'LEVEL_COMPLETE';
