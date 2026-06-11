/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  Heart, 
  Play, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Skull, 
  Trophy, 
  HelpCircle, 
  HeartHandshake, 
  Activity, 
  ArrowLeft,
  Share2,
  Zap
} from 'lucide-react';
import { GameNode, HitParticle, FloatingText, NodeType, GameState, ScoreRecord } from './types';
import { AudioSynthesizer } from './AudioSynthesizer';
import { EKGMonitor } from './components/EKGMonitor';
import { HeartGameCanvas } from './components/HeartGameCanvas';
import { BpmHistoryChart } from './components/BpmHistoryChart';

export default function App() {
  // Game States
  const [gameState, setGameState] = useState<GameState>('START');
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('nabdah_player_name') || 'نبّاض';
  });
  
  // Game Play variables
  const [heartHealth, setHeartHealth] = useState<number>(100);
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [currentBPM, setCurrentBPM] = useState<number>(72);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [accuracy, setAccuracy] = useState<number>({ total: 0, perfect: 0 }); // To calculate % perfect score
  
  // Active Entities
  const [nodes, setNodes] = useState<GameNode[]>([]);
  const [particles, setParticles] = useState<HitParticle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  
  // Visual effects
  const [screenShake, setScreenShake] = useState<boolean>(false);
  const [beatScale, setBeatScale] = useState<number>(1.0);
  const [showBeatIndicator, setShowBeatIndicator] = useState<boolean>(false); // Beats visual halo
  const [triggerBeatSign, setTriggerBeatSign] = useState<boolean>(false); // Triggers EKG spike
  const [volume, setVolume] = useState<number>(0.6);

  // Multiplayer Room and Real-Time State variables
  const [isMultiplayer, setIsMultiplayer] = useState<boolean>(false);
  const [roomCode, setRoomCode] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [partnerName, setPartnerName] = useState<string>('');
  const [lobbyPlayers, setLobbyPlayers] = useState<string[]>([]);
  const [isJoiningLobby, setIsJoiningLobby] = useState<boolean>(false);
  const [lobbyError, setLobbyError] = useState<string>('');

  // Game Modes (Endless vs Timed Challenge)
  const [gameMode, setGameMode] = useState<'ENDLESS' | 'TIMED'>('ENDLESS');
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isTimeOutEnd, setIsTimeOutEnd] = useState<boolean>(false);

  // Pacemaker dynamic stabilization effect (Option 1)
  const [stabilizationTimeLeft, setStabilizationTimeLeft] = useState<number>(0);
  const stabilizationActiveRef = useRef<boolean>(false);

  // Leaderboard data
  const [leaderboard, setLeaderboard] = useState<ScoreRecord[]>([]);

  // BPM History over time (for the Game Over graph)
  const [bpmHistory, setBpmHistory] = useState<number[]>([]);

  // Sound Engine ref
  const audioSynthRef = useRef<AudioSynthesizer>(new AudioSynthesizer());

  // WebSocket Server Sync Connection ref
  const wsRef = useRef<WebSocket | null>(null);

  // Game configuration & Dynamic scales
  const activeLoopRef = useRef<number | null>(null);
  const lastSpawnTimeRef = useRef<number>(0);
  const lastBeatTimeRef = useRef<number>(0);
  const scoreRef = useRef<number>(score);
  const bpmRef = useRef<number>(currentBPM);
  const isPlayingRef = useRef<boolean>(false);

  // Frame safe reference anchors for high-frequency loops
  const isMultiplayerRef = useRef<boolean>(false);
  const isHostRef = useRef<boolean>(false);

  isMultiplayerRef.current = isMultiplayer;
  isHostRef.current = isHost;
  scoreRef.current = score;
  bpmRef.current = currentBPM;
  stabilizationActiveRef.current = stabilizationTimeLeft > 0;

  // Real-time peer co-op WS matching functions
  const connectToLobby = (code: string) => {
    if (!code.trim()) {
      setLobbyError('الرجاء إدخال رمز الغرفة أولاً');
      return;
    }
    setLobbyError('');
    setIsJoiningLobby(true);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        roomCode: code.toUpperCase(),
        playerName: playerName.trim() || 'نبّاض'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, playerName: senderName, players, isHost: hostStatus, partnerName: oppName, data, message } = payload;

        switch (type) {
          case 'PLAYER_JOINED':
            setLobbyPlayers(players);
            setIsHost(hostStatus);
            break;

          case 'START_MATCH':
            setIsHost(hostStatus);
            setPartnerName(oppName);
            setIsMultiplayer(true);
            setIsJoiningLobby(false);
            setGameState('PLAYING');
            startGame(true);
            break;

          case 'ACTION_BROADCAST':
            handleIncomingBroadcast(data);
            break;

          case 'PARTNER_DISCONNECTED':
            spawnFloatingText('🚨 انقطع اتصال زميلك!', 190, 150, '#ef4444', true);
            setGameState('GAMEOVER');
            audioSynthRef.current.startFlatline();
            break;

          case 'ERROR':
            setLobbyError(message);
            setIsJoiningLobby(false);
            ws.close();
            break;
        }
      } catch (err) {
        console.error("WS client msg error", err);
      }
    };

    ws.onerror = () => {
      setLobbyError('فشل الاتصال بالغرفة. تأكد من تشغيل الخادم.');
      setIsJoiningLobby(false);
    };

    ws.onclose = () => {
      setIsJoiningLobby(false);
    };
  };

  const sendGameAction = (data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'GAME_ACTION',
        data
      }));
    }
  };

  const handleIncomingBroadcast = (action: any) => {
    switch (action.type) {
      case 'SPAWN_THREAT':
        spawnThreatNode(action);
        break;

      case 'TAP_NODE':
        executeLocalTap(action.id, action.isPerfect, action.tapX, action.tapY);
        break;

      case 'MISS_NODE':
        executeLocalMiss(action.id);
        break;

      case 'BPM_CHANGE':
        setCurrentBPM(action.bpm);
        break;
    }
  };

  // Load Leaderboard on mount
  useEffect(() => {
    const rawScores = localStorage.getItem('nabdah_leaderboard_v1');
    if (rawScores) {
      try {
        setLeaderboard(JSON.parse(rawScores));
      } catch (e) {
        console.error("Score load failed", e);
      }
    }
  }, []);

  // Sync mute state to synthesizer
  useEffect(() => {
    audioSynthRef.current.setVolume(isMuted ? 0 : volume);
  }, [isMuted, volume]);

  // Start/Stop dynamic background Ambient Soundtrack based on game state
  useEffect(() => {
    if (gameState === 'PLAYING') {
      audioSynthRef.current.startAmbientSoundtrack(currentBPM);
    } else {
      audioSynthRef.current.stopAmbientSoundtrack();
    }
    return () => {
      audioSynthRef.current.stopAmbientSoundtrack();
    };
  }, [gameState]);

  // Dynamically update Ambient Soundtrack parameters on BPM changes
  useEffect(() => {
    if (gameState === 'PLAYING') {
      audioSynthRef.current.updateAmbientBPM(currentBPM);
    }
  }, [currentBPM, gameState]);

  // Main Rhythm Clock Tick Loop (Spawns double thumps + schedules perfect windows)
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    let beatTimeout: NodeJS.Timeout;
    
    const scheduleNextBeat = () => {
      const msPerBeat = 60000 / bpmRef.current;
      
      // TRIGGER RECURRENT HEARTBEAT
      lastBeatTimeRef.current = Date.now();
      
      // Synthesize audio thump
      if (!isMuted) {
        audioSynthRef.current.playHeartbeat(bpmRef.current);
      }

      // Visual pulse response
      setBeatScale(1.23); // Enlarge heart instantly
      setShowBeatIndicator(true); // Open double-beat golden ring
      setTriggerBeatSign(prev => !prev); // Action EKG monitor spike

      // Close the perfect target zone after 200 milliseconds (Perfect Window 1)
      setTimeout(() => {
        setShowBeatIndicator(false);
      }, 200);

      // Medical ECG Alert sound if client health is critically low
      if (heartHealth < 30 && !isMuted && Math.random() > 0.4) {
        audioSynthRef.current.playAlarmBeep();
      }

      // Schedule next beat
      beatTimeout = setTimeout(scheduleNextBeat, msPerBeat);
    };

    // Kickstart heart beat rhythm
    scheduleNextBeat();

    return () => {
      clearTimeout(beatTimeout);
    };
  }, [gameState, isMuted, heartHealth]);

  // Main 60FPS Game Tick loop (Handles particle physics, node positions, trail animations)
  useEffect(() => {
    if (gameState !== 'PLAYING') {
      if (activeLoopRef.current) {
        cancelAnimationFrame(activeLoopRef.current);
        activeLoopRef.current = null;
      }
      return;
    }

    isPlayingRef.current = true;
    let lastTick = Date.now();

    const gameTick = () => {
      if (!isPlayingRef.current) return;

      const now = Date.now();
      const delta = (now - lastTick) / 16.66; // Normalize based on ~60fps (16.6ms) Target
      lastTick = now;

      // 1. Spawner logic
      // Intervals starts around 2200ms and contracts down to 650ms as score escalates
      const currentScore = scoreRef.current;
      const adaptiveSpawnInterval = Math.max(650, 2200 - (currentScore * 0.12));
      
      if (now - lastSpawnTimeRef.current > adaptiveSpawnInterval) {
        if (!isMultiplayerRef.current || isHostRef.current) {
          spawnThreatNode();
        }
        lastSpawnTimeRef.current = now;
      }

      // 2. Adjust BPM dynamically (Excites the heart as gameplay gets harder!)
      // Limit speed between 72bpm up to extreme 144bpm
      const targetBPM = Math.min(144, 72 + Math.floor(currentScore / 250) * 4);
      if (targetBPM !== bpmRef.current) {
        setCurrentBPM(targetBPM);
        if (isMultiplayerRef.current && isHostRef.current) {
          sendGameAction({ type: 'BPM_CHANGE', bpm: targetBPM });
        }
      }

      // 3. Move nodes towards center heart
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          // Normal threat drops down directly. Sinuous virus curves or scales its threat.
          let nextAngle = node.angle;
          if (node.type === NodeType.VIRUS) {
            // Serpentine sweeping effect based on visual distance left
            nextAngle = node.angle + Math.sin(node.distance / 12) * 0.04;
          } else if (node.type === NodeType.ARRHYTHMIA) {
            // Erratic jagged sway with higher frequencies
            nextAngle = node.angle + Math.sin(now / 80) * 0.06;
          }

          // Advance speed scale based on score level
          const speedMultiplier = 1 + (currentScore / 3000);
          let currentSpeed = node.speed * speedMultiplier * delta;

          // Arrhythmia has sudden speed bursts and slowdowns!
          if (node.type === NodeType.ARRHYTHMIA) {
            const speedWave = 0.5 + Math.abs(Math.sin(now / 200)) * 1.5; // ranges from 0.5 to 2.0x
            currentSpeed *= speedWave;
          }

          // If pacemaker is active, slow down speed by 60% (take 40% speed)
          if (stabilizationActiveRef.current) {
            currentSpeed *= 0.4;
          }

          return {
            ...node,
            angle: nextAngle,
            distance: node.distance - currentSpeed,
            // Tiny organic wobble
            pulseScale: 1 + Math.sin(now / 150) * 0.08,
          };
        })
      );

      // 4. Update and decay debris particles
      setParticles((prevParticles) =>
        prevParticles
          .map((p) => ({
            ...p,
            x: p.x + p.vx * delta,
            y: p.y + p.vy * delta,
            alpha: p.alpha - p.decay * delta,
          }))
          .filter((p) => p.alpha > 0)
      );

      // 5. Update floating notifications
      setFloatingTexts((prevTexts) =>
        prevTexts
          .map((ft) => ({
            ...ft,
            y: ft.y - 0.8 * delta,
            alpha: ft.alpha - 0.03 * delta,
            scale: Math.max(0.7, ft.scale - 0.01 * delta),
          }))
          .filter((ft) => ft.alpha > 0)
      );

      // 6. Smooth recovery decay of the heart scale
      setBeatScale((s) => Math.max(1.0, s - 0.02 * delta));

      activeLoopRef.current = requestAnimationFrame(gameTick);
    };

    activeLoopRef.current = requestAnimationFrame(gameTick);

    return () => {
      isPlayingRef.current = false;
      if (activeLoopRef.current) {
        cancelAnimationFrame(activeLoopRef.current);
        activeLoopRef.current = null;
      }
    };
  }, [gameState]);

  // Spawns electrical disruptions (cyan), virus threats (gold), or clots (red) from visual edges
  const spawnThreatNode = (customData?: any) => {
    // Distance starts at approx 190 (border edge of 380px grid)
    const startDistance = 195;
    
    let id = customData?.id || Math.random().toString(36).substr(2, 9);
    let randomAngle = customData?.angle !== undefined ? customData.angle : Math.random() * Math.PI * 2;
    let type = customData?.threatType || NodeType.DISRUPTION;
    let radius = customData?.radius || 10;
    let initialHealth = customData?.maxHealth || 1;
    let color = customData?.color || '#22d3ee'; // Neon Cyan (Disruption)
    let speed = customData?.speed || 1.2;

    if (!customData) {
      const currentScore = scoreRef.current;
      const roll = Math.random();
      
      if (currentScore > 600 && roll > 0.88) {
        // Neon Orange Arrhythmia: Erratic zig-zag, high threat
        type = NodeType.ARRHYTHMIA;
        color = '#f97316'; // Neon Orange
        speed = 1.4;
        radius = 10;
        initialHealth = 1;
      } else if (currentScore > 420 && roll > 0.74 && roll <= 0.88) {
        // Golden Bio Virus: very fast speed, serpentine path
        type = NodeType.VIRUS;
        color = '#fbbf24'; // Gold
        speed = 1.9;
        radius = 8;
        initialHealth = 1;
      } else if (currentScore > 180 && roll > 0.55 && roll <= 0.74) {
        // Dark red multi-touch blood clot
        type = NodeType.CLOT;
        color = '#f43f5e'; // Red
        initialHealth = 2; // Needs 2 taps
        speed = 0.8; // moves slower because it is heavier
        radius = 13;
      } else if (roll < 0.08) {
        // Neon green Adrenaline: rare restoration packet (+15 hp)
        type = NodeType.ADRENALINE;
        color = '#10b981'; // Neon Green
        speed = 1.1;
        radius = 11;
        initialHealth = 1;
      } else if (roll >= 0.08 && roll < 0.16 && currentScore > 300) {
        // Pacemaker: stabilizes heart node speed for 5s (blue glowing helper)
        type = NodeType.PACEMAKER;
        color = '#38bdf8'; // Sky Blue
        speed = 1.0;
        radius = 12;
        initialHealth = 1;
      }

      if (isMultiplayerRef.current && isHostRef.current) {
        sendGameAction({
          type: 'SPAWN_THREAT',
          id,
          angle: randomAngle,
          threatType: type,
          radius,
          maxHealth: initialHealth,
          color,
          speed
        });
      }
    }

    const newNode: GameNode = {
      id,
      type,
      x: 0,
      y: 0,
      radius,
      angle: randomAngle,
      distance: startDistance,
      speed,
      health: initialHealth,
      maxHealth: initialHealth,
      pulseScale: 1.0,
      color,
    };

    setNodes((prev) => [...prev, newNode]);
  };

  // Triggers tap interaction
  const handleTapNode = (id: string, isPerfect: boolean, tapX: number, tapY: number) => {
    executeLocalTap(id, isPerfect, tapX, tapY);
    if (isMultiplayerRef.current) {
      sendGameAction({
        type: 'TAP_NODE',
        id,
        isPerfect,
        tapX,
        tapY
      });
    }
  };

  const executeLocalTap = (id: string, isPerfect: boolean, tapX: number, tapY: number) => {
    setNodes((prevNodes) => {
      const nodeToHit = prevNodes.find((n) => n.id === id);
      if (!nodeToHit) return prevNodes;

      // Tap decrease health
      const nextHealth = nodeToHit.health - 1;

      // Create spark debris burst on impact
      createExplosionDebris(tapX, tapY, nodeToHit.color, nextHealth <= 0 ? 15 : 6);

      // Play audio cue
      if (isPerfect) {
        audioSynthRef.current.playPerfectSound();
        // Add Perfect score
        setScore((prev) => prev + 200);
        setCombo((prev) => {
          const newCombo = prev + 1;
          if (newCombo > maxCombo) setMaxCombo(newCombo);
          return newCombo;
        });
        
        // Log accuracy tracking
        setAccuracy(prev => ({ total: prev.total + 1, perfect: prev.perfect + 1 }));

        // Append high-glowing Perfect floating text
        spawnFloatingText('🚨 نبضة مثالية! +200', tapX, tapY, '#10b981', true);
      } else {
        audioSynthRef.current.playHitSound();
        setScore((prev) => prev + 100);
        setCombo((prev) => {
          const newCombo = prev + 1;
          if (newCombo > maxCombo) setMaxCombo(newCombo);
          return newCombo;
        });

        setAccuracy(prev => ({ ...prev, total: prev.total + 1 }));
        
        spawnFloatingText('+100 نقرة', tapX, tapY, '#22d3ee', false);
      }

      if (nextHealth <= 0) {
        // Trigger Specialty effects (Option 1 - Gameplay Deepening)
        if (nodeToHit.type === NodeType.ADRENALINE) {
          setHeartHealth((h) => Math.min(100, h + 15));
          spawnFloatingText('❤️ جرعة أدرينالين! +15%', tapX, tapY, '#10b981', true);
        } else if (nodeToHit.type === NodeType.PACEMAKER) {
          setStabilizationTimeLeft(5);
          spawnFloatingText('🛡️ تشغيل منظم النبض! (تباطؤ)', tapX, tapY, '#38bdf8', true);
        } else if (nodeToHit.type === NodeType.ARRHYTHMIA) {
          spawnFloatingText('⚡ نبضة مضطربة جرى تثبيتها!', tapX, tapY, '#f97316', true);
        }

        // Destroy code item
        return prevNodes.filter((n) => n.id !== id);
      } else {
        // Decrement HP on multi-hit blood clot
        return prevNodes.map((n) => {
          if (n.id === id) {
            return { ...n, health: nextHealth };
          }
          return n;
        });
      }
    });
  };

  // Triggered when threat breaks the heart boundary
  const handleMissNode = (id: string) => {
    // In co-op multiplayer, ONLY the Host processes and dictates misses
    if (isMultiplayerRef.current) {
      if (isHostRef.current) {
        executeLocalMiss(id);
        sendGameAction({
          type: 'MISS_NODE',
          id
        });
      }
    } else {
      executeLocalMiss(id);
    }
  };

  const executeLocalMiss = (id: string) => {
    setNodes((prevNodes) => {
      const missedNode = prevNodes.find((n) => n.id === id);
      if (!missedNode) return prevNodes;

      // Determine damage percentage
      let dmg = 10;
      let label = '⚠️ اضطراب قلبي!';
      if (missedNode.type === NodeType.CLOT) {
        dmg = 15;
        label = '🚨 جلطة حادة!!';
      } else if (missedNode.type === NodeType.VIRUS) {
        dmg = 12;
        label = '👾 تلوث خلوي!';
      } else if (missedNode.type === NodeType.ARRHYTHMIA) {
        dmg = 18;
        label = '⚡ نوبة اضطراب حادة!';
      } else if (missedNode.type === NodeType.ADRENALINE) {
        dmg = 0;
        label = '💨 ضاعت جرعة الدعم!';
      } else if (missedNode.type === NodeType.PACEMAKER) {
        dmg = 0;
        label = '🛡️ فاتك منظم النبض!';
      }

      // Apply Screen Shake visual effect
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 240);

      // Trigger warning audio synth damage hit
      audioSynthRef.current.playDamageSound();

      // Break chain combo
      setCombo(0);

      // Spark debris
      // Center coordinates
      createExplosionDebris(190, 190, '#ef4444', 18);

      // Renders Floating damage notification
      spawnFloatingText(`${label} -${dmg}%`, 190, 150, '#ef4444', true);

      // Apply health penalty
      setHeartHealth((h) => {
        const nextH = Math.max(0, h - dmg);
        if (nextH <= 0) {
          handleGameOver();
        }
        return nextH;
      });

      return prevNodes.filter((n) => n.id !== id);
    });
  };

  const handleGameOver = (isTimeOut: boolean = false) => {
    setGameState('GAMEOVER');
    isPlayingRef.current = false;
    setIsTimeOutEnd(isTimeOut);
    
    // Play sound based on outcome
    if (isTimeOut) {
      // Play a positive completion cascade
      audioSynthRef.current.playPerfectSound();
      setTimeout(() => audioSynthRef.current.playPerfectSound(), 150);
      setTimeout(() => audioSynthRef.current.playPerfectSound(), 300);
    } else {
      // Play flatline tone
      audioSynthRef.current.startFlatline();
    }

    // Persist scores
    const finalScore = scoreRef.current;
    const finalAcc = accuracy.total > 0 ? Math.round((accuracy.perfect / accuracy.total) * 100) : 0;
    
    const newRecord: ScoreRecord = {
      score: finalScore,
      maxCombo,
      accuracy: finalAcc,
      date: new Date().toLocaleDateString('ar-EG'),
      playerName: playerName.trim() || 'لاعب نبضة',
      gameMode: gameMode
    };

    setLeaderboard((prev) => {
      const updated = [...prev, newRecord]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5); // Keep top 5
      localStorage.setItem('nabdah_leaderboard_v1', JSON.stringify(updated));
      return updated;
    });
  };

  // Timed challenge 60 seconds countdown
  useEffect(() => {
    if (gameState !== 'PLAYING' || gameMode !== 'TIMED') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleGameOver(true); // timedOut = true
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, gameMode]);

  // Pacemaker stabilization countdown timer (Option 1)
  useEffect(() => {
    if (gameState !== 'PLAYING' || stabilizationTimeLeft <= 0) return;

    const timer = setInterval(() => {
      setStabilizationTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, stabilizationTimeLeft]);

  // Periodically record BPM values during the active game session (every 1.5 seconds)
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const recorder = setInterval(() => {
      setBpmHistory((prev) => {
        // Capture latest BPM from synchronized ref safely
        return [...prev, bpmRef.current];
      });
    }, 1500);

    return () => clearInterval(recorder);
  }, [gameState]);

  // Spark debris burst generator
  const createExplosionDebris = (cx: number, cy: number, color: string, count: number) => {
    // Converts hex colors to rgb format for alpha handling
    let rgb = '34, 211, 238'; // fallback
    if (color === '#ef4444' || color === '#f43f5e') rgb = '244, 63, 94';
    else if (color === '#fbbf24') rgb = '251, 191, 36';
    else if (color === '#10b981') rgb = '16, 185, 129';

    const newParticles: HitParticle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4.5;
      
      newParticles.push({
        id: Math.random().toString(),
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 2,
        color: rgb,
        alpha: 1.0,
        decay: 0.02 + Math.random() * 0.03,
      });
    }

    setParticles((prev) => [...prev, ...newParticles]);
  };

  const spawnFloatingText = (text: string, x: number, y: number, color: string, isPerfect: boolean) => {
    const id = Math.random().toString();
    const newText: FloatingText = {
      id,
      text,
      x: x + (Math.random() - 0.5) * 14, // small variance
      y: y - 5,
      color,
      alpha: 1.1,
      scale: isPerfect ? 1.4 : 1.0,
      isPerfect,
    };
    setFloatingTexts((prev) => [...prev, newText]);
  };

  // Safe game initialisation
  const startGame = async (isMult: boolean = false, selectedMode: 'ENDLESS' | 'TIMED' = 'ENDLESS') => {
    // Init Audio Context safely via user click gesture
    await audioSynthRef.current.initialize();
    
    // Set Game Mode
    setGameMode(selectedMode);
    setTimeLeft(60);
    setIsTimeOutEnd(false);
    setStabilizationTimeLeft(0);

    // Reset Stats
    setHeartHealth(100);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setCurrentBPM(72);
    setBpmHistory([72]);
    setAccuracy({ total: 0, perfect: 0 });
    setNodes([]);
    setParticles([]);
    setFloatingTexts([]);
    lastSpawnTimeRef.current = Date.now();
    lastBeatTimeRef.current = Date.now();

    if (!isMult) {
      setIsMultiplayer(false);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }

    // Persist player name
    localStorage.setItem('nabdah_player_name', playerName);

    setGameState('PLAYING');
  };

  // Re-initialisation on retry
  const restartGame = async () => {
    // Turn off continuous flatline alarm tone
    audioSynthRef.current.stopFlatline();
    startGame(isMultiplayer, gameMode);
  };

  const handleBackToMenu = () => {
    audioSynthRef.current.stopFlatline();
    setGameState('START');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsMultiplayer(false);
  };

  const calculatedAcc = accuracy.total > 0 ? Math.round((accuracy.perfect / accuracy.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#0a0505] text-white flex flex-col justify-start items-center p-4 relative font-sans select-none overflow-x-hidden" dir="rtl">
      
      {/* Background Ambience Lines - Frosted Glass layered glowing background blobs */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0505] to-[#150a0a] pointer-events-none -z-20" />
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] sm:w-[800px] sm:h-[800px] rounded-full blur-[120px] bg-gradient-to-tr from-[#ff1a1a] to-transparent -z-10 animate-pulse" />
        <div className="absolute -bottom-20 -right-20 w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] rounded-full blur-[100px] bg-[#440000] -z-10" />
      </div>

      {/* Main Responsive Game View Frame */}
      <div className={`w-full max-w-md backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-6 shadow-2xl relative flex flex-col gap-5 z-10 transition-all duration-300 ${screenShake ? 'animate-bounce border-red-500/50 scale-[0.98]' : ''}`}>
        
        {/* TOP STATUS HEADER PANEL */}
        <div className="flex justify-between items-center backdrop-blur-md bg-white/5 border border-white/10 p-3 rounded-2xl">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-red-650 rounded-full flex items-center justify-center border border-white/10 shadow-[0_0_15px_rgba(220,38,38,0.8)] animate-pulse">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-wider uppercase text-red-500">Nabdah • نبضة</h1>
              <p className="text-[9px] text-white/40 font-mono tracking-widest uppercase">HEALTH MONITOR V1.0</p>
            </div>
          </div>

          {/* Quick Volume Trigger Controls */}
          <div className="flex items-center gap-2">
            <button 
              id="mute-button"
              onClick={() => setIsMuted(!isMuted)} 
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all text-white/60 cursor-pointer"
              title={isMuted ? "تفعيل الصوت" : "كتم الصوت"}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-red-500" />}
            </button>
            <div className="h-6 w-[1px] bg-white/10" />
            <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md font-mono">{currentBPM} BPM</span>
          </div>
        </div>

        {/* SCREEN MODULE STATE ROUTER */}

        {gameState === 'START' && (
          <div id="start-screen" className="flex flex-col gap-5 py-3 animate-fade-in text-center">
            
            {/* Pulsating Logo Banner */}
            <div className="my-2 relative flex flex-col items-center">
              <div className="absolute -inset-1 bg-red-500/20 rounded-full blur-2xl animate-pulse w-28 h-28 -z-10" />
              <div className="w-20 h-20 bg-gradient-to-b from-red-600 to-red-900 rounded-3xl flex items-center justify-center shadow-[0_0_60px_rgba(220,38,38,0.6)] animate-pulse border-2 border-white/20">
                <Heart className="w-11 h-11 text-white fill-current" />
              </div>
              <h2 className="text-3xl font-black text-white mt-4 font-display tracking-widest text-red-500 uppercase">نَبْضَة • Nabdah</h2>
              <p className="text-[10px] text-white/50 font-mono tracking-widest uppercase mt-1">NABDAH | HEART RHYTHM</p>
              <div className="px-5 mt-3 py-1.5 backdrop-blur-md bg-white/5 border border-white/10 rounded-full inline-block">
                <p className="text-xs text-white/70">لعبة بقاء إيقاعية ممتعة لحماية القلب</p>
              </div>
            </div>

            {/* Player Name Tag Input Field */}
            <div className="flex flex-col gap-1.5 text-right px-1">
              <label className="text-[10px] uppercase font-bold tracking-widest text-white/50">اسم اللاعب (لتسجيل النقاط العليا):</label>
              <input
                id="player-name-input"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.slice(0, 15))}
                placeholder="أدخل اسمك هنا"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-red-500 transition-all font-sans text-center font-bold"
              />
            </div>

            {/* Action Start Buttons */}
            <div className="flex flex-col gap-2 mt-2">
              <button
                id="start-game-btn"
                onClick={() => startGame(false, 'ENDLESS')}
                className="w-full bg-gradient-to-r from-red-650 to-red-800 hover:from-red-550 hover:to-red-700 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/15 shadow-[0_0_15px_rgba(220,38,38,0.4)] active:scale-[0.98] transition-all cursor-pointer text-sm font-display font-medium"
              >
                <Play className="w-4 h-4 fill-current text-white" />
                الوضع الفردي اللانهائي (البقاء)
              </button>

              <button
                id="start-timed-btn"
                onClick={() => startGame(false, 'TIMED')}
                className="w-full bg-gradient-to-r from-amber-550 to-amber-700 hover:from-amber-450 hover:to-amber-600 text-slate-950 font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/15 shadow-[0_0_15px_rgba(251,191,36,0.3)] active:scale-[0.98] transition-all cursor-pointer text-sm font-display font-medium"
              >
                <Zap className="w-4 h-4 fill-current text-slate-950" />
                تحدي الـ 60 ثانية (إنعاش سريع)
              </button>

              {/* Multiplayer Room Joining Section */}
              <div className="flex flex-col gap-2 p-3.5 bg-white/2 pb-4 border border-white/5 rounded-2xl text-right my-1">
                <label className="text-[10px] uppercase font-bold tracking-widest text-[#fbbf24] flex items-center gap-1.5 justify-end">
                  <Zap className="w-3.5 h-3.5 text-[#fbbf24] animate-pulse" />
                  <span>غرفة الطوارئ المشتركة (Co-op Room):</span>
                </label>
                
                <div className="flex gap-2.5 mt-1">
                  <input
                    id="room-code-input"
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.slice(0, 4).toUpperCase())}
                    placeholder="رمز الغرفة (مثال: EMER)"
                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#fbbf24] transition-all font-sans text-center font-bold tracking-widest w-[120px] shrink-0"
                  />
                  
                  <button
                    id="join-room-btn"
                    onClick={() => connectToLobby(roomCode)}
                    disabled={isJoiningLobby}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-slate-950 font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1 outline-none border border-white/10 hover:shadow-[0_0_15px_rgba(251,191,36,0.3)] transition-all cursor-pointer text-[11px] disabled:opacity-50"
                  >
                    {isJoiningLobby ? 'جاري الاتصال...' : 'انضمام كمسعف ثانٍ'}
                  </button>
                </div>

                {lobbyPlayers.length > 0 && isJoiningLobby && (
                  <div className="mt-2.5 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                    <p className="text-[10px] text-[#fbbf24] animate-pulse font-medium mb-1.5">
                      في الانتظار... انضم {lobbyPlayers.length === 1 ? 'مسعف واحد' : 'مسعفان'} للغرفة {roomCode}
                    </p>
                    <div className="flex justify-center gap-1.5 text-[9px] text-white/50 font-mono">
                      {lobbyPlayers.map((name, i) => (
                        <span key={i} className="bg-white/5 px-2 py-0.5 rounded border border-white/10">
                          {name} {i === 0 ? '👑' : '🩺'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {lobbyError && (
                  <p className="text-[10px] text-red-400 text-center mt-1.5 font-medium">{lobbyError}</p>
                )}
              </div>

              <button
                id="how-to-btn"
                onClick={() => setGameState('HOWTO')}
                className="w-full bg-white/5 hover:bg-white/10 text-white/80 font-medium py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/10 shadow transition-all cursor-pointer text-xs"
              >
                <HelpCircle className="w-4 h-4 text-red-400" />
                كيف تلعب والتعليمات؟
              </button>
            </div>

            {/* MINI LEADERBOARD BAR */}
            {leaderboard.length > 0 && (
              <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-3.5 mt-2 text-right">
                <div className="flex justify-between items-center mb-2 px-1 border-b border-white/5 pb-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-white/40">مجموع الجلسات السابقة</span>
                  <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>سجل النبضات الأعلى:</span>
                  </div>
                </div>
                <div className="divide-y divide-white/5">
                  {leaderboard.slice(0, 2).map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 text-xs">
                      <span className="font-bold text-white/95 font-mono">{item.score} <span className="text-[10px] text-white/40 font-normal">نقطة</span></span>
                      <span className="text-white/80">{idx + 1}. {item.playerName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* HOW TO PLAY INTRO SCREEN */}
        {gameState === 'HOWTO' && (
          <div id="howto-screen" className="flex flex-col gap-4 py-1 text-right animate-fade-in font-sans">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-lg font-bold text-white">دليل حماية القلب</h3>
              <button
                onClick={() => setGameState('START')}
                className="p-1 rounded-lg bg-white/5 border border-white/10 text-white hover:text-white/80 transition-all scale-x-[-1] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-white/60 leading-relaxed backdrop-blur-md bg-white/5 border border-white/10 p-4 rounded-2xl">
              <p>مريضنا في حالة حرجة! أجهزة القلب ترصد اضطرابات وتجلطات دموية تهاجم صمامات القلب الحيوية من الأطراف.</p>
              
              <div className="space-y-2.5 mt-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold text-cyan-400 mt-0.5">١</div>
                  <p>تظهر <strong className="text-cyan-400">كرات الاضطرابات الكهربائية (الزرقاء)</strong> وتتجه نحو القلب. انقر عليها لتفجيرها وتطهير مجرى الدم.</p>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold text-red-500 mt-0.5">٢</div>
                  <p><strong className="text-red-400">الجلطات الدموية المتصلبة (الحمراء)</strong> ثقيلة وخطيرة، وتحتاج منك إلى <strong className="text-white">نقرتين كاملتين</strong> لتدميرها.</p>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold text-amber-400 mt-0.5">٣</div>
                  <p><strong className="text-amber-400">ملوثات هجومية (صفراء)</strong> تتحرك بسرعة فائقة وبمسار متعرج حلزوني، انتبه لها جيداً!</p>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold text-orange-400 mt-0.5">٤</div>
                  <p><strong className="text-orange-500">النبض المضطرب (برتقالي)</strong> هجوم مباغت يتقدّم بحركات متسارعة متذبذبة تضليليّة قريبة من الصدمات الحرجة.</p>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold text-sky-400 mt-0.5">٥</div>
                  <p><strong className="text-sky-450">منظم ضربات القلب (أزرق)</strong> داعم تقني عند نقره يقوم بإنتاج حقل تثبيت يُبطئ الكرات القادمة بـ 60% لمدّة 5 ثوانٍ.</p>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 text-[10px] font-bold text-emerald-400 mt-0.5">٦</div>
                  <p><strong className="text-emerald-400">جرعة أدرينالين (أخضر)</strong> حقنة دعم حيوية، نقرها يعافي صحة قلب المريض مباشرة ويمنحه <strong className="text-white">+15% طاقة</strong>.</p>
                </div>
              </div>

              {/* RHYTHM EXPLANATION */}
              <div className="mt-4 p-3 bg-red-550/10 border border-red-500/20 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-red-400 font-bold mb-1 col-reverse text-xs">
                  <Zap className="w-4 h-4 animate-pulse shrink-0" />
                  <span>آلية الإيقاع والنبض (قوة الـ Perfect):</span>
                </div>
                <p className="text-white/80">
                  اللعبة تعتمد على موسيقى نبضات قلب إلكترونية حية. عندما تنقر على أي كرة بالتزامن مع <strong className="text-red-400">دقة وتوهج نبض القلب في المركز (صوت الـ LUB-DUB)</strong>، ستحصل فوراً على ضربة <strong className="text-red-400">مثالية (Perfect!) مضاعفة النقاط</strong>!
                </p>
              </div>
            </div>

            <button
              onClick={() => startGame(false, 'ENDLESS')}
              className="w-full bg-gradient-to-r from-red-650 to-red-800 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/10 hover:shadow-[0_0_15px_rgba(220,38,38,0.5)] active:scale-[0.98] transition-all cursor-pointer text-sm font-display"
            >
              <HeartHandshake className="w-4 h-4 fill-current" />
              جاهز، دعنا نُنقذ القلب!
            </button>
          </div>
        )}

        {/* ACTIVE GAMEPLAY MODULE SCREEN */}
        {gameState === 'PLAYING' && (
          <div id="playing-module" className="flex flex-col gap-4 animate-fade-in font-sans">
            
            {/* Multiplayer Peer Connection Badge */}
            {isMultiplayer && (
              <div className="flex items-center justify-between px-3.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl my-0.5">
                <span className="text-[10px] text-white/50">رمز الغرفة: <strong className="text-[#fbbf24] font-mono">{roomCode}</strong></span>
                <span className="text-[11px] text-[#fbbf24] flex items-center gap-1.5 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  المساعد: {partnerName || 'طبيب طوارئ'}
                </span>
              </div>
            )}

            {/* Real-time Electrocardiogram (ECG) monitor line */}
            <EKGMonitor 
              currentBPM={currentBPM} 
              triggerBeatSign={triggerBeatSign}
              isLowHealth={heartHealth < 30}
              isFlatline={false}
            />

            {/* Score, combo and health bar display */}
            <div className="grid grid-cols-3 backdrop-blur-md bg-white/5 p-3 rounded-2xl border border-white/10 font-mono text-center relative overflow-hidden">
              <div className="border-l border-white/10">
                <span className="block text-[9px] text-white/40 uppercase tracking-widest">النقاط (SCORE)</span>
                <span className="text-lg font-black text-white">{score}</span>
              </div>
              <div className="border-l border-white/10">
                <span className="block text-[9px] text-white/40 uppercase tracking-widest">متتالي (COMBO)</span>
                <span className="text-lg font-black text-red-400">{combo}x</span>
              </div>
              <div>
                <span className="block text-[9px] text-white/40 uppercase tracking-widest">أطول سلسلة</span>
                <span className="text-lg font-black text-amber-500">{maxCombo}</span>
              </div>
            </div>

            {gameMode === 'TIMED' && (
              <div className="space-y-1.5 backdrop-blur-md bg-amber-500/5 p-3 rounded-2xl border border-amber-500/20 text-right animate-fade-in">
                <div className="flex justify-between items-center text-[10px] font-mono px-1">
                  <span className="text-amber-400 font-bold uppercase tracking-wider">المؤقت التنازلي للتحدي (COUNTDOWN)</span>
                  <span className={`font-mono font-bold text-xs py-0.5 px-2 rounded-md ${timeLeft <= 10 ? 'text-red-405 animate-pulse bg-red-550/10 border border-red-500/25' : 'text-amber-400 bg-amber-500/10 border border-amber-500/25'}`}>
                    {timeLeft} ثانية
                  </span>
                </div>
                <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/5 p-0.5">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-gradient-to-r from-red-650 to-rose-550 animate-pulse-glow shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-gradient-to-r from-amber-500 to-yellow-400'}`}
                    style={{ width: `${(timeLeft / 60) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Vital Patient Health level progress meter */}
            <div className="space-y-1.5 backdrop-blur-md bg-white/5 p-3 rounded-2xl border border-white/10">
              <div className="flex justify-between items-center text-[10px] font-mono px-1">
                <span className="text-white/40 uppercase tracking-wider">سلامة القلب (HEART HP)</span>
                <span className={`font-bold ${heartHealth < 30 ? 'text-red-400 animate-pulse' : (heartHealth < 60 ? 'text-orange-400' : 'text-red-500')}`}>
                  {heartHealth}% {heartHealth < 30 ? '⚠️ حالة حرجة' : 'مستقرة'}
                </span>
              </div>
              <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden border border-white/10 p-0.5">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${heartHealth < 30 ? 'bg-gradient-to-r from-red-650 to-rose-550 animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)]' : (heartHealth < 60 ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-gradient-to-r from-red-550 to-rose-500')}`}
                  style={{ width: `${heartHealth}%` }}
                />
              </div>
            </div>

            {/* Pacemaker Active HUD Indicator (Option 1) */}
            {stabilizationTimeLeft > 0 && (
              <div id="pacemaker-hud" className="space-y-1 backdrop-blur-md bg-sky-500/10 p-2.5 rounded-2xl border border-sky-500/30 text-center animate-pulse relative overflow-hidden shadow-[0_0_15px_rgba(56,189,248,0.2)]">
                <div className="flex justify-between items-center text-[10px] font-mono px-1">
                  <span className="text-sky-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                    تم تفعيل منظم ضربات القلب (PACEMAKER ACTIVE)
                  </span>
                  <span className="font-mono font-bold text-sky-450 bg-sky-500/25 py-0.5 px-2 rounded-md border border-sky-500/30">
                    {stabilizationTimeLeft} ثوانٍ
                  </span>
                </div>
                <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-1000"
                    style={{ width: `${(stabilizationTimeLeft / 5) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Main Interactive beating Heart Canvas board */}
            <HeartGameCanvas
              nodes={nodes}
              particles={particles}
              floatingTexts={floatingTexts}
              heartHealth={heartHealth}
              currentBPM={currentBPM}
              beatScale={beatScale}
              isOnBeat={showBeatIndicator}
              score={score}
              combo={combo}
              onTapNode={handleTapNode}
              onMissNode={handleMissNode}
              isPaused={false}
            />

            {/* Pause & emergency abort trigger */}
            <div className="flex justify-center">
              <button
                onClick={handleGameOver}
                className="text-[10px] text-red-500 hover:text-red-400 hover:underline transition-all font-mono"
              >
                [ قطع الاتصال بالنبض ومغادرة الجلسة ]
              </button>
            </div>
          </div>
        )}

        {/* CUSTOM GAMEOVER REPORT DIALOG SCREEN */}
        {gameState === 'GAMEOVER' && (
          <div id="gameover-container" className="flex flex-col gap-4 py-2 animate-fade-in text-center font-sans">
            
            {/* Flatline dead visual monitor state */}
            <EKGMonitor 
              currentBPM={isTimeOutEnd ? currentBPM : 0}
              triggerBeatSign={isTimeOutEnd}
              isLowHealth={false}
              isFlatline={!isTimeOutEnd}
            />

            {/* Flatline Alarm status banner */}
            {isTimeOutEnd ? (
              <div className="p-4 backdrop-blur-md bg-white/5 border border-emerald-500/20 rounded-2xl flex flex-col items-center gap-1.5 my-1 shadow-[0_0_25px_rgba(16,185,129,0.15)] animate-fade-in">
                <Trophy className="w-10 h-10 text-emerald-400 animate-bounce" />
                <h3 className="text-xl font-bold text-emerald-400 font-display">اكتمل التحدي الزمني! ⏱️</h3>
                <p className="text-xs text-white/70">أحسنت يا دكتور! لقد نجحت في حماية القلب وتثبيت النبض طوال الـ 60 ثانية بنجاح.</p>
              </div>
            ) : (
              <div className="p-4 backdrop-blur-md bg-white/5 border border-red-500/20 rounded-2xl flex flex-col items-center gap-1.5 my-1 shadow-[0_0_25px_rgba(220,38,38,0.1)]">
                <Skull className="w-10 h-10 text-red-500 animate-bounce" />
                <h3 className="text-xl font-bold text-red-500 font-display">مات النبض - توقف القلب</h3>
                <p className="text-xs text-white/50">عجز القلب عن التعامل مع تراكم التجلطات والاضطرابات الكهربائية.</p>
              </div>
            )}

            {/* Session statistics */}
            <div className="backdrop-blur-md bg-white/5 p-4 rounded-2xl border border-white/10 text-right space-y-3">
              <h4 className="text-[10px] uppercase tracking-widest text-white/40 font-bold border-b border-white/5 pb-1.5 font-sans">تقرير الكفاءة الحيوية للمسعف:</h4>
              
              <div className="flex justify-between items-center text-xs">
                <span className="text-white/60">الاسم الرمزي للمسعف:</span>
                <span className="font-bold text-white">{playerName || 'لاعب نبضة'}</span>
              </div>
              
              <div className="flex justify-between items-center text-xs">
                <span className="text-white/60">إجمالي النقاط المسجلة:</span>
                <span className="font-mono font-bold text-red-500 text-base">{score} <span className="text-[10px] font-normal text-white/50_at_center">نقطة</span></span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-white/60">الضربات المتتالية (Max Combo):</span>
                <span className="font-mono font-bold text-amber-500">{maxCombo} متتالية</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-white/60">نسبة التطابق الإيقاعي البيرفكت:</span>
                <span className="font-mono font-bold text-cyan-400">{calculatedAcc}%</span>
              </div>
            </div>

            {/* D3-based Cardiac Rate (BPM) Progression Chart */}
            <BpmHistoryChart history={bpmHistory} />

            {/* Interactive leaderboards panel */}
            <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4 text-right">
              <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold mb-2.5 border-b border-white/5 pb-1.5">
                <Trophy className="w-4 h-4" />
                <span>لوحة الشرف للأطباء المسعفين:</span>
              </div>
              <div className="space-y-2">
                {leaderboard.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-1.5 text-xs border-b border-white/5 last:border-0 pl-1">
                    <div className="flex items-center gap-1.5 font-mono text-white/50">
                      <span className="font-bold text-red-400">{item.score}</span>
                      <span className="text-[10px] text-white/30 font-sans">({item.accuracy}%)</span>
                      <span className="text-[9px] text-white/40 font-sans px-1 bg-white/5 rounded-md border border-white/5">
                        {item.gameMode === 'TIMED' ? '⏱️ تحدي' : '♾️ بقاء'}
                      </span>
                    </div>
                    <span className={`text-white/80 ${item.playerName === playerName ? 'font-bold text-red-405' : ''}`}>
                      {idx + 1}. {item.playerName} {item.playerName === playerName && '⭐'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2.5 mt-2">
              <button
                id="retry-game-btn"
                onClick={restartGame}
                className="w-full bg-gradient-to-r from-red-600 to-red-800 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/10 hover:shadow-[0_0_15px_rgba(220,38,38,0.5)] active:scale-[0.98] transition-all cursor-pointer text-sm font-display font-medium"
              >
                <RotateCcw className="w-4 h-4" />
                أعد إنعاش القلب وجرب ثانية
              </button>

              <button
                id="menu-btn"
                onClick={handleBackToMenu}
                className="w-full bg-white/5 hover:bg-white/10 text-white font-medium py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/10 transition-all cursor-pointer text-xs"
              >
                العودة للشاشة الرئيسية
              </button>
            </div>
          </div>
        )}

        {/* FOOTER DETAILS & LOGO */}
        <div className="flex flex-col items-center gap-1 border-t border-white/5 pt-4 text-[9px] uppercase tracking-widest text-white/30 font-mono text-center">
          <p>© {new Date().getFullYear()} NABDHA RHYTHM ENG • ALL SYSTEMS OPERATIONAL</p>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-550 animate-ping" />
            <span>نبضة - نظام حماية القلب التفاعلي</span>
          </div>
        </div>

      </div>
    </div>
  );
}
