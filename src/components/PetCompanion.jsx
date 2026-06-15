/**
 * PetCompanion.jsx — Lumi the Cosmic Cat 🐱✨
 *
 * Drop-in floating pet companion for TimeLock.
 * Inject once in main.jsx (or App.jsx Layout) — appears on every page.
 *
 * Dependencies: framer-motion  (already common in Vite/React projects)
 * No other external deps required.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import lumi from "../assets/lumi.png";
import { usePet } from "../contexts/PetContext";
import "./PetCompanion.css";

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */
const STORAGE_KEY      = "lumi_position";
const HIDDEN_KEY       = "lumi_hidden";
const NAV_HEIGHT       = 68;    // px — keep Lumi above bottom nav
const PET_SIZE         = 72;    // px
const LONG_PRESS_MS    = 600;   // ms to trigger menu
const LONG_PRESS_SOUND_MS = 800; // ms to trigger purr sound on long-press
const SLEEP_TIMEOUT_MS = 60000; // 60 s of no interaction → sleep mode
const SPEECH_MIN_MS    = 120000; // 2 min
const SPEECH_MAX_MS    = 180000; // 3 min
const SPEECH_SHOW_MS   = 5000;  // bubble visible for 5 s

/* ─────────────────────────────────────────────
   Sound effects
───────────────────────────────────────────── */
const SOUND_TAP   = "/sounds/lumi-tap.mp3";
tapSound.volume = 0.25;
const SOUND_PURR  = "/sounds/lumi-purr.mp3";
const SOUND_SPARK = "/sounds/lumi-spark.mp3";
const SPARK_SOUND_CHANCE = 0.3; // 30% chance to also play the spark sound on tap

/* ─────────────────────────────────────────────
   Random speech messages
───────────────────────────────────────────── */
const RANDOM_SPEECHES = [
  "Hi Dhana! ✨",
  "Create a capsule! 📦",
  "I'm protecting memories 💜",
  "Someone may send you a capsule 👀",
  "Time is precious… 🌙",
  "Your memories are safe with me 🔮",
  "Don't forget to look back! ⭐",
];

/* ─────────────────────────────────────────────
   Lumi PNG image
───────────────────────────────────────────── */
function LumiImage({ animState }) {
  return (
    <img
      src={lumi}
      alt="Lumi the cosmic cat"
      className={`lumi-image lumi-image--${animState}`}
      draggable={false}
    />
  );
}

/* ─────────────────────────────────────────────
   Floating heart — rises and fades out
───────────────────────────────────────────── */
function FloatingHeart({ id, onDone }) {
  const offsetX = (Math.random() - 0.5) * 40; // spread horizontally

  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.span
      className="lumi-floating-heart"
      style={{ left: `calc(50% + ${offsetX}px)` }}
      initial={{ opacity: 1, y: 0, scale: 0.6 }}
      animate={{ opacity: 0, y: -52, scale: 1.2 }}
      transition={{ duration: 1.4, ease: "easeOut" }}
    >
      ❤️
    </motion.span>
  );
}

/* ─────────────────────────────────────────────
   Sleep ZZZ particle
───────────────────────────────────────────── */
function SleepZzz({ id, onDone }) {
  const offsetX = (Math.random() - 0.5) * 20;

  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.span
      className="lumi-zzz"
      style={{ left: `calc(50% + ${offsetX}px)` }}
      initial={{ opacity: 0.9, y: 0, scale: 0.7 }}
      animate={{ opacity: 0, y: -40, scale: 1.1 }}
      transition={{ duration: 2, ease: "easeOut" }}
    >
      z
    </motion.span>
  );
}

/* ─────────────────────────────────────────────
   Particle — generic, colour-configurable
───────────────────────────────────────────── */
function Particle({ id, type, onDone }) {
  const angle = Math.random() * 2 * Math.PI;
  const dist  = 20 + Math.random() * 28;
  const sx    = `${Math.cos(angle) * dist}px`;
  const sy    = `${Math.sin(angle) * dist}px`;

  useEffect(() => {
    const t = setTimeout(onDone, 750);
    return () => clearTimeout(t);
  }, [onDone]);

  const emoji = type === "heart" ? "💜" : type === "star" ? "⭐" : null;

  if (emoji) {
    return (
      <span
        className="lumi-sparkle lumi-sparkle--emoji"
        style={{ "--sx": sx, "--sy": sy, left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}
      >
        {emoji}
      </span>
    );
  }

  return (
    <span
      className="lumi-sparkle"
      style={{ "--sx": sx, "--sy": sy, left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}
    />
  );
}

function makeConfetti(n) {
  return Array.from({ length: n }, (_, i) => ({ id: Date.now() + i, type: "confetti" }));
}

/* ─────────────────────────────────────────────
   Confetti particle — pops out in random direction and colour
───────────────────────────────────────────── */
const CONFETTI_COLORS = ["#FF6B9D", "#FFD93D", "#6BCB77", "#4D96FF", "#C77DFF", "#FF9A3C"];

function ConfettiParticle({ id, onDone }) {
  const angle  = Math.random() * 2 * Math.PI;
  const dist   = 30 + Math.random() * 50;
  const color  = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
  const size   = 5 + Math.random() * 5;
  const rotate = Math.random() * 360;

  useEffect(() => {
    const t = setTimeout(onDone, 900);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: size,
        height: size * 0.55,
        borderRadius: 2,
        background: color,
        transformOrigin: "center",
        pointerEvents: "none",
        zIndex: 10,
      }}
      initial={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
      animate={{
        opacity: 0,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        rotate: rotate,
        scale: 0.4,
      }}
      transition={{ duration: 0.85, ease: "easeOut" }}
    />
  );
}


function makeBurst(n) {
  return Array.from({ length: n }, (_, i) => ({ id: Date.now() + i, type: "sparkle" }));
}
function makeHearts(n) {
  return Array.from({ length: n }, (_, i) => ({ id: Date.now() + i, type: "heart" }));
}
function makeStars(n) {
  return Array.from({ length: n }, (_, i) => ({ id: Date.now() + i, type: "star" }));
}
function makeFloatingHearts(n) {
  return Array.from({ length: n }, (_, i) => ({ id: Date.now() + i + 10000 }));
}
function makeZzzs(n) {
  return Array.from({ length: n }, (_, i) => ({ id: Date.now() + i + 20000 }));
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function PetCompanion() {
  /* ── Visibility ── */
  const [hidden, setHidden] = useState(
    () => localStorage.getItem(HIDDEN_KEY) === "true"
  );

  /* ── Position ── */
  const getInitialPos = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {
      x: window.innerWidth  - PET_SIZE - 16,
      y: window.innerHeight - PET_SIZE - NAV_HEIGHT - 16,
    };
  }, []);

  const [pos, setPos] = useState(getInitialPos);

  /* ── Drag state ── */
  const isDragging  = useRef(false);
  const dragStart   = useRef({ px: 0, py: 0, ex: 0, ey: 0 });
  const hasMoved    = useRef(false);
  const wrapperRef  = useRef(null);

  /* ── UI state ── */
  const [menuOpen,        setMenuOpen]        = useState(false);
  const [tapped,          setTapped]          = useState(false);
  const [tooltip,         setTooltip]         = useState(null);
  const [particles,       setParticles]       = useState([]);
  const [confetti,        setConfetti]        = useState([]);
  const [floatingHearts,  setFloatingHearts]  = useState([]);
  const [sleeping,        setSleeping]        = useState(false);
  const [zzzParticles,    setZzzParticles]    = useState([]);

  /* ── Animation state for the image ── */
  // "idle" | "tap" | "bounce"
  const [animState, setAnimState] = useState("idle");

  /* ── Pet context (capsule reactions) ── */
  const { activeEvent, clearPetEvent } = usePet();

  /* ── Long-press timer ── */
  const longPressTimer = useRef(null);
  const longPressSoundTimer = useRef(null);

  /* ── Sound effect refs ── */
  const tapSoundRef   = useRef(null);
  const purrSoundRef  = useRef(null);
  const sparkSoundRef = useRef(null);

  // Create Audio instances once on mount
  useEffect(() => {
    tapSoundRef.current   = new Audio(SOUND_TAP);
    purrSoundRef.current  = new Audio(SOUND_PURR);
    sparkSoundRef.current = new Audio(SOUND_SPARK);
  }, []);

  /* ─────────────────────────────────────────
     Play a sound effect from scratch.
     - Resets currentTime so sounds can overlap/retrigger.
     - Swallows autoplay-blocked / play() rejection errors.
  ───────────────────────────────────────── */
  const playSound = useCallback((audioRef) => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      audio.currentTime = 0;
    } catch (_) {
      // ignore — some browsers throw if media isn't ready yet
    }

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Autoplay blocked or interrupted — safe to ignore
      });
    }
  }, []);


  /* ── Sleep timer ── */
  const sleepTimer      = useRef(null);
  const zzzInterval     = useRef(null);
  const speechTimer     = useRef(null);
  const tooltipTimer    = useRef(null);

  /* ─────────────────────────────────────────
     Clamp helper — keep Lumi fully on screen
  ───────────────────────────────────────── */
  const clampPos = useCallback((x, y) => ({
    x: Math.max(0, Math.min(window.innerWidth  - PET_SIZE, x)),
    y: Math.max(0, Math.min(window.innerHeight - PET_SIZE - NAV_HEIGHT, y)),
  }), []);

  /* ─────────────────────────────────────────
     Persist position
  ───────────────────────────────────────── */
  const savePos = useCallback((p) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (_) {}
  }, []);

  /* ─────────────────────────────────────────
     Sleep mode helpers
  ───────────────────────────────────────── */
  const startZzzLoop = useCallback(() => {
    // Emit a new zzz particle every 1.2 s while sleeping
    zzzInterval.current = setInterval(() => {
      setZzzParticles((prev) => [
        ...prev,
        { id: Date.now() + Math.random() },
      ]);
    }, 1200);
  }, []);

  const stopZzzLoop = useCallback(() => {
    clearInterval(zzzInterval.current);
    setZzzParticles([]);
  }, []);

  const resetSleepTimer = useCallback(() => {
    if (sleeping) {
      setSleeping(false);
      stopZzzLoop();
    }
    clearTimeout(sleepTimer.current);
    sleepTimer.current = setTimeout(() => {
      setSleeping(true);
      startZzzLoop();
    }, SLEEP_TIMEOUT_MS);
  }, [sleeping, startZzzLoop, stopZzzLoop]);

  // Kick off sleep timer on mount
  useEffect(() => {
    resetSleepTimer();
    return () => {
      clearTimeout(sleepTimer.current);
      clearInterval(zzzInterval.current);
      clearTimeout(longPressSoundTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─────────────────────────────────────────
     Random speech bubble
  ───────────────────────────────────────── */
  const scheduleNextSpeech = useCallback(() => {
    clearTimeout(speechTimer.current);
    const delay = SPEECH_MIN_MS + Math.random() * (SPEECH_MAX_MS - SPEECH_MIN_MS);
    speechTimer.current = setTimeout(() => {
      const msg = RANDOM_SPEECHES[Math.floor(Math.random() * RANDOM_SPEECHES.length)];
      setTooltip(msg);
      clearTimeout(tooltipTimer.current);
      tooltipTimer.current = setTimeout(() => {
        setTooltip(null);
        scheduleNextSpeech();
      }, SPEECH_SHOW_MS);
    }, delay);
  }, []);

  useEffect(() => {
    scheduleNextSpeech();
    return () => {
      clearTimeout(speechTimer.current);
      clearTimeout(tooltipTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─────────────────────────────────────────
     Pointer drag handlers
  ───────────────────────────────────────── */
  const onPointerDown = useCallback((e) => {
    if (e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
    hasMoved.current   = false;

    dragStart.current = {
      px: e.clientX,
      py: e.clientY,
      ex: pos.x,
      ey: pos.y,
    };

    longPressTimer.current = setTimeout(() => {
      if (!hasMoved.current) {
        setMenuOpen(true);
        isDragging.current = false;
      }
    }, LONG_PRESS_MS);

    // Separate timer for the long-press purr sound (fires at 800ms)
    longPressSoundTimer.current = setTimeout(() => {
      if (!hasMoved.current) {
        playSound(purrSoundRef);
      }
    }, LONG_PRESS_SOUND_MS);

    resetSleepTimer();
  }, [pos, resetSleepTimer, playSound]);

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current) return;

    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;

    if (!hasMoved.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      hasMoved.current = true;
      clearTimeout(longPressTimer.current);
      clearTimeout(longPressSoundTimer.current);
      setMenuOpen(false);
    }

    if (hasMoved.current) {
      const next = clampPos(
        dragStart.current.ex + dx,
        dragStart.current.ey + dy,
      );
      setPos(next);
    }
  }, [clampPos]);

  const onPointerUp = useCallback((e) => {
    clearTimeout(longPressTimer.current);
    clearTimeout(longPressSoundTimer.current);
    isDragging.current = false;

    if (!hasMoved.current) {
      handleTap();
    } else {
      const dx = e.clientX - dragStart.current.px;
      const dy = e.clientY - dragStart.current.py;
      const next = clampPos(
        dragStart.current.ex + dx,
        dragStart.current.ey + dy,
      );
      setPos(next);
      savePos(next);
    }
  }, [clampPos, savePos]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─────────────────────────────────────────
     Tap handler — hearts + jump
  ───────────────────────────────────────── */
  const tapCount = useRef(0);

  const TAP_MESSAGES = [
    "Meow! 🌙",
    "Don't forget to save your memories! ✨",
    "I'm watching over your capsules 🔮",
    "Time is precious… 💜",
    "You're doing great! ⭐",
  ];

  const handleTap = useCallback(() => {
    resetSleepTimer();

    // Sound effects: tap always plays, spark plays 30% of the time
    playSound(tapSoundRef);
    if (Math.random() < SPARK_SOUND_CHANCE) {
      playSound(sparkSoundRef);
    }

    setTapped(true);
    setTimeout(() => setTapped(false), 300);

    // Jump animation
    setAnimState("tap");
    setTimeout(() => setAnimState("idle"), 500);

    // Sparkles + floating hearts
    setParticles(makeBurst(4));
    setFloatingHearts(makeFloatingHearts(4));

    // Tooltip (tap cycle)
    const msg = TAP_MESSAGES[tapCount.current % TAP_MESSAGES.length];
    tapCount.current += 1;
    clearTimeout(tooltipTimer.current);
    setTooltip(msg);
    tooltipTimer.current = setTimeout(() => setTooltip(null), 2200);
  }, [resetSleepTimer, playSound]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─────────────────────────────────────────
     Public event API — capsule / message hooks
  ───────────────────────────────────────── */
  useEffect(() => {
    const onCapsuleCreated = () => {
      resetSleepTimer();
      // Jump + confetti + speech
      setAnimState("tap");
      setTimeout(() => setAnimState("idle"), 500);
      setConfetti(makeConfetti(22));
      clearTimeout(tooltipTimer.current);
      setTooltip("Yay! New capsule created! 🎉");
      tooltipTimer.current = setTimeout(() => setTooltip(null), 3000);
    };
    const onCapsuleUnlocked = () => {
      resetSleepTimer();
      // Celebrate + sparkle burst
      setParticles([...makeStars(8), ...makeBurst(6)]);
      setAnimState("bounce");
      setTimeout(() => setAnimState("idle"), 800);
      clearTimeout(tooltipTimer.current);
      setTooltip("Capsule unlocked! ⭐");
      tooltipTimer.current = setTimeout(() => setTooltip(null), 2200);
    };
    const onMessageReceived = () => {
      resetSleepTimer();
      setAnimState("bounce");
      setTimeout(() => setAnimState("idle"), 800);
      setParticles(makeBurst(5));
      clearTimeout(tooltipTimer.current);
      setTooltip("New message! 📬");
      tooltipTimer.current = setTimeout(() => setTooltip(null), 2200);
    };

    window.addEventListener("lumi:capsule-created",  onCapsuleCreated);
    window.addEventListener("lumi:capsule-unlocked", onCapsuleUnlocked);
    window.addEventListener("lumi:message-received", onMessageReceived);
    return () => {
      window.removeEventListener("lumi:capsule-created",  onCapsuleCreated);
      window.removeEventListener("lumi:capsule-unlocked", onCapsuleUnlocked);
      window.removeEventListener("lumi:message-received", onMessageReceived);
    };
  }, [resetSleepTimer]);

  /* ─────────────────────────────────────────
     React to PetContext activeEvent
     (triggered via triggerPetEvent in app code)
  ───────────────────────────────────────── */
  useEffect(() => {
    if (!activeEvent) return;
    resetSleepTimer();

    const { type, effect, animation, message, duration } = activeEvent;

    // Animation
    if (animation === "jump" || animation === "celebrate") {
      setAnimState("tap");
      setTimeout(() => setAnimState("idle"), 500);
    } else if (animation === "bounce" || animation === "tailWag") {
      setAnimState("bounce");
      setTimeout(() => setAnimState("idle"), 900);
    }

    // Effect
    if (effect === "confetti") {
      setConfetti(makeConfetti(24));
    } else if (effect === "sparkleBurst") {
      setParticles([...makeStars(8), ...makeBurst(8)]);
    } else if (effect === "floatingHearts") {
      setFloatingHearts(makeFloatingHearts(6));
    } else if (effect === "heart") {
      setParticles(makeHearts(6));
    } else if (effect === "sparkle") {
      setParticles(makeBurst(6));
    }

    // Speech bubble
    if (message) {
      clearTimeout(tooltipTimer.current);
      setTooltip(message);
      tooltipTimer.current = setTimeout(() => setTooltip(null), duration ?? 3000);
    }

    // Clear the event from context after consuming it
    const clearId = setTimeout(clearPetEvent, duration ?? 3000);
    return () => clearTimeout(clearId);
  }, [activeEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─────────────────────────────────────────
     Hide / show
  ───────────────────────────────────────── */
  const toggleHidden = useCallback((val) => {
    const next = val ?? !hidden;
    setHidden(next);
    try { localStorage.setItem(HIDDEN_KEY, String(next)); } catch (_) {}
    setMenuOpen(false);
  }, [hidden]);

  /* ─────────────────────────────────────────
     Window resize — re-clamp
  ───────────────────────────────────────── */
  useEffect(() => {
    const onResize = () => {
      setPos((prev) => {
        const clamped = clampPos(prev.x, prev.y);
        savePos(clamped);
        return clamped;
      });
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [clampPos, savePos]);

  /* ─────────────────────────────────────────
     Close menu on outside click
  ───────────────────────────────────────── */
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  /* ─────────────────────────────────────────
     Render — restore button when hidden
  ───────────────────────────────────────── */
  if (hidden) {
    return (
      <motion.button
        className="lumi-restore-btn"
        onClick={() => toggleHidden(false)}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Show Lumi"
        title="Show Lumi"
      >
        🐱
      </motion.button>
    );
  }

  /* ─────────────────────────────────────────
     Framer Motion animation variants
  ───────────────────────────────────────── */
  const floatVariants = {
    animate: {
      y: [0, -7, 0, -4, 0],
      transition: {
        duration: 4.2,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
    sleep: {
      y: [0, -3, 0],
      transition: {
        duration: 5,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };

  const breatheVariants = {
    animate: {
      scale: [1, 1.05, 1, 1.03, 1],
      transition: {
        duration: 3.6,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
    sleep: {
      scale: [1, 1.02, 1],
      transition: {
        duration: 4.5,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };

  const tapVariant = {
    scale: tapped ? [1, 1.22, 0.92, 1.08, 1] : undefined,
    transition: { duration: 0.35 },
  };

  return (
    <div
      ref={wrapperRef}
      className="lumi-wrapper"
      style={{ left: pos.x, top: pos.y, width: PET_SIZE, height: PET_SIZE }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* ── Sleep ZZZ particles ── */}
      <AnimatePresence>
        {sleeping && zzzParticles.map((z) => (
          <SleepZzz
            key={z.id}
            id={z.id}
            onDone={() => setZzzParticles((s) => s.filter((x) => x.id !== z.id))}
          />
        ))}
      </AnimatePresence>

      {/* ── Sleep emoji ── */}
      <AnimatePresence>
        {sleeping && (
          <motion.div
            className="lumi-sleep-indicator"
            key="sleep-emoji"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.4 }}
          >
            
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating hearts (tap reaction) ── */}
      <AnimatePresence>
        {floatingHearts.map((h) => (
          <FloatingHeart
            key={h.id}
            id={h.id}
            onDone={() => setFloatingHearts((s) => s.filter((x) => x.id !== h.id))}
          />
        ))}
      </AnimatePresence>

      {/* ── Floating + breathing pet ── */}
      <motion.div
        variants={floatVariants}
        animate={sleeping ? "sleep" : "animate"}
      >
        <motion.div
          className={`lumi-pet ${tapped ? "tapped" : ""}`}
          variants={breatheVariants}
          animate={
            tapped
              ? { ...tapVariant }
              : sleeping
              ? breatheVariants.sleep
              : breatheVariants.animate
          }
        >
          {/* Aura ring */}
          <div className={`lumi-aura ${sleeping ? "lumi-aura--dim" : ""}`} />

          {/* Lumi PNG */}
          <LumiImage animState={animState} />

          {/* Particles */}
          {particles.map((p) => (
            <Particle
              key={p.id}
              id={p.id}
              type={p.type}
              onDone={() => setParticles((s) => s.filter((x) => x.id !== p.id))}
            />
          ))}

          {/* Confetti burst */}
          <AnimatePresence>
            {confetti.map((c) => (
              <ConfettiParticle
                key={c.id}
                id={c.id}
                onDone={() => setConfetti((s) => s.filter((x) => x.id !== c.id))}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* ── Tooltip / speech bubble ── */}
      <AnimatePresence>
        {tooltip && (
          <motion.div
            className="lumi-tooltip"
            key="tooltip"
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.9 }}
            transition={{ duration: 0.2 }}
          >
            {tooltip}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Long-press menu ── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="lumi-menu"
            key="menu"
            initial={{ opacity: 0, scale: 0.85, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 8 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
          >
            <button
              className="lumi-menu-item"
              onClick={() => { handleTap(); setMenuOpen(false); }}
            >
              <span className="lumi-menu-icon">✨</span>
              Pet Lumi
            </button>

            <div className="lumi-menu-divider" />

            <button
              className="lumi-menu-item"
              onClick={() => {
                const center = clampPos(
                  window.innerWidth  / 2 - PET_SIZE / 2,
                  window.innerHeight / 2 - PET_SIZE / 2,
                );
                setPos(center);
                savePos(center);
                setMenuOpen(false);
              }}
            >
              <span className="lumi-menu-icon">🎯</span>
              Centre Lumi
            </button>

            <button
              className="lumi-menu-item"
              onClick={() => {
                const corner = clampPos(
                  window.innerWidth  - PET_SIZE - 16,
                  window.innerHeight - PET_SIZE - NAV_HEIGHT - 16,
                );
                setPos(corner);
                savePos(corner);
                setMenuOpen(false);
              }}
            >
              <span className="lumi-menu-icon">↘</span>
              Reset position
            </button>

            <div className="lumi-menu-divider" />

            <button
              className="lumi-menu-item"
              onClick={() => toggleHidden(true)}
            >
              <span className="lumi-menu-icon">👁</span>
              Hide Lumi
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
