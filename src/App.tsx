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
  RefreshCw,
  Dumbbell,
  Flame
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
  const [screenBlur, setScreenBlur] = useState<boolean>(false);
  const [beatScale, setBeatScale] = useState<number>(1.0);
  const [showBeatIndicator, setShowBeatIndicator] = useState<boolean>(false); // Beats visual halo
  const [triggerBeatSign, setTriggerBeatSign] = useState<boolean>(false); // Triggers EKG spike
  const [triggerBeatSign2, setTriggerBeatSign2] = useState<boolean>(false); // Triggers Player 2 EKG spike
  const [volume, setVolume] = useState<number>(0.6);

  // Single Player Game Modes (Endless vs Timed Challenge vs Levels vs Lifestyle)
  const [gameMode, setGameMode] = useState<'ENDLESS' | 'TIMED' | 'LEVELS' | 'LIFESTYLE'>('ENDLESS');
  const [currentCampaign, setCurrentCampaign] = useState<'MEDICAL' | 'LIFESTYLE'>('MEDICAL');
  const [selectedCampaignTab, setSelectedCampaignTab] = useState<'MEDICAL' | 'LIFESTYLE'>('MEDICAL');
  const [maxUnlockedLifestyleLevel, setMaxUnlockedLifestyleLevel] = useState<number>(1);
  const [completedLifestyleLevels, setCompletedLifestyleLevels] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isTimeOutEnd, setIsTimeOutEnd] = useState<boolean>(false);
  const [currentLevel, setCurrentLevel] = useState<number>(1);
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState<number>(1);
  const [levelCompleted, setLevelCompleted] = useState<boolean>(false);
  const [showLevelsView, setShowLevelsView] = useState<boolean>(false);
  const [activeLevelTab, setActiveLevelTab] = useState<'CLASSIC' | 'MUTATED' | 'VASCULAR' | 'CARDIAC'>('CLASSIC');
  const [selectedLevelInfo, setSelectedLevelInfo] = useState<number | null>(null);

  // Interactive Cardio Gym & Active Exercise Boosters (صالة تعزيز اللياقة وقوة القلب)
  const [isGymOpen, setIsGymOpen] = useState<boolean>(false);
  const [gymPoints, setGymPoints] = useState<number>(0);
  const [sprintLevel, setSprintLevel] = useState<number>(1);
  const [cyclingLevel, setCyclingLevel] = useState<number>(1);
  const [swimmingLevel, setSwimmingLevel] = useState<number>(1);
  const [strengthLevel, setStrengthLevel] = useState<number>(1);

  // Active status of boosters
  const [cardioSprintActive, setCardioSprintActive] = useState<boolean>(true);
  const [cyclingActive, setCyclingActive] = useState<boolean>(true);
  const [swimmingActive, setSwimmingActive] = useState<boolean>(true);
  const [strengthActive, setStrengthActive] = useState<boolean>(true);

  // Active micro-training mini-game states inside the Gym
  const [gymPracticeType, setGymPracticeType] = useState<'NONE' | 'SPRINT' | 'CYCLING' | 'SWIMMING' | 'STRENGTH'>('NONE');
  const [practiceProgress, setPracticeProgress] = useState<number>(0);
  const [practiceTimer, setPracticeTimer] = useState<number>(0);
  const [practiceStatusMessage, setPracticeStatusMessage] = useState<string>('');

  // Motivational features: programs/plans and daily spin
  const [totalWorkouts, setTotalWorkouts] = useState<number>(0);
  const [ironHeartClaimed, setIronHeartClaimed] = useState<boolean>(false);
  const [superArteriesClaimed, setSuperArteriesClaimed] = useState<boolean>(false);
  const [oxygenTankClaimed, setOxygenTankClaimed] = useState<boolean>(false);
  const [lastSpinDate, setLastSpinDate] = useState<string>('');
  const [spinCompletedWorkouts, setSpinCompletedWorkouts] = useState<number>(0);
  const [gymTab, setGymTab] = useState<'EXERCISES' | 'PLANS' | 'WHEEL'>('EXERCISES');
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [spinAnimationDegree, setSpinAnimationDegree] = useState<number>(0);
  const [spinRewardMsg, setSpinRewardMsg] = useState<string>('');

  // Arabic Heart Safety Tips (≤ 4 words) - For displaying non-disruptive medical tips between levels
  const HEART_TIPS = [
    "مارس الرياضة يومياً 🏃‍♂️",
    "قلل الملح والسكريات 🧂",
    "تجنب التدخين تماماً 🚭",
    "تناول طعاماً صحياً 🍏",
    "ابتعد عن التوتر 🧘‍♂️",
    "احرص على النوم 😴",
    "اشرب الماء بانتظام 💧",
    "راقب ضغط الدم 🩺",
    "حافظ على وزنك ⚖️",
    "قلل الوجبات السريعة 🍔",
    "تناول خضاراً وفواكه 🥦",
    "افحص قلبك دورياً ❤️"
  ];
  const [currentHeartTip, setCurrentHeartTip] = useState<string>("مارس الرياضة يومياً 🏃‍♂️");

  const rotateHeartTip = () => {
    const idx = Math.floor(Math.random() * HEART_TIPS.length);
    setCurrentHeartTip(HEART_TIPS[idx]);
  };

  // Defibrillator Resuscitation Minigame states
  const [isDefibrillatorActive, setIsDefibrillatorActive] = useState<boolean>(false);
  const [defibrillatorCharge, setDefibrillatorCharge] = useState<number>(0);
  const [defibrillatorSlider, setDefibrillatorSlider] = useState<number>(0);
  const [defibrillatorUsed, setDefibrillatorUsed] = useState<boolean>(false);
  const [defibrillatorTimeLeft, setDefibrillatorTimeLeft] = useState<number>(10);

  // Helper to calculate stage configurations (1 to 90) - Scales difficulty beautifully
  const getStageConfig = (lvl: number) => {
    // Advanced Vascular Campaign stages (61 to 90) & Mutated stages (31 to 60) & Cardiac Surgery (91 to 100)
    let targetScore = lvl * 100 + 50; 
    if (lvl === 30) {
      targetScore = 3500; // Epic boss score goal
    } else if (lvl === 60) {
      targetScore = 6000; // Ultimate giant megaboss boss score goal
    } else if (lvl === 90) {
      targetScore = 9000; // Ultimate coronary embolus boss score goal
    } else if (lvl === 100) {
      targetScore = 12000; // Ultimate Grand Open Heart Surgery Boss score goal
    } else if (lvl >= 91) {
      targetScore = 9200 + (lvl - 90) * 250;
    } else if (lvl >= 61) {
      targetScore = 6200 + (lvl - 60) * 140;
    } else if (lvl >= 31) {
      // Scale target scores nicely for the advanced arc
      targetScore = 3000 + (lvl - 30) * 120;
    }
    
    // Shorter spawn intervals as level increases (clamped sensibly)
    const baseSpawnInterval = Math.max(
      lvl >= 91 ? 250 : lvl >= 80 ? 270 : lvl >= 61 ? 310 : lvl >= 50 ? 320 : lvl >= 31 ? 380 : lvl === 30 ? 460 : 440,
      2400 - (lvl * 64)
    ); 
    
    // Higher speed base factor as difficulty expands
    const baseSpeed = lvl >= 91 ? 0.9 + (lvl * 0.05) : lvl >= 61 ? 0.8 + (lvl * 0.046) : 0.8 + (lvl * 0.057); 
    return { targetScore, baseSpawnInterval, baseSpeed };
  };

  const getStageDescription = (lvl: number) => {
    if (lvl === 100) {
      return {
        title: "جراحة القلب المفتوح الكبرى: الإنعاش الأسطوري الأخير (المستوى رقم 100!) 🫀🏆🏥",
        threats: "زعيم الإنسداد صِمام صِمام الهائل CORONARY_EMBOLUS_BOSS (يتطلب 30 ضربة!) + عاصفة جائحة من كافة اللويحات والخثرات!",
        speed: "سرعة فوق طاقة الاستيعاب ⚡🩺💥",
        desc: "لقد بلغت المرحلة 100 النهائية! عملية قلب مفتوح معقدة تحت رعاية المسعف الأسطوري. الزعيم مسدود عند الصمام الثلاثي والنبض على المحك التام، يحتاج لـ 30 ضربة إيقاعية لتفتيته وإنعاش الحياة دورياً! أثبت جدارتك التاريخية والتقط الإيقاع الأخر لوقف التوقف ونيل المجد الطبي الكامل."
      };
    }
    if (lvl >= 91) {
      return {
        title: `غرفة العمليات الجراحية: إنقاذ العقدة الأذينية - مستوى ${lvl} 🧪`,
        threats: "مزيج عاصف من الآفات: لويحات تصلب صفراء (4 ضربات) + خثرات وريدية زرقاء سريعة + جلطات شريانية ورمية!",
        speed: "نبض حاد وخاطف 🧬🏥🚨",
        desc: "تتعرض العقدة الجيبية الأذينية لتشويش شامل في حملة القلب المفتوح المتقدمة! يجب تطهير غرف المريض وإزالة الجلطات المتسارعة لتأمين ثبات النبض وتدفق الدورة الدموية الكبرى."
      };
    }
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

  // Helper to calculate Lifestyle stages configuration (1 to 100)
  const getLifestyleStageConfig = (lvl: number) => {
    let targetScore = lvl * 6 + 50; // Phase 1: 1-30 (56 to 230 - much more achievable and faster!)
    if (lvl >= 91) {
      targetScore = lvl * 15 + 400; // Phase 4 finale: 91-100 (1765 to 1900 - fast final combat instead of 4000!)
    } else if (lvl >= 61) {
      targetScore = lvl * 10 + 350; // Phase 3 danger zone: 61-90 (960 to 1250 instead of 2850!)
    } else if (lvl >= 31) {
      targetScore = lvl * 8 + 180; // Phase 2 intermediate: 31-60 (428 to 660 instead of 1500!)
    }

    const baseSpawnInterval = Math.max(
      lvl >= 91 ? 380 : lvl >= 61 ? 500 : lvl >= 31 ? 650 : 800,
      1700 - (lvl * 18)
    );
    const baseSpeed = lvl >= 91 ? 1.15 + (lvl * 0.015) : lvl >= 61 ? 1.0 + (lvl * 0.013) : 0.85 + (lvl * 0.015);
    return { targetScore, baseSpawnInterval, baseSpeed };
  };

  const getLifestyleStageDescription = (lvl: number) => {
    if (lvl === 100) {
      return {
        title: "العمر المديد والصحة الذهبية المستدامة (المستوى 100!) 👑🥗🧘‍♂️",
        threats: "عاصفة مدمجة من كافة السموم والوجبات السريعة والسهر والتوتر العالي بوجبات مزدوجة!",
        speed: "سرعة ونشاط عالي جداً 🩺📈⚡",
        desc: "المرحلة المئوية الختامية الكبرى لتحدي نمط الحياة! جميع العادات الضارة تظهر والقلب يحتاج لنظام دعم صارم ورعاية دقيقة. انتصر في هذه المحطة لتكسب وسام 'ملك الرعاية الوقائية وسفير الحياة الملهمة'!"
      };
    }
    if (lvl >= 91) {
      return {
        title: `نهائي الاستقرار والتعافي الكامل لنمط الحياة - مستوى ${lvl} 🏥🕊️`,
        threats: "هجمات سريعة من ثنائيات البرجر 🍔🍔 والملح الزائد 🧂🧂 والتوخي والتهرب من التمارين 📺 والسهر 🌙!",
        speed: "نبضات حياة متسارعة 🏃‍♂️💨",
        desc: "أنت الآن في محطة التشافي المتكاملة! تحرّك بسرعة لحظر العادات الضارة ودع الأكلات الصحية والماء والنوم الكافي يغذون الشرايين لتستقر ضربات القلب في مواجهة ضغوطات الحياة اليومية الشائكة."
      };
    }
    if (lvl === 90) {
      return {
        title: "حظر التوتر وهدم السهر المزمن (مرحلة التحدي الأعظم 90) 😰🚫⚔️",
        threats: "كميات مكدسة للغاية من السهر 🌙 الخمول المفرط 📺 والتدخين الكثيف 🚬 والتوتر المطبق 😰!",
        speed: "وتيرة قاسية ومجهدة 🌋⚡💥",
        desc: "مستوى ذروة التحدي لنمط الحياة! شرايين القلب تعاني من الخمول التام والتوتر العالي؛ صفي ذهنك وحطم العادات القاتلة وادعم القلب بالهواء المتجدد والنوم العميق لتجاوز أزمة التوتر المزمن وإنقاذ نبض الشرايين."
      };
    }
    if (lvl >= 61) {
      return {
        title: `حملة مواجهة الخمول والسموم - مستوى ${lvl} 📺🚭🧂`,
        threats: "تأثير خمول الشاشة والجلوس الطويل 📺 والتدخين السام 🚬 والملح المزدوج 🧂🧂!",
        speed: "صعوبة تصاعدية ملحوظة ⚠️⚡",
        desc: "أصبحت العادات الضارة تظهر بقوة وثوب هجومي مستمر! خمول التلفاز 📺 يقلل مرونة الصمامات ويستدعي 3 ضربات سريعة لتفتيته. استمر في التغذية بالماء والأبقاء على الرياضة نشطة لحرق الكوليسترول الضار!"
      };
    }
    if (lvl === 60) {
      return {
        title: "مقاومة وجبات البرجر العملاقة المكدسة (تحدي مستوى 60) 🍔🍔💣",
        threats: "تتابع سريع من ثنائيات البرجر 🍔🍔 والصلصات وصدمات السهر والسكر 🧂 وشبح التدخين 🚬!",
        speed: "تحدي إيقاعي حرج 🔥🍔",
        desc: "أنت على مشارف المرحلة الستين الفاصلة! الوجبات الدسمة الثنائية 🍔🍔 تبطئ الحركة وتحجر الشرايين وتتطلب نقرتين متتاليتين لتفكيكها وتجنب انسداد صمامات القلب الكبرى. قاوم بشدة وافسح للشرايين طريقتها الصحية!"
      };
    }
    if (lvl >= 31) {
      return {
        title: `تحديات التغذية المتوازنة والمقاومة - مستوى ${lvl} 🍎🥗🍔`,
        threats: "وجبات دسمة مكررة 🍔🍔، ملح زائد 🧂🧂، تدخين مبدئي 🚬 وضغوطات روتينية 😰!",
        speed: "صدمات إيقاعية متوسطة ⚡",
        desc: "المرحلة المتوسطة تطلق العنان لوحش العادات اليومية الخانقة. تبدأ ثنائيات البرجر بالظهور مع السهر القاتل 🌙. حافظ على مخزون الفيتامينات والماء ونظّم إيقاع يومك للمحافظة على ضغط وتوازن الشرايين."
      };
    }
    if (lvl >= 1) {
      return {
        title: `تطهير الأساسيات وبناء العادات - مستوى ${lvl} 🍏💧🍔`,
        threats: "تسلل وجبات البرجر 🍔، رشات صوديوم 🧂، وتأثير خفيف من التوتر والضغوط اليومية 😰.",
        speed: "إيقاع معتدل وتعليمي 🧘‍♂️🍏",
        desc: "مرحلة ترحيبية دافئة لمساعدتك على فكّ شيفرة نمط الحياة الصحي. تجنب لمس الوجبات والملح الضار واسمح للتفاح 🍎 والماء 💧 بدخول مجرى الدم لتغذية النسيج العضلي وإنعاش الحيوية."
      };
    }
    return { title: "", threats: "", speed: "", desc: "" };
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
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
        setMaxUnlockedLevel(parsed);
      }
    }
    const rawLvlLife = localStorage.getItem('nabdah_max_unlocked_lifestyle_level_v1');
    if (rawLvlLife) {
      const parsedLife = parseInt(rawLvlLife, 10);
      if (!isNaN(parsedLife) && parsedLife >= 1 && parsedLife <= 100) {
        setMaxUnlockedLifestyleLevel(parsedLife);
      }
    }
    try {
      const rawCompLife = localStorage.getItem('nabdah_completed_lifestyle_levels_v1');
      if (rawCompLife) {
        setCompletedLifestyleLevels(JSON.parse(rawCompLife));
      }
    } catch (e) {
      console.error("Lifestyle completed levels load failed", e);
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

  // Standalone effect to load Gym details for offline/unauthenticated startup
  useEffect(() => {
    const localGymPoints = parseInt(localStorage.getItem('nabdah_gym_points') || '0', 10);
    const localSprintLvl = parseInt(localStorage.getItem('nabdah_sprint_lvl') || '1', 10);
    const localCyclingLvl = parseInt(localStorage.getItem('nabdah_cycling_lvl') || '1', 10);
    const localSwimmingLvl = parseInt(localStorage.getItem('nabdah_swimming_lvl') || '1', 10);
    const localStrengthLvl = parseInt(localStorage.getItem('nabdah_strength_lvl') || '1', 10);

    const localWorkouts = parseInt(localStorage.getItem('nabdah_total_workouts') || '0', 10);
    const localIHClaimed = localStorage.getItem('nabdah_iron_heart_claimed') === 'true';
    const localSAClaimed = localStorage.getItem('nabdah_super_arteries_claimed') === 'true';
    const localOTClaimed = localStorage.getItem('nabdah_oxygen_tank_claimed') === 'true';
    const localSpinDate = localStorage.getItem('nabdah_last_spin_date') || '';
    const localSpinWkCount = parseInt(localStorage.getItem('nabdah_spin_wk_count') || '0', 10);

    setGymPoints(isNaN(localGymPoints) ? 0 : localGymPoints);
    setSprintLevel(isNaN(localSprintLvl) ? 1 : localSprintLvl);
    setCyclingLevel(isNaN(localCyclingLvl) ? 1 : localCyclingLvl);
    setSwimmingLevel(isNaN(localSwimmingLvl) ? 1 : localSwimmingLvl);
    setStrengthLevel(isNaN(localStrengthLvl) ? 1 : localStrengthLvl);

    setTotalWorkouts(isNaN(localWorkouts) ? 0 : localWorkouts);
    setIronHeartClaimed(localIHClaimed);
    setSuperArteriesClaimed(localSAClaimed);
    setOxygenTankClaimed(localOTClaimed);
    setLastSpinDate(localSpinDate);
    setSpinCompletedWorkouts(isNaN(localSpinWkCount) ? 0 : localSpinWkCount);
  }, []);

  const saveGymProgress = async (pt: number, spr: number, cyc: number, swi: number, str: number) => {
    localStorage.setItem('nabdah_gym_points', String(pt));
    localStorage.setItem('nabdah_sprint_lvl', String(spr));
    localStorage.setItem('nabdah_cycling_lvl', String(cyc));
    localStorage.setItem('nabdah_swimming_lvl', String(swi));
    localStorage.setItem('nabdah_strength_lvl', String(str));

    setGymPoints(pt);
    setSprintLevel(spr);
    setCyclingLevel(cyc);
    setSwimmingLevel(swi);
    setStrengthLevel(str);

    if (auth.currentUser) {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      try {
        await setDoc(userRef, {
          gymPoints: pt,
          sprintLevel: spr,
          cyclingLevel: cyc,
          swimmingLevel: swi,
          strengthLevel: str,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        console.error("Failed to sync gym progress to Firebase: ", e);
        handleFirestoreError(e, OperationType.WRITE, `users/${auth.currentUser.uid}`);
      }
    }
  };

  const saveMotivationProgress = async (
    workouts: number,
    ihClaimed: boolean,
    saClaimed: boolean,
    otClaimed: boolean,
    spinDate: string,
    spinWkCount: number
  ) => {
    localStorage.setItem('nabdah_total_workouts', String(workouts));
    localStorage.setItem('nabdah_iron_heart_claimed', String(ihClaimed));
    localStorage.setItem('nabdah_super_arteries_claimed', String(saClaimed));
    localStorage.setItem('nabdah_oxygen_tank_claimed', String(otClaimed));
    localStorage.setItem('nabdah_last_spin_date', spinDate);
    localStorage.setItem('nabdah_spin_wk_count', String(spinWkCount));

    setTotalWorkouts(workouts);
    setIronHeartClaimed(ihClaimed);
    setSuperArteriesClaimed(saClaimed);
    setOxygenTankClaimed(otClaimed);
    setLastSpinDate(spinDate);
    setSpinCompletedWorkouts(spinWkCount);

    if (auth.currentUser) {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      try {
        await setDoc(userRef, {
          totalWorkouts: workouts,
          ironHeartClaimed: ihClaimed,
          superArteriesClaimed: saClaimed,
          oxygenTankClaimed: otClaimed,
          lastSpinDate: spinDate,
          spinCompletedWorkouts: spinWkCount,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e) {
        console.error("Failed to sync motivation progress to Firebase:", e);
      }
    }
  };

  const claimPlanReward = async (plan: 'IRON' | 'ARTERIES' | 'OXYGEN') => {
    let xpAward = 0;
    let nextIHC = ironHeartClaimed;
    let nextSAC = superArteriesClaimed;
    let nextOTC = oxygenTankClaimed;

    if (plan === 'IRON') {
      if (totalWorkouts < 5 || ironHeartClaimed) return;
      xpAward = 100;
      nextIHC = true;
    } else if (plan === 'ARTERIES') {
      if (sprintLevel < 3 || cyclingLevel < 3 || superArteriesClaimed) return;
      xpAward = 200;
      nextSAC = true;
    } else if (plan === 'OXYGEN') {
      if (swimmingLevel < 4 || strengthLevel < 4 || oxygenTankClaimed) return;
      xpAward = 300;
      nextOTC = true;
    }

    if (xpAward > 0) {
      audioSynthRef.current.playPerfectSound();
      const updatedPoints = gymPoints + xpAward;
      setGymPoints(updatedPoints);
      
      // Save Gym Points first
      localStorage.setItem('nabdah_gym_points', String(updatedPoints));
      if (auth.currentUser) {
        try {
          await setDoc(doc(db, 'users', auth.currentUser.uid), {
            gymPoints: updatedPoints
          }, { merge: true });
        } catch (e) {
          console.error(e);
        }
      }

      // Save Plan Claims
      await saveMotivationProgress(totalWorkouts, nextIHC, nextSAC, nextOTC, lastSpinDate, spinCompletedWorkouts);
      spawnFloatingText(1, `🎉 استلام مكافأة الخطة بنجاح! +${xpAward} XP`, 190, 150, '#eab308', true);
    }
  };

  const handleDailySpin = async () => {
    if (isSpinning) return;
    
    const todayStr = new Date().toDateString();
    const isDateLocked = lastSpinDate === todayStr;
    const isWorkoutUnlocked = spinCompletedWorkouts >= 2;
    
    if (isDateLocked && !isWorkoutUnlocked) {
      audioSynthRef.current.playHitSound();
      return;
    }

    setIsSpinning(true);
    setSpinRewardMsg('جاري تدوير شرايين الحماس... 🎡');
    
    let ticks = 0;
    const interval = setInterval(() => {
      audioSynthRef.current.playHitSound();
      setSpinRewardMsg(`جاري الدوران... 🤸‍♂️ ${['💖', '⚡', '🚴‍♂️', '🏊‍♂️', '🏋️‍♂️'][ticks % 5]}`);
      ticks++;
      if (ticks >= 12) {
        clearInterval(interval);
      }
    }, 120);

    setTimeout(async () => {
      const rand = Math.random();
      let xpAward = 20;
      let rewardName = '20 XP ⚡ (نبضة حيوية خفيفة)';
      let quote = 'الرياضة اليومية تحسن أداء الشرايين وتزيد من تدفق الدم النقي! 🏃‍♂️';

      if (rand < 0.4) {
        xpAward = 20;
        rewardName = '20 XP ⚡ (نبضة حيوية خفيفة)';
        quote = 'الرياضة اليومية تحسن أداء الشرايين وتزيد من تدفق الدم النقي! 🏃‍♂️';
      } else if (rand < 0.7) {
        xpAward = 40;
        rewardName = '40 XP 💖 (شريان ذهبي معافى)';
        quote = 'قلوب من حديد! السعرات الحرارية المحروقة تبني صماماً فولاذياً للوقاية 🚴‍♂️';
      } else if (rand < 0.9) {
        xpAward = 60;
        rewardName = '60 XP 🏅 (استشفاء القلب السريع)';
        quote = 'تدريب السباحة والأكسجين ينظف الأوعية الدموية من الكوليسترول الضار! 🏊‍♂️';
      } else {
        xpAward = 80;
        rewardName = '80 XP 🎁 (النبضة الخارقة لقوة دكتور نبضة!)';
        quote = 'أنت وحش رياضي! ضخ دماءك بقوة كافية لتبتسم كرات الدم الحمراء حماساً! 🏋️‍♂️';
      }

      const updatedPoints = gymPoints + xpAward;
      setGymPoints(updatedPoints);
      
      localStorage.setItem('nabdah_gym_points', String(updatedPoints));
      if (auth.currentUser) {
        try {
          await setDoc(doc(db, 'users', auth.currentUser.uid), {
            gymPoints: updatedPoints
          }, { merge: true });
        } catch (e) {
          console.error(e);
        }
      }

      await saveMotivationProgress(totalWorkouts, ironHeartClaimed, superArteriesClaimed, oxygenTankClaimed, todayStr, 0);

      audioSynthRef.current.playPerfectSound();
      spawnFloatingText(1, `🎁 ربحت من عجلة الحماس: +${xpAward} XP`, 190, 150, '#eab308', true);
      setSpinRewardMsg(`🎉 مبروك! لقد ربحت: ${rewardName}\n\n💡 نصيحة نبضة الذهبية: ${quote}`);
      setIsSpinning(false);
    }, 1800);
  };

  const handleGymExerciseSuccess = (type: 'SPRINT' | 'CYCLING' | 'SWIMMING' | 'STRENGTH') => {
    let nextSprint = sprintLevel;
    let nextCycling = cyclingLevel;
    let nextSwimming = swimmingLevel;
    let nextStrength = strengthLevel;
    let nextPoints = gymPoints + 25;

    let exerciseName = '';
    if (type === 'SPRINT') {
      nextSprint = sprintLevel + 1;
      exerciseName = 'الجري السريع 🏃‍♂️';
    } else if (type === 'CYCLING') {
      nextCycling = cyclingLevel + 1;
      exerciseName = 'ركوب الدراجة 🚴‍♂️';
    } else if (type === 'SWIMMING') {
      nextSwimming = swimmingLevel + 1;
      exerciseName = 'السباحة والأكسجين 🏊‍♂️';
    } else if (type === 'STRENGTH') {
      nextStrength = strengthLevel + 1;
      exerciseName = 'رفع الأثقال وتطهير الشرايين 🏋️‍♂️';
    }

    audioSynthRef.current.playPerfectSound();
    
    // Spawn gorgeous floating text
    spawnFloatingText(1, `💪 ممارسة ${exerciseName} بنجاح! +25 XP`, 190, 150, '#eab308', true);

    // Save progress
    saveGymProgress(nextPoints, nextSprint, nextCycling, nextSwimming, nextStrength);

    // Increment motivational stats
    const nextTotalWorkouts = totalWorkouts + 1;
    const nextSpinWorkouts = spinCompletedWorkouts + 1;
    saveMotivationProgress(nextTotalWorkouts, ironHeartClaimed, superArteriesClaimed, oxygenTankClaimed, lastSpinDate, nextSpinWorkouts);

    setPracticeStatusMessage(`🎉 أحسنت! ارتفع مستوى تمرين ${exerciseName} إلى المستوى ${type === 'SPRINT' ? nextSprint : type === 'CYCLING' ? nextCycling : type === 'SWIMMING' ? nextSwimming : nextStrength}!`);

    // Set short timeout then return back to main list
    setTimeout(() => {
      setGymPracticeType('NONE');
    }, 2000);
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

            const dbMaxLifestyle = userData.maxUnlockedLifestyleLevel || 1;
            const dbCompletedLifestyle: number[] = userData.completedLifestyleLevels || [];

            const dbGymPoints = userData.gymPoints || 0;
            const dbSprintLevel = userData.sprintLevel || 1;
            const dbCyclingLevel = userData.cyclingLevel || 1;
            const dbSwimmingLevel = userData.swimmingLevel || 1;
            const dbStrengthLevel = userData.strengthLevel || 1;

            // Read from local storage (Medical)
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
            const finalCompleted = Array.from(mergedSet).filter(lvl => !isNaN(lvl) && lvl >= 1 && lvl <= 100);

            // Read from local storage (Lifestyle)
            const localMaxLifestyleStr = localStorage.getItem('nabdah_max_unlocked_lifestyle_level_v1');
            const localMaxLifestyle = localMaxLifestyleStr ? parseInt(localMaxLifestyleStr, 10) : 1;
            const finalMaxLifestyle = Math.max(dbMaxLifestyle, isNaN(localMaxLifestyle) ? 1 : localMaxLifestyle);

            let localCompletedLifestyle: number[] = [];
            try {
              localCompletedLifestyle = JSON.parse(localStorage.getItem('nabdah_completed_lifestyle_levels_v1') || '[]');
            } catch (e) {
              console.error(e);
            }

            const mergedSetLifestyle = new Set([...dbCompletedLifestyle, ...localCompletedLifestyle]);
            const finalCompletedLifestyle = Array.from(mergedSetLifestyle).filter(lvl => !isNaN(lvl) && lvl >= 1 && lvl <= 100);

            // Read from local storage (Gym Cardio)
            const localGymPoints = parseInt(localStorage.getItem('nabdah_gym_points') || '0', 10);
            const finalGymPoints = Math.max(dbGymPoints, isNaN(localGymPoints) ? 0 : localGymPoints);

            const localSprintLvl = parseInt(localStorage.getItem('nabdah_sprint_lvl') || '1', 10);
            const finalSprintLvl = Math.max(dbSprintLevel, isNaN(localSprintLvl) ? 1 : localSprintLvl);

            const localCyclingLvl = parseInt(localStorage.getItem('nabdah_cycling_lvl') || '1', 10);
            const finalCyclingLvl = Math.max(dbCyclingLevel, isNaN(localCyclingLvl) ? 1 : localCyclingLvl);

            const localSwimmingLvl = parseInt(localStorage.getItem('nabdah_swimming_lvl') || '1', 10);
            const finalSwimmingLvl = Math.max(dbSwimmingLevel, isNaN(localSwimmingLvl) ? 1 : localSwimmingLvl);

            const localStrengthLvl = parseInt(localStorage.getItem('nabdah_strength_lvl') || '1', 10);
            const finalStrengthLvl = Math.max(dbStrengthLevel, isNaN(localStrengthLvl) ? 1 : localStrengthLvl);

            // Update local storage
            localStorage.setItem('nabdah_max_unlocked_level_v1', String(finalMax));
            localStorage.setItem('nabdah_completed_levels_v1', JSON.stringify(finalCompleted));

            localStorage.setItem('nabdah_max_unlocked_lifestyle_level_v1', String(finalMaxLifestyle));
            localStorage.setItem('nabdah_completed_lifestyle_levels_v1', JSON.stringify(finalCompletedLifestyle));

            localStorage.setItem('nabdah_gym_points', String(finalGymPoints));
            localStorage.setItem('nabdah_sprint_lvl', String(finalSprintLvl));
            localStorage.setItem('nabdah_cycling_lvl', String(finalCyclingLvl));
            localStorage.setItem('nabdah_swimming_lvl', String(finalSwimmingLvl));
            localStorage.setItem('nabdah_strength_lvl', String(finalStrengthLvl));

            // Motivation variables DB fetch & merge
            const dbTotalWorkouts = userData.totalWorkouts || 0;
            const dbIronHeartClaimed = userData.ironHeartClaimed || false;
            const dbSuperArteriesClaimed = userData.superArteriesClaimed || false;
            const dbOxygenTankClaimed = userData.oxygenTankClaimed || false;
            const dbLastSpinDate = userData.lastSpinDate || '';
            const dbSpinWkCount = userData.spinCompletedWorkouts || 0;

            const localWorkouts = parseInt(localStorage.getItem('nabdah_total_workouts') || '0', 10);
            const finalWorkouts = Math.max(dbTotalWorkouts, isNaN(localWorkouts) ? 0 : localWorkouts);

            const finalIHClaimed = dbIronHeartClaimed || localStorage.getItem('nabdah_iron_heart_claimed') === 'true';
            const finalSAClaimed = dbSuperArteriesClaimed || localStorage.getItem('nabdah_super_arteries_claimed') === 'true';
            const finalOTClaimed = dbOxygenTankClaimed || localStorage.getItem('nabdah_oxygen_tank_claimed') === 'true';

            const finalSpinDate = dbLastSpinDate || localStorage.getItem('nabdah_last_spin_date') || '';
            const localSpinWkCount = parseInt(localStorage.getItem('nabdah_spin_wk_count') || '0', 10);
            const finalSpinWkCount = Math.max(dbSpinWkCount, isNaN(localSpinWkCount) ? 0 : localSpinWkCount);

            localStorage.setItem('nabdah_total_workouts', String(finalWorkouts));
            localStorage.setItem('nabdah_iron_heart_claimed', String(finalIHClaimed));
            localStorage.setItem('nabdah_super_arteries_claimed', String(finalSAClaimed));
            localStorage.setItem('nabdah_oxygen_tank_claimed', String(finalOTClaimed));
            localStorage.setItem('nabdah_last_spin_date', finalSpinDate);
            localStorage.setItem('nabdah_spin_wk_count', String(finalSpinWkCount));

            // Set React level state
            setMaxUnlockedLevel(finalMax);
            setMaxUnlockedLifestyleLevel(finalMaxLifestyle);
            setCompletedLifestyleLevels(finalCompletedLifestyle);

            setGymPoints(finalGymPoints);
            setSprintLevel(finalSprintLvl);
            setCyclingLevel(finalCyclingLvl);
            setSwimmingLevel(finalSwimmingLvl);
            setStrengthLevel(finalStrengthLvl);

            setTotalWorkouts(finalWorkouts);
            setIronHeartClaimed(finalIHClaimed);
            setSuperArteriesClaimed(finalSAClaimed);
            setOxygenTankClaimed(finalOTClaimed);
            setLastSpinDate(finalSpinDate);
            setSpinCompletedWorkouts(finalSpinWkCount);

            // Update database if local has different or newer progress
            if (
              finalMax > dbMax || 
              finalCompleted.length > dbCompleted.length ||
              finalMaxLifestyle > dbMaxLifestyle ||
              finalCompletedLifestyle.length > dbCompletedLifestyle.length ||
              finalGymPoints > dbGymPoints ||
              finalSprintLvl > dbSprintLevel ||
              finalCyclingLvl > dbCyclingLevel ||
              finalSwimmingLvl > dbSwimmingLevel ||
              finalStrengthLvl > dbStrengthLevel
            ) {
              await updateDoc(userRef, {
                maxUnlockedLevel: finalMax,
                completedLevels: finalCompleted,
                maxUnlockedLifestyleLevel: finalMaxLifestyle,
                completedLifestyleLevels: finalCompletedLifestyle,
                gymPoints: finalGymPoints,
                sprintLevel: finalSprintLvl,
                cyclingLevel: finalCyclingLvl,
                swimmingLevel: finalSwimmingLvl,
                strengthLevel: finalStrengthLvl,
                totalWorkouts: finalWorkouts,
                ironHeartClaimed: finalIHClaimed,
                superArteriesClaimed: finalSAClaimed,
                oxygenTankClaimed: finalOTClaimed,
                lastSpinDate: finalSpinDate,
                spinCompletedWorkouts: finalSpinWkCount,
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
    if (gameState !== 'PLAYING' || isDefibrillatorActive) {
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
        rotateHeartTip();
        isPlayingRef.current = false;
        audioSynthRef.current.stopAmbientSoundtrack();
        audioSynthRef.current.playPerfectSound();
        
        // Save level status
        const nextLvl = currentLevel + 1;
        let updatedMaxLvl = maxUnlockedLevel;
        if (nextLvl <= 100 && nextLvl > maxUnlockedLevel) {
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

      if (gameMode === 'LIFESTYLE' && currentLevel > 0 && !levelCompleted && scoreRef.current >= getLifestyleStageConfig(currentLevel).targetScore) {
        setLevelCompleted(true);
        setGameState('LEVEL_COMPLETE');
        rotateHeartTip();
        isPlayingRef.current = false;
        audioSynthRef.current.stopAmbientSoundtrack();
        audioSynthRef.current.playPerfectSound();
        
        // Save level status
        const nextLvl = currentLevel + 1;
        let updatedMaxLvl = maxUnlockedLifestyleLevel;
        if (nextLvl <= 100 && nextLvl > maxUnlockedLifestyleLevel) {
          updatedMaxLvl = nextLvl;
          setMaxUnlockedLifestyleLevel(nextLvl);
          localStorage.setItem('nabdah_max_unlocked_lifestyle_level_v1', String(nextLvl));
        }
        
        // Add level to completed list
        let completedList: number[] = [];
        try {
          completedList = JSON.parse(localStorage.getItem('nabdah_completed_lifestyle_levels_v1') || '[]');
          if (!completedList.includes(currentLevel)) {
            completedList.push(currentLevel);
            localStorage.setItem('nabdah_completed_lifestyle_levels_v1', JSON.stringify(completedList));
          }
        } catch (e) {
          console.error(e);
        }

        setCompletedLifestyleLevels(completedList);

        // Deploy/save level progress immediately to Firestore if authenticated
        if (currentUser) {
          const userRef = doc(db, 'users', currentUser.uid);
          try {
            updateDoc(userRef, {
              maxUnlockedLifestyleLevel: updatedMaxLvl,
              completedLifestyleLevels: completedList,
              updatedAt: serverTimestamp()
            });
          } catch (e) {
            console.error("Failed to sync lifestyle progress to cloud database on level complete: ", e);
          }
        }
        return;
      }

      // 1. Spawner logic for Player 1 & Player 2
      const currentScore1 = scoreRef.current;
      let adaptiveSpawnInterval1 = Math.max(655, 2200 - (currentScore1 * 0.12));
      if (gameMode === 'LEVELS') {
        adaptiveSpawnInterval1 = getStageConfig(currentLevel).baseSpawnInterval;
      } else if (gameMode === 'LIFESTYLE' && currentLevel > 0) {
        adaptiveSpawnInterval1 = getLifestyleStageConfig(currentLevel).baseSpawnInterval;
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
        } else if (gameMode === 'LIFESTYLE' && currentLevel > 0) {
          adaptiveSpawnInterval2 = getLifestyleStageConfig(currentLevel).baseSpawnInterval;
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
      } else if (gameMode === 'LIFESTYLE' && currentLevel > 0) {
        targetBPM = Math.min(150, 72 + Math.floor(currentLevel * 0.72));
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
  }, [gameState, isDefibrillatorActive]);

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
      
      if (gameMode === 'LIFESTYLE') {
        const lvl = currentLevel > 0 ? currentLevel : (currentScore < 500 ? 15 : currentScore < 1500 ? 45 : currentScore < 3000 ? 75 : 95);
        
        if (lvl >= 91) {
          // Phase 4: Ultimate Chaos (91-100)
          if (roll < 0.08) {
            type = NodeType.LIFESTYLE_DOUBLE_BURGER;
            color = '#ea580c';
            initialHealth = 2;
            speed = 1.35;
            radius = 18;
          } else if (roll >= 0.08 && roll < 0.16) {
            type = NodeType.LIFESTYLE_DOUBLE_SALT;
            color = '#94a3b8';
            initialHealth = 2;
            speed = 1.45;
            radius = 16;
          } else if (roll >= 0.16 && roll < 0.23) {
            type = NodeType.LIFESTYLE_SEDENTARY;
            color = '#9333ea';
            initialHealth = 3;
            speed = 0.95;
            radius = 19;
          } else if (roll >= 0.23 && roll < 0.30) {
            type = NodeType.LIFESTYLE_LATE_NIGHT;
            color = '#6366f1';
            initialHealth = 1;
            speed = 1.75;
            radius = 14;
          } else if (roll >= 0.30 && roll < 0.38) {
            type = NodeType.LIFESTYLE_CIGARETTE;
            color = '#dc2626';
            initialHealth = 1;
            speed = 1.8;
            radius = 13;
          } else if (roll >= 0.38 && roll < 0.45) {
            type = NodeType.LIFESTYLE_STRESS;
            color = '#c084fc';
            initialHealth = 1;
            speed = 1.4;
            radius = 16;
          } else if (roll >= 0.45 && roll < 0.52) {
            type = NodeType.LIFESTYLE_SHISHA;
            color = '#a855f7';
            initialHealth = 2;
            speed = 1.6;
            radius = 15;
          } else if (roll >= 0.52 && roll < 0.59) {
            type = NodeType.LIFESTYLE_ENERGY_DRINK;
            color = '#f43f5e';
            initialHealth = 1;
            speed = 1.7;
            radius = 13;
          } else if (roll >= 0.59 && roll < 0.66) {
            type = NodeType.LIFESTYLE_SODA;
            color = '#b45309';
            initialHealth = 1;
            speed = 1.5;
            radius = 14;
          } else if (roll >= 0.66 && roll < 0.73) {
            type = NodeType.LIFESTYLE_SLEEP;
            color = '#10b981';
            initialHealth = 1;
            speed = 1.1;
            radius = 15;
          } else if (roll >= 0.73 && roll < 0.80) {
            type = NodeType.LIFESTYLE_EXERCISE;
            color = '#06b6d4';
            initialHealth = 1;
            speed = 1.2;
            radius = 15;
          } else if (roll >= 0.80 && roll < 0.87) {
            type = NodeType.LIFESTYLE_BROCCOLI;
            color = '#15803d';
            initialHealth = 1;
            speed = 1.15;
            radius = 14;
          } else if (roll >= 0.87 && roll < 0.93) {
            type = NodeType.LIFESTYLE_GREEN_TEA;
            color = '#84cc16';
            initialHealth = 1;
            speed = 1.2;
            radius = 13;
          } else if (roll >= 0.93 && roll < 0.97) {
            type = NodeType.LIFESTYLE_APPLE;
            color = '#22c55e';
            initialHealth = 1;
            speed = 1.2;
            radius = 14;
          } else {
            type = NodeType.LIFESTYLE_WATER;
            color = '#3b82f6';
            initialHealth = 1;
            speed = 1.3;
            radius = 11;
          }
        } else if (lvl >= 61) {
          // Phase 3: Stress & Smoking Zone (61-90)
          if (roll < 0.10) {
            type = NodeType.LIFESTYLE_SEDENTARY;
            color = '#a855f7';
            initialHealth = 3;
            speed = 0.85;
            radius = 18;
          } else if (roll >= 0.10 && roll < 0.20) {
            type = NodeType.LIFESTYLE_CIGARETTE;
            color = '#dc2626';
            initialHealth = 1;
            speed = 1.6;
            radius = 13;
          } else if (roll >= 0.20 && roll < 0.30) {
            type = NodeType.LIFESTYLE_SHISHA;
            color = '#9333ea';
            initialHealth = 1;
            speed = 1.7;
            radius = 14;
          } else if (roll >= 0.30 && roll < 0.40) {
            type = NodeType.LIFESTYLE_STRESS;
            color = '#c084fc';
            initialHealth = 1;
            speed = 1.35;
            radius = 16;
          } else if (roll >= 0.40 && roll < 0.50) {
            type = NodeType.LIFESTYLE_DOUBLE_SALT;
            color = '#94a3b8';
            initialHealth = 2;
            speed = 1.25;
            radius = 15;
          } else if (roll >= 0.50 && roll < 0.58) {
            type = NodeType.LIFESTYLE_LATE_NIGHT;
            color = '#4f46e5';
            initialHealth = 1;
            speed = 1.6;
            radius = 13;
          } else if (roll >= 0.58 && roll < 0.66) {
            type = NodeType.LIFESTYLE_EXERCISE;
            color = '#06b6d4';
            initialHealth = 1;
            speed = 1.1;
            radius = 14;
          } else if (roll >= 0.66 && roll < 0.74) {
            type = NodeType.LIFESTYLE_SLEEP;
            color = '#10b981';
            initialHealth = 1;
            speed = 1.0;
            radius = 14;
          } else if (roll >= 0.74 && roll < 0.82) {
            type = NodeType.LIFESTYLE_BROCCOLI;
            color = '#15803d';
            initialHealth = 1;
            speed = 1.05;
            radius = 14;
          } else if (roll >= 0.82 && roll < 0.89) {
            type = NodeType.LIFESTYLE_GREEN_TEA;
            color = '#84cc16';
            initialHealth = 1;
            speed = 1.1;
            radius = 13;
          } else if (roll >= 0.89 && roll < 0.94) {
            type = NodeType.LIFESTYLE_APPLE;
            color = '#22c55e';
            initialHealth = 1;
            speed = 1.05;
            radius = 14;
          } else {
            type = NodeType.LIFESTYLE_WATER;
            color = '#3b82f6';
            initialHealth = 1;
            speed = 1.15;
            radius = 11;
          }
        } else if (lvl >= 31) {
          // Phase 2: Food & Health Challenges (31-60)
          if (roll < 0.12) {
            type = NodeType.LIFESTYLE_DOUBLE_BURGER;
            color = '#ea580c';
            initialHealth = 2;
            speed = 1.15;
            radius = 17;
          } else if (roll >= 0.12 && roll < 0.22) {
            type = NodeType.LIFESTYLE_LATE_NIGHT;
            color = '#4f46e5';
            initialHealth = 1;
            speed = 1.5;
            radius = 12;
          } else if (roll >= 0.22 && roll < 0.32) {
            type = NodeType.LIFESTYLE_BURGER;
            color = '#f59e0b';
            initialHealth = 1;
            speed = 1.25;
            radius = 15;
          } else if (roll >= 0.32 && roll < 0.42) {
            type = NodeType.LIFESTYLE_SALT;
            color = '#cbd5e1';
            initialHealth = 1;
            speed = 1.35;
            radius = 13;
          } else if (roll >= 0.42 && roll < 0.50) {
            type = NodeType.LIFESTYLE_ENERGY_DRINK;
            color = '#ef4444';
            initialHealth = 1;
            speed = 1.5;
            radius = 14;
          } else if (roll >= 0.50 && roll < 0.58) {
            type = NodeType.LIFESTYLE_SODA;
            color = '#b45309';
            initialHealth = 1;
            speed = 1.4;
            radius = 14;
          } else if (roll >= 0.58 && roll < 0.67) {
            type = NodeType.LIFESTYLE_SLEEP;
            color = '#10b981';
            initialHealth = 1;
            speed = 1.0;
            radius = 14;
          } else if (roll >= 0.67 && roll < 0.76) {
            type = NodeType.LIFESTYLE_GREEN_TEA;
            color = '#84cc16';
            initialHealth = 1;
            speed = 1.1;
            radius = 13;
          } else if (roll >= 0.76 && roll < 0.84) {
            type = NodeType.LIFESTYLE_APPLE;
            color = '#22c55e';
            initialHealth = 1;
            speed = 1.0;
            radius = 14;
          } else if (roll >= 0.84 && roll < 0.92) {
            type = NodeType.LIFESTYLE_WATER;
            color = '#3b82f6';
            initialHealth = 1;
            speed = 1.1;
            radius = 11;
          } else {
            type = NodeType.LIFESTYLE_STRESS;
            color = '#a855f7';
            initialHealth = 1;
            speed = 1.25;
            radius = 15;
          }
        } else {
          // Phase 1: Basic Habits (1-30)
          if (roll < 0.20) {
            type = NodeType.LIFESTYLE_BURGER;
            color = '#f59e0b';
            initialHealth = 1;
            speed = 1.05;
            radius = 14;
          } else if (roll >= 0.20 && roll < 0.35) {
            type = NodeType.LIFESTYLE_SALT;
            color = '#cbd5e1';
            initialHealth = 1;
            speed = 1.2;
            radius = 12;
          } else if (roll >= 0.35 && roll < 0.45) {
            type = NodeType.LIFESTYLE_SODA;
            color = '#b45309';
            initialHealth = 1;
            speed = 1.25;
            radius = 13;
          } else if (roll >= 0.45 && roll < 0.60) {
            type = NodeType.LIFESTYLE_BROCCOLI;
            color = '#15803d';
            initialHealth = 1;
            speed = 1.0;
            radius = 13;
          } else if (roll >= 0.60 && roll < 0.75) {
            type = NodeType.LIFESTYLE_APPLE;
            color = '#22c55e';
            initialHealth = 1;
            speed = 0.9;
            radius = 13;
          } else {
            type = NodeType.LIFESTYLE_WATER;
            color = '#3b82f6';
            initialHealth = 1;
            speed = 1.1;
            radius = 11;
          }
        }

        // Apply progressive level speed scaling
        const gameLvlSpeedFactor = 1 + (lvl * 0.0075);
        speed *= gameLvlSpeedFactor;
      } else if (gameMode === 'LEVELS') {
        const stage = currentLevel;
        if (stage === 100) {
          // Ultimate Coronary Embolus Grand Boss (Level 100!)
          if (roll < 0.15) {
            type = NodeType.CORONARY_EMBOLUS_BOSS;
            color = '#e11d48'; // Bright crimson-rose
            initialHealth = 30; // 30 epic hits!
            speed = 0.25;
            radius = 35;
          } else if (roll >= 0.15 && roll < 0.35) {
            type = NodeType.ARTERIAL_CLOT;
            color = '#dc2626';
            initialHealth = 3;
            speed = 1.1;
            radius = 16;
          } else if (roll >= 0.35 && roll < 0.55) {
            type = NodeType.VEIN_THROMBUS;
            color = '#2563eb';
            initialHealth = 2;
            speed = 1.8;
            radius = 13;
          } else if (roll >= 0.55 && roll < 0.75) {
            type = NodeType.ATHEROMA_PLAQUE;
            color = '#facc15';
            initialHealth = 4;
            speed = 0.7;
            radius = 18;
          } else if (roll >= 0.75 && roll < 0.88) {
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
        } else if (stage >= 91) {
          // Campaign Levels 91-99
          if (roll < 0.10) {
            // Mini boss
            type = NodeType.CORONARY_EMBOLUS_BOSS;
            color = '#f43f5e';
            initialHealth = 12; // Mini-boss version (12 hits)
            speed = 0.35;
            radius = 28;
          } else if (roll >= 0.10 && roll < 0.32) {
            type = NodeType.ATHEROMA_PLAQUE;
            color = '#facc15';
            initialHealth = 4;
            speed = 0.65;
            radius = 18;
          } else if (roll >= 0.32 && roll < 0.55) {
            type = NodeType.VEIN_THROMBUS;
            color = '#2563eb';
            initialHealth = 2;
            speed = 1.75;
            radius = 13;
          } else if (roll >= 0.55 && roll < 0.78) {
            type = NodeType.ARTERIAL_CLOT;
            color = '#dc2626';
            initialHealth = 3;
            speed = 1.05;
            radius = 16;
          } else if (roll >= 0.78 && roll < 0.88) {
            type = NodeType.ADRENALINE;
            color = '#10b981';
            speed = 1.1;
            radius = 11;
            initialHealth = 1;
          } else {
            type = NodeType.PACEMAKER;
            color = '#38bdf8';
            speed = 1.05;
            radius = 12;
            initialHealth = 1;
          }
        } else if (stage === 90) {
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

  // Defibrillator Resuscitation Minigame loops (Timer and Slider animation)
  useEffect(() => {
    if (!isDefibrillatorActive) return;

    // 1. Countdown ticking timer (10 seconds to flatline)
    const countdown = setInterval(() => {
      setDefibrillatorTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdown);
          // Fail Resuscitation!
          setIsDefibrillatorActive(false);
          audioSynthRef.current.stopFlatline();
          handleGameOver(false);
          return 0;
        }
        // Play critical alarm beep on each countdown tick
        audioSynthRef.current.playAlarmBeep();
        return prev - 1;
      });
    }, 1000);

    // 2. High-speed slider loop for precision target
    let activeFrame: number;
    let currentSlider = 0;
    let currentDir: 'RIGHT' | 'LEFT' = 'RIGHT';

    const animateSlider = () => {
      if (currentDir === 'RIGHT') {
        currentSlider += 3.5; // sliding speed
        if (currentSlider >= 100) {
          currentSlider = 100;
          currentDir = 'LEFT';
        }
      } else {
        currentSlider -= 3.5;
        if (currentSlider <= 0) {
          currentSlider = 0;
          currentDir = 'RIGHT';
        }
      }
      setDefibrillatorSlider(currentSlider);
      activeFrame = requestAnimationFrame(animateSlider);
    };

    activeFrame = requestAnimationFrame(animateSlider);

    return () => {
      clearInterval(countdown);
      cancelAnimationFrame(activeFrame);
    };
  }, [isDefibrillatorActive]);

  // Charge function called when player taps/clicks "Charge"
  const handleDefibrillatorChargeClick = () => {
    if (!isDefibrillatorActive) return;
    setDefibrillatorCharge((prev) => {
      const nextCharge = Math.min(100, prev + 12); // needs ~8 rapidly sequenced taps
      audioSynthRef.current.playDefibrillatorChargeSound(nextCharge);
      return nextCharge;
    });
  };

  // Shock trigger function called when player taps "SHOCK"
  const handleDefibrillatorShockClick = () => {
    if (!isDefibrillatorActive) return;
    if (defibrillatorCharge < 100) return; // Must be fully charged

    // Precision window target is between 40% and 60% on the slider bar
    const hitPosition = defibrillatorSlider;
    const isSuccess = hitPosition >= 40 && hitPosition <= 60;

    if (isSuccess) {
      // resus succeeded!
      audioSynthRef.current.playDefibrillatorShockSound();
      audioSynthRef.current.stopFlatline();
      
      // Resuscitate player's heart
      setHeartHealth(40);
      setDefibrillatorUsed(true);
      setIsDefibrillatorActive(false);
      
      // Add a nice floating resus success text and visual halo
      spawnFloatingText(1, '❤️ تم الإنعاش بنجاح! +40%', 190, 150, '#10b981', true);
      createExplosionDebris(1, 190, 190, '#10b981', 30);
      
      // Resume core game animation loop safely after resus!
      isPlayingRef.current = true;
      lastSpawnTimeRef.current = Date.now();
    } else {
      // Fail! Shock missed the golden EKG sync point!
      audioSynthRef.current.playDefibrillatorFailSound();
      
      // Reset charge back so they have to recharge and adjust timing once more!
      setDefibrillatorCharge(35);
      
      // Flash a screen red effect
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 240);
      
      spawnFloatingText(1, '❌ فشلت الصدمة: خارج النبض!', 190, 150, '#ef4444', true);
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

      // Tap decrease health with active Gym Strength booster
      const tapDamage = strengthActive ? (1 + strengthLevel) : 1;
      const nextHealth = nodeToHit.health - tapDamage;

      // Create spark debris burst on impact (Giant boss generates an epic burst of 45 particles)
      createExplosionDebris(playerNum, tapX, tapY, nodeToHit.color, nextHealth <= 0 ? (nodeToHit.type === NodeType.GIANT_BOSS ? 45 : 15) : 6);

      // Play audio cue
      const isHealthyNode = 
        nodeToHit.type === NodeType.LIFESTYLE_APPLE || 
        nodeToHit.type === NodeType.LIFESTYLE_WATER ||
        nodeToHit.type === NodeType.LIFESTYLE_SLEEP ||
        nodeToHit.type === NodeType.LIFESTYLE_EXERCISE ||
        nodeToHit.type === NodeType.LIFESTYLE_BROCCOLI ||
        nodeToHit.type === NodeType.LIFESTYLE_GREEN_TEA;

      if (gameMode === 'LIFESTYLE') {
        if (isHealthyNode) {
          audioSynthRef.current.playHitSound();
          if (playerNum === 1) {
            setScore((prev) => Math.max(0, prev - 5));
            setCombo(0);
            setAccuracy(prev => ({ ...prev, total: prev.total + 1 }));
            spawnFloatingText(1, '❌ عنصر صحي! -5', tapX, tapY, '#f43f5e', false);
          } else {
            setScore2((prev) => Math.max(0, prev - 5));
            setCombo2(0);
            setAccuracy2(prev => ({ ...prev, total: prev.total + 1 }));
            spawnFloatingText(2, '❌ عنصر صحي! -5', tapX, tapY, '#f43f5e', false);
          }
        } else {
          if (isPerfect) {
            audioSynthRef.current.playPerfectSound();
            if (playerNum === 1) {
              setScore((prev) => prev + 20);
              setCombo((prev) => {
                const newCombo = prev + 1;
                if (newCombo > maxCombo) setMaxCombo(newCombo);
                return newCombo;
              });
              setAccuracy(prev => ({ total: prev.total + 1, perfect: prev.perfect + 1 }));
              spawnFloatingText(1, '⭐ مثالي! +20', tapX, tapY, '#10b981', true);
            } else {
              setScore2((prev) => prev + 20);
              setCombo2((prev) => {
                const newCombo = prev + 1;
                if (newCombo > maxCombo2) setMaxCombo2(newCombo);
                return newCombo;
              });
              setAccuracy2(prev => ({ total: prev.total + 1, perfect: prev.perfect + 1 }));
              spawnFloatingText(2, '⭐ مثالي! +20', tapX, tapY, '#10b981', true);
            }
          } else {
            audioSynthRef.current.playHitSound();
            if (playerNum === 1) {
              setScore((prev) => prev + 10);
              setCombo((prev) => {
                const newCombo = prev + 1;
                if (newCombo > maxCombo) setMaxCombo(newCombo);
                return newCombo;
              });
              setAccuracy(prev => ({ ...prev, total: prev.total + 1 }));
              spawnFloatingText(1, '⚡ ممتاز! +10', tapX, tapY, '#22d3ee', false);
            } else {
              setScore2((prev) => prev + 10);
              setCombo2((prev) => {
                const newCombo = prev + 1;
                if (newCombo > maxCombo2) setMaxCombo2(newCombo);
                return newCombo;
              });
              setAccuracy2(prev => ({ ...prev, total: prev.total + 1 }));
              spawnFloatingText(2, '⚡ ممتاز! +10', tapX, tapY, '#22d3ee', false);
            }
          }
        }
      } else {
        if (isPerfect) {
          audioSynthRef.current.playPerfectSound();
          if (playerNum === 1) {
            const isP1Fever = combo >= 15;
            const scoreAdd = isP1Fever ? 300 : 200;
            setScore((prev) => prev + scoreAdd);
            setCombo((prev) => {
              const newCombo = prev + 1;
              if (newCombo > maxCombo) setMaxCombo(newCombo);
              return newCombo;
            });
            setAccuracy(prev => ({ total: prev.total + 1, perfect: prev.perfect + 1 }));
            spawnFloatingText(1, isP1Fever ? '🔥 نبضة حمى ذهبية! +300' : '🚨 نبضة مثالية! +200', tapX, tapY, isP1Fever ? '#facc15' : '#10b981', true);
          } else {
            const isP2Fever = combo2 >= 15;
            const scoreAdd = isP2Fever ? 300 : 200;
            setScore2((prev) => prev + scoreAdd);
            setCombo2((prev) => {
              const newCombo = prev + 1;
              if (newCombo > maxCombo2) setMaxCombo2(newCombo);
              return newCombo;
            });
            setAccuracy2(prev => ({ total: prev.total + 1, perfect: prev.perfect + 1 }));
            spawnFloatingText(2, isP2Fever ? '🔥 نبضة حمى ذهبية! + 300' : '🚨 نبضة مثالية! +200', tapX, tapY, isP2Fever ? '#facc15' : '#10b981', true);
          }
        } else {
          audioSynthRef.current.playHitSound();
          if (playerNum === 1) {
            const isP1Fever = combo >= 15;
            const scoreAdd = isP1Fever ? 150 : 100;
            setScore((prev) => prev + scoreAdd);
            setCombo((prev) => {
              const newCombo = prev + 1;
              if (newCombo > maxCombo) setMaxCombo(newCombo);
              return newCombo;
            });
            setAccuracy(prev => ({ ...prev, total: prev.total + 1 }));
            spawnFloatingText(1, isP1Fever ? '⚡ نقرة فورة! +150' : '+100 نقرة', tapX, tapY, isP1Fever ? '#eab308' : '#22d3ee', false);
          } else {
            const isP2Fever = combo2 >= 15;
            const scoreAdd = isP2Fever ? 150 : 100;
            setScore2((prev) => prev + scoreAdd);
            setCombo2((prev) => {
              const newCombo = prev + 1;
              if (newCombo > maxCombo2) setMaxCombo2(newCombo);
              return newCombo;
            });
            setAccuracy2(prev => ({ ...prev, total: prev.total + 1 }));
            spawnFloatingText(2, isP2Fever ? '⚡ نقرة فورة! +150' : '+100 نقرة', tapX, tapY, isP2Fever ? '#eab308' : '#22d3ee', false);
          }
        }
      }

      if (nextHealth <= 0) {
        // Trigger Specialty effects
        if (nodeToHit.type === NodeType.ADRENALINE) {
          let healPct = 15;
          if (swimmingActive) {
            healPct = Math.round(15 * (1 + swimmingLevel * 0.25));
          }
          if (playerNum === 1) {
            setHeartHealth((h) => Math.min(100, h + healPct));
            spawnFloatingText(1, `❤️ جرعة أدرينالين! +${healPct}%`, tapX, tapY, '#10b981', true);
          } else {
            setHeartHealth2((h) => Math.min(100, h + healPct));
            spawnFloatingText(2, `❤️ جرعة أدرينالين! +${healPct}%`, tapX, tapY, '#10b981', true);
          }
        } else if (nodeToHit.type === NodeType.PACEMAKER) {
          let slowSeconds = 5;
          if (cyclingActive) {
            slowSeconds = Math.round(5 * (1 + cyclingLevel * 0.3));
          }
          if (playerNum === 1) {
            setStabilizationTimeLeft(slowSeconds);
            spawnFloatingText(1, `🛡️ تشغيل منظم النبض! (تباطؤ ${slowSeconds}ث)`, tapX, tapY, '#38bdf8', true);
          } else {
            setStabilizationTimeLeft2(slowSeconds);
            spawnFloatingText(2, `🛡️ تشغيل منظم النبض! (تباطؤ ${slowSeconds}ث)`, tapX, tapY, '#38bdf8', true);
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
      let isBenefit = false;
      let ptAdd = 0;

      if (gameMode === 'LIFESTYLE') {
        if (missedNode.type === NodeType.LIFESTYLE_BURGER) {
          dmg = 20; // 1 life
          label = '🍔 برجر دهني!';
        } else if (missedNode.type === NodeType.LIFESTYLE_SALT) {
          dmg = 20; // 1 life
          label = '🧂 صوديوم زائد!';
        } else if (missedNode.type === NodeType.LIFESTYLE_CIGARETTE) {
          dmg = 40; // 2 lives
          label = '🚬 دخان خطر!';
        } else if (missedNode.type === NodeType.LIFESTYLE_STRESS) {
          dmg = 20; // 1 life
          label = '😰 توتر ونشاط مفرط!';
          if (playerNum === 1) {
            setScreenBlur(true);
            setTimeout(() => setScreenBlur(false), 3000);
          }
        } else if (missedNode.type === NodeType.LIFESTYLE_DOUBLE_BURGER) {
          dmg = 35;
          label = '🍔🍔 وجبة مضاعفة ضارة!';
        } else if (missedNode.type === NodeType.LIFESTYLE_DOUBLE_SALT) {
          dmg = 35;
          label = '🧂🧂 أملاح الصوديوم المضاعفة!';
        } else if (missedNode.type === NodeType.LIFESTYLE_LATE_NIGHT) {
          dmg = 20;
          label = '🌙 السهر وخسارة الراحة!';
        } else if (missedNode.type === NodeType.LIFESTYLE_SEDENTARY) {
          dmg = 25;
          label = '📺 خمول وجلوس طويل خافض للنبض!';
        } else if (missedNode.type === NodeType.LIFESTYLE_ENERGY_DRINK) {
          dmg = 35;
          label = '🥤 مشروب طاقة مجهد لضربات القلب!';
        } else if (missedNode.type === NodeType.LIFESTYLE_SODA) {
          dmg = 25;
          label = '🍹 مشروب غازي يزيد العبء والسكريات!';
        } else if (missedNode.type === NodeType.LIFESTYLE_SHISHA) {
          dmg = 45;
          label = '💨 دخان شيشة يمنع أكسجين الشرايين!';
        } else if (missedNode.type === NodeType.LIFESTYLE_APPLE) {
          dmg = -20; // Heals 1 life!
          isBenefit = true;
          ptAdd = 15;
          label = '🍎 تفاحة كاملة الفائدة!';
        } else if (missedNode.type === NodeType.LIFESTYLE_WATER) {
          dmg = 0; // Pure rhythm boost
          isBenefit = true;
          ptAdd = 20;
          label = '💧 إرتواء بالماء!';
        } else if (missedNode.type === NodeType.LIFESTYLE_BROCCOLI) {
          dmg = -22;
          isBenefit = true;
          ptAdd = 22;
          label = '🥦 بروكلي يمنع تراكم الترسبات بالشرايين!';
        } else if (missedNode.type === NodeType.LIFESTYLE_GREEN_TEA) {
          dmg = -25;
          isBenefit = true;
          ptAdd = 25;
          label = '🍵 شاي أخضر ينعش مضادات الأكسدة!';
        } else if (missedNode.type === NodeType.LIFESTYLE_SLEEP) {
          dmg = -30; // Heals 1.5 lives!
          isBenefit = true;
          ptAdd = 25;
          label = '😴 نوم عميق ومريح للقلب!';
        } else if (missedNode.type === NodeType.LIFESTYLE_EXERCISE) {
          dmg = -30; // Heals!
          isBenefit = true;
          ptAdd = 30;
          label = '🏃‍♂️ نشاط رياضي وصحة قلب!';
        }
      } else {
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
      }

      if (playerNum === 1) {
        if (gameMode === 'LIFESTYLE' && isBenefit) {
          audioSynthRef.current.playPerfectSound();
          createExplosionDebris(1, 190, 190, missedNode.color || '#22c55e', 15);
          setScore((prev) => prev + ptAdd);
          spawnFloatingText(1, `${label} +${ptAdd}`, 190, 150, missedNode.color || '#22c55e', true);
          
          let healAmount = dmg; // dmg is negative (e.g., -15 or -20 for water/apple)
          if (swimmingActive) {
            const multiplier = 1 + (swimmingLevel * 0.25);
            healAmount = Math.round(dmg * multiplier);
          }
          setHeartHealth((h) => Math.min(100, h - healAmount)); // heals
        } else {
          // Apply Screen Shake visual effect
          setScreenShake(true);
          setTimeout(() => setScreenShake(false), 240);

          // Trigger warning audio synth damage hit
          audioSynthRef.current.playDamageSound();

          // Break chain combo
          setCombo(0);

          // Spark debris
          createExplosionDebris(1, 190, 190, '#ef4444', 18);

          // Apply Gym Cardio Sprint / Heart Shield damage reduction modifier
          let finalDmg = dmg;
          if (cardioSprintActive) {
            const multiplier = Math.max(0.4, 1 - (sprintLevel * 0.12));
            finalDmg = Math.round(dmg * multiplier);
          }

          // Renders Floating damage notification
          spawnFloatingText(1, `${label} -${finalDmg}%`, 190, 150, '#ef4444', true);

          // Apply health penalty
          setHeartHealth((h) => {
            const nextH = Math.max(0, h - finalDmg);
            if (nextH <= 0) {
              if (!isSplitScreenRef.current && !isOnlineCoop && !defibrillatorUsed && (gameMode === 'LEVELS' || gameMode === 'ENDLESS')) {
                isPlayingRef.current = false;
                setIsDefibrillatorActive(true);
                setDefibrillatorCharge(0);
                setDefibrillatorTimeLeft(10);
                audioSynthRef.current.startFlatline();
              } else {
                handleGameOver();
              }
            }
            return nextH;
          });
        }
      } else {
        if (gameMode === 'LIFESTYLE' && isBenefit) {
          audioSynthRef.current.playPerfectSound();
          createExplosionDebris(2, 190, 190, missedNode.color || '#22c55e', 15);
          setScore2((prev) => prev + ptAdd);
          spawnFloatingText(2, `${label} +${ptAdd}`, 190, 150, missedNode.color || '#22c55e', true);
          
          let healAmount = dmg;
          if (swimmingActive) {
            const multiplier = 1 + (swimmingLevel * 0.25);
            healAmount = Math.round(dmg * multiplier);
          }
          setHeartHealth2((h) => Math.min(100, h - healAmount));
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

          // Apply Gym Cardio Sprint damage modifier for P2
          let finalDmg = dmg;
          if (cardioSprintActive) {
            const multiplier = Math.max(0.4, 1 - (sprintLevel * 0.12));
            finalDmg = Math.round(dmg * multiplier);
          }

          // Renders Floating damage notification
          spawnFloatingText(2, `${label} -${finalDmg}%`, 190, 150, '#ef4444', true);

          // Apply health penalty
          setHeartHealth2((h) => {
            const nextH = Math.max(0, h - finalDmg);
            if (nextH <= 0) {
              handleGameOver();
            }
            return nextH;
          });
        }
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
    rotateHeartTip();
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
  const startGame = async (selectedMode: 'ENDLESS' | 'TIMED' | 'LEVELS' | 'LIFESTYLE' = 'ENDLESS', specificLevel?: number) => {
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

    if (selectedMode === 'LIFESTYLE') {
      setCurrentCampaign('LIFESTYLE');
      if (specificLevel !== undefined) {
        setCurrentLevel(specificLevel);
      } else {
        setCurrentLevel(0); // endless lifestyle
      }
    } else {
      setCurrentCampaign('MEDICAL');
      if (selectedMode === 'LEVELS' && specificLevel !== undefined) {
        setCurrentLevel(specificLevel);
      } else {
        setCurrentLevel(1);
      }
    }

    // Reset Stats
    setHeartHealth(100);
    setScore(0);
    setDefibrillatorUsed(false);
    setIsDefibrillatorActive(false);
    setDefibrillatorCharge(0);
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

        {/* CARDIO FITNESS GYM PORTAL MODAL */}
        {isGymOpen && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-slate-950/95 border border-red-500/30 rounded-3xl w-full max-w-lg p-5 flex flex-col gap-4 text-right animate-fade-in font-sans shadow-[0_0_40px_rgba(239,68,68,0.15)] max-h-[90vh] overflow-y-auto">
              
              {/* Header */}
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <button
                  type="button"
                  onClick={() => {
                    audioSynthRef.current.playPerfectSound();
                    setIsGymOpen(false);
                    setGymPracticeType('NONE');
                  }}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-red-500 animate-pulse" />
                  <h3 className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-amber-500 font-display">صالة نَبْضَة للياقة والتدريبات الرياضية 🏋️‍♂️</h3>
                </div>
              </div>

              {gymPracticeType === 'NONE' ? (
                <>
                  {/* Gym Sub-Tabs Navigation */}
                  <div className="flex border-b border-white/10 p-0.5 gap-1 bg-white/5 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        audioSynthRef.current.playPerfectSound();
                        setGymTab('WHEEL');
                      }}
                      className={`flex-1 py-1.5 text-[10.5px] font-black rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                        gymTab === 'WHEEL'
                          ? 'bg-gradient-to-r from-red-650 to-amber-600 text-white shadow'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>عجلة الحماس 🎡</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        audioSynthRef.current.playPerfectSound();
                        setGymTab('PLANS');
                      }}
                      className={`flex-1 py-1.5 text-[10.5px] font-black rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                        gymTab === 'PLANS'
                          ? 'bg-gradient-to-r from-red-650 to-amber-600 text-white shadow'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      <span>خطط وتحديات التحفيز 🎯</span>
                      {(!ironHeartClaimed && totalWorkouts >= 5) || 
                       (!superArteriesClaimed && sprintLevel >= 3 && cyclingLevel >= 3) || 
                       (!oxygenTankClaimed && swimmingLevel >= 4 && strengthLevel >= 4) ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                      ) : null}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        audioSynthRef.current.playPerfectSound();
                        setGymTab('EXERCISES');
                      }}
                      className={`flex-1 py-1.5 text-[10.5px] font-black rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                        gymTab === 'EXERCISES'
                          ? 'bg-gradient-to-r from-red-650 to-amber-600 text-white shadow'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Dumbbell className="w-3.5 h-3.5" />
                      <span>التمارين المتاحة 🏋️‍♂️</span>
                    </button>
                  </div>

                  {gymTab === 'EXERCISES' && (
                    <>
                      {/* Gym Info with Stats */}
                      <div className="bg-gradient-to-br from-red-950/20 to-slate-900 border border-white/5 rounded-2xl p-4 flex flex-col gap-3 relative text-right">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg font-black">{gymPoints} XP</span>
                          <span className="text-xs text-white/50 font-bold">مجموع نقاط اللياقة البدنية:</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-red-500 to-amber-400" style={{ width: `${Math.min(100, (gymPoints % 100))}%` }} />
                        </div>
                        <p className="text-[10.5px] text-white/60 leading-relaxed font-sans">
                          كلما تدربت بالداخل، ازدادت نقاط اللياقة وزادت مستويات التمرين. توفر التمارين قوة هائلة وحصانة نبضية ضد الآفات والأمراض في كافة أطوار اللعب والزمالة!
                        </p>
                      </div>

                      {/* Sports list */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-right">
                        
                        {/* SPRINT CARD */}
                        <div className="bg-white/5 border border-white/10 hover:border-red-500/30 rounded-2xl p-3.5 flex flex-col justify-between gap-3 text-right group transition-all">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] text-red-400 font-bold">المستوى {sprintLevel} ⭐</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white">الجري السريع 🏃‍♂️</span>
                            </div>
                          </div>
                          <p className="text-[9.5px] text-white/50 leading-relaxed font-sans">
                            يقوي عضلة القلب ويقلل الضرر والوهن الصحي بنسبة <span className="text-red-400">-{Math.round((1 - Math.max(0.4, 1 - (sprintLevel * 0.12))) * 100)}%</span> في كافة المراحل!
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              audioSynthRef.current.playPerfectSound();
                              setGymPracticeType('SPRINT');
                              setPracticeProgress(0);
                              setPracticeTimer(5);
                              setPracticeStatusMessage('اضغط بسرعة قصوى لمحاكاة الجري وسحق الدهون وسد الشرايين! 🏃‍♂️');
                            }}
                            className="w-full bg-red-650 hover:bg-red-550 text-white font-extrabold py-2 px-3 rounded-lg text-[10.5px] transition-all cursor-pointer"
                          >
                            بدء تمرين الجري السريع 🔥
                          </button>
                        </div>

                        {/* CYCLING CARD */}
                        <div className="bg-white/5 border border-white/10 hover:border-amber-500/30 rounded-2xl p-3.5 flex flex-col justify-between gap-3 text-right group transition-all">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] text-amber-400 font-bold">المستوى {cyclingLevel} ⭐</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white">دراجة اللياقة 🚴‍♂️</span>
                            </div>
                          </div>
                          <p className="text-[9.5px] text-white/50 leading-relaxed font-sans">
                            يزيد من كفاءة الدورة الدموية ومفعول منظم النبض بنسبة <span className="text-amber-400 font-bold">+{Math.round(cyclingLevel * 30)}%</span> من الثواني التباطئية!
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              audioSynthRef.current.playPerfectSound();
                              setGymPracticeType('CYCLING');
                              setPracticeProgress(0);
                              setPracticeTimer(5);
                              setPracticeStatusMessage('اضغط على الدواسات بسرعة واملأ السرعة والضربات! 🚴‍♂️');
                            }}
                            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-extrabold py-2 px-3 rounded-lg text-[10.5px] transition-all cursor-pointer"
                          >
                            بدء دراجة التحمل 🔥
                          </button>
                        </div>

                        {/* SWIMMING CARD */}
                        <div className="bg-white/5 border border-white/10 hover:border-sky-500/30 rounded-2xl p-3.5 flex flex-col justify-between gap-3 text-right group transition-all">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] text-sky-450 font-bold">المستوى {swimmingLevel} ⭐</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white">السباحة الرئوية 🏊‍♂️</span>
                            </div>
                          </div>
                          <p className="text-[9.5px] text-white/50 leading-relaxed font-sans">
                            يضاعف سعة الأكسجين ويرفع استشفاء الأوعية من الأدرينالين والأغذية بنسبة <span className="text-sky-450 font-bold">+{Math.round(swimmingLevel * 25)}%</span>!
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              audioSynthRef.current.playPerfectSound();
                              setGymPracticeType('SWIMMING');
                              setPracticeProgress(40); // lungs depth starts middle
                              setPracticeTimer(6);
                              setPracticeStatusMessage('اضغط على التنفس عندما يتطابق المؤشر في المنطقة الخضراء! 🏊‍♂️');
                            }}
                            className="w-full bg-sky-600/90 hover:bg-sky-500 text-white font-extrabold py-2 px-3 rounded-lg text-[10.5px] transition-all cursor-pointer"
                          >
                            بدء تدريب السباحة والأكسجين 🔥
                          </button>
                        </div>

                        {/* STRENGTH CARD */}
                        <div className="bg-white/5 border border-white/10 hover:border-purple-500/30 rounded-2xl p-3.5 flex flex-col justify-between gap-3 text-right group transition-all">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] text-purple-400 font-bold">المستوى {strengthLevel} ⭐</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white">رفع الأثقال والتطهير 🏋️‍♂️</span>
                            </div>
                          </div>
                          <p className="text-[9.5px] text-white/50 leading-relaxed font-sans">
                            يمنح قلبك قدرة سحق الخثرات والآفات المتراكمة بنبضة واحدة! يلحق <span className="text-purple-400 font-bold">+{strengthLevel} ضرر</span> نقري إضافي!
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              audioSynthRef.current.playPerfectSound();
                              setGymPracticeType('STRENGTH');
                              setPracticeProgress(0);
                              setPracticeTimer(5);
                              setPracticeStatusMessage('اضغط لرفع الثقل الثقيل فوق رأس دكتور نبضة! 🏋️‍♂️');
                            }}
                            className="w-full bg-purple-650 hover:bg-purple-550 text-white font-extrabold py-2 px-3 rounded-lg text-[10.5px] transition-all cursor-pointer"
                          >
                            بدء رفع الأثقال الحديدية 🔥
                          </button>
                        </div>

                      </div>
                    </>
                  )}

                  {gymTab === 'PLANS' && (
                    <div className="flex flex-col gap-4 text-right">
                      
                      {/* Section Title */}
                      <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-2xl text-right">
                        <h4 className="text-xs font-black text-red-400 font-display">خُطط وبرامج اللياقة لتعزيز دافعية قلبك 🎯</h4>
                        <p className="text-[10px] text-white/70 mt-1 leading-relaxed">
                          أكمل التحديات التالية لتثبت جدارتك الرياضية أمام دكتور نبضة وتحصل على مكافآت ضخمة من نقاط اللياقة (XP)!
                        </p>
                      </div>

                      {/* PLAN 1 */}
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 text-right space-y-2 flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] text-amber-400 font-bold bg-amber-500/15 px-2 py-0.5 rounded-md">مكافأة: +100 XP 🏆</span>
                          <span className="text-xs font-black text-white">1. خطة "شرايين صقر نبضة" للمبتدئين 🦅</span>
                        </div>
                        <p className="text-[10px] text-white/50 leading-relaxed">
                          الشرط: تنفيذ 5 تمارين متكاملة داخل صالة نبضة الرياضية لاكتساب الروتين الرياضي.
                        </p>
                        
                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] text-white/45 font-mono">
                            <span>{Math.round((Math.min(5, totalWorkouts) / 5) * 100)}%</span>
                            <span>التقدم الحالي: {Math.min(5, totalWorkouts)} / 5 تمارين</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-505 rounded-full transition-all" style={{ width: `${(Math.min(5, totalWorkouts) / 5) * 100}%` }} />
                          </div>
                        </div>

                        {ironHeartClaimed ? (
                          <div className="text-center py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] rounded-lg font-bold">
                            الخطة مكتملة وتم تسليم مكافأتك بنجاح! 🎉
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={totalWorkouts < 5}
                            onClick={() => claimPlanReward('IRON')}
                            className={`w-full py-2 font-black rounded-lg text-xs transition-all cursor-pointer ${
                              totalWorkouts >= 5
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 animate-pulse font-extrabold shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                                : 'bg-white/5 text-white/30 border border-white/5 cursor-not-allowed'
                            }`}
                          >
                            {totalWorkouts >= 5 ? 'استلام مكافأة الخطة! 🎁' : 'الخطة غير جاهزة بعد 🔒'}
                          </button>
                        )}
                      </div>

                      {/* PLAN 2 */}
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 text-right space-y-2 flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] text-amber-400 font-bold bg-amber-500/15 px-2 py-0.5 rounded-md">مكافأة: +200 XP 🏆</span>
                          <span className="text-xs font-black text-white">2. خطة "القلب والدوران الفولاذي" 💖</span>
                        </div>
                        <p className="text-[10px] text-white/50 leading-relaxed">
                          الشرط: الوصول بالمستوى التدريبي للجري والدراجة إلى المستوى 3 أو أعلى لتعزيز القوة العضلية الدافعة.
                        </p>
                        
                        {/* Progress Grid */}
                        <div className="grid grid-cols-2 gap-2 text-[9px] text-white/60 font-sans">
                          <div className="bg-white/5 p-1.5 rounded-lg border border-white/5 text-center">
                            الجري: {sprintLevel}/3 {sprintLevel >= 3 ? '✅' : '❌'}
                          </div>
                          <div className="bg-white/5 p-1.5 rounded-lg border border-white/5 text-center">
                            الدراجة: {cyclingLevel}/3 {cyclingLevel >= 3 ? '✅' : '❌'}
                          </div>
                        </div>

                        {superArteriesClaimed ? (
                          <div className="text-center py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] rounded-lg font-bold">
                            الخطة مكتملة وتم تسليم مكافأتك بنجاح! 🎉
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={sprintLevel < 3 || cyclingLevel < 3}
                            onClick={() => claimPlanReward('ARTERIES')}
                            className={`w-full py-2 font-black rounded-lg text-xs transition-all cursor-pointer ${
                              sprintLevel >= 3 && cyclingLevel >= 3
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 animate-pulse font-extrabold shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                                : 'bg-white/5 text-white/30 border border-white/5 cursor-not-allowed'
                            }`}
                          >
                            {sprintLevel >= 3 && cyclingLevel >= 3 ? 'استلام مكافأة الخطة! 🎁' : 'الخطة غير جاهزة بعد 🔒'}
                          </button>
                        )}
                      </div>

                      {/* PLAN 3 */}
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 text-right space-y-2 flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] text-amber-400 font-bold bg-amber-500/15 px-2 py-0.5 rounded-md">مكافأة: +300 XP 🏆</span>
                          <span className="text-xs font-black text-white">3. برنامج "أوكسجين الشرايين النقي" الخارق 🏊‍♂️</span>
                        </div>
                        <p className="text-[10px] text-white/50 leading-relaxed">
                          الشرط: وصول مستويات السباحة وقوة رفع الأثقال وتطهير الشرايين إلى المستوى 4 أو أعلى.
                        </p>
                        
                        {/* Progress Grid */}
                        <div className="grid grid-cols-2 gap-2 text-[9px] text-white/60 font-sans">
                          <div className="bg-white/5 p-1.5 rounded-lg border border-white/5 text-center">
                            السباحة: {swimmingLevel}/4 {swimmingLevel >= 4 ? '✅' : '❌'}
                          </div>
                          <div className="bg-white/5 p-1.5 rounded-lg border border-white/5 text-center">
                            رفع الأثقال: {strengthLevel}/4 {strengthLevel >= 4 ? '✅' : '❌'}
                          </div>
                        </div>

                        {oxygenTankClaimed ? (
                          <div className="text-center py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] rounded-lg font-bold">
                            الخطة مكتملة وتم تسليم مكافأتك بنجاح! 🎉
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={swimmingLevel < 4 || strengthLevel < 4}
                            onClick={() => claimPlanReward('OXYGEN')}
                            className={`w-full py-2 font-black rounded-lg text-xs transition-all cursor-pointer ${
                              swimmingLevel >= 4 && strengthLevel >= 4
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 animate-pulse font-extrabold shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                                : 'bg-white/5 text-white/30 border border-white/5 cursor-not-allowed'
                            }`}
                          >
                            {swimmingLevel >= 4 && strengthLevel >= 4 ? 'استلام مكافأة الخطة! 🎁' : 'الخطة غير جاهزة بعد 🔒'}
                          </button>
                        )}
                      </div>

                    </div>
                  )}

                  {gymTab === 'WHEEL' && (
                    <div className="flex flex-col gap-4 items-center">
                      
                      {/* Explanatory Banner */}
                      <div className="p-3 bg-gradient-to-r from-red-950/20 to-slate-900 border border-white/5 rounded-2xl text-right w-full">
                        <h4 className="text-xs font-black text-amber-400 font-display">عجلة الحماس اليومي للقلب والشرايين 🎡</h4>
                        <p className="text-[10px] text-white/70 mt-1 leading-relaxed">
                          قم بتدوير العجلة مرة واحدة يومياً، أو <span className="text-amber-400 font-bold">أكمل تمرينين (2) متتاليين</span> في الصالة لفك القفل فوراً وإعادة التدوير!
                        </p>
                      </div>

                      {/* Spinner Graphic Representation */}
                      <div className="relative w-44 h-44 rounded-full border-4 border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.15)] flex items-center justify-center overflow-hidden my-2 bg-slate-900">
                        {/* Wheel sectors rotation */}
                        <div 
                          className="absolute inset-0 transition-transform duration-[1800ms] ease-out rounded-full grid grid-cols-2 grid-rows-2"
                          style={{ transform: `rotate(${spinAnimationDegree}deg)` }}
                        >
                          <div className="bg-red-650/40 border border-white/10 flex items-center justify-center font-black text-[12px] text-red-400">💖 80 XP</div>
                          <div className="bg-amber-650/40 border border-white/10 flex items-center justify-center font-black text-[12px] text-amber-400">⚡ 40 XP</div>
                          <div className="bg-sky-650/40 border border-white/10 flex items-center justify-center font-black text-[12px] text-sky-450">🏅 60 XP</div>
                          <div className="bg-slate-800/60 border border-white/10 flex items-center justify-center font-black text-[12px] text-white/40">✨ 20 XP</div>
                        </div>

                        {/* Spinner Arrow pointer indicator */}
                        <div className="absolute top-1 z-20 text-lg animate-bounce select-none">👇</div>

                        {/* Spinner inner hub */}
                        <div className="w-12 h-12 bg-slate-950 border border-amber-500/50 rounded-full flex items-center justify-center z-10 shadow">
                          <Sparkles className="w-5 h-5 text-amber-400 animate-spin" />
                        </div>
                      </div>

                      {/* Last Spin parameters */}
                      <div className="text-center w-full space-y-1.5 p-2.5 bg-white/5 border border-white/10 rounded-xl">
                        <div className="flex justify-between items-center text-[10px] text-white/60 px-1">
                          <span className="font-bold text-amber-400 font-mono">{spinCompletedWorkouts} / 2</span>
                          <span>التمارين المكتملة منذ آخر دوران:</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, (spinCompletedWorkouts / 2) * 100)}%` }} />
                        </div>
                        {lastSpinDate === new Date().toDateString() && spinCompletedWorkouts < 2 ? (
                          <p className="text-[9.5px] text-amber-400/90 font-bold mt-1 text-center font-sans">
                            تم تدوير العجلة مؤخراً اليوم. أكمل {2 - spinCompletedWorkouts} تمارين إضافية لإعادة فك القفل فورياً! 🔥
                          </p>
                        ) : (
                          <p className="text-[9.5px] text-emerald-400 font-bold mt-1 text-center">
                            العجلة جاهزة للدوران والتحفيز الآن! 🎉
                          </p>
                        )}
                      </div>

                      {/* Spinner Button and messaging */}
                      {spinRewardMsg && (
                        <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-center text-[10.5px] text-white/80 leading-relaxed font-sans whitespace-pre-line w-full">
                          {spinRewardMsg}
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={isSpinning || (lastSpinDate === new Date().toDateString() && spinCompletedWorkouts < 2)}
                        onClick={handleDailySpin}
                        className={`w-full py-2.5 font-black rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          isSpinning
                            ? 'bg-amber-600/30 text-white/45 cursor-wait'
                            : (lastSpinDate === new Date().toDateString() && spinCompletedWorkouts < 2)
                            ? 'bg-white/5 text-white/30 border border-white/5 cursor-not-allowed'
                            : 'bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-extrabold animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.35)]'
                        }`}
                      >
                        <Sparkles className="w-4 h-4 text-white" />
                        <span>{isSpinning ? 'جاري دوران شرايين القلب...' : 'تدوير شرايين وعجلة الحماس! 🎡'}</span>
                      </button>

                    </div>
                  )}
                </>
              ) : (
                /* ACTIVE MINI GAME MODULE inside modal */
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4 text-center items-center w-full">
                  
                  {gymPracticeType === 'SPRINT' && (
                    <div className="w-full space-y-4">
                      <h4 className="text-xs text-red-400 font-black tracking-wider font-sans uppercase">الجري السريع لتوسيع الشرايين 🏃‍♂️</h4>
                      <p className="text-[11px] text-white/70">{practiceStatusMessage}</p>
                      
                      {/* Interactive Track bar */}
                      <div className="relative w-full h-12 bg-black/40 border border-white/10 rounded-2xl overflow-hidden flex items-center px-4">
                        <div className="absolute right-0 top-0 bottom-0 bg-red-600/30 transition-all font-sans" style={{ width: `${practiceProgress}%` }} />
                        <span className="text-2xl z-10 transition-all" style={{ marginRight: `calc(${practiceProgress}% - 24px)` }}>🏃‍♂️</span>
                        <span className="absolute left-4 text-xs font-sans text-white/45">النهاية 🏆</span>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/10 pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (practiceProgress >= 100) return;
                            audioSynthRef.current.playHitSound();
                            const next = practiceProgress + 8;
                            if (next >= 100) {
                              setPracticeProgress(100);
                              handleGymExerciseSuccess('SPRINT');
                            } else {
                              setPracticeProgress(next);
                            }
                          }}
                          disabled={practiceProgress >= 100}
                          className="px-6 py-3 bg-red-650 hover:bg-red-550 rounded-xl text-white font-black text-xs active:scale-95 transition-all text-center cursor-pointer flex-1"
                        >
                          {practiceProgress >= 100 ? 'تم التدريب بنجاح! 🎉' : 'خطوة سريعة! 🏃‍♂️'}
                        </button>
                      </div>
                    </div>
                  )}

                  {gymPracticeType === 'CYCLING' && (
                    <div className="w-full space-y-4">
                      <h4 className="text-xs text-amber-400 font-black tracking-wider uppercase font-sans">دراجة اللياقة الهوائية 🚴‍♂️</h4>
                      <p className="text-[11px] text-white/70">{practiceStatusMessage}</p>

                      {/* Speedometer level indicator */}
                      <div className="flex flex-col items-center justify-center p-3 border border-white/5 bg-slate-900 rounded-2xl relative w-full overflow-hidden">
                        <p className="text-[10px] text-white/40 mb-1">عداد السرعة والدوران</p>
                        <p className="text-3xl font-black text-amber-400 transition-all">{Math.round(practiceProgress * 1.8)} RPM</p>
                        <div className="w-full h-2 bg-white/5 rounded-full mt-2.5 overflow-hidden">
                          <div className="h-full bg-amber-500 transition-all" style={{ width: `${Math.min(100, practiceProgress)}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/10 pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (practiceProgress >= 100) return;
                            audioSynthRef.current.playHitSound();
                            const next = practiceProgress + 10;
                            if (next >= 100) {
                              setPracticeProgress(100);
                              handleGymExerciseSuccess('CYCLING');
                            } else {
                              setPracticeProgress(next);
                            }
                          }}
                          disabled={practiceProgress >= 100}
                          className="px-6 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl text-white font-black text-xs active:scale-95 transition-all text-center cursor-pointer flex-1"
                        >
                          {practiceProgress >= 100 ? 'تم التدريب بنجاح! 🎉' : 'اضغط على السلسلة والبدّال 🚴‍♂️'}
                        </button>
                      </div>
                    </div>
                  )}

                  {gymPracticeType === 'SWIMMING' && (
                    <div className="w-full space-y-4">
                      <h4 className="text-xs text-sky-400 font-black tracking-wider uppercase font-sans">السباحة الرئوية للأوعية والصمامات 🏊‍♂️</h4>
                      <p className="text-[11px] text-white/70">{practiceStatusMessage}</p>

                      {/* Breath target indicator */}
                      <div className="flex flex-col items-center justify-center p-4 border border-white/5 bg-slate-900 rounded-2xl relative w-full overflow-hidden gap-2">
                        <p className="text-[10px] text-white/40 mb-1">مستوى الأكسجين والقدرة</p>
                        
                        {/* Lungs Target Bar */}
                        <div className="relative w-full h-8 bg-sky-950 border border-white/15 rounded-xl overflow-hidden flex items-center justify-center">
                          {/* target green zone between 70% and 90% */}
                          <div className="absolute right-[70%] left-[10%] h-full bg-emerald-500/40 border-x border-emerald-500/60" />
                          <div className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_white] transition-all" style={{ right: `${practiceProgress}%` }} />
                          <span className="text-[9px] font-bold text-white z-10">منطقة النفس الذهبية ⭐</span>
                        </div>
                        <p className="text-[10px] text-white/60">القيمة الحالية: {Math.round(practiceProgress)}%</p>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/10 pt-3 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            audioSynthRef.current.playHitSound();
                            // Increase/fluctuate breathing
                            const factor = Math.random() > 0.5 ? 12 : -15;
                            const next = Math.max(0, Math.min(100, practiceProgress + factor));
                            setPracticeProgress(next);

                            // Check if exactly inside golden zone (70% to 90%)
                            if (next >= 70 && next <= 90) {
                              handleGymExerciseSuccess('SWIMMING');
                            } else {
                              setPracticeStatusMessage('نفس غير مضبوط! حاول جعل المؤشر الأبيض يقف بداخل المنطقة الخضراء!');
                            }
                          }}
                          className="px-6 py-3 bg-sky-600 hover:bg-sky-500 rounded-xl text-white font-black text-xs active:scale-95 transition-all text-center cursor-pointer flex-1"
                        >
                          خذ شهيقاً وزفيراً عميقاً! 🏊‍♂️
                        </button>
                      </div>
                    </div>
                  )}

                  {gymPracticeType === 'STRENGTH' && (
                    <div className="w-full space-y-4">
                      <h4 className="text-xs text-purple-400 font-black tracking-wider uppercase font-sans">تحدّي رفع الأثقال وتطهير الشرايين 🏋️‍♂️</h4>
                      <p className="text-[11px] text-white/70">{practiceStatusMessage}</p>

                      {/* Barbell Height gauge */}
                      <div className="flex flex-col items-center justify-center p-4 border border-white/5 bg-slate-900 rounded-2xl relative w-full overflow-hidden gap-4">
                        {/* Virtual weight display */}
                        <div className="text-center font-black text-2xl relative h-16 flex items-center justify-center w-full">
                          <span className="text-slate-200 transition-all font-sans" style={{ transform: `translateY(-${practiceProgress * 0.3}px) rotate(${Math.sin(practiceProgress) * 5}deg)` }}>
                            🏋️‍♂️ ─── ⚖️ ─── 🏋️‍♂️
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 transition-all" style={{ width: `${practiceProgress}%` }} />
                        </div>
                        <p className="text-[10px] text-white/40">ارتفاع الثقل: {practiceProgress}%</p>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/10 pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (practiceProgress >= 100) return;
                            audioSynthRef.current.playHitSound();
                            const next = practiceProgress + 10;
                            if (next >= 100) {
                              setPracticeProgress(100);
                              handleGymExerciseSuccess('STRENGTH');
                            } else {
                              setPracticeProgress(next);
                            }
                          }}
                          disabled={practiceProgress >= 100}
                          className="px-6 py-3 bg-purple-650 hover:bg-purple-550 rounded-xl text-white font-black text-xs active:scale-95 transition-all text-center cursor-pointer flex-1"
                        >
                          {practiceProgress >= 100 ? 'تم رفع الثقل تماماً! 🎉' : 'ادفع بقوتك الرافعة 🏋️‍♂️'}
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      audioSynthRef.current.playPerfectSound();
                      setGymPracticeType('NONE');
                    }}
                    className="mt-2 text-xs text-white/50 hover:text-white transition-all underline outline-none cursor-pointer"
                  >
                    العودة لخيارات الصالة
                  </button>

                </div>
              )}

            </div>
          </div>
        )}

        {/* SCREEN MODULE STATE ROUTER */}

        {gameState === 'START' && (
          showLevelsView ? (
            <div id="levels-selection-screen" className="flex flex-col gap-4 py-3 animate-fade-in text-center font-sans w-full max-w-lg mx-auto">
              {/* Back button */}
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm sm:text-base font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-amber-400 font-display">
                  {selectedCampaignTab === 'LIFESTYLE' ? (
                    activeLevelTab === 'CLASSIC' ? "نمط الحياة الكلاسيكي: المراحل 1 - 30 🥗" : activeLevelTab === 'MUTATED' ? "تحدي النوم والمثابرة: المراحل 31 - 60 😴" : activeLevelTab === 'VASCULAR' ? "سموم التوتر والتدخين: المراحل 61 - 90 🚬" : "التحدي الشامل الختامي: المراحل 91 - 100 🏆"
                  ) : (
                    activeLevelTab === 'CLASSIC' ? "الأوعية الكلاسيكية: المراحل 1 - 30 🏆" : activeLevelTab === 'MUTATED' ? "الطفرة السيبرانية: المراحل 31 - 60 🧪" : activeLevelTab === 'VASCULAR' ? "حملة الأوردة والشرايين: المراحل 61 - 90 🚨" : "جراحة القلب المفتوح: المراحل 91 - 100 🏥"
                  )}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowLevelsView(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white/90 hover:text-white transition-all text-xs flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 scale-x-[-1]" />
                  <span>رجوع</span>
                </button>
              </div>

              {/* Campaign Switcher */}
              <div className="flex gap-2 p-1 bg-black/50 rounded-2xl border border-white/5 mx-auto w-full max-w-sm">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCampaignTab('MEDICAL');
                    setSelectedLevelInfo(null);
                  }}
                  className={`flex-1 py-1.5 text-[11px] font-black rounded-xl transition-all cursor-pointer ${
                    selectedCampaignTab === 'MEDICAL'
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md border border-red-500/20'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  🔬 الحملة الطبية
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCampaignTab('LIFESTYLE');
                    setSelectedLevelInfo(null);
                  }}
                  className={`flex-1 py-1.5 text-[11px] font-black rounded-xl transition-all cursor-pointer ${
                    selectedCampaignTab === 'LIFESTYLE'
                      ? 'bg-gradient-to-r from-emerald-650 to-teal-600 text-white shadow-md border border-emerald-500/20'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  🥗 حملة نمط الحياة
                </button>
              </div>

              {/* Tabs selector */}
              <div className="flex gap-1 p-1 bg-black/40 rounded-2xl border border-white/5 overflow-x-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveLevelTab('CLASSIC')}
                  className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                    activeLevelTab === 'CLASSIC'
                      ? selectedCampaignTab === 'LIFESTYLE'
                        ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-gradient-to-r from-red-500/20 to-red-600/20 text-red-400 border border-red-500/30'
                      : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {selectedCampaignTab === 'LIFESTYLE' ? 'الأساسية (1-30)' : 'الكلاسيكية (1-30)'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLevelTab('MUTATED')}
                  className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                    activeLevelTab === 'MUTATED'
                      ? selectedCampaignTab === 'LIFESTYLE'
                        ? 'bg-gradient-to-r from-teal-500/20 to-teal-600/20 text-teal-400 border border-teal-500/30'
                        : 'bg-gradient-to-r from-cyan-500/20 to-cyan-600/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {selectedCampaignTab === 'LIFESTYLE' ? 'الغذاء والنوم (31-60)' : 'السيبرانية (31-60)'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLevelTab('VASCULAR')}
                  className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                    activeLevelTab === 'VASCULAR'
                      ? selectedCampaignTab === 'LIFESTYLE'
                        ? 'bg-gradient-to-r from-green-500/20 to-green-600/20 text-green-400 border border-green-500/30'
                        : 'bg-gradient-to-r from-rose-500/20 to-rose-600/20 text-rose-450 border border-rose-500/30'
                      : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {selectedCampaignTab === 'LIFESTYLE' ? 'التوتر والتدخين (61-90)' : 'الأوعية (61-90)'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLevelTab('CARDIAC')}
                  className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                    activeLevelTab === 'CARDIAC'
                      ? selectedCampaignTab === 'LIFESTYLE'
                        ? 'bg-gradient-to-r from-cyan-500/20 to-cyan-600/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,180,180,0.15)]'
                        : 'bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                      : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {selectedCampaignTab === 'LIFESTYLE' ? 'الختام الشامل (91-100)' : 'القلب المفتوح (91-100)'}
                </button>
              </div>

              <p className="text-xs text-white/60 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5 text-right font-sans" dir="rtl">
                {selectedCampaignTab === 'LIFESTYLE' ? (
                  activeLevelTab === 'CLASSIC'
                    ? "السلوكيات الأساسية: 30 مرحلة لحماية عضلات القلب من البرغر الضار والأملاح الزائدة! دع عناصر الماء المتدفق والتفاح اللذيذ تصل للقلب لتغذيته."
                    : activeLevelTab === 'MUTATED'
                      ? "تحدي الأغذية المعدلة والنوم السليم: 30 مرحلة متقدمة! تطلق وجبات برجر دهنية ضخمة وسهر مطول متذبذب، واجهها ودع النوم المريح يرمم القلب."
                      : activeLevelTab === 'VASCULAR'
                        ? "سموم العصر الحديث القاتلة: 30 مرحلة حاسمة! تجنب التدخين الخطر، التوتر العالي، وأضرار الجلوس والخمول المديد؛ واستعن بالرياضة والتمارين لتعزيز تدفق الشرايين."
                        : "تحدي نمط الحياة الختامي الشامل: 10 مستويات مكثفة ومزيج فوضوي يحتاج إلى تركيز حديدي وجرأة مطلقة لتصل بقلبك إلى قمة المثالية!"
                ) : (
                  activeLevelTab === 'CLASSIC' 
                    ? "طهر صمامات وعضلات القلب بالتدريج وتجاوز 30 مرحلة من الخطورة والآفات الجرثومية! تزداد وتيرة النبض والعدوانية مع تقدمك."
                    : activeLevelTab === 'MUTATED'
                      ? "⚠️ تحذير الطفرة السيبرانية: 30 مرحلة جديدة تختلف عن ال30 الأولى تماماً ببيئة لعب زرقاء مجهرية، جراثيم إلكترونية ذكية، وموسيقى طوارئ تركيبية مختلفة!"
                      : activeLevelTab === 'VASCULAR'
                        ? "🔴🔵 حملة المسعف للأوعية والشرايين: 30 مرحلة فائقة الصعوبة والتشويق! جلطات شريانية تتضخم، وخثرات وريدية متعرجة خاطفة لتطوي القنوات، ولويحات تصلب صفراء بـ 4 ضربات، وزعيم الانسداد الأعظم بقوة 20 ضربة!"
                        : "🏥 جراحة القلب المفتوح الكبرى: 10 مراحل حاسمة نهائية لاستعادة نشاط العقدة الجيبية الأذينية! جلطات مستشرية، ومواجهة زعيم الصمام الأخير بصحة 30 ضربة بتركيز حديدي!"
                )}
              </p>

              {/* levels list */}
              <div className="grid grid-cols-5 gap-2 max-h-[280px] overflow-y-auto pr-1">
                {Array.from({ length: activeLevelTab === 'CARDIAC' ? 10 : 30 }).map((_, i) => {
                  const lNum = activeLevelTab === 'CLASSIC' 
                    ? (i + 1) 
                    : activeLevelTab === 'MUTATED' 
                      ? (i + 31) 
                      : activeLevelTab === 'VASCULAR' 
                        ? (i + 61) 
                        : (i + 91);
                  const isUnlocked = selectedCampaignTab === 'LIFESTYLE' ? lNum <= maxUnlockedLifestyleLevel : lNum <= maxUnlockedLevel;
                  const isCompleted = selectedCampaignTab === 'LIFESTYLE' 
                    ? (lNum < maxUnlockedLifestyleLevel || completedLifestyleLevels.includes(lNum)) 
                    : (lNum < maxUnlockedLevel || JSON.parse(localStorage.getItem('nabdah_completed_levels_v1') || '[]').includes(lNum));

                  return (
                    <button
                      key={lNum}
                      disabled={!isUnlocked}
                      type="button"
                      onClick={() => {
                        setSelectedLevelInfo(lNum);
                      }}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center relative border transition-all select-none cursor-pointer ${
                        !isUnlocked 
                          ? 'bg-black/45 border-white/5 text-white/20 cursor-not-allowed opacity-50'
                          : isCompleted
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:scale-[1.05] shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                            : selectedCampaignTab === 'LIFESTYLE'
                              ? 'bg-teal-500/5 border-teal-500/20 text-teal-300 hover:border-teal-400 hover:scale-[1.05]'
                              : activeLevelTab === 'MUTATED'
                                ? 'bg-cyan-500/5 border-cyan-500/20 text-cyan-300 hover:border-cyan-400 hover:scale-[1.05]'
                                : activeLevelTab === 'VASCULAR'
                                  ? 'bg-rose-500/5 border-rose-500/20 text-rose-400 hover:border-rose-450 hover:scale-[1.05]'
                                  : activeLevelTab === 'CARDIAC'
                                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-350 hover:border-emerald-400 hover:scale-[1.05]'
                                    : 'bg-white/5 border-white/10 text-white hover:border-red-500 hover:scale-[1.05]'
                      }`}
                    >
                      {/* Status Check / Lock */}
                      {!isUnlocked ? (
                        <Lock className="w-3.5 h-3.5 opacity-60 mb-0.5 text-white/30" />
                      ) : isCompleted ? (
                        <div className="flex gap-0.5 items-center justify-center mb-0.5 animate-bounce">
                          <Trophy className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        </div>
                      ) : (
                        <span className="text-[8px] text-white/40 tracking-tight font-mono mb-0.5">
                          هدف: {selectedCampaignTab === 'LIFESTYLE' ? getLifestyleStageConfig(lNum).targetScore : getStageConfig(lNum).targetScore}
                        </span>
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
                const isL = selectedCampaignTab === 'LIFESTYLE';
                const info = isL ? getLifestyleStageDescription(selectedLevelInfo) : getStageDescription(selectedLevelInfo);
                const config = isL ? getLifestyleStageConfig(selectedLevelInfo) : getStageConfig(selectedLevelInfo);
                return (
                  <div className="absolute inset-x-3 inset-y-4 bg-slate-950/98 bg-gradient-to-b from-slate-950/98 to-slate-900/98 backdrop-blur-xl rounded-2xl p-5 flex flex-col justify-between text-right animate-fade-in z-30 border-2 border-white/10" dir="rtl">
                    <div className="flex flex-col gap-3.5 overflow-y-auto pr-1">
                      <div className="flex justify-between items-center border-b border-white/10 pb-2">
                        <h4 className="text-base font-black text-emerald-400 font-display">
                          {isL ? `مرحلة عادات القلب #${selectedLevelInfo}` : `مهمة الإنعاش الإنعاشي #${selectedLevelInfo}`}
                        </h4>
                        <span className={`text-[10px] border px-2 py-0.5 rounded-full font-mono ${isL ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                          {isL ? 'تقرير السلوك اليومي' : 'تقرير التشخيص'}
                        </span>
                      </div>
                      
                      <div className="space-y-3 font-sans">
                        <div>
                          <p className="text-[9px] text-white/50 uppercase font-bold tracking-widest mb-0.5">مسمى المرحلة:</p>
                          <p className={`text-sm font-extrabold leading-snug ${isL ? 'text-emerald-400' : 'text-white'}`}>{info.title}</p>
                        </div>
                        
                        <div>
                          <p className="text-[9px] text-white/50 uppercase font-bold tracking-widest mb-0.5">العناصر النشطة في المرحلة:</p>
                          <p className="text-xs text-amber-400 font-bold leading-normal">{info.threats}</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 bg-white/5 p-2 rounded-xl border border-white/5">
                          <div>
                            <p className="text-[9px] text-white/40 font-bold">النتيجة المستهدفة:</p>
                            <p className="text-xs font-black text-emerald-400 font-mono">+{config.targetScore} نقطة</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-white/40 font-bold">وتيرة النزول والسرعة:</p>
                            <p className="text-xs font-black text-amber-400 font-sans">{info.speed}</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-[9px] text-white/50 uppercase font-bold tracking-widest mb-0.5">
                            {isL ? 'التوجيهات السلوكية والفوائد الصحية:' : 'ملخص الحالة الطبية والتشخيص:'}
                          </p>
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
                          startGame(isL ? 'LIFESTYLE' : 'LEVELS', lvl);
                        }}
                        className={`flex-1 py-2.5 rounded-xl text-white font-extrabold text-xs shadow-lg active:scale-95 transition-all text-center cursor-pointer ${
                          isL 
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:shadow-emerald-500/25' 
                            : 'bg-gradient-to-r from-red-500 to-rose-500 hover:shadow-red-500/25'
                        }`}
                      >
                        {isL ? 'بدء تحدي نمط الحياة 🥗' : 'بدء العملية الإيقاعية ⚡'}
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

              {/* Medical Accolades Panel (25-year game development expert polish) */}
              <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-3.5 text-right flex flex-col gap-2">
                <p className="text-[10px] uppercase font-bold tracking-widest text-amber-400 flex items-center gap-1.5 justify-end">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>الأوسمة الطبية المكتسبة والجوائز:</span>
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { lvl: 2, title: "مُسعف متدرب", icon: "🩺", desc: "بدأ رحلة الإنعاش" },
                    { lvl: 15, title: "قاهر الفيروسات", icon: "🦠", desc: "بلغ المرحلة 15" },
                    { lvl: 30, title: "أخصائي القلوب", icon: "🫀", desc: "طهّر الأوعية الكلاسيكية" },
                    { lvl: 60, title: "بروفيسور سيبراني", icon: "🧬", desc: "بلغ المرحلة 60" },
                    { lvl: 90, title: "المنقذ الأسطوري", icon: "🏆", desc: "قهر صمام الإنسداد النهائي" }
                  ].map((badge, bIdx) => {
                    const isBadgeUnlocked = maxUnlockedLevel >= badge.lvl;
                    return (
                      <div 
                        key={bIdx}
                        className={`flex flex-col items-center justify-center py-2 px-0.5 rounded-xl border text-center transition-all cursor-help relative group h-[58px] ${
                          isBadgeUnlocked 
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-[0_0_8px_rgba(234,179,8,0.1)] scale-100' 
                            : 'bg-black/35 border-white/5 text-white/30 opacity-60'
                        }`}
                      >
                        <span className="text-xl mb-0.5 leading-none">{isBadgeUnlocked ? badge.icon : "🔒"}</span>
                        <span className="text-[7.5px] font-black leading-tight w-full truncate">{badge.title}</span>
                        {/* Custom tooltip on hover */}
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 border border-white/10 text-white rounded-lg p-2 text-[10px] hidden group-hover:block w-36 text-center shadow-xl z-20 pointer-events-none">
                          <p className="font-extrabold text-amber-400">{badge.title}</p>
                          <p className="text-white/70 text-[9px] mt-0.5">{badge.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CARDIO GYM: صالة التمارين الرياضية لتقوية القلب */}
              <div className="backdrop-blur-md bg-gradient-to-r from-red-950/40 to-amber-950/20 rounded-2xl border border-red-500/20 hover:border-red-500/40 p-4 text-right flex flex-col gap-3 transition-all relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl -mr-6 -mt-6" />
                <div className="flex items-center justify-between z-10">
                  <span className="text-[9px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg font-black">
                    مستوى التدريبات الحالي: {Math.max(1, Math.round((sprintLevel + cyclingLevel + swimmingLevel + strengthLevel) / 4))} ⭐
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] font-black text-rose-450 uppercase tracking-wider">
                    <Heart className="w-3.5 h-3.5 text-red-500 animate-pulse fill-current" />
                    <span>صالة لياقة وقوة القلب الرياضية:</span>
                  </div>
                </div>
                <p className="text-[10px] text-white/70 leading-relaxed font-sans z-10">
                  ممارسة التدريبات في هذه الصالة تمنح قلبك <span className="text-amber-400 font-bold">قوة مضاعفة</span> ومقاومة فولاذية للأمراض ومسرعات الاستشفاء في كافة أطوار اللعب والزمالة!
                </p>
                <button
                  type="button"
                  onClick={() => {
                    audioSynthRef.current.playPerfectSound();
                    setIsGymOpen(true);
                  }}
                  className="w-full bg-gradient-to-r from-red-650 to-amber-600 hover:from-red-550 hover:to-amber-500 text-white font-extrabold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 outline-none shadow-[0_0_15px_rgba(239,68,68,0.25)] active:scale-[0.98] transition-all cursor-pointer text-xs font-semibold z-10"
                >
                  <Dumbbell className="w-4 h-4 text-white animate-bounce" />
                  <span>دخول صالة التمارين وتقوية القلب 🏋️‍♂️</span>
                </button>
              </div>

              {/* Action Start Buttons */}
              <div className="flex flex-col gap-5 mt-4 text-right">
                
                {/* CATEGORY 1: Campaigns */}
                <div className="space-y-2">
                  <div className="flex items-center justify-end gap-1 text-[11px] font-bold text-emerald-400/90 uppercase tracking-wider mb-1">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>حملة المغامرة والقصة (مراحل إنعاش):</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      id="start-levels-btn"
                      type="button"
                      onClick={() => {
                        setSelectedCampaignTab('MEDICAL');
                        setShowLevelsView(true);
                      }}
                      className="bg-gradient-to-br from-emerald-950/80 to-emerald-920/40 hover:from-emerald-900 hover:to-emerald-850 text-white font-extrabold p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 outline-none border border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_4px_12px_rgba(16,185,129,0.1)] active:scale-[0.97] transition-all cursor-pointer text-center group"
                    >
                      <Activity className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform animate-pulse" />
                      <span className="text-[11px] sm:text-xs">المراحل الطبية</span>
                      <span className="text-[8px] font-normal text-white/50 font-mono">100 مرحلة إنعاش</span>
                    </button>

                    <button
                      id="start-lifestyle-campaign-btn"
                      type="button"
                      onClick={() => {
                        setSelectedCampaignTab('LIFESTYLE');
                        setShowLevelsView(true);
                      }}
                      className="bg-gradient-to-br from-teal-950/80 to-teal-920/40 hover:from-teal-900 hover:to-teal-850 text-white font-extrabold p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 outline-none border border-teal-500/30 hover:border-teal-500/60 shadow-[0_4px_12px_rgba(20,184,166,0.1)] active:scale-[0.97] transition-all cursor-pointer text-center group"
                    >
                      <Sparkles className="w-5 h-5 text-teal-400 group-hover:scale-110 transition-transform animate-pulse" />
                      <span className="text-[11px] sm:text-xs">نمط الحياة</span>
                      <span className="text-[8px] font-normal text-white/50 font-mono">100 مرحلة سلوكية</span>
                    </button>
                  </div>
                </div>

                {/* CATEGORY 2: Arcade & Fast Survival */}
                <div className="space-y-2">
                  <div className="flex items-center justify-end gap-1 text-[11px] font-bold text-rose-450/90 uppercase tracking-wider mb-1">
                    <Zap className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                    <span>تحديات البقاء الإيقاعية (الأركيد):</span>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <button
                      id="start-game-btn"
                      type="button"
                      onClick={() => startGame('ENDLESS')}
                      className="w-full bg-gradient-to-r from-red-950/70 to-red-900/40 hover:from-red-900 hover:to-red-800 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-between outline-none border border-red-500/20 hover:border-red-500/40 shadow-md active:scale-[0.98] transition-all cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Play className="w-3.5 h-3.5 text-red-500 fill-current" />
                        <span>الوضع الفردي اللانهائي (بقاء)</span>
                      </div>
                      <span className="text-[9px] text-white/40 font-mono bg-black/45 px-1.5 py-0.5 rounded border border-white/5">بقاء 🔥</span>
                    </button>

                    <button
                      id="start-timed-btn"
                      type="button"
                      onClick={() => startGame('TIMED')}
                      className="w-full bg-gradient-to-r from-amber-950/70 to-amber-900/40 hover:from-amber-900 hover:to-amber-800 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-between outline-none border border-amber-500/20 hover:border-amber-500/40 shadow-md active:scale-[0.98] transition-all cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-current" />
                        <span>تحدي الـ 60 ثانية (إنعاش سريع)</span>
                      </div>
                      <span className="text-[9px] text-white/40 font-mono bg-black/45 px-1.5 py-0.5 rounded border border-white/5">تحدّي ⏱️</span>
                    </button>

                    <button
                      id="start-lifestyle-btn"
                      type="button"
                      onClick={() => startGame('LIFESTYLE')}
                      className="w-full bg-gradient-to-r from-teal-950/70 to-teal-900/40 hover:from-teal-900 hover:to-teal-800 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-between outline-none border border-teal-500/20 hover:border-teal-500/40 shadow-md active:scale-[0.98] transition-all cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Heart className="w-3.5 h-3.5 text-teal-400" />
                        <span>طور نمط الحياة اللانهائي المفتوح</span>
                      </div>
                      <span className="text-[9px] text-white/40 font-mono bg-black/45 px-1.5 py-0.5 rounded border border-white/5">تدريب 🥗</span>
                    </button>
                  </div>
                </div>

                {/* CATEGORY 3: Social & Coop */}
                <div className="space-y-2">
                  <div className="flex items-center justify-end gap-1 text-[11px] font-bold text-violet-400/90 uppercase tracking-wider mb-1">
                    <Users className="w-3.5 h-3.5 text-violet-500" />
                    <span>طور التحدي والمسعفين:</span>
                  </div>
                  
                  <button
                    id="start-splitscreen-btn"
                    onClick={() => startSplitScreenGame('ENDLESS')}
                    className="w-full bg-gradient-to-r from-violet-950/80 to-purple-900/45 hover:from-violet-900 hover:to-purple-800 text-white font-bold py-3 px-5 rounded-2xl flex items-center justify-center gap-2 outline-none border border-violet-500/20 hover:border-violet-500/45 shadow-[0_4px_15px_rgba(139,92,246,0.15)] active:scale-[0.98] transition-all cursor-pointer text-xs sm:text-sm font-semibold"
                  >
                    <Users className="w-4 h-4 text-violet-400 animate-pulse" />
                    <span>تحدي شخصين (تقسيم الشاشة 👥)</span>
                  </button>
                </div>

                {/* Info / Help button */}
                <div className="pt-2 border-t border-white/5 flex gap-2">
                  <button
                    id="how-to-btn"
                    onClick={() => setGameState('HOWTO')}
                    className="flex-1 bg-white/[0.03] hover:bg-white/[0.08] text-white/70 font-medium py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 outline-none border border-white/5 hover:border-white/10 transition-all cursor-pointer text-xs"
                  >
                    <HelpCircle className="w-4 h-4 text-slate-400" />
                    <span>كيف تلعب والتعليمات؟</span>
                  </button>
                </div>

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
          <div id="playing-module" className="flex flex-col gap-4 animate-fade-in font-sans relative">
            
            {isDefibrillatorActive && (
              <div id="defibrillator-overlay" className="absolute inset-0 bg-[#0c0202]/98 z-50 rounded-3xl p-5 flex flex-col justify-between overflow-hidden border border-red-500/30 animate-fade-in shadow-[0_0_50px_rgba(239,68,68,0.25)] min-h-[500px]">
                
                {/* Header flashing alert */}
                <div className="text-center space-y-2 mt-2">
                  <div className="inline-flex items-center gap-1.5 bg-red-550/15 border border-red-500/30 text-red-500 text-[10px] font-bold py-1 px-3.5 rounded-full animate-pulse tracking-widest uppercase">
                    <span className="w-2 h-2 rounded-full bg-red-650 animate-ping" />
                    توقف مفاجئ لعضلة القلب • CARDIAC ARREST
                  </div>
                  <h2 className="text-xl font-black text-white tracking-tight leading-7">
                    🚨 وحدة الطوارئ والإنعاش الصدمي 🚨
                  </h2>
                  <p className="text-xs text-white/50 px-4 font-sans">
                    مستوى حيوية الدماغ والقلب ينخفض بسرعة! اشحن المكثف وقدم صدمة متزامنة مع نبضات EKG لمنع الوفاة السريرية.
                  </p>
                </div>

                {/* EKG / Flatline Monitor Section */}
                <div className="w-full bg-black/60 rounded-2xl p-4 border border-white/5 space-y-3 relative overflow-hidden shadow-inner flex flex-col items-center">
                  <div className="text-center font-sans space-y-1">
                    <div className="text-[10px] text-white/40 uppercase tracking-widest">إشارة النبض الأساسية (ECG SIGNALS)</div>
                    <div className="text-xl font-black text-red-500 animate-pulse font-sans flex items-center justify-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                      00 BPM
                    </div>
                  </div>
                  
                  {/* Flatline flat neon line simulator */}
                  <div className="w-full h-10 flex items-center justify-center relative">
                    <div className="absolute inset-x-0 h-[2px] bg-red-600/20" />
                    <div className="absolute inset-x-0 h-[2px] bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                    <span className="absolute right-4 text-[9px] text-red-400 font-sans">تسطح كهربائي (Asystole)</span>
                  </div>

                  {/* Time remaining counter */}
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 px-4 py-1.5 rounded-xl">
                    <span className="text-[10px] text-red-400 font-sans font-bold">الوقت المتبقي للإنعاش:</span>
                    <span className="text-base font-black text-red-400 font-sans animate-bounce">{defibrillatorTimeLeft}s</span>
                  </div>
                </div>

                {/* Tap charging system */}
                <div className="space-y-4 my-2 text-center">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] px-1 font-sans">
                      <span className="text-amber-400 font-bold">شحن مكثف الطاقة (CAPACITOR CHARGE)</span>
                      <span className="text-amber-400 font-bold">{defibrillatorCharge}%</span>
                    </div>
                    <div className="w-full h-4 bg-black/50 border border-white/5 rounded-full p-0.5 relative overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-150 bg-gradient-to-r from-amber-550 via-orange-500 to-yellow-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                        style={{ width: `${defibrillatorCharge}%` }}
                      />
                      {defibrillatorCharge === 100 && (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-black font-black uppercase tracking-widest animate-pulse">
                          ⚡ جاهز تماماً للصعق! CHARGED ⚡
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tapping trigger button to charge or shock */}
                  {defibrillatorCharge < 100 ? (
                    <button
                      onClick={handleDefibrillatorChargeClick}
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black py-4 px-6 rounded-2xl flex flex-col items-center justify-center gap-1 outline-none border border-amber-400/30 active:scale-95 transition-all text-sm font-sans shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-pulse cursor-pointer"
                    >
                      <span className="text-sm font-bold flex items-center gap-1">⚡ اضغط بشكل متكرر وسريع للشحن! ⚡</span>
                      <span className="text-[10px] opacity-75 font-normal">[ TAP / CLICK REPEATEDLY TO CHARGE ]</span>
                    </button>
                  ) : (
                    <div className="space-y-3.5 bg-amber-500/5 p-4 rounded-2xl border border-amber-500/20">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-amber-400/70 mb-1 font-sans px-1">
                          <span>إشارة المزامنة التناغمية</span>
                          <span className="font-bold">المعدل الحرج: 40% - 60%</span>
                        </div>
                        {/* Sliding sync bar game */}
                        <div className="w-full h-6 bg-black/50 rounded-lg p-0.5 relative overflow-hidden border border-white/10">
                          {/* Sweet target zone in center (40% to 60%) */}
                          <div className="absolute inset-y-0 left-[40%] right-[40%] bg-gradient-to-r from-emerald-500 to-green-400 opacity-30 border-x border-emerald-400/50 animate-pulse" />
                          <div className="absolute inset-y-0 left-[45%] right-[45%] bg-emerald-450 opacity-20 flex items-center justify-center text-[8px] text-emerald-400 font-bold">
                            SYNC
                          </div>

                          {/* Moving indicator */}
                          <div 
                            className="absolute top-0 bottom-0 w-1.5 bg-yellow-400 shadow-[0_0_12px_#facc15] transition-all duration-10 cursor-default"
                            style={{ left: `${defibrillatorSlider}%` }}
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleDefibrillatorShockClick}
                        className="w-full bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-black font-black py-4 px-6 rounded-2xl flex flex-col items-center justify-center gap-0.5 outline-none border border-emerald-400/30 active:scale-95 transition-all text-sm font-sans shadow-[0_0_25px_rgba(16,185,129,0.4)] animate-pulse cursor-pointer"
                      >
                        <span className="text-base font-black flex items-center gap-1.5">⚡ صعق الآن! ⚡ [ SHOCK NOW ]</span>
                        <span className="text-[9px] opacity-80 font-normal">[ TAP WHEN TARGET IS IN HIGHLIGHTED GREEN ZONE ]</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Footer warning */}
                <div className="text-center text-[9px] text-white/30 font-sans py-1 border-t border-white/5">
                  NABDAH EMERGENCY SYSTEM V1.0 • صدمات تزامنية إيقاعية
                </div>
              </div>
            )}
            

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
                      <span className={`font-mono font-bold text-xs py-0.5 px-2 rounded-md ${timeLeft <= 10 ? 'text-red-400 animate-pulse bg-red-550/10 border border-red-500/25' : 'text-amber-400 bg-amber-500/10 border border-amber-500/25'}`}>
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

                {gameMode === 'LIFESTYLE' && (
                  <div className="space-y-2 backdrop-blur-md bg-teal-500/5 p-3 rounded-2xl border border-teal-500/20 text-right animate-fade-in">
                    <div className="flex justify-between items-center text-[10px] font-mono px-1">
                      <span className="text-teal-400 font-bold uppercase tracking-wider flex items-center gap-1">
                        🥗 عدد المحاولات والأرواح (HEART LIVES)
                      </span>
                      <span className="text-teal-400 font-bold bg-teal-500/10 border border-teal-500/25 px-2 py-0.5 rounded-md">
                        {Math.ceil(heartHealth / 20)} / 5 أرواح
                      </span>
                    </div>
                    {/* Render Hearts */}
                    <div className="flex justify-end gap-1 text-sm">
                      {Array.from({ length: 5 }).map((_, index) => {
                        const scoreLife = Math.ceil(heartHealth / 20);
                        return (
                          <span key={index} className="transition-all duration-300">
                            {index < scoreLife ? '❤️' : '🖤'}
                          </span>
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-teal-400/80 leading-relaxed border-t border-teal-550/10 pt-1.5 mt-1">
                      <div>🚨 <strong className="text-rose-450">دمّر بالضرب المباشر:</strong> برجر 🍔، ملح 🧂، سجائر 🚬، توتر 😰، طاقة 🥤، غازات 🍹، شيشة 💨</div>
                      <div className="mt-0.5">⭐ <strong className="text-emerald-400">اترك للقلب لتغذيته:</strong> تفاحة 🍎، ماء 💧، بروكلي 🥦، شاي🍵</div>
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
            
            {/* Heart Safety Tip Badge */}
            <div className="w-full bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-2xl flex items-center justify-center gap-2 text-center animate-fade-in shadow-[0_0_15px_rgba(220,38,38,0.05)]">
              <span className="text-red-400 font-bold text-xs font-sans">💡 نصيحة لسلامة قلبك:</span>
              <span className="text-white font-bold text-xs font-sans">{currentHeartTip}</span>
            </div>
            
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
                 <div className="backdrop-blur-md bg-white/5 p-4 rounded-2xl border border-white/10 text-right space-y-3 shadow-inner">
                   <h4 className="text-[10px] uppercase tracking-widest text-[#f87171] font-bold border-b border-white/10 pb-1.5 font-mono flex justify-end items-center gap-1">
                     <span>• CLINICAL DIAGNOSIS REPORT</span>
                     <Activity className="w-3 h-3 text-[#f87171] animate-pulse" />
                   </h4>
                   
                   <div className="flex justify-between items-center text-xs pb-1 border-b border-white/[0.03]">
                     <span className="text-white/60">الاسم الرمزي للمسعف:</span>
                     <span className="font-bold text-white bg-white/5 px-2 py-0.5 rounded border border-white/5">{playerName || 'لاعب نبضة'}</span>
                   </div>
                   
                   <div className="flex justify-between items-center text-xs pb-1 border-b border-white/[0.03]">
                     <span className="text-white/60">إجمالي النقاط المسجلة:</span>
                     <span className="font-mono font-black text-red-500 text-base">{score} <span className="text-[10px] font-normal text-white/50">نقطة</span></span>
                   </div>
 
                   <div className="flex justify-between items-center text-xs pb-1 border-b border-white/[0.03]">
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
                        {item.gameMode === 'TIMED' ? '⏱️ تحدي' : item.gameMode === 'LIFESTYLE' ? '🥗 نمط الحياة' : item.gameMode === 'LEVELS' ? '🏆 مراحل' : '♾️ بقاء'}
                      </span>
                    </div>
                    <span className={`text-white/80 ${item.playerName === playerName ? 'font-bold text-red-400' : ''}`}>
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

            {/* Heart Safety Tip Badge */}
            <div className="w-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 rounded-2xl flex items-center justify-center gap-2 text-center animate-fade-in shadow-[0_0_15px_rgba(16,185,129,0.05)]">
              <span className="text-emerald-400 font-bold text-xs font-sans">💡 نصيحة لسلامة قلبك:</span>
              <span className="text-white font-bold text-xs font-sans">{currentHeartTip}</span>
            </div>

            {/* Victory card */}
            <div className={`p-5 backdrop-blur-md border rounded-3xl flex flex-col items-center gap-3.5 shadow-xl animate-fade-in text-center ${
              gameMode === 'LIFESTYLE' 
                ? 'bg-teal-500/10 border-teal-500/30 shadow-teal-500/5'
                : 'bg-emerald-500/10 border-emerald-500/30 shadow-emerald-500/5'
            }`}>
              <Trophy className={`w-12 h-12 animate-bounce ${gameMode === 'LIFESTYLE' ? 'text-teal-400' : 'text-emerald-400'}`} />
              <h3 className={`text-xl sm:text-2xl font-black font-display ${gameMode === 'LIFESTYLE' ? 'text-teal-400' : 'text-emerald-400'}`}>
                {gameMode === 'LIFESTYLE' ? 'اكتمل تحدي نمط الحياة والتطهير! 🥗' : 'اكتمل تطهير صمام القلب بنجاح! 🎉'}
              </h3>
              <p className="text-xs text-white/80 leading-relaxed px-2">
                {gameMode === 'LIFESTYLE' ? (
                  <>عمل صحّي وبطولي! لقد حميت القلب وعوضت العناصر المغذية وطهرت المريض من السلوكيات السيئة في المرحلة <span className="text-teal-400 font-bold font-mono text-base">{currentLevel}</span> ليركض قلبه بنبض مفعم بالصحة والنشاط.</>
                ) : (
                  <>عمل بطولي يا دكتور! لقد طهرت الأوعية الدموية بالكامل ونظّمت صمامات المريض في المرحلة <span className="text-emerald-400 font-bold font-mono text-base">{currentLevel}</span> ليركض قلبه بنبض سليم.</>
                )}
              </p>
            </div>

            {/* Stage statistics */}
            <div className="backdrop-blur-md bg-white/5 p-4 rounded-2xl border border-white/10 text-right space-y-3">
              <h4 className="text-[10px] uppercase tracking-widest text-white/40 font-bold border-b border-white/5 pb-1.5 font-sans">تقرير كفاءة إنقاذ المرحلة:</h4>
              
              <div className="flex justify-between items-center text-xs">
                <span className="text-white/60 font-sans">المرحلة المنجزة:</span>
                <span className={`font-bold font-mono ${gameMode === 'LIFESTYLE' ? 'text-teal-400' : 'text-emerald-400'}`}>
                  {gameMode === 'LIFESTYLE' ? `مرحلة عادات القلب ${currentLevel} من أصل 100` : `مرحلة الإنعاش الطبي ${currentLevel} من أصل 100`}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-xs">
                <span className="text-white/60">النقاط التي تجمعت:</span>
                <span className={`font-mono font-bold text-sm ${gameMode === 'LIFESTYLE' ? 'text-teal-400' : 'text-emerald-400'}`}>{score} نقطة</span>
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
              {currentLevel < 100 ? (
                <button
                  id="next-level-btn"
                  onClick={() => startGame(gameMode, currentLevel + 1)}
                  className={`w-full text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/10 active:scale-[0.98] transition-all cursor-pointer text-xs sm:text-sm font-display font-semibold ${
                    gameMode === 'LIFESTYLE'
                      ? 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:shadow-[0_0_15px_rgba(20,184,166,0.35)]'
                      : 'bg-gradient-to-r from-emerald-600 to-green-700 hover:shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                  }`}
                >
                  الذهاب إلى المرحلة التالية ({currentLevel + 1}) ⏩
                </button>
              ) : (
                <div className="py-2.5 px-4 bg-amber-500/10 border border-amber-500/35 text-amber-400 text-xs rounded-xl font-bold">
                  {gameMode === 'LIFESTYLE' ? (
                    "🎖️ أهلاً بك في صف الأصحّاء الأبرار! لقد أكملت جميع مراحل نمط الحياة الـ 100 بنجاح فائق وتغلبت على جميع السلوكيات والعادات السلبية الحيوية!"
                  ) : (
                    "🎖️ أهلاً بك في صف الرائد الإيقاعي! لقد أكملت جميع المراحل الـ 100 بنجاح فائق وتغلبت على جميع التحديات وطفرات الجراجة السيبرانية!"
                  )}
                </div>
              )}

              <button
                id="replay-level-btn"
                onClick={() => startGame(gameMode, currentLevel)}
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
                className="w-full bg-white/5 hover:bg-white/10 text-white/75 font-medium py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 outline-none border border-white/10 transition-all cursor-pointer text-xs"
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
