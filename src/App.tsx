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
  Zap,
  Users,
  Lock,
  Check,
  UserPlus,
  LogOut,
  Plus,
  Search,
  Send,
  CheckCircle,
  Loader2,
  X,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { GameNode, HitParticle, FloatingText, NodeType, GameState, ScoreRecord } from './types';
import { AudioSynthesizer } from './AudioSynthesizer';
import { EKGMonitor } from './components/EKGMonitor';
import { HeartGameCanvas } from './components/HeartGameCanvas';
import { BpmHistoryChart } from './components/BpmHistoryChart';

// Firebase Integrations
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  serverTimestamp, 
  addDoc 
} from 'firebase/firestore';

export default function App() {
  // Game States
  const [gameState, setGameState] = useState<GameState>('START');
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('nabdah_player_name') || 'نبّاض';
  });

  // Firebase auth & social lobby states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [friendships1, setFriendships1] = useState<any[]>([]);
  const [friendships2, setFriendships2] = useState<any[]>([]);
  const [friendsStatuses, setFriendsStatuses] = useState<Record<string, string>>({});
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  
  const [searchName, setSearchName] = useState<string>('');
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [searchError, setSearchError] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  
  const [incomingInvite, setIncomingInvite] = useState<any | null>(null);
  const [activeInviteDocId, setActiveInviteDocId] = useState<string | null>(null);
  const [outInviteStatus, setOutInviteStatus] = useState<string | null>(null);
  const [isSocialOpen, setIsSocialOpen] = useState<boolean>(false);

  // Online Websocket coop states
  const [isOnlineCoop, setIsOnlineCoop] = useState<boolean>(false);
  const [onlineRole, setOnlineRole] = useState<'HOST' | 'GUEST' | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [partnerName, setPartnerName] = useState<string>('');
  const [isConnectingWs, setIsConnectingWs] = useState<boolean>(false);
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  // Game Play variables (Player 1)
  const [isSplitScreen, setIsSplitScreen] = useState<boolean>(false);
  const [heartHealth, setHeartHealth] = useState<number>(100);
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [currentBPM, setCurrentBPM] = useState<number>(72);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [accuracy, setAccuracy] = useState<number>({ total: 0, perfect: 0 }); // To calculate % perfect score
  
  // Player 2 States (Used in split-screen co-op / versus duel)
  const [heartHealth2, setHeartHealth2] = useState<number>(100);
  const [score2, setScore2] = useState<number>(0);
  const [combo2, setCombo2] = useState<number>(0);
  const [maxCombo2, setMaxCombo2] = useState<number>(0);
  const [accuracy2, setAccuracy2] = useState<number>({ total: 0, perfect: 0 });
  const [nodes2, setNodes2] = useState<GameNode[]>([]);
  const [particles2, setParticles2] = useState<HitParticle[]>([]);
  const [floatingTexts2, setFloatingTexts2] = useState<FloatingText[]>([]);
  const [beatScale2, setBeatScale2] = useState<number>(1.0);
  const [stabilizationTimeLeft2, setStabilizationTimeLeft2] = useState<number>(0);

  // Active Entities (Player 1)
  const [nodes, setNodes] = useState<GameNode[]>([]);
  const [particles, setParticles] = useState<HitParticle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  
  // Visual effects (Player 1 & Shared UI)
  const [screenShake, setScreenShake] = useState<boolean>(false);
  const [screenShake2, setScreenShake2] = useState<boolean>(false);
  const [beatScale, setBeatScale] = useState<number>(1.0);
  const [showBeatIndicator, setShowBeatIndicator] = useState<boolean>(false); // Beats visual halo
  const [triggerBeatSign, setTriggerBeatSign] = useState<boolean>(false); // Triggers EKG spike
  const [triggerBeatSign2, setTriggerBeatSign2] = useState<boolean>(false); // Triggers Player 2 EKG spike
  const [volume, setVolume] = useState<number>(0.6);

  // Single Player Game Modes (Endless vs Timed Challenge vs Levels)
  const [gameMode, setGameMode] = useState<'ENDLESS' | 'TIMED' | 'LEVELS'>('ENDLESS');
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isTimeOutEnd, setIsTimeOutEnd] = useState<boolean>(false);
  const [currentLevel, setCurrentLevel] = useState<number>(1);
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState<number>(1);
  const [levelCompleted, setLevelCompleted] = useState<boolean>(false);
  const [showLevelsView, setShowLevelsView] = useState<boolean>(false);
  const [activeLevelTab, setActiveLevelTab] = useState<'CLASSIC' | 'MUTATED' | 'VASCULAR'>('CLASSIC');
  const [selectedLevelInfo, setSelectedLevelInfo] = useState<number | null>(null);

  // Helper to calculate stage configurations (1 to 90) - Scales difficulty beautifully
  const getStageConfig = (lvl: number) => {
    // Advanced Vascular Campaign stages (61 to 90) & Mutated stages (31 to 60)
    let targetScore = lvl * 100 + 50; 
    if (lvl === 30) {
      targetScore = 3500; // Epic boss score goal
    } else if (lvl === 60) {
      targetScore = 6000; // Ultimate giant megaboss boss score goal
    } else if (lvl === 90) {
      targetScore = 9000; // Ultimate coronary embolus boss score goal
    } else if (lvl >= 61) {
      targetScore = 6200 + (lvl - 60) * 140;
    } else if (lvl >= 31) {
      // Scale target scores nicely for the advanced arc
      targetScore = 3000 + (lvl - 30) * 120;
    }
    
    // Shorter spawn intervals as level increases (clamped sensibly)
    const baseSpawnInterval = Math.max(
      lvl >= 80 ? 270 : lvl >= 61 ? 310 : lvl >= 50 ? 320 : lvl >= 31 ? 380 : lvl === 30 ? 460 : 440,
      2400 - (lvl * 64)
    ); 
    
    // Higher speed base factor as difficulty expands
    const baseSpeed = lvl >= 61 ? 0.8 + (lvl * 0.046) : 0.8 + (lvl * 0.057); 
    return { targetScore, baseSpawnInterval, baseSpeed };
  };

  const getStageDescription = (lvl: number) => {
    if (lvl === 90) {
      return {
        title: "انسداد الشريان التاجي الأعظم (المستوى النهائي النهائي 90)! 🫀🚨",
        threats: "زعيم الانسداد الوعائي النهائي CORONARY_EMBOLUS_BOSS (يتطلب 20 ضربة!) + سيل جارف من الخثرات والجلطات الشريانية والوريدية المتزامنة!",
        speed: "صاعقة وقاتلة ⚡🔴🔵",
        desc: "لقد غدوت المسعف الرائد المنقذ لحياة المريض! الشريان التاجي الرئيسي مسدود تماماً ويحتاج لـ 20 ضربة مدوية مباشرة لتفتيته، مع تدفق رهيب للأوعية والشرايين الممتلئة بالخثرات من الجوانب الثمانية. حافظ على ثباتك الإيقاعي الكامل لمنع تشكل الجلطات وحماية شرايين الحياة وتطهير قلب المريض للنهاية وصناعة الإعجاز الطبي!"
      };
    }
    if (lvl >= 81) {
      return {
        title: `حملة الأوعية: الخثرة الوريدية الصاعقة - مستوى ${lvl}`,
        threats: "الخثرة الوريدية الزرقاء (Vein Thrombus - نقرتان، حركة متعرجة سريعة للغاية) + جلطات شريانية صعبة ولويحات صفراء!",
        speed: "سريعة وعشوائية متعرجة 🌀🔵",
        desc: "الأوردة العميقة بحاجة لمسعف ذكي وسريع! جلطات الأوردة الزرقاء تتحرك بشكل متعرج خاطف كأنها تختبئ داخل جدران الأوعية. تتبعها بكفاءة قبل أن تسد الرئتين!"
      };
    }
    if (lvl >= 71) {
      return {
        title: `حملة الأوعية: تصلب الشرايين العصيدي - مستوى ${lvl}`,
        threats: "لويحات التصلب الدهنية الضخمة الصفراء (Atheroma Plaque - تحتاج 4 نقرات مغلظة لتفتيتها) + جلطات قرمزية متسارعة!",
        speed: "نبض وعائي جداري ضيق ⏳🟡",
        desc: "لقد أدى تراكم الكوليسترول الملوث إلى انسدادات متصلبة صعبة الإذابة! تحتاج لويحات التصلب الصفراء لضربات مركزة وتفتيت متكرر لفتح منفذ الشرايين صماماً صماماً وتوسعة الأوعية."
      };
    }
    if (lvl >= 61) {
      return {
        title: `حملة الأوعية الدموية: منع الجلطات - مستوى ${lvl}`,
        threats: "الجلطة الشريانية المتضخمة الحمراء (Arterial Clot - تحتاج 3 نقرات وتكبر تدريجيا في الحجم أثناء اقترابها من القلب) + منظمات نبض!",
        speed: "نبض شرياني حاد ودافق 🛑🔴",
        desc: "مرحباً بك في حملة الأوعية الدموية والشرايين! الجلطات الشريانية الحمراء تغزو جدران شرايين المريض وتتضخم أثناء حركتها. بصفتك المسعف البطل، تفتيتها بنقرات متلاحقة يمنع الجلطات القلبية الوعائية وينقذ دقاته!"
      };
    }
    if (lvl === 60) {
      return {
        title: "المواجهة المطلقة: المدمر الميكانيكي الأخير (المستوى النهائي 60)!",
        threats: "زعيم النانو الميكانيكي العملاق NANO_MEGA_BOSS (يتطلب 15 ضربة متتالية!) + سيل من الفيروسات التاجية وأبواغ البلازما!",
        speed: "عاصفة تجتاح الكيان ⚡⚡⚡",
        desc: "لقد وصلت إلى ذروة المغامرة المجهرية! لقد طوّر الفيروس نفسه إلى آلة ميكانيكية مدمرة لغزو خلايا عضلات القلب تماماً. صماماتك الإيقاعية وتركيزك المطلق هما الأمل الأخير لإذابة صفائح النانو المغناطيسية لهذا الكيان المعدني واستئصال الطفرة نهائياً!"
      };
    }
    if (lvl >= 51) {
      return {
        title: `التحول التاجي المتكامل - مستوى ${lvl}`,
        threats: "الفيروس التاجي المتحور (Crown Coronavirus - 3 نقرات) + أبواغ البلازما وهجمات جراثيم الاختراق المتزامنة!",
        speed: "برق حيوي خاطف 🚀⚡",
        desc: "مستعمرات الفيروس التاجي ذات النتوءات الشوكية الحادة تجتاح النبض! هذه الفيروسات قادرة على التمدد والتقلص العشوائي بشكل يخدع الحواس ويفقدك الإيقاع دون ثبات كامل."
      };
    }
    if (lvl >= 41) {
      return {
        title: `الشرارة النانوية الرقمية - مستوى ${lvl}`,
        threats: "أجسام نانو فيج السيبرانية الراقصة (Cyber Phage) + فيروسات غراء سريعة ومقويات نبض نادرة!",
        speed: "تسونامي سيبراني 🔊",
        desc: "تتراكم الكبسولات النانوية ذات الستة أرجل معدنية حول صماماتك لتبث تشويشات برمجية دقيقة! تصرف بسرعة بالغة واقض عليها إثر حركتها المتموجة السريعة."
      };
    }
    if (lvl >= 31) {
      return {
        title: `حقبة المتغيرات البلازمية - مستوى ${lvl}`,
        threats: "أبواغ البلازما المشحونة (Plasma Spore) + الفيروسات الرجعية الملتوية ذات الخيوط الأنيقة!",
        speed: "نبض مجهري فتاك 🌋",
        desc: "مرحباً بك في المنطقة المتقدمة المتميزة بالمؤثرات الصوتية والمحيطية المتغيرة! حقل القوة الحبوح حوّل الأنقاض المجهرية إلى هالات طاقة مضيئة مدمّرة لسلامة الأوردة والشرايين."
      };
    }
    if (lvl === 30) {
      return {
        title: "المعركة الكبرى: بكتيريا العملاق الأبيدوس!",
        threats: "البكتيريا العملاقة (تتطلب 10 نقرات متتالية) + جيش من الجراثيم الخاطفة والبكتيريا الضخمة والجلطات السريعة!",
        speed: "قصوى متغيرة ⚡",
        desc: "لقد وصلت إلى المعقل الأخير من الآفة الجراحية! عليك بمواجهة البكتيريا الأكبر مائة مرة والمدعومة بمساعديها الحرافيين. القضاء التام عليها يتطلب تدميرها مباشرة أو الوصول للهدف لتعقيم صمامات قلبك نهائياً والانتصار باللعبة!"
      };
    }
    if (lvl >= 21) {
      return {
        title: `العاصفة الجرثومية - مستوى ${lvl}`,
        threats: "جراثيم خاطفة متسارعة، فيروس الحصبة الذهبي، ججلطات دموية مركبة، بكتيريا ثنائية!",
        speed: "سريعة جداً 🚀",
        desc: "الصعوبة بلغت حدًا محرجًا! تقترب الجراثيم بسرعة جارفة لتخترق نبضات قلبك. حافظ على أقصى تركيز وقم بتنشيط الأوتار الإيقاعية."
      };
    }
    if (lvl >= 15) {
      return {
        title: `تشنج البطين الحاد - مستوى ${lvl}`,
        threats: "مزيج خطير من البكتيريا الخضراء، الفيروسات الدائرية المتنقلة، ومنظمات مفقودة!",
        speed: "سريعة 🏃",
        desc: "الأوعية الدموية تتعرض لاختبار قاسي. تبدأ الصعوبة بالتمدد العسير كلما خطوت مقتربًا من النهاية الكبرى."
      };
    }
    if (lvl >= 8) {
      return {
        title: `غزو الجرثومة الخاطفة - مستوى ${lvl}`,
        threats: "الجرثومة البنفسجية فائقة السرعة (تحتاج نقرة سريعة جداً لدفاع دقيق) + بكتيريا مستدعاة!",
        speed: "فوق المتوسط ✨",
        desc: "تحذير: تسللت جراثيم ذكية وصغيرة الحجم قادرة على التخفي والمناورة الإيقاعية الكثيفة!"
      };
    }
    if (lvl >= 4) {
      return {
        title: `هيجان البكتيريا الكبيرة - مستوى ${lvl}`,
        threats: "البكتيريا الكبيرة الخضراء (تتطلب 3 نقرات وتستدعي بكتيريا أصغر كل 15 ثانية)!",
        speed: "متوسط 📈",
        desc: "أجسام بكتيرية ثقيلة تهاجم الجدران العضلية للقلب وتتطلب ضربات متكررة قبل تفتيتها!"
      };
    }
    return {
      title: `تعقيم صمامات القلب - مستوى ${lvl}`,
      threats: "اضطرابات نبضية بسيطة وجلتات حمراء طفيفة طارئة.",
      speed: "معتدل وسهل 🧘",
      desc: "بداية رحلة النبض الإيقاعي البسيط. تخلص من المشوشات الزرقاء والجلطات وحافظ على معدل ضربات القلب مستقراً لفتح المراحل الأعلى."
    };
  };

  // Pacemaker dynamic stabilization effect (Option 1)
  const [stabilizationTimeLeft, setStabilizationTimeLeft] = useState<number>(0);
  const stabilizationActiveRef = useRef<boolean>(false);

  // Leaderboard data
  const [leaderboard, setLeaderboard] = useState<ScoreRecord[]>([]);

  // BPM History over time (for the Game Over graph)
  const [bpmHistory, setBpmHistory] = useState<number[]>([]);

  // Sound Engine ref
  const audioSynthRef = useRef<AudioSynthesizer>(new AudioSynthesizer());

  // Game configuration & Dynamic scales
  const activeLoopRef = useRef<number | null>(null);
  const lastSpawnTimeRef = useRef<number>(0);
  const lastSpawnTimeRef2 = useRef<number>(0);
  const lastBeatTimeRef = useRef<number>(0);
  const scoreRef = useRef<number>(score);
  const scoreRef2 = useRef<number>(score2);
  const bpmRef = useRef<number>(currentBPM);
  const isPlayingRef = useRef<boolean>(false);
  const stabilizationActiveRef2 = useRef<boolean>(false);
  const isSplitScreenRef = useRef<boolean>(false);

  scoreRef.current = score;
  scoreRef2.current = score2;
  bpmRef.current = currentBPM;
  stabilizationActiveRef.current = stabilizationTimeLeft > 0;
  stabilizationActiveRef2.current = stabilizationTimeLeft2 > 0;
  isSplitScreenRef.current = isSplitScreen;

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
    const rawLvl = localStorage.getItem('nabdah_max_unlocked_level_v1');
    if (rawLvl) {
      const parsed = parseInt(rawLvl, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 90) {
        setMaxUnlockedLevel(parsed);
      }
    }
  }, []);

  // Update user status in database helper
  const updateMyStatus = async (status: 'online' | 'offline' | 'ingame') => {
    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          status,
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
      }
    }
  };

  // 1. Google Auth & User Profile tracking
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Register/update user profile
        const userRef = doc(db, 'users', user.uid);
        try {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email || `${user.uid}@nabdah.app`,
            displayName: user.displayName || user.email?.split('@')[0] || 'طبيب نبّاض',
            photoURL: user.photoURL || 'https://api.dicebear.com/7.x/pixel-art/svg?seed=' + user.uid,
            status: 'online',
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
        }

        setPlayerName(user.displayName || user.email?.split('@')[0] || 'نبّاض');

        // Restore & Sync progress with Firestore
        try {
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const dbMax = userData.maxUnlockedLevel || 1;
            const dbCompleted: number[] = userData.completedLevels || [];

            // Read from local storage
            const localMaxStr = localStorage.getItem('nabdah_max_unlocked_level_v1');
            const localMax = localMaxStr ? parseInt(localMaxStr, 10) : 1;
            const finalMax = Math.max(dbMax, isNaN(localMax) ? 1 : localMax);

            let localCompleted: number[] = [];
            try {
              localCompleted = JSON.parse(localStorage.getItem('nabdah_completed_levels_v1') || '[]');
            } catch (e) {
              console.error(e);
            }

            const mergedSet = new Set([...dbCompleted, ...localCompleted]);
            const finalCompleted = Array.from(mergedSet).filter(lvl => !isNaN(lvl) && lvl >= 1 && lvl <= 90);

            // Update local storage
            localStorage.setItem('nabdah_max_unlocked_level_v1', String(finalMax));
            localStorage.setItem('nabdah_completed_levels_v1', JSON.stringify(finalCompleted));

            // Set React level state
            setMaxUnlockedLevel(finalMax);

            // Update database if local has different or newer progress
            if (finalMax > dbMax || finalCompleted.length > dbCompleted.length) {
              await updateDoc(userRef, {
                maxUnlockedLevel: finalMax,
                completedLevels: finalCompleted,
                updatedAt: serverTimestamp()
              });
            }
          }
        } catch (err) {
          console.error("Failed to restore level progress from cloud database: ", err);
        }

        // Listen to friendships where current user is user1
        const q1 = query(collection(db, 'friendships'), where('user1', '==', user.uid));
        const unsub1 = onSnapshot(q1, (snapshot) => {
          const list1 = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setFriendships1(list1);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'friendships');
        });

        // Listen to friendships where current user is user2
        const q2 = query(collection(db, 'friendships'), where('user2', '==', user.uid));
        const unsub2 = onSnapshot(q2, (snapshot) => {
          const list2 = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setFriendships2(list2);
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, 'friendships');
        });

        return () => {
          unsub1();
          unsub2();
        };
      } else {
        setFriendships1([]);
        setFriendships2([]);
        setFriends([]);
        setPendingRequests([]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Sync window unload to go offline
  useEffect(() => {
    const handleUnloadEnd = () => {
      updateMyStatus('offline');
    };
    window.addEventListener('beforeunload', handleUnloadEnd);
    return () => {
      window.removeEventListener('beforeunload', handleUnloadEnd);
    };
  }, [currentUser]);

  // 2. Merging Friendships and Pending Requests
  useEffect(() => {
    if (!currentUser) return;

    const merged = [...friendships1, ...friendships2];
    const uniqueFriendships = merged.filter((item, index, self) =>
      self.findIndex(t => t.id === item.id) === index
    );

    const pending: any[] = [];
    const acceptedList: any[] = [];

    uniqueFriendships.forEach(f => {
      if (f.status === 'pending') {
        const isIncoming = f.user2 === currentUser.uid;
        pending.push({
          ...f,
          isIncoming,
          friendUid: f.user1 === currentUser.uid ? f.user2 : f.user1,
          friendEmail: f.user1 === currentUser.uid ? f.user2Email : f.user1Email,
          friendName: f.user1 === currentUser.uid ? f.user2Name : f.user1Name,
          friendPhoto: f.user1 === currentUser.uid ? f.user2Photo : f.user1Photo
        });
      } else if (f.status === 'accepted') {
        acceptedList.push({
          ...f,
          friendUid: f.user1 === currentUser.uid ? f.user2 : f.user1,
          friendEmail: f.user1 === currentUser.uid ? f.user2Email : f.user1Email,
          friendName: f.user1 === currentUser.uid ? f.user2Name : f.user1Name,
          friendPhoto: f.user1 === currentUser.uid ? f.user2Photo : f.user1Photo
        });
      }
    });

    setFriends(acceptedList);
    setPendingRequests(pending);
  }, [friendships1, friendships2, currentUser]);

  // 3. Listen to each accepted friend's online status
  useEffect(() => {
    if (!currentUser || friends.length === 0) return;

    const unsubscribes = friends.map(f => {
      const friendUid = f.friendUid;
      return onSnapshot(doc(db, 'users', friendUid), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setFriendsStatuses(prev => ({
            ...prev,
            [friendUid]: data.status || 'offline'
          }));
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${friendUid}`);
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [friends, currentUser]);

  // 4. Real-time Incoming Match Invitations listener
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'invitations'), 
      where('receiverId', '==', currentUser.uid), 
      where('status', '==', 'pending')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        // Find newest
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // Settle on first pending invite
        setIncomingInvite(docs[0]);
      } else {
        setIncomingInvite(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'invitations');
    });

    return () => unsub();
  }, [currentUser]);

  // 5. Real-time Outgoing Invite update listener
  useEffect(() => {
    if (!currentUser || !activeInviteDocId) return;

    const unsub = onSnapshot(doc(db, 'invitations', activeInviteDocId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setOutInviteStatus(data.status);
        if (data.status === 'accepted') {
          // Join room as HOST!
          connectToWebSocket(data.roomCode, playerName, 'HOST');
          setActiveInviteDocId(null);
          setOutInviteStatus(null);
        } else if (data.status === 'declined') {
          alert('يريد زميلك الطبيب التريث قليلاً؛ تم رفض طلب الانضمام.');
          setActiveInviteDocId(null);
          setOutInviteStatus(null);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `invitations/${activeInviteDocId}`);
    });

    return () => unsub();
  }, [currentUser, activeInviteDocId]);

  // Sync mute state to synthesizer
  useEffect(() => {
    audioSynthRef.current.setVolume(isMuted ? 0 : volume);
  }, [isMuted, volume]);

  // Start/Stop dynamic background Ambient Soundtrack based on game state
  useEffect(() => {
    if (gameState === 'PLAYING') {
      const isMutated = gameMode === 'LEVELS' && currentLevel >= 31;
      audioSynthRef.current.startAmbientSoundtrack(currentBPM, isMutated);
    } else {
      audioSynthRef.current.stopAmbientSoundtrack();
    }
    return () => {
      audioSynthRef.current.stopAmbientSoundtrack();
    };
  }, [gameState, gameMode, currentLevel]);

  // Dynamically update Ambient Soundtrack parameters on BPM, health and stage changes
  useEffect(() => {
    if (gameState === 'PLAYING') {
      const isDanger = heartHealth < 35 || (isSplitScreen && heartHealth2 < 35);
      const isBoss = gameMode === 'LEVELS' && (currentLevel === 30 || currentLevel === 60);
      audioSynthRef.current.updateAmbientBPM(currentBPM, isDanger, isBoss);
    }
  }, [currentBPM, gameState, heartHealth, heartHealth2, isSplitScreen, gameMode, currentLevel]);

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
      setBeatScale2(1.23); // Enlarge player 2 heart too
      setShowBeatIndicator(true); // Open double-beat golden ring
      setTriggerBeatSign(prev => !prev); // Action EKG monitor spike
      setTriggerBeatSign2(prev => !prev); // Action Player 2 EKG spike

      // Close the perfect target zone after 200 milliseconds (Perfect Window 1)
      setTimeout(() => {
        setShowBeatIndicator(false);
      }, 200);

      // Medical ECG Alert sound if client health is critically low
      const isCritical = heartHealth < 30 || (isSplitScreen && heartHealth2 < 30);
      if (isCritical && !isMuted && Math.random() > 0.4) {
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

      // Check for stage completion
      if (gameMode === 'LEVELS' && !levelCompleted && scoreRef.current >= getStageConfig(currentLevel).targetScore) {
        setLevelCompleted(true);
        setGameState('LEVEL_COMPLETE');
        isPlayingRef.current = false;
        audioSynthRef.current.stopAmbientSoundtrack();
        audioSynthRef.current.playPerfectSound();
        
        // Save level status
        const nextLvl = currentLevel + 1;
        let updatedMaxLvl = maxUnlockedLevel;
        if (nextLvl <= 90 && nextLvl > maxUnlockedLevel) {
          updatedMaxLvl = nextLvl;
          setMaxUnlockedLevel(nextLvl);
          localStorage.setItem('nabdah_max_unlocked_level_v1', String(nextLvl));
        }
        
        // Add level to completed list
        let completedList: number[] = [];
        try {
          completedList = JSON.parse(localStorage.getItem('nabdah_completed_levels_v1') || '[]');
          if (!completedList.includes(currentLevel)) {
            completedList.push(currentLevel);
            localStorage.setItem('nabdah_completed_levels_v1', JSON.stringify(completedList));
          }
        } catch (e) {
          console.error(e);
        }

        // Deploy/save level progress immediately to Firestore if authenticated
        if (currentUser) {
          const userRef = doc(db, 'users', currentUser.uid);
          try {
            updateDoc(userRef, {
              maxUnlockedLevel: updatedMaxLvl,
              completedLevels: completedList,
              updatedAt: serverTimestamp()
            });
          } catch (e) {
            console.error("Failed to sync progress to cloud database on level complete: ", e);
          }
        }
        return;
      }

      // 1. Spawner logic for Player 1 & Player 2
      const currentScore1 = scoreRef.current;
      let adaptiveSpawnInterval1 = Math.max(655, 2200 - (currentScore1 * 0.12));
      if (gameMode === 'LEVELS') {
        adaptiveSpawnInterval1 = getStageConfig(currentLevel).baseSpawnInterval;
      }
      
      if (now - lastSpawnTimeRef.current > adaptiveSpawnInterval1) {
        if (!isOnlineCoop || onlineRole === 'HOST') {
          spawnThreatNode(1);
        }
        lastSpawnTimeRef.current = now;
      }

      if (isSplitScreenRef.current) {
        const currentScore2 = scoreRef2.current;
        let adaptiveSpawnInterval2 = Math.max(655, 2200 - (currentScore2 * 0.12));
        if (gameMode === 'LEVELS') {
          adaptiveSpawnInterval2 = getStageConfig(currentLevel).baseSpawnInterval;
        }
        
        if (now - lastSpawnTimeRef2.current > adaptiveSpawnInterval2) {
          if (!isOnlineCoop || onlineRole === 'HOST') {
            spawnThreatNode(2);
          }
          lastSpawnTimeRef2.current = now;
        }
      }

      // 2. Adjust BPM dynamically (Excites the heart as gameplay gets harder!)
      // Limit speed between 72bpm up to extreme 144bpm
      const maxScore = isSplitScreenRef.current ? Math.max(currentScore1, scoreRef2.current) : currentScore1;
      let targetBPM = Math.min(144, 72 + Math.floor(maxScore / 250) * 4);
      if (gameMode === 'LEVELS') {
        targetBPM = Math.min(150, 72 + (currentLevel * 2));
      }
      if (targetBPM !== bpmRef.current) {
        setCurrentBPM(targetBPM);
      }

      // 3. Move nodes towards center heart (Player 1)
      setNodes((prevNodes) => {
        let extraNodes: GameNode[] = [];
        let playedSound = false;

        const updatedNodes = prevNodes.map((node) => {
          let nextAngle = node.angle;
          if (node.type === NodeType.VIRUS) {
            nextAngle = node.angle + Math.sin(node.distance / 12) * 0.04;
          } else if (node.type === NodeType.ARRHYTHMIA) {
            nextAngle = node.angle + Math.sin(now / 80) * 0.06;
          } else if (node.type === NodeType.VEIN_THROMBUS) {
            // Zigzag motion mimicking cardiac venous valves
            nextAngle = node.angle + Math.sin(now / 50) * 0.08;
          } else if (node.type === NodeType.BIG_BACTERIA || node.type === NodeType.SMALL_BACTERIA || node.type === NodeType.GIANT_BOSS || node.type === NodeType.FAST_GERM || node.type === NodeType.CORONARY_EMBOLUS_BOSS) {
            // High-polish live organic wiggle/dancing offset by unique node id phase
            const wigglePhase = (node.id.charCodeAt(0) % 10) * 1.5;
            nextAngle = node.angle + Math.sin(now / 100 + wigglePhase) * 0.038;
          }

          const speedMultiplier = 1 + (currentScore1 / 3000);
          let currentSpeed = node.speed * speedMultiplier * delta;

          if (node.type === NodeType.ARRHYTHMIA) {
            const speedWave = 0.5 + Math.abs(Math.sin(now / 200)) * 1.5;
            currentSpeed *= speedWave;
          } else if (node.type === NodeType.ATHEROMA_PLAQUE) {
            // Atheroma Plaque is very dense, moving slower
            currentSpeed *= 0.45;
          }

          if (stabilizationActiveRef.current) {
            currentSpeed *= 0.4;
          }

          // Grows in size as it gets closer to heart
          const finalRadius = node.type === NodeType.ARTERIAL_CLOT 
            ? Math.min(22, 13 + (195 - (node.distance - currentSpeed)) * 0.05) 
            : node.radius;

          // Check summon condition for BIG_BACTERIA, GIANT_BOSS, or CORONARY_EMBOLUS_BOSS
          let lastSummon = node.lastSummonTime;
          if (node.type === NodeType.BIG_BACTERIA) {
            if (!lastSummon) {
              lastSummon = now; // initialize
            } else if (now - lastSummon >= 15000) {
              lastSummon = now;
              playedSound = true;
              
              const angles = [node.angle - 0.2, node.angle, node.angle + 0.2];
              angles.forEach((sa) => {
                extraNodes.push({
                  id: Math.random().toString(36).substr(2, 9),
                  type: NodeType.SMALL_BACTERIA,
                  x: 0,
                  y: 0,
                  radius: 9,
                  angle: sa,
                  distance: node.distance,
                  speed: node.speed * 1.3,
                  health: 2,
                  maxHealth: 2,
                  pulseScale: 1.0,
                  color: '#4ade80'
                });
              });
            }
          } else if (node.type === NodeType.GIANT_BOSS) {
            if (!lastSummon) {
              lastSummon = now; // initialize
            } else if (now - lastSummon >= 8500) {
              lastSummon = now;
              playedSound = true;
              // Spawns 2 ultra-fast germs and 1 small bacteria helper as vanguard!
              extraNodes.push({
                id: Math.random().toString(36).substr(2, 9),
                type: NodeType.SMALL_BACTERIA,
                x: 0,
                y: 0,
                radius: 9,
                angle: node.angle,
                distance: node.distance - 12,
                speed: node.speed * 1.4,
                health: 2,
                maxHealth: 2,
                pulseScale: 1.0,
                color: '#4ade80'
              });
              extraNodes.push({
                id: Math.random().toString(36).substr(2, 9),
                type: NodeType.FAST_GERM,
                x: 0,
                y: 0,
                radius: 7,
                angle: node.angle - 0.25,
                distance: node.distance - 8,
                speed: node.speed * 2.2,
                health: 1,
                maxHealth: 1,
                pulseScale: 1.0,
                color: '#df49fa'
              });
              extraNodes.push({
                id: Math.random().toString(36).substr(2, 9),
                type: NodeType.FAST_GERM,
                x: 0,
                y: 0,
                radius: 7,
                angle: node.angle + 0.25,
                distance: node.distance - 8,
                speed: node.speed * 2.2,
                health: 1,
                maxHealth: 1,
                pulseScale: 1.0,
                color: '#df49fa'
              });
            }
          } else if (node.type === NodeType.CORONARY_EMBOLUS_BOSS) {
            if (!lastSummon) {
              lastSummon = now;
            } else if (now - lastSummon >= 8000) {
              lastSummon = now;
              playedSound = true;
              // Summon a crimson arterial clot and a deep blue vein thrombus
              extraNodes.push({
                id: Math.random().toString(36).substr(2, 9),
                type: NodeType.ARTERIAL_CLOT,
                x: 0,
                y: 0,
                radius: 12,
                angle: node.angle - 0.22,
                distance: node.distance - 15,
                speed: node.speed * 1.4,
                health: 3,
                maxHealth: 3,
                pulseScale: 1.0,
                color: '#dc2626'
              });
              extraNodes.push({
                id: Math.random().toString(36).substr(2, 9),
                type: NodeType.VEIN_THROMBUS,
                x: 0,
                y: 0,
                radius: 11,
                angle: node.angle + 0.22,
                distance: node.distance - 10,
                speed: node.speed * 1.8,
                health: 2,
                maxHealth: 2,
                pulseScale: 1.0,
                color: '#2563eb'
              });
            }
          }

          return {
            ...node,
            radius: finalRadius,
            angle: nextAngle,
            distance: node.distance - currentSpeed,
            pulseScale: 1 + Math.sin(now / 150) * 0.08,
            lastSummonTime: lastSummon
          };
        });

        if (playedSound && !isMuted) {
          audioSynthRef.current.playSummonSound();
        }

        return [...updatedNodes, ...extraNodes];
      });

      // Move nodes towards center heart (Player 2)
      if (isSplitScreenRef.current) {
        setNodes2((prevNodes) => {
          let extraNodes: GameNode[] = [];
          let playedSound = false;

          const updatedNodes = prevNodes.map((node) => {
            let nextAngle = node.angle;
            if (node.type === NodeType.VIRUS) {
              nextAngle = node.angle + Math.sin(node.distance / 12) * 0.04;
            } else if (node.type === NodeType.ARRHYTHMIA) {
              nextAngle = node.angle + Math.sin(now / 80) * 0.06;
            } else if (node.type === NodeType.VEIN_THROMBUS) {
              // Zigzag motion mimicking cardiac venous valves
              nextAngle = node.angle + Math.sin(now / 50) * 0.08;
            } else if (node.type === NodeType.BIG_BACTERIA || node.type === NodeType.SMALL_BACTERIA || node.type === NodeType.GIANT_BOSS || node.type === NodeType.FAST_GERM || node.type === NodeType.CORONARY_EMBOLUS_BOSS) {
              // High-polish live organic wiggle/dancing offset by unique node id phase for Player 2
              const wigglePhase = (node.id.charCodeAt(0) % 10) * 1.5;
              nextAngle = node.angle + Math.sin(now / 100 + wigglePhase) * 0.038;
            }

            const speedMultiplier = 1 + (scoreRef2.current / 3000);
            let currentSpeed = node.speed * speedMultiplier * delta;

            if (node.type === NodeType.ARRHYTHMIA) {
              const speedWave = 0.5 + Math.abs(Math.sin(now / 200)) * 1.5;
              currentSpeed *= speedWave;
            } else if (node.type === NodeType.ATHEROMA_PLAQUE) {
              // Atheroma Plaque is very dense, moving slower
              currentSpeed *= 0.45;
            }

            if (stabilizationActiveRef2.current) {
              currentSpeed *= 0.4;
            }

            // Grows in size as it gets closer to heart for Player 2
            const finalRadius = node.type === NodeType.ARTERIAL_CLOT 
              ? Math.min(22, 13 + (195 - (node.distance - currentSpeed)) * 0.05) 
              : node.radius;

            // Check summon condition for BIG_BACTERIA, GIANT_BOSS, or CORONARY_EMBOLUS_BOSS
            let lastSummon = node.lastSummonTime;
            if (node.type === NodeType.BIG_BACTERIA) {
              if (!lastSummon) {
                lastSummon = now; // initialize
              } else if (now - lastSummon >= 15000) {
                lastSummon = now;
                playedSound = true;
                
                const angles = [node.angle - 0.2, node.angle, node.angle + 0.2];
                angles.forEach((sa) => {
                  extraNodes.push({
                    id: Math.random().toString(36).substr(2, 9),
                    type: NodeType.SMALL_BACTERIA,
                    x: 0,
                    y: 0,
                    radius: 9,
                    angle: sa,
                    distance: node.distance,
                    speed: node.speed * 1.3,
                    health: 2,
                    maxHealth: 2,
                    pulseScale: 1.0,
                    color: '#4ade80'
                  });
                });
              }
            } else if (node.type === NodeType.GIANT_BOSS) {
              if (!lastSummon) {
                lastSummon = now; // initialize
              } else if (now - lastSummon >= 8500) {
                lastSummon = now;
                playedSound = true;
                // Spawns 2 ultra-fast germs and 1 small bacteria helper as vanguard!
                extraNodes.push({
                  id: Math.random().toString(36).substr(2, 9),
                  type: NodeType.SMALL_BACTERIA,
                  x: 0,
                  y: 0,
                  radius: 9,
                  angle: node.angle,
                  distance: node.distance - 12,
                  speed: node.speed * 1.4,
                  health: 2,
                  maxHealth: 2,
                  pulseScale: 1.0,
                  color: '#4ade80'
                });
                extraNodes.push({
                  id: Math.random().toString(36).substr(2, 9),
                  type: NodeType.FAST_GERM,
                  x: 0,
                  y: 0,
                  radius: 7,
                  angle: node.angle - 0.25,
                  distance: node.distance - 8,
                  speed: node.speed * 2.2,
                  health: 1,
                  maxHealth: 1,
                  pulseScale: 1.0,
                  color: '#df49fa'
                });
                extraNodes.push({
                  id: Math.random().toString(36).substr(2, 9),
                  type: NodeType.FAST_GERM,
                  x: 0,
                  y: 0,
                  radius: 7,
                  angle: node.angle + 0.25,
                  distance: node.distance - 8,
                  speed: node.speed * 2.2,
                  health: 1,
                  maxHealth: 1,
                  pulseScale: 1.0,
                  color: '#df49fa'
                });
              }
            } else if (node.type === NodeType.CORONARY_EMBOLUS_BOSS) {
              if (!lastSummon) {
                lastSummon = now;
              } else if (now - lastSummon >= 8000) {
                lastSummon = now;
                playedSound = true;
                // Summon a crimson arterial clot and a deep blue vein thrombus
                extraNodes.push({
                  id: Math.random().toString(36).substr(2, 9),
                  type: NodeType.ARTERIAL_CLOT,
                  x: 0,
                  y: 0,
                  radius: 12,
                  angle: node.angle - 0.22,
                  distance: node.distance - 15,
                  speed: node.speed * 1.4,
                  health: 3,
                  maxHealth: 3,
                  pulseScale: 1.0,
                  color: '#dc2626'
                });
                extraNodes.push({
                  id: Math.random().toString(36).substr(2, 9),
                  type: NodeType.VEIN_THROMBUS,
                  x: 0,
                  y: 0,
                  radius: 11,
                  angle: node.angle + 0.22,
                  distance: node.distance - 10,
                  speed: node.speed * 1.8,
                  health: 2,
                  maxHealth: 2,
                  pulseScale: 1.0,
                  color: '#2563eb'
                });
              }
            }

            return {
              ...node,
              radius: finalRadius,
              angle: nextAngle,
              distance: node.distance - currentSpeed,
              pulseScale: 1 + Math.sin(now / 150) * 0.08,
              lastSummonTime: lastSummon
            };
          });

          if (playedSound && !isMuted) {
            audioSynthRef.current.playSummonSound();
          }

          return [...updatedNodes, ...extraNodes];
        });
      }

      // 4. Update and decay debris particles (Player 1)
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

      // Update and decay debris particles (Player 2)
      if (isSplitScreenRef.current) {
        setParticles2((prevParticles) =>
          prevParticles
            .map((p) => ({
              ...p,
              x: p.x + p.vx * delta,
              y: p.y + p.vy * delta,
              alpha: p.alpha - p.decay * delta,
            }))
            .filter((p) => p.alpha > 0)
        );
      }

      // 5. Update floating notifications (Player 1)
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

      // Update floating notifications (Player 2)
      if (isSplitScreenRef.current) {
        setFloatingTexts2((prevTexts) =>
          prevTexts
            .map((ft) => ({
              ...ft,
              y: ft.y - 0.8 * delta,
              alpha: ft.alpha - 0.03 * delta,
              scale: Math.max(0.7, ft.scale - 0.01 * delta),
            }))
            .filter((ft) => ft.alpha > 0)
        );
      }

      // 6. Smooth recovery decay of the heart scale
      setBeatScale((s) => Math.max(1.0, s - 0.02 * delta));
      setBeatScale2((s) => Math.max(1.0, s - 0.02 * delta));

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
  const spawnThreatNode = (playerNum: 1 | 2 = 1, customData?: any) => {
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
      const currentScore = playerNum === 1 ? scoreRef.current : scoreRef2.current;
      const roll = Math.random();
      
      if (gameMode === 'LEVELS') {
        const stage = currentLevel;
        if (stage === 90) {
          // Ultimate Coronary Embolus Final boss (Level 90)
          if (roll < 0.12) {
            type = NodeType.CORONARY_EMBOLUS_BOSS;
            color = '#f43f5e';
            initialHealth = 20; // Needs 20 hits!
            speed = 0.28;
            radius = 32;
          } else if (roll >= 0.12 && roll < 0.35) {
            type = NodeType.ARTERIAL_CLOT;
            color = '#dc2626';
            initialHealth = 3;
            speed = 1.0;
            radius = 16;
          } else if (roll >= 0.35 && roll < 0.58) {
            type = NodeType.VEIN_THROMBUS;
            color = '#2563eb';
            initialHealth = 2;
            speed = 1.7;
            radius = 13;
          } else if (roll >= 0.58 && roll < 0.78) {
            type = NodeType.ATHEROMA_PLAQUE;
            color = '#facc15';
            initialHealth = 4;
            speed = 0.6;
            radius = 18;
          } else if (roll >= 0.78 && roll < 0.86) {
            type = NodeType.ADRENALINE;
            color = '#10b981';
            speed = 1.1;
            radius = 11;
            initialHealth = 1;
          } else {
            type = NodeType.PACEMAKER;
            color = '#38bdf8';
            speed = 1.0;
            radius = 12;
            initialHealth = 1;
          }
        } else if (stage >= 61) {
          // Campaign Levels 61-89
          if (roll < 0.22 && stage >= 81) {
            // Vein Thrombus (Deep blue zigzag, fast, 2-hits)
            type = NodeType.VEIN_THROMBUS;
            color = '#2563eb';
            initialHealth = 2;
            speed = 1.6 + (stage * 0.007);
            radius = 13;
          } else if (roll >= 0.22 && roll < 0.44 && stage >= 71) {
            // Atheroma Plaque (Fat lipid deposit, slow, 4-hits)
            type = NodeType.ATHEROMA_PLAQUE;
            color = '#facc15';
            initialHealth = 4;
            speed = 0.55 + (stage * 0.003);
            radius = 18;
          } else if (roll >= 0.44 && roll < 0.72) {
            // Arterial Clot (Needs 3 hits, grows bigger as it flows)
            type = NodeType.ARTERIAL_CLOT;
            color = '#dc2626';
            initialHealth = 3;
            speed = 0.95 + (stage * 0.006);
            radius = 15;
          } else if (roll >= 0.72 && roll < 0.78) {
            type = NodeType.ADRENALINE;
            color = '#10b981';
            speed = 1.1;
            radius = 11;
            initialHealth = 1;
          } else if (roll >= 0.78 && roll < 0.84) {
            type = NodeType.PACEMAKER;
            color = '#38bdf8';
            speed = 1.0;
            radius = 12;
            initialHealth = 1;
          } else {
            // Helper/Standard clot etc.
            type = NodeType.CLOT;
            color = '#f43f5e';
            initialHealth = 2;
            speed = 0.9 + (stage * 0.006);
            radius = 12;
          }
        } else if (stage === 60) {
          // Ultimate Final Megaboss stage (Level 60)
          if (roll < 0.08) {
            type = NodeType.NANO_MEGA_BOSS;
            color = '#374151'; // Charcoal armor
            initialHealth = 15; // Mega health!
            speed = 0.32;
            radius = 32;
          } else if (roll >= 0.08 && roll < 0.22) {
            type = NodeType.CROWN_CORONAVIRUS;
            color = '#a855f7';
            initialHealth = 3;
            speed = 1.2;
            radius = 15;
          } else if (roll >= 0.22 && roll < 0.40) {
            type = NodeType.CYBER_NANO_PHAGE;
            color = '#eab308';
            initialHealth = 2;
            speed = 1.7;
            radius = 11;
          } else if (roll >= 0.40 && roll < 0.60) {
            type = NodeType.MUTATED_RETROVIRUS;
            color = '#ec4899';
            initialHealth = 1;
            speed = 2.1;
            radius = 9;
          } else if (roll >= 0.60 && roll < 0.80) {
            type = NodeType.PLASMA_SPORE;
            color = '#f97316';
            initialHealth = 1;
            speed = 1.45;
            radius = 12;
          } else {
            type = NodeType.FAST_GERM;
            color = '#df49fa';
            speed = 2.4;
            radius = 7;
            initialHealth = 1;
          }
        } else if (stage >= 31) {
          // Advanced mutated stages (31-59) probabilities and attributes
          if (roll < 0.16 && stage >= 51) {
            // Crown Coronavirus (spells of swelling spikes)
            type = NodeType.CROWN_CORONAVIRUS;
            color = '#a855f7'; // Purple
            initialHealth = 3;
            speed = 1.0 + (stage * 0.01);
            radius = 15;
          } else if (roll >= 0.16 && roll < 0.36 && stage >= 41) {
            // Cyber Phage
            type = NodeType.CYBER_NANO_PHAGE;
            color = '#eab308'; // Golden yellow
            initialHealth = 2;
            speed = 1.4 + (stage * 0.012);
            radius = 11;
          } else if (roll >= 0.36 && roll < 0.56 && stage >= 31) {
            // Mutated Retrovirus
            type = NodeType.MUTATED_RETROVIRUS;
            color = '#ec4899'; // Pink
            initialHealth = 1;
            speed = 1.7 + (stage * 0.015);
            radius = 9;
          } else if (roll >= 0.56 && roll < 0.72 && stage >= 31) {
            // Plasma Spore
            type = NodeType.PLASMA_SPORE;
            color = '#f97316'; // Orange
            initialHealth = 1;
            speed = 1.2 + (stage * 0.008);
            radius = 12;
          } else if (roll >= 0.72 && roll < 0.78) {
            // Support Adrenaline
            type = NodeType.ADRENALINE;
            color = '#10b981';
            speed = 1.1;
            radius = 11;
            initialHealth = 1;
          } else if (roll >= 0.78 && roll < 0.84) {
            // Pacemaker
            type = NodeType.PACEMAKER;
            color = '#38bdf8';
            speed = 1.0;
            radius = 12;
            initialHealth = 1;
          } else {
            // Faster standard threats in mutated mode
            type = NodeType.ARRHYTHMIA;
            color = '#f97316';
            speed = 1.3 + (stage * 0.012);
            radius = 10;
            initialHealth = 1;
          }
        } else if (stage === 30) {
          // Special Boss Stage 30 behavior: Spawns the boss and various intense helpers
          if (roll < 0.08) {
            type = NodeType.GIANT_BOSS;
            color = '#ef4444';
            initialHealth = 10;
            speed = 0.35;
            radius = 28;
          } else if (roll >= 0.08 && roll < 0.20) {
            type = NodeType.FAST_GERM;
            color = '#df49fa';
            speed = 2.1;
            radius = 7;
            initialHealth = 1;
          } else if (roll >= 0.20 && roll < 0.35) {
            type = NodeType.BIG_BACTERIA;
            color = '#22c55e';
            initialHealth = 3;
            speed = 0.7;
            radius = 17;
          } else if (roll >= 0.35 && roll < 0.50) {
            type = NodeType.VIRUS;
            color = '#fbbf24';
            speed = 1.9;
            radius = 8;
            initialHealth = 1;
          } else if (roll >= 0.50 && roll < 0.65) {
            type = NodeType.CLOT;
            color = '#f43f5e';
            initialHealth = 2;
            speed = 1.1;
            radius = 13;
          } else if (roll >= 0.65 && roll < 0.70) {
            type = NodeType.ADRENALINE;
            color = '#10b981';
            speed = 1.0;
            radius = 11;
            initialHealth = 1;
          } else if (roll >= 0.70 && roll < 0.75) {
            type = NodeType.PACEMAKER;
            color = '#38bdf8';
            speed = 1.0;
            radius = 12;
            initialHealth = 1;
          } else {
            type = NodeType.ARRHYTHMIA;
            color = '#f97316';
            speed = 1.4;
            radius = 10;
            initialHealth = 1;
          }
        } else {
          // Regular stages (1-29) probabilities and attributes - Difficulty swells automatically
          if (stage >= 8 && roll < 0.12) {
            // Fast violet target
            type = NodeType.FAST_GERM;
            color = '#df49fa';
            speed = 1.8 + (stage * 0.022);
            radius = 7;
            initialHealth = 1;
          } else if (stage >= 4 && roll >= 0.12 && roll < 0.25) {
            // Big green bacteria
            type = NodeType.BIG_BACTERIA;
            color = '#22c55e';
            initialHealth = 3;
            speed = 0.55 + (stage * 0.012);
            radius = 17;
          } else if (stage >= 12 && roll >= 0.25 && roll < 0.35) {
            // Erratic zig-zag arrhytmia
            type = NodeType.ARRHYTHMIA;
            color = '#f97316';
            speed = 1.1 + (stage * 0.015);
            radius = 10;
            initialHealth = 1;
          } else if (stage >= 5 && roll >= 0.35 && roll < 0.46) {
            // Golden orbital virus
            type = NodeType.VIRUS;
            color = '#fbbf24';
            speed = 1.45 + (stage * 0.025);
            radius = 8;
            initialHealth = 1;
          } else if (stage >= 2 && roll >= 0.46 && roll < 0.60) {
            // Clot (Requires 2 taps)
            type = NodeType.CLOT;
            color = '#f43f5e';
            initialHealth = 2;
            speed = 0.65 + (stage * 0.01);
            radius = 13;
          } else if (roll >= 0.60 && roll < 0.65) {
            // Restoration Adrenaline
            type = NodeType.ADRENALINE;
            color = '#10b981';
            speed = 0.9 + (stage * 0.01);
            radius = 11;
            initialHealth = 1;
          } else if (stage >= 3 && roll >= 0.65 && roll < 0.71) {
            // Pacemaker
            type = NodeType.PACEMAKER;
            color = '#38bdf8';
            speed = 0.9 + (stage * 0.008);
            radius = 12;
            initialHealth = 1;
          } else {
            // Standard Disruption (1-hit cyan)
            type = NodeType.DISRUPTION;
            color = '#22d3ee';
            speed = 0.95 + (stage * 0.022);
            radius = 10;
            initialHealth = 1;
          }
        }
      } else {
        // ENDLESS or TIMED mode original spawn logic updated to include BIG_BACTERIA for high scores!
        if (currentScore > 500 && roll > 0.85) {
          // Big Bacteria: 3 hits, slow, summons small ones
          type = NodeType.BIG_BACTERIA;
          color = '#22c55e';
          initialHealth = 3;
          speed = 0.75;
          radius = 17;
        } else if (currentScore > 600 && roll > 0.72 && roll <= 0.85) {
          // Neon Orange Arrhythmia
          type = NodeType.ARRHYTHMIA;
          color = '#f97316';
          speed = 1.4;
          radius = 10;
          initialHealth = 1;
        } else if (currentScore > 420 && roll > 0.58 && roll <= 0.72) {
          // Golden Bio Virus
          type = NodeType.VIRUS;
          color = '#fbbf24';
          speed = 1.9;
          radius = 8;
          initialHealth = 1;
        } else if (currentScore > 180 && roll > 0.38 && roll <= 0.58) {
          // Dark red clot
          type = NodeType.CLOT;
          color = '#f43f5e';
          initialHealth = 2;
          speed = 0.8;
          radius = 13;
        } else if (roll < 0.08) {
          // Adrenaline
          type = NodeType.ADRENALINE;
          color = '#10b981';
          speed = 1.1;
          radius = 11;
          initialHealth = 1;
        } else if (roll >= 0.08 && roll < 0.16 && currentScore > 300) {
          // Pacemaker
          type = NodeType.PACEMAKER;
          color = '#38bdf8';
          speed = 1.0;
          radius = 12;
          initialHealth = 1;
        }
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

    if (playerNum === 1) {
      setNodes((prev) => [...prev, newNode]);
    } else {
      setNodes2((prev) => [...prev, newNode]);
    }

    if (isOnlineCoop && onlineRole === 'HOST' && !customData) {
      sendGameAction({
        action: 'SPAWN',
        playerNum,
        id,
        angle: randomAngle,
        threatType: type,
        radius,
        maxHealth: initialHealth,
        color,
        speed
      });
    }
  };

  // Spawns decorative explosions/impact sparks for a given player
  const createExplosionDebris = (playerNum: 1 | 2, x: number, y: number, color: string, count: number = 8) => {
    const newParticles: HitParticle[] = Array.from({ length: count }).map(() => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.0 + Math.random() * 3.0;
      return {
        id: Math.random().toString(36).substr(2, 9),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        alpha: 1.0,
        decay: 0.015 + Math.random() * 0.02,
        radius: 1.5 + Math.random() * 2.5
      };
    });

    if (playerNum === 1) {
      setParticles((prev) => [...prev, ...newParticles]);
    } else {
      setParticles2((prev) => [...prev, ...newParticles]);
    }
  };

  // Spawns a floating text note (like Perfect! or +100) for a given player
  const spawnFloatingText = (playerNum: 1 | 2, text: string, x: number, y: number, color: string, isBig: boolean = false) => {
    const newText: FloatingText = {
      id: Math.random().toString(36).substr(2, 9),
      text,
      x,
      y,
      color,
      alpha: 1.0,
      scale: isBig ? 1.4 : 1.0,
      isPerfect: isBig
    };

    if (playerNum === 1) {
      setFloatingTexts((prev) => [...prev, newText]);
    } else {
      setFloatingTexts2((prev) => [...prev, newText]);
    }
  };

  // Triggers tap interaction (Player 1)
  const handleTapNode = (id: string, isPerfect: boolean, tapX: number, tapY: number) => {
    executeLocalTap(1, id, isPerfect, tapX, tapY);
  };

  // Triggers tap interaction (Player 2)
  const handleTapNode2 = (id: string, isPerfect: boolean, tapX: number, tapY: number) => {
    executeLocalTap(2, id, isPerfect, tapX, tapY);
  };

  const executeLocalTap = (playerNum: 1 | 2, id: string, isPerfect: boolean, tapX: number, tapY: number) => {
    if (isOnlineCoop && playerNum === 2) {
      // Direct remote hits blocked in online co-op mode!
      return;
    }

    const setTargetNodes = playerNum === 1 ? setNodes : setNodes2;
    setTargetNodes((prevNodes) => {
      const nodeToHit = prevNodes.find((n) => n.id === id);
      if (!nodeToHit) return prevNodes;

      // Tap decrease health
      const nextHealth = nodeToHit.health - 1;

      // Create spark debris burst on impact (Giant boss generates an epic burst of 45 particles)
      createExplosionDebris(playerNum, tapX, tapY, nodeToHit.color, nextHealth <= 0 ? (nodeToHit.type === NodeType.GIANT_BOSS ? 45 : 15) : 6);

      // Play audio cue
      if (isPerfect) {
        audioSynthRef.current.playPerfectSound();
        if (playerNum === 1) {
          setScore((prev) => prev + 200);
          setCombo((prev) => {
            const newCombo = prev + 1;
            if (newCombo > maxCombo) setMaxCombo(newCombo);
            return newCombo;
          });
          setAccuracy(prev => ({ total: prev.total + 1, perfect: prev.perfect + 1 }));
          spawnFloatingText(1, '🚨 نبضة مثالية! +200', tapX, tapY, '#10b981', true);
        } else {
          setScore2((prev) => prev + 200);
          setCombo2((prev) => {
            const newCombo = prev + 1;
            if (newCombo > maxCombo2) setMaxCombo2(newCombo);
            return newCombo;
          });
          setAccuracy2(prev => ({ total: prev.total + 1, perfect: prev.perfect + 1 }));
          spawnFloatingText(2, '🚨 نبضة مثالية! +200', tapX, tapY, '#10b981', true);
        }
      } else {
        audioSynthRef.current.playHitSound();
        if (playerNum === 1) {
          setScore((prev) => prev + 100);
          setCombo((prev) => {
            const newCombo = prev + 1;
            if (newCombo > maxCombo) setMaxCombo(newCombo);
            return newCombo;
          });
          setAccuracy(prev => ({ ...prev, total: prev.total + 1 }));
          spawnFloatingText(1, '+100 نقرة', tapX, tapY, '#22d3ee', false);
        } else {
          setScore2((prev) => prev + 100);
          setCombo2((prev) => {
            const newCombo = prev + 1;
            if (newCombo > maxCombo2) setMaxCombo2(newCombo);
            return newCombo;
          });
          setAccuracy2(prev => ({ ...prev, total: prev.total + 1 }));
          spawnFloatingText(2, '+100 نقرة', tapX, tapY, '#22d3ee', false);
        }
      }

      if (nextHealth <= 0) {
        // Trigger Specialty effects
        if (nodeToHit.type === NodeType.ADRENALINE) {
          if (playerNum === 1) {
            setHeartHealth((h) => Math.min(100, h + 15));
            spawnFloatingText(1, '❤️ جرعة أدرينالين! +15%', tapX, tapY, '#10b981', true);
          } else {
            setHeartHealth2((h) => Math.min(100, h + 15));
            spawnFloatingText(2, '❤️ جرعة أدرينالين! +15%', tapX, tapY, '#10b981', true);
          }
        } else if (nodeToHit.type === NodeType.PACEMAKER) {
          if (playerNum === 1) {
            setStabilizationTimeLeft(5);
            spawnFloatingText(1, '🛡️ تشغيل منظم النبض! (تباطؤ)', tapX, tapY, '#38bdf8', true);
          } else {
            setStabilizationTimeLeft2(5);
            spawnFloatingText(2, '🛡️ تشغيل منظم النبض! (تباطؤ)', tapX, tapY, '#38bdf8', true);
          }
        } else if (nodeToHit.type === NodeType.ARRHYTHMIA) {
          spawnFloatingText(playerNum, '⚡ نبضة مضطربة جرى تثبيتها!', tapX, tapY, '#f97316', true);
        } else if (nodeToHit.type === NodeType.GIANT_BOSS) {
          if (playerNum === 1) {
            setScore((prev) => prev + 1000);
          } else {
            setScore2((prev) => prev + 1000);
          }
          spawnFloatingText(playerNum, '💥 ملاك الشفاء! تدمير البكتيريا العملاقة +1000!', tapX, tapY, '#f43f5e', true);
        } else if (nodeToHit.type === NodeType.BIG_BACTERIA) {
          spawnFloatingText(playerNum, '🦠 تم تدمير البكتيريا الضخمة!', tapX, tapY, '#22c55e', true);
        } else if (nodeToHit.type === NodeType.FAST_GERM) {
          spawnFloatingText(playerNum, '⚡ هدم الجرثومة الخاطفة! سريع جداً!', tapX, tapY, '#e0f2fe', true);
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

    if (isOnlineCoop && playerNum === 1) {
      sendGameAction({
        action: 'TAP',
        id,
        isPerfect,
        tapX,
        tapY
      });
    }
  };

  // Triggered when threat breaks the heart boundary (Player 1)
  const handleMissNode = (id: string) => {
    executeLocalMiss(1, id);
  };

  // Triggered when threat breaks the heart boundary (Player 2)
  const handleMissNode2 = (id: string) => {
    executeLocalMiss(2, id);
  };

  const executeLocalMiss = (playerNum: 1 | 2, id: string) => {
    const setTargetNodes = playerNum === 1 ? setNodes : setNodes2;
    setTargetNodes((prevNodes) => {
      const missedNode = prevNodes.find((n) => n.id === id);
      if (!missedNode) return prevNodes;

      // Determine damage percentage
      let dmg = 10;
      let label = '⚠️ اضطراب قلبي!';
      if (missedNode.type === NodeType.CLOT) {
        dmg = 15;
        label = '🚨 جلتة حادة!!';
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
      } else if (missedNode.type === NodeType.GIANT_BOSS) {
        dmg = 35;
        label = '💥 غزو البكتيريا العملاقة الخارق!!!';
      } else if (missedNode.type === NodeType.BIG_BACTERIA) {
        dmg = 20;
        label = '🦠 وباء بكتيري جسيم!';
      } else if (missedNode.type === NodeType.FAST_GERM) {
        dmg = 14;
        label = '⚡ فتك جرثومي خاطف!';
      }

      if (playerNum === 1) {
        // Apply Screen Shake visual effect
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), 240);

        // Trigger warning audio synth damage hit
        audioSynthRef.current.playDamageSound();

        // Break chain combo
        setCombo(0);

        // Spark debris
        createExplosionDebris(1, 190, 190, '#ef4444', 18);

        // Renders Floating damage notification
        spawnFloatingText(1, `${label} -${dmg}%`, 190, 150, '#ef4444', true);

        // Apply health penalty
        setHeartHealth((h) => {
          const nextH = Math.max(0, h - dmg);
          if (nextH <= 0) {
            handleGameOver();
          }
          return nextH;
        });
      } else {
        // Apply Screen Shake visual effect
        setScreenShake2(true);
        setTimeout(() => setScreenShake2(false), 240);

        // Trigger warning audio synth damage hit
        audioSynthRef.current.playDamageSound();

        // Break chain combo
        setCombo2(0);

        // Spark debris
        createExplosionDebris(2, 190, 190, '#ef4444', 18);

        // Renders Floating damage notification
        spawnFloatingText(2, `${label} -${dmg}%`, 190, 150, '#ef4444', true);

        // Apply health penalty
        setHeartHealth2((h) => {
          const nextH = Math.max(0, h - dmg);
          if (nextH <= 0) {
            handleGameOver();
          }
          return nextH;
        });
      }

      return prevNodes.filter((n) => n.id !== id);
    });

    if (isOnlineCoop && playerNum === 1) {
      sendGameAction({
        action: 'MISS',
        id
      });
    }
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

    if (isOnlineCoop) {
      sendGameAction({
        action: 'GAMEOVER',
        score: scoreRef.current,
        score2: scoreRef2.current
      });
    }
    updateMyStatus('online');

    if (isSplitScreen) {
      // Determine split screen winner
      let winner = '';
      if (heartHealth <= 0 && heartHealth2 <= 0) {
        if (score > score2) winner = '🏆 المسعف الأول (فوز بالنقاط)';
        else if (score2 > score) winner = '🏆 المسعف الثاني (فوز بالنقاط)';
        else winner = '🤝 تعادل بطولي بحيازة نقاط متكافئة!';
      } else if (heartHealth <= 0) {
        winner = '🏆 المسعف الثاني (صاحب نبض مريض مستقر)';
      } else if (heartHealth2 <= 0) {
        winner = '🏆 المسعف الأول (صاحب نبض مريض مستقر)';
      } else {
        if (score > score2) winner = '🏆 المسعف الأول (فوز بالنقاط والسرعة)';
        else if (score2 > score) winner = '🏆 المسعف الثاني (فوز بالنقاط والسرعة)';
        else winner = '🤝 تعادل بطولي بحيازة نقاط متكافئة!';
      }
      setSplitScreenWinner(winner);
      return; // Skip solo leaderboard saves in versus sessions
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

  // State to hold split-screen victory outcome messages
  const [splitScreenWinner, setSplitScreenWinner] = useState<string>('');

  const socketRef = useRef<WebSocket | null>(null);

  const connectToWebSocket = (roomCodeStr: string, nameToJoin: string, role: 'HOST' | 'GUEST') => {
    setIsConnectingWs(true);
    setWsStatus('connecting');

    if (socketRef.current) {
      socketRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws-coop`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      setIsConnectingWs(false);
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        roomCode: roomCodeStr.toUpperCase(),
        playerName: nameToJoin
      }));
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, playerName: joinedName, isHost, partnerName: remotePartnerName, data, message } = payload;

        switch (type) {
          case 'PLAYER_JOINED':
            console.log('[MULTIPLAYER] Player joined room', joinedName);
            break;

          case 'START_MATCH':
            setPartnerName(remotePartnerName);
            startOnlineMatch(isHost, remotePartnerName, roomCodeStr);
            break;

          case 'ACTION_BROADCAST':
            handleBroadcastAction(data);
            break;

          case 'PARTNER_DISCONNECTED':
            setSplitScreenWinner(`انقطع الاتصال: ${message || 'غادر زميلك الغرفة'}`);
            setGameState('GAMEOVER');
            ws.close();
            break;

          case 'ERROR':
            alert(`فشل الانضمام: ${message}`);
            setWsStatus('disconnected');
            setIsConnectingWs(false);
            break;
        }
      } catch (e) {
        console.error('[MULTIPLAYER] WS message error', e);
      }
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
      setIsConnectingWs(false);
    };

    ws.onerror = (e) => {
      console.error('[MULTIPLAYER] WS error', e);
      setWsStatus('disconnected');
      setIsConnectingWs(false);
    };
  };

  const startOnlineMatch = async (isHost: boolean, teammateName: string, roomCodeStr: string) => {
    try {
      await audioSynthRef.current.initialize();
    } catch (e) {
      console.warn('Audio visualization/playback initialization skipped:', e);
    }
    
    setGameMode('ENDLESS');
    setTimeLeft(60);
    setIsTimeOutEnd(false);
    setSplitScreenWinner('');
    
    setHeartHealth(100);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setAccuracy({ total: 0, perfect: 0 });
    setNodes([]);
    setParticles([]);
    setFloatingTexts([]);
    setStabilizationTimeLeft(0);

    setHeartHealth2(100);
    setScore2(0);
    setCombo2(0);
    setMaxCombo2(0);
    setAccuracy2({ total: 0, perfect: 0 });
    setNodes2([]);
    setParticles2([]);
    setFloatingTexts2([]);
    setStabilizationTimeLeft2(0);

    setCurrentBPM(72);
    setIsSplitScreen(true);
    
    setIsOnlineCoop(true);
    setOnlineRole(isHost ? 'HOST' : 'GUEST');
    setRoomCode(roomCodeStr);
    setPartnerName(teammateName);

    lastSpawnTimeRef.current = Date.now();
    lastSpawnTimeRef2.current = Date.now();

    setGameState('PLAYING');
    await updateMyStatus('ingame');
  };

  const sendGameAction = (actionData: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'GAME_ACTION',
        roomCode: roomCode,
        data: actionData
      }));
    }
  };

  const handleBroadcastAction = (data: any) => {
    const { action, id, isPerfect, tapX, tapY, playerNum, angle, threatType, radius, maxHealth, color, speed } = data;

    switch (action) {
      case 'SPAWN':
        const targetPlayerNum = playerNum === 1 ? 2 : 1;
        spawnThreatNode(targetPlayerNum, {
          id,
          angle,
          threatType,
          radius,
          maxHealth,
          color,
          speed
        });
        break;

      case 'TAP':
        executeLocalTap(2, id, isPerfect, tapX, tapY);
        break;

      case 'MISS':
        executeLocalMiss(2, id);
        break;

      case 'GAMEOVER':
        setGameState('GAMEOVER');
        isPlayingRef.current = false;
        audioSynthRef.current.startFlatline();
        updateMyStatus('online');
        break;
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error('Google Sign in failed', e);
    }
  };

  const handleLogout = async () => {
    try {
      await updateMyStatus('offline');
      await signOut(auth);
    } catch (e) {
      console.error('Sign Out failed', e);
    }
  };

  const handleSearchFriend = async () => {
    const term = searchName.trim();
    if (!term) return;
    setIsSearching(true);
    setSearchError('');
    setSearchResult(null);

    try {
      // Build search variations to address capitalization variations in latin alphabet names
      const variations = [term];
      if (/^[a-zA-Z]/.test(term)) {
        const capitalized = term.charAt(0).toUpperCase() + term.slice(1);
        const lowercased = term.toLowerCase();
        const uppercased = term.toUpperCase();
        if (!variations.includes(capitalized)) variations.push(capitalized);
        if (!variations.includes(lowercased)) variations.push(lowercased);
        if (!variations.includes(uppercased)) variations.push(uppercased);
      }

      let foundUser: any = null;

      // Run queries for each variation
      for (const t of variations) {
        const q = query(
          collection(db, 'users'), 
          where('displayName', '>=', t),
          where('displayName', '<=', t + '\uf8ff')
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          for (const doc of snap.docs) {
            const uData = doc.data();
            if (uData.uid !== currentUser?.uid) {
              foundUser = uData;
              break;
            }
          }
        }
        if (foundUser) break;
      }

      if (foundUser) {
        setSearchResult(foundUser);
      } else {
        // Let's check if they searched for themselves exactly
        let matchedSelf = false;
        for (const t of variations) {
          const qSelf = query(collection(db, 'users'), where('displayName', '==', t));
          const snapSelf = await getDocs(qSelf);
          if (!snapSelf.empty && snapSelf.docs[0].data().uid === currentUser?.uid) {
            matchedSelf = true;
            break;
          }
        }
        if (matchedSelf) {
          setSearchError('لا يمكنك إضافة نفسك!');
        } else {
          setSearchError('عذراً، لم نجد طبيباً مسجلاً بهذا الاسم.');
        }
      }
    } catch (e) {
      setSearchError('حدث خطأ أثناء البحث.');
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const sendFriendRequest = async () => {
    if (!currentUser || !searchResult) return;
    try {
      const uid1 = currentUser.uid;
      const uid2 = searchResult.uid;
      const friendshipId = uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;

      await setDoc(doc(db, 'friendships', friendshipId), {
        user1: uid1,
        user2: uid2,
        user1Email: currentUser.email,
        user2Email: searchResult.email,
        user1Name: currentUser.displayName || currentUser.email?.split('@')[0] || 'طبيب نبيض',
        user2Name: searchResult.displayName,
        user1Photo: currentUser.photoURL || '',
        user2Photo: searchResult.photoURL || '',
        status: 'pending',
        updatedAt: serverTimestamp()
      });

      alert('تم إرسال طلب الصداقة بنجاح! 🚀');
      setSearchResult(null);
      setSearchName('');
    } catch (e) {
      console.error(e);
      alert('فشل إرسال الطلب.');
    }
  };

  const acceptFriendRequest = async (friendshipId: string) => {
    try {
      await updateDoc(doc(db, 'friendships', friendshipId), {
        status: 'accepted',
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
    }
  };

  const removeFriendship = async (friendshipId: string) => {
    try {
      await deleteDoc(doc(db, 'friendships', friendshipId));
    } catch (e) {
      console.error(e);
    }
  };

  const sendGameInvite = async (friendUid: string, friendName: string) => {
    if (!currentUser) return;
    try {
      const randomCode = 'NABD-' + Math.random().toString(36).substr(2, 4).toUpperCase();
      
      const invRef = await addDoc(collection(db, 'invitations'), {
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email?.split('@')[0] || 'طبيب نبّاض',
        receiverId: friendUid,
        roomCode: randomCode,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setActiveInviteDocId(invRef.id);
      setOutInviteStatus('pending');
    } catch (e) {
      console.error('Failed to create invitation', e);
      alert('فشل إرسال الدعوة.');
    }
  };

  const acceptInvite = async () => {
    if (!incomingInvite) return;
    try {
      const docRef = doc(db, 'invitations', incomingInvite.id);
      await updateDoc(docRef, {
        status: 'accepted'
      });
      // Try initializing the audio context too
      try {
        await audioSynthRef.current.initialize();
      } catch (err) {
        console.warn('Audio initialization ignored inside accept game connection', err);
      }
      connectToWebSocket(incomingInvite.roomCode, playerName, 'GUEST');
    } catch (e) {
      console.error('Failed to accept invitation', e);
      alert('لم نتمكن من إتمام الاتصال بالخادم السحابي لقبول الدعوة. جرب اللعب الفردي!');
    } finally {
      setIncomingInvite(null);
    }
  };

  const declineInvite = async () => {
    if (!incomingInvite) return;
    try {
      const docRef = doc(db, 'invitations', incomingInvite.id);
      await updateDoc(docRef, {
        status: 'declined'
      });
    } catch (e) {
      console.error('Decline failed', e);
    } finally {
      setIncomingInvite(null);
    }
  };

  // Safe game initialisation
  const startGame = async (selectedMode: 'ENDLESS' | 'TIMED' | 'LEVELS' = 'ENDLESS', specificLevel?: number) => {
    // Init Audio Context safely via user click gesture
    try {
      await audioSynthRef.current.initialize();
    } catch (e) {
      console.warn('AudioContext failed to initialize (continuing to start game silently)', e);
    }
    
    // Set Game Mode
    setGameMode(selectedMode);
    setTimeLeft(60);
    setIsTimeOutEnd(false);
    setStabilizationTimeLeft(0);
    setIsSplitScreen(false);
    setSplitScreenWinner('');
    setLevelCompleted(false);
    if (selectedMode === 'LEVELS' && specificLevel !== undefined) {
      setCurrentLevel(specificLevel);
    }

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

    // Persist player name
    localStorage.setItem('nabdah_player_name', playerName);

    setIsOnlineCoop(false);
    setOnlineRole(null);
    updateMyStatus('ingame');

    setGameState('PLAYING');
  };

  const startSplitScreenGame = async (selectedMode: 'ENDLESS' | 'TIMED' = 'ENDLESS') => {
    // Init Audio Context safely via user click gesture
    try {
      await audioSynthRef.current.initialize();
    } catch (e) {
      console.warn('AudioContext failed to initialize (continuing to start game silently)', e);
    }
    
    // Set Game Mode
    setGameMode(selectedMode);
    setTimeLeft(60);
    setIsTimeOutEnd(false);
    setSplitScreenWinner('');
    
    // Reset Player 1
    setHeartHealth(100);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setAccuracy({ total: 0, perfect: 0 });
    setNodes([]);
    setParticles([]);
    setFloatingTexts([]);
    setStabilizationTimeLeft(0);

    // Reset Player 2
    setHeartHealth2(100);
    setScore2(0);
    setCombo2(0);
    setMaxCombo2(0);
    setAccuracy2({ total: 0, perfect: 0 });
    setNodes2([]);
    setParticles2([]);
    setFloatingTexts2([]);
    setStabilizationTimeLeft2(0);

    setIsOnlineCoop(false);
    setOnlineRole(null);
    updateMyStatus('ingame');

    setCurrentBPM(72);
    setBpmHistory([72]);
    
    setIsSplitScreen(true);
    
    lastSpawnTimeRef.current = Date.now();
    lastSpawnTimeRef2.current = Date.now();
    lastBeatTimeRef.current = Date.now();

    // Persist player name
    localStorage.setItem('nabdah_player_name', playerName);

    setGameState('PLAYING');
  };

  // Re-initialisation on retry
  const restartGame = async () => {
    // Turn off continuous flatline alarm tone
    audioSynthRef.current.stopFlatline();
    if (isSplitScreen) {
      startSplitScreenGame(gameMode);
    } else {
      startGame(gameMode);
    }
  };

  const handleBackToMenu = () => {
    audioSynthRef.current.stopFlatline();
    setGameState('START');
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
      <div className={`w-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-4 md:p-6 shadow-2xl relative flex flex-col gap-5 z-10 transition-all duration-300 ${isSplitScreen && gameState === 'PLAYING' ? 'max-w-6xl' : 'max-w-md'} ${screenShake || screenShake2 ? 'animate-bounce border-red-500/50 scale-[0.98]' : ''}`}>
        
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

        {/* INCOMING COOP CHALLENGE INVITATION */}
        {incomingInvite && (
          <div className="backdrop-blur-xl bg-slate-950/98 border-2 border-red-500 rounded-3xl p-5 shadow-[0_0_30px_rgba(239,68,68,0.40)] flex flex-col gap-4 text-center animate-fade-in z-50">
            <div className="flex items-center justify-center gap-2 text-red-050">
              <Activity className="w-5 h-5 animate-pulse text-red-400" />
              <h4 className="text-sm font-extrabold font-display">تحدي إنعاش تشاركي عاجل! ❤️</h4>
            </div>
            <p className="text-xs text-white/90 leading-relaxed font-sans" dir="rtl">
              يدعوك الزميل الطبيب <strong className="text-red-400 font-extrabold">{incomingInvite.senderName}</strong> للانضمام إليه في العناية المركزة لحماية القلب من البكتيريا الفتاكة! هل أنت مستعد للتعاون؟
            </p>
            {isConnectingWs && (
              <div className="flex flex-col items-center gap-2 py-1.5 px-3 bg-white/5 rounded-xl border border-white/10 animate-pulse text-right" dir="rtl">
                <div className="w-5 h-5 border-2 border-t-red-500 border-white/20 rounded-full animate-spin" />
                <p className="text-[10px] text-white/80 font-bold">جاري تشبيك المسيرات الحيوية والربط الصوتي المتزامن...</p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={acceptInvite}
                disabled={isConnectingWs}
                className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {isConnectingWs ? (
                  <>
                    <div className="w-3 h-3 border-2 border-t-white border-transparent rounded-full animate-spin" />
                    <span>جاري الاتصال...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>قبول التحدي والتطهير</span>
                  </>
                )}
              </button>
              <button
                onClick={declineInvite}
                disabled={isConnectingWs}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white/80 text-xs transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>تراجع</span>
              </button>
            </div>
          </div>
        )}

        {/* OUTGOING INVITATION WAIT BOX */}
        {activeInviteDocId && (
          <div className="backdrop-blur-xl bg-slate-900/90 border border-white/10 rounded-2xl p-4 text-center animate-fade-in z-40">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-t-red-500 border-white/20 rounded-full animate-spin" />
              <p className="text-xs text-white/80">جاري إرسال الدعوة العاجلة لزميلك...</p>
              <p className="text-[10px] text-white/40">بانتظار موافقة الطبيب للبدء في تطهير الصمامات الثنائية.</p>
              <button
                onClick={async () => {
                  try {
                    await deleteDoc(doc(db, 'invitations', activeInviteDocId));
                    setActiveInviteDocId(null);
                    setOutInviteStatus(null);
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="mt-2 px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white transition-all text-[10px] cursor-pointer"
              >
                إلغاء الطلب
              </button>
            </div>
          </div>
        )}

        {/* SOCIAL PORTAL DRAWER */}
        {isSocialOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-slate-950/95 border border-white/15 rounded-3xl w-full max-w-md p-5 flex flex-col gap-4 text-right animate-fade-in font-sans">
              
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <button
                  onClick={() => setIsSocialOpen(false)}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                <h3 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-amber-500 font-display">بوابة الزملاء وإدارة الأصدقاء 👥</h3>
              </div>

              {/* Add Friends Section */}
              <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 space-y-2">
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">البحث عن طبيب بالاسم:</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleSearchFriend}
                    disabled={isSearching}
                    className="px-4 py-2 rounded-xl bg-red-650 hover:bg-red-550 text-white text-xs font-bold transition-all disabled:opacity-40 cursor-pointer"
                  >
                    {isSearching ? 'جاري..' : 'بحث'}
                  </button>
                  <input
                    type="text"
                    placeholder="أدخل اسم الطبيب المسجل"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white text-center outline-none focus:border-red-500 transition-all font-sans"
                  />
                </div>
                {searchError && <p className="text-[10px] text-red-400 mt-1">{searchError}</p>}
                {searchResult && (
                  <div className="mt-2 p-2.5 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                    <button
                      onClick={sendFriendRequest}
                      className="px-3 py-1.5 bg-emerald-500 rounded-lg text-white text-[10px] font-bold hover:bg-emerald-600 active:scale-95 transition-all text-center flex items-center gap-1 cursor-pointer"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>إرسال طلب</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/80 font-bold">{searchResult.displayName}</span>
                      <img src={searchResult.photoURL || ''} alt="Preview" className="w-6 h-6 rounded-full border border-white/10" />
                    </div>
                  </div>
                )}
              </div>

              {/* Pending Requests */}
              {pendingRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest text-right">طلبات الصداقة المعلقة ({pendingRequests.length}):</p>
                  <div className="max-h-[100px] overflow-y-auto space-y-1.5 pr-1">
                    {pendingRequests.map((req) => (
                      <div key={req.id} className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between text-xs">
                        {req.isIncoming ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => acceptFriendRequest(req.id)}
                              className="px-2 py-1 bg-emerald-500 rounded-lg text-white text-[9px] font-bold hover:bg-emerald-600 transition-all cursor-pointer"
                            >
                              قبول
                            </button>
                            <button
                              onClick={() => removeFriendship(req.id)}
                              className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white/70 text-[9px] hover:text-white transition-all cursor-pointer"
                            >
                              رفض
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-white/40 italic">بانتظار قبول زميلك..</span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-white/80 font-bold text-xs">{req.friendName}</span>
                          <span className="text-[9px] text-amber-400">⚡</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Friends List status */}
              <div className="flex-1 flex flex-col gap-2 min-h-0">
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest text-right">قائمة الرفاق والأطباء المتصلين ({friends.length}):</p>
                <div className="flex-1 overflow-y-auto divide-y divide-white/5 space-y-1.5 max-h-[160px] pr-1">
                  {friends.length === 0 ? (
                    <p className="text-[11px] text-white/30 text-center py-5 italic leading-relaxed">لم تقم بإضافة أي رفاق بعد. ابحث عن زملائك بالبريد الإلكتروني للبدء في إنعاش القلوب معاً!</p>
                  ) : (
                    friends.map((friend) => {
                      const fStatus = friendsStatuses[friend.friendUid] || 'offline';
                      return (
                        <div key={friend.id} className="flex items-center justify-between py-2.5">
                          
                          {/* Invite to coop trigger */}
                          {fStatus === 'online' ? (
                            <button
                              onClick={() => sendGameInvite(friend.friendUid, friend.friendName)}
                              className="px-3 py-1.5 bg-gradient-to-r from-red-650 to-red-800 rounded-xl text-white text-[10px] font-bold hover:from-red-550 hover:to-red-750 active:scale-95 transition-all text-center flex items-center gap-1.5 cursor-pointer shadow-md shadow-red-500/10"
                            >
                              <Play className="w-3 h-3 fill-current text-white" />
                              <span>دعوة للعب 👥</span>
                            </button>
                          ) : fStatus === 'ingame' ? (
                            <span className="text-[9px] text-amber-400 bg-amber-500/10 py-1 px-2 rounded-lg font-bold border border-amber-500/20">في عملية طبية 🩺</span>
                          ) : (
                            <span className="text-[9.5px] text-white/30 italic">غير متصل بالنبض</span>
                          )}

                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="text-xs font-bold text-white/95">{friend.friendName}</p>
                              <p className="text-[8.5px] text-white/40 font-sans">{friend.friendEmail}</p>
                            </div>
                            <div className="relative">
                              <img
                                src={friend.friendPhoto || 'https://api.dicebear.com/7.x/pixel-art/svg?seed=' + friend.friendUid}
                                alt="User"
                                className="w-7 h-7 rounded-full border border-white/5"
                              />
                              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 ${
                                fStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : fStatus === 'ingame' ? 'bg-amber-400' : 'bg-white/10'
                              }`} />
                            </div>
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* SCREEN MODULE STATE ROUTER */}

        {gameState === 'START' && (
          showLevelsView ? (
            <div id="levels-selection-screen" className="flex flex-col gap-4 py-3 animate-fade-in text-center font-sans">
              {/* Back button */}
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-amber-400 font-display">
                  {activeLevelTab === 'CLASSIC' ? "الأوعية الكلاسيكية: المراحل 1 - 30 🏆" : activeLevelTab === 'MUTATED' ? "الطفرة السيبرانية: المراحل 31 - 60 🧪" : "حملة الأوردة والشرايين: المراحل 61 - 90 🚨"}
                </h3>
                <button
                  onClick={() => setShowLevelsView(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/90 hover:text-white transition-all text-xs flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 scale-x-[-1]" />
                  <span>رجوع</span>
                </button>
              </div>

              {/* Tabs selector */}
              <div className="flex gap-1.5 p-1 bg-black/40 rounded-2xl border border-white/5">
                <button
                  type="button"
                  onClick={() => setActiveLevelTab('CLASSIC')}
                  className={`flex-1 py-2 text-[10px] sm:text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeLevelTab === 'CLASSIC'
                      ? 'bg-gradient-to-r from-red-500/20 to-red-600/20 text-red-400 border border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                      : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  الكلاسيكية (1-30)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLevelTab('MUTATED')}
                  className={`flex-1 py-2 text-[10px] sm:text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeLevelTab === 'MUTATED'
                      ? 'bg-gradient-to-r from-cyan-500/20 to-cyan-600/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                      : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  السيبرانية (31-60)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLevelTab('VASCULAR')}
                  className={`flex-1 py-2 text-[10px] sm:text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    activeLevelTab === 'VASCULAR'
                      ? 'bg-gradient-to-r from-rose-500/20 to-rose-600/20 text-rose-400 border border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.15)]'
                      : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  الأوعية (61-90)
                </button>
              </div>

              <p className="text-xs text-white/60 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5 text-right font-sans" dir="rtl">
                {activeLevelTab === 'CLASSIC' 
                  ? "طهر صمامات وعضلات القلب بالتدريج وتجاوز 30 مرحلة من الخطورة والآفات الجرثومية! تزداد وتيرة النبض والعدوانية مع تقدمك."
                  : activeLevelTab === 'MUTATED'
                    ? "⚠️ تحذير الطفرة السيبرانية: 30 مرحلة جديدة تختلف عن ال30 الأولى تماماً ببيئة لعب زرقاء مجهرية، جراثيم إلكترونية ذكية، وموسيقى طوارئ تركيبية مختلفة!"
                    : "🔴🔵 حملة المسعف للأوعية والشرايين: 30 مرحلة فائقة الصعوبة والتشويق! جلطات شريانية تتضخم، وخثرات وريدية متعرجة خاطفة لتطوي القنوات، ولويحات تصلب صفراء بـ 4 ضربات، وزعيم الانسداد الأعظم بقوة 20 ضربة!"
                }
              </p>

              {/* levels list */}
              <div className="grid grid-cols-5 gap-2 max-h-[280px] overflow-y-auto pr-1">
                {Array.from({ length: 30 }).map((_, i) => {
                  const lNum = activeLevelTab === 'CLASSIC' ? (i + 1) : activeLevelTab === 'MUTATED' ? (i + 31) : (i + 61);
                  const isUnlocked = lNum <= maxUnlockedLevel;
                  const isCompleted = lNum < maxUnlockedLevel || JSON.parse(localStorage.getItem('nabdah_completed_levels_v1') || '[]').includes(lNum);

                  return (
                    <button
                      key={lNum}
                      disabled={!isUnlocked}
                      onClick={() => {
                        setSelectedLevelInfo(lNum);
                      }}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center relative border transition-all select-none cursor-pointer ${
                        !isUnlocked 
                          ? 'bg-black/45 border-white/5 text-white/20 cursor-not-allowed opacity-50'
                          : isCompleted
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:scale-[1.05] shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                            : activeLevelTab === 'MUTATED'
                              ? 'bg-cyan-500/5 border-cyan-500/20 text-cyan-300 hover:border-cyan-400 hover:scale-[1.05]'
                              : activeLevelTab === 'VASCULAR'
                                ? 'bg-rose-500/5 border-rose-500/20 text-rose-350 hover:border-rose-400 hover:scale-[1.05]'
                                : 'bg-white/5 border-white/10 text-white hover:border-red-500 hover:scale-[1.05]'
                      }`}
                    >
                      {/* Status Check / Lock */}
                      {!isUnlocked ? (
                        <Lock className="w-3.5 h-3.5 opacity-60 mb-0.5 text-white/30" />
                      ) : isCompleted ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 mb-0.5" />
                      ) : (
                        <span className="text-[8px] text-white/40 tracking-tight font-mono mb-0.5">هدف: {getStageConfig(lNum).targetScore}</span>
                      )}
                      <span className="text-sm font-black font-mono">{lNum}</span>
                      <span className="text-[7px] text-white/40 font-sans">مرحلة</span>
                    </button>
                  );
                })}
              </div>
              
              {/* Visual Legend */}
              <div className="flex justify-center gap-4 text-[9px] text-white/50 border-t border-white/5 pt-3">
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500/25 border border-emerald-500/40" />
                  <span>مكتملة</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-white/5 border border-white/10" />
                  <span>متاحة للعب</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-black/45 border border-white/5 opacity-50" />
                  <span>مغلقة</span>
                </div>
              </div>

              {/* Level Info Modal Overlay */}
              {selectedLevelInfo !== null && (() => {
                const info = getStageDescription(selectedLevelInfo);
                const config = getStageConfig(selectedLevelInfo);
                return (
                  <div className="absolute inset-x-3 inset-y-4 bg-slate-950/98 bg-gradient-to-b from-slate-950/98 to-slate-900/98 backdrop-blur-xl rounded-2xl p-5 flex flex-col justify-between text-right animate-fade-in z-30 border-2 border-white/10" dir="rtl">
                    <div className="flex flex-col gap-3.5 overflow-y-auto pr-1">
                      <div className="flex justify-between items-center border-b border-white/10 pb-2">
                        <h4 className="text-base font-black text-red-400 font-display">مهمة الإنعاش الإنعاشي #{selectedLevelInfo}</h4>
                        <span className="text-[10px] bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-mono">تقرير التشخيص</span>
                      </div>
                      
                      <div className="space-y-3 font-sans">
                        <div>
                          <p className="text-[9px] text-white/50 uppercase font-bold tracking-widest mb-0.5">مسمى المرحلة:</p>
                          <p className="text-sm font-extrabold text-white leading-snug">{info.title}</p>
                        </div>
                        
                        <div>
                          <p className="text-[9px] text-white/50 uppercase font-bold tracking-widest mb-0.5">نوعية التهديد النشط:</p>
                          <p className="text-xs text-amber-400 font-bold leading-normal">{info.threats}</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 bg-white/5 p-2 rounded-xl border border-white/5">
                          <div>
                            <p className="text-[9px] text-white/40 font-bold">النتيجة المستهدفة:</p>
                            <p className="text-xs font-black text-emerald-400 font-mono">+{config.targetScore} نقطة</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-white/40 font-bold">سرعة حركة التهديدات:</p>
                            <p className="text-xs font-black text-amber-400 font-sans">{info.speed}</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-[9px] text-white/50 uppercase font-bold tracking-widest mb-0.5">ملخص الحالة الطبية والتشخيص:</p>
                          <p className="text-[11px] text-white/80 leading-relaxed font-sans">{info.desc}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-white/10 mt-2">
                      <button
                        onClick={() => {
                          const lvl = selectedLevelInfo;
                          setSelectedLevelInfo(null);
                          setShowLevelsView(false);
                          startGame('LEVELS', lvl);
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-extrabold text-xs shadow-lg hover:shadow-emerald-500/25 active:scale-95 transition-all text-center cursor-pointer"
                      >
                        بدء العملية الإيقاعية ⚡
                      </button>
                      <button
                        onClick={() => setSelectedLevelInfo(null)}
                        className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white text-xs active:scale-95 transition-all cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div id="start-screen" className="flex flex-col gap-5 py-3 animate-fade-in text-center">
              
              {/* Google Auth & Social Lobby Status Row */}
              <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-3.5 mb-2 text-right">
                {!currentUser ? (
                  <div className="flex flex-col items-center justify-center p-2 text-center gap-2">
                    <p className="text-xs text-white/70">سجل دخولك باستخدام Google لمنافسة الأصدقاء في عمليات فورية!</p>
                    <button
                      onClick={handleGoogleLogin}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-white text-slate-900 border border-white hover:bg-white/90 active:scale-95 transition-all text-xs font-bold shadow-md cursor-pointer"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.74 5.74 0 0 1-2.49 3.77v3.12h4.01c2.34-2.16 3.685-5.32 3.685-8.74z"/>
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-4.01-3.12c-1.12.75-2.54 1.19-3.92 1.19-2.65 0-4.9-1.8-5.7-4.21H2.18v3.22C4.16 22.12 7.82 24 12 24z"/>
                        <path fill="#FBBC05" d="M6.3 14.95a7.19 7.19 0 0 1 0-4.57V7.16H2.18a11.99 11.99 0 0 0 0 9.68l4.12-3.21z"/>
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.82 0 4.16 1.88 2.18 5.18l4.12 3.22c.8-2.41 3.05-4.21 5.7-4.21z"/>
                      </svg>
                      <span>تسجيل الدخول باستخدام Google</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div className="flex items-center gap-2">
                        <img
                          src={currentUser.photoURL || ''}
                          alt="Avatar"
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full border border-red-500/30"
                        />
                        <div className="text-right">
                          <p className="text-xs font-bold text-white leading-none">{currentUser.displayName || 'طبيب نبّاض'}</p>
                          <p className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 mt-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                            <span>متاح للضم الشراكي</span>
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="px-2.5 py-1 text-[10px] rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
                      >
                        خروج
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsSocialOpen(true)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-red-650 to-red-800 hover:from-red-550 hover:to-red-700 text-white font-bold text-xs shadow-md border border-white/10 transition-all active:scale-95 cursor-pointer animate-pulse"
                      >
                        <Users className="w-4 h-4 text-white" />
                        <span>بوابة الأصدقاء والزملاء ({friends.length})</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

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
                  id="start-levels-btn"
                  onClick={() => setShowLevelsView(true)}
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/15 shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-[0.98] transition-all cursor-pointer text-sm font-display font-medium"
                >
                  <Trophy className="w-4 h-4 text-white fill-current animate-pulse" />
                  لعب طور المراحل الـ 30 (تطهير الأوعية الدموية 🏆)
                </button>

                <button
                  id="start-game-btn"
                  onClick={() => startGame('ENDLESS')}
                  className="w-full bg-gradient-to-r from-red-650 to-red-800 hover:from-red-550 hover:to-red-700 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/15 shadow-[0_0_15px_rgba(220,38,38,0.4)] active:scale-[0.98] transition-all cursor-pointer text-sm font-display font-medium"
                >
                  <Play className="w-4 h-4 fill-current text-white" />
                  الوضع الفردي اللانهائي (البقاء)
                </button>

                <button
                  id="start-timed-btn"
                  onClick={() => startGame('TIMED')}
                  className="w-full bg-gradient-to-r from-amber-550 to-amber-700 hover:from-amber-450 hover:to-amber-600 text-slate-950 font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/15 shadow-[0_0_15px_rgba(251,191,36,0.3)] active:scale-[0.98] transition-all cursor-pointer text-sm font-display font-medium"
                >
                  <Zap className="w-4 h-4 fill-current text-slate-950" />
                  تحدي الـ 60 ثانية (إنعاش سريع)
                </button>

                <button
                  id="start-splitscreen-btn"
                  onClick={() => startSplitScreenGame('ENDLESS')}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/15 shadow-[0_0_15px_rgba(139,92,246,0.3)] active:scale-[0.98] transition-all cursor-pointer text-sm font-display font-medium"
                >
                  <Users className="w-4 h-4 text-white" />
                  تحدي شخصين (تقسيم الشاشة 👥)
                </button>

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
          )
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
              onClick={() => startGame('ENDLESS')}
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
            

            {/* Real-time Electrocardiogram (ECG) monitor line */}
            <EKGMonitor 
              currentBPM={currentBPM} 
              triggerBeatSign={triggerBeatSign}
              isLowHealth={heartHealth < 30 || (isSplitScreen && heartHealth2 < 30)}
              isFlatline={false}
            />

            {isSplitScreen ? (
              /* Split Screen Mode view - 2 Players side-by-side or stacked on mobile */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
                
                {/* PLAYER 1: LEFT / TOP SIDE */}
                <div className="flex flex-col gap-3.5 p-4 rounded-3xl bg-white/[0.02] border border-white/5 relative shadow-inner">
                  <div className="flex justify-between items-center mb-1">
                    <span className="bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-[0_0_12px_rgba(239,68,68,0.4)]">
                      المسعف الأول (PLAYER 1) 🟥
                    </span>
                    <span className="text-xs text-red-400 font-mono font-bold bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md">
                      {score} نقطة
                    </span>
                  </div>

                  <div className="grid grid-cols-2 bg-white/5 p-2 rounded-xl text-center font-mono border border-white/5 text-xs">
                    <div className="border-l border-white/10">
                      <span className="block text-[8px] text-white/40">متتالي</span>
                      <span className="text-sm font-black text-red-400">{combo}x</span>
                    </div>
                    <div>
                      <span className="block text-[8px] text-white/40">أطول سلسلة</span>
                      <span className="text-sm font-black text-amber-500">{maxCombo}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 bg-white/5 p-2.5 rounded-xl border border-white/5">
                    <div className="flex justify-between items-center text-[9px] font-mono">
                      <span className="text-white/40 uppercase">صحة المريض الأول</span>
                      <span className={`font-bold ${heartHealth < 30 ? 'text-red-400 animate-pulse' : 'text-red-500'}`}>
                        {heartHealth}% HP
                      </span>
                    </div>
                    <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/5">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${heartHealth < 30 ? 'bg-gradient-to-r from-red-600 to-rose-500 animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.4)]' : 'bg-gradient-to-r from-red-550 to-rose-550'}`} 
                        style={{ width: `${heartHealth}%` }} 
                      />
                    </div>
                  </div>

                  {stabilizationTimeLeft > 0 && (
                    <div className="py-1 px-3 rounded-xl bg-sky-500/10 text-center text-[9px] text-sky-450 border border-sky-500/20 animate-pulse font-mono tracking-wider">
                      منظم ضربات القلب نشط: {stabilizationTimeLeft} ثوانٍ
                    </div>
                  )}

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
                    currentLevel={currentLevel}
                    gameMode={gameMode}
                  />
                </div>

                {/* PLAYER 2: RIGHT / BOTTOM SIDE */}
                <div className="flex flex-col gap-3.5 p-4 rounded-3xl bg-white/[0.02] border border-white/5 relative shadow-inner">
                  <div className="flex justify-between items-center mb-1">
                    <span className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-[0_0_12px_rgba(79,70,229,0.4)]">
                      المسعف الثاني (PLAYER 2) 🟦
                    </span>
                    <span className="text-xs text-indigo-400 font-mono font-bold bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                      {score2} نقطة
                    </span>
                  </div>

                  <div className="grid grid-cols-2 bg-white/5 p-2 rounded-xl text-center font-mono border border-white/5 text-xs">
                    <div className="border-l border-white/10">
                      <span className="block text-[8px] text-white/40">متتالي</span>
                      <span className="text-sm font-black text-indigo-400">{combo2}x</span>
                    </div>
                    <div>
                      <span className="block text-[8px] text-white/40">أطول سلسلة</span>
                      <span className="text-sm font-black text-amber-500">{maxCombo2}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 bg-white/5 p-2.5 rounded-xl border border-white/5">
                    <div className="flex justify-between items-center text-[9px] font-mono">
                      <span className="text-white/40 uppercase">صحة المريض الثاني</span>
                      <span className={`font-bold ${heartHealth2 < 30 ? 'text-indigo-400 animate-pulse' : 'text-indigo-500'}`}>
                        {heartHealth2}% HP
                      </span>
                    </div>
                    <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/5">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${heartHealth2 < 30 ? 'bg-gradient-to-r from-indigo-600 to-indigo-400 animate-pulse shadow-[0_0_8px_rgba(79,70,229,0.4)]' : 'bg-gradient-to-r from-indigo-550 to-indigo-450'}`} 
                        style={{ width: `${heartHealth2}%` }} 
                      />
                    </div>
                  </div>

                  {stabilizationTimeLeft2 > 0 && (
                    <div className="py-1 px-3 rounded-xl bg-sky-500/10 text-center text-[9px] text-sky-450 border border-sky-500/20 animate-pulse font-mono tracking-wider">
                      منظم ضربات القلب نشط: {stabilizationTimeLeft2} ثوانٍ
                    </div>
                  )}

                  <HeartGameCanvas
                    nodes={nodes2}
                    particles={particles2}
                    floatingTexts={floatingTexts2}
                    heartHealth={heartHealth2}
                    currentBPM={currentBPM}
                    beatScale={beatScale2}
                    isOnBeat={showBeatIndicator}
                    score={score2}
                    combo={combo2}
                    onTapNode={handleTapNode2}
                    onMissNode={handleMissNode2}
                    isPaused={false}
                    currentLevel={currentLevel}
                    gameMode={gameMode}
                  />
                </div>

              </div>
            ) : (
              /* Regular Singleplayer view layout */
              <>
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

                {gameMode === 'LEVELS' && (
                  <div className="space-y-1.5 backdrop-blur-md bg-emerald-500/5 p-3 rounded-2xl border border-emerald-500/20 text-right animate-fade-in">
                    <div className="flex justify-between items-center text-[10px] font-mono px-1">
                      <span className="text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                        🏆 هدف المرحلة {currentLevel} (STAGE OBJECTIVE)
                      </span>
                      <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-md">
                        {score} / {getStageConfig(currentLevel).targetScore} نقطة
                      </span>
                    </div>
                    <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/5 p-0.5">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-300"
                        style={{ width: `${Math.min(100, (score / getStageConfig(currentLevel).targetScore) * 100)}%` }}
                      />
                    </div>
                    {currentLevel >= 4 && (
                      <div className="text-[10px] text-emerald-400/80 mt-1">
                        ⚠️ تحذير: تظهر البكتيريا الكبيرة (تتطلب 3 ضربات) وتستدعي بكتيريا أصغر (تتطلب ضربتين)!
                      </div>
                    )}
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
                  currentLevel={currentLevel}
                  gameMode={gameMode}
                />
              </>
            )}

            {/* Pause & emergency abort trigger */}
            <div className="flex justify-center mt-2">
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
            
            {splitScreenWinner ? (
              /* DUAL PLAYER RESULTS PANEL */
              <div className="p-5 backdrop-blur-md bg-white/5 border border-purple-500/30 rounded-3xl flex flex-col items-center gap-3.5 my-2 shadow-[0_0_35px_rgba(139,92,246,0.25)] animate-fade-in text-right">
                <Trophy className="w-12 h-12 text-violet-400 animate-bounce" />
                <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 text-center w-full">تحدي النبض الثنائي!</h3>
                
                <div className="text-center w-full my-1.5">
                  <span className="text-xs text-purple-300 uppercase block tracking-widest mb-1.5">الفائز في المواجهة</span>
                  <p className="text-base font-black text-white bg-gradient-to-r from-violet-600 to-indigo-700 border border-white/10 px-6 py-2 rounded-2xl inline-block shadow-lg">
                    🏆 {splitScreenWinner}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full mt-3 pt-3 border-t border-white/5">
                  {/* Player 1 Stats Box */}
                  <div className="bg-red-550/10 border border-red-500/20 p-3 rounded-2xl flex flex-col gap-1 text-center">
                    <span className="block text-[10px] text-red-400 font-bold">المسعف الأول 🟥</span>
                    <span className="text-xl font-black font-mono text-white mt-1">{score} <span className="text-[10px] font-normal text-white/40">نقطة</span></span>
                    <div className="text-[10px] text-white/50 space-y-0.5 mt-1 border-t border-white/5 pt-1 font-mono">
                      <div>السلسلة: {maxCombo}x</div>
                      <div>الدقة: {calculatedAcc}%</div>
                    </div>
                  </div>

                  {/* Player 2 Stats Box */}
                  <div className="bg-indigo-650/10 border border-indigo-500/20 p-3 rounded-2xl flex flex-col gap-1 text-center">
                    <span className="block text-[10px] text-indigo-400 font-bold">المسعف الثاني 🟦</span>
                    <span className="text-xl font-black font-mono text-white mt-1">{score2} <span className="text-[10px] font-normal text-white/40">نقطة</span></span>
                    <div className="text-[10px] text-white/50 space-y-0.5 mt-1 border-t border-white/5 pt-1 font-mono">
                      <div>السلسلة: {maxCombo2}x</div>
                      <div>الدقة: {accuracy2.total > 0 ? Math.round((accuracy2.perfect / accuracy2.total) * 100) : 0}%</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ORIGINAL SOLO RESULTS VIEW */
              <>
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
              </>
            )}

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
                className="w-full bg-gradient-to-r from-red-650 to-red-800 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/10 hover:shadow-[0_0_15px_rgba(220,38,38,0.5)] active:scale-[0.98] transition-all cursor-pointer text-sm font-display font-medium"
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

        {/* CUSTOM LEVEL COMPLETION CELEBRATION SCREEN */}
        {gameState === 'LEVEL_COMPLETE' && (
          <div id="level-complete-container" className="flex flex-col gap-4 py-3 animate-fade-in text-center font-sans w-full max-w-md">
            
            {/* EKG fully green beating stable line */}
            <EKGMonitor 
              currentBPM={72 + (currentLevel * 2)}
              triggerBeatSign={true}
              isLowHealth={false}
              isFlatline={false}
            />

            {/* Victory card */}
            <div className="p-5 backdrop-blur-md bg-emerald-500/10 border border-emerald-500/30 rounded-3xl flex flex-col items-center gap-3.5 shadow-[0_0_35px_rgba(16,185,129,0.25)] animate-fade-in text-center">
              <Trophy className="w-12 h-12 text-emerald-400 animate-bounce" />
              <h3 className="text-2xl font-black text-emerald-400 font-display">اكتمل تطهير صمام القلب بنجاح! 🎉</h3>
              <p className="text-xs text-white/80 leading-relaxed px-2">
                عمل بطولي يا دكتور! لقد طهرت الأوعية الدموية بالكامل ونظّمت صمامات المريض في المرحلة <span className="text-emerald-400 font-bold font-mono text-base">{currentLevel}</span> ليركض قلبه بنبض سليم.
              </p>
            </div>

            {/* Stage statistics */}
            <div className="backdrop-blur-md bg-white/5 p-4 rounded-2xl border border-white/10 text-right space-y-3">
              <h4 className="text-[10px] uppercase tracking-widest text-white/40 font-bold border-b border-white/5 pb-1.5 font-sans">تقرير كفاءة إنقاذ المرحلة:</h4>
              
              <div className="flex justify-between items-center text-xs">
                <span className="text-white/60">المرحلة المنجزة:</span>
                <span className="font-bold text-white font-mono">مرحلة {currentLevel} من أصل 60</span>
              </div>
              
              <div className="flex justify-between items-center text-xs">
                <span className="text-white/60">النقاط التي تجمعت:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">{score} نقطة</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-white/60">أعلى دقة سلسلة ضربات:</span>
                <span className="font-mono font-bold text-amber-500">{maxCombo} متتالية</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-white/60">نسبة الكفاءة الإيقاعية (Accuracy):</span>
                <span className="font-mono font-bold text-cyan-400">{calculatedAcc}%</span>
              </div>
            </div>

            {/* Navigation options */}
            <div className="flex flex-col gap-2.5 mt-2">
              {currentLevel < 60 ? (
                <button
                  id="next-level-btn"
                  onClick={() => startGame('LEVELS', currentLevel + 1)}
                  className="w-full bg-gradient-to-r from-emerald-600 to-green-700 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/10 hover:shadow-[0_0_15px_rgba(16,185,129,0.5)] active:scale-[0.98] transition-all cursor-pointer text-sm font-display font-medium"
                >
                  الذهاب إلى المرحلة التالية ({currentLevel + 1}) ⏩
                </button>
              ) : (
                <div className="py-2.5 px-4 bg-amber-500/10 border border-amber-500/35 text-amber-400 text-xs rounded-xl font-bold">
                  🎖️ أهلاً بك في صف الرائد الإيقاعي! لقد أكملت جميع المراحل الـ 60 بنجاح فائق وتغلبت على الطفرة السيبرانية الحيوية!
                </div>
              )}

              <button
                id="replay-level-btn"
                onClick={() => startGame('LEVELS', currentLevel)}
                className="w-full bg-white/5 hover:bg-white/10 text-white font-medium py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/10 transition-all cursor-pointer text-xs"
              >
                إعادة تشغيل المرحلة الحالية {currentLevel}
              </button>

              <button
                id="back-to-levels-grid-btn"
                onClick={() => {
                  setGameState('START');
                  setShowLevelsView(true);
                }}
                className="w-full bg-white/5 hover:bg-white/10 text-white/70 font-medium py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/10 transition-all cursor-pointer text-xs"
              >
                العودة لقائمة مستويات الخريطة 🗺️
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
