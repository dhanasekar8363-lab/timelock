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
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import "./PetCompanion.css";

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */
const STORAGE_KEY   = "lumi_position";
const HIDDEN_KEY    = "lumi_hidden";
const NAV_HEIGHT    = 68;   // px — keep Lumi above bottom nav
const PET_SIZE      = 72;   // px
const LONG_PRESS_MS = 600;  // ms to trigger menu

/* ─────────────────────────────────────────────
   Lumi SVG — cosmic purple cat
   Hand-crafted to match the reference image:
   big blue eyes, moon crescent on forehead,
   rounded body, fluffy tail, purple palette.
───────────────────────────────────────────── */
function LumiSVG({ blinking, expression }) {
  // eye height animation for blink
  const eyeRY = blinking ? 1 : 9;

  const mouthPath =
    expression === "happy"
      ? "M 26 38 Q 32 44 38 38"   // smile
      : expression === "surprised"
      ? "M 29 39 Q 32 43 35 39"   // small O
      : "M 27 39 Q 32 42 37 39";  // neutral

  return (
    <svg
      className="lumi-svg"
      viewBox="0 0 64 72"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Lumi the cosmic cat"
    >
      <defs>
        {/* Body gradient */}
        <radialGradient id="bodyGrad" cx="50%" cy="40%" r="55%">
          <stop offset="0%"   stopColor="#b47aff" />
          <stop offset="55%"  stopColor="#7b3fcf" />
          <stop offset="100%" stopColor="#4a1a9e" />
        </radialGradient>

        {/* Belly patch */}
        <radialGradient id="bellyGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#d4b0ff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#9c5ee8" stopOpacity="0" />
        </radialGradient>

        {/* Eye shine */}
        <radialGradient id="eyeGrad" cx="35%" cy="30%" r="60%">
          <stop offset="0%"   stopColor="#a8eaff" />
          <stop offset="50%"  stopColor="#3db8e8" />
          <stop offset="100%" stopColor="#1a6fa8" />
        </radialGradient>

        {/* Inner ear */}
        <radialGradient id="earGrad" cx="50%" cy="70%" r="60%">
          <stop offset="0%"   stopColor="#e8a0ff" />
          <stop offset="100%" stopColor="#b060e0" />
        </radialGradient>

        {/* Moon glow */}
        <radialGradient id="moonGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffe9a0" />
          <stop offset="100%" stopColor="#ffc940" />
        </radialGradient>

        {/* Soft glow filter */}
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Highlight filter */}
        <filter id="softHighlight">
          <feGaussianBlur stdDeviation="1" />
        </filter>
      </defs>

      {/* ── Tail (behind body) ── */}
      <path
        d="M 50 55 Q 68 48 64 62 Q 60 72 50 65 Z"
        fill="url(#bodyGrad)"
        opacity="0.95"
      />
      {/* Tail tip highlight */}
      <ellipse cx="60" cy="63" rx="5" ry="4" fill="#c090ff" opacity="0.35" />

      {/* ── Body ── */}
      <ellipse cx="32" cy="52" rx="20" ry="17" fill="url(#bodyGrad)" />

      {/* ── Belly highlight ── */}
      <ellipse cx="32" cy="54" rx="11" ry="9" fill="url(#bellyGrad)" />

      {/* ── Left ear ── */}
      <polygon points="12,22 8,6 20,16" fill="url(#bodyGrad)" />
      <polygon points="13,21 10,9  19,17" fill="url(#earGrad)" />

      {/* ── Right ear ── */}
      <polygon points="52,22 56,6 44,16" fill="url(#bodyGrad)" />
      <polygon points="51,21 54,9 45,17" fill="url(#earGrad)" />

      {/* ── Head ── */}
      <ellipse cx="32" cy="28" rx="20" ry="18" fill="url(#bodyGrad)" />

      {/* ── Head top highlight ── */}
      <ellipse cx="28" cy="18" rx="10" ry="7" fill="#c8a0ff" opacity="0.3" />

      {/* ── Left eye socket ── */}
      <ellipse cx="23" cy="28" rx="7" ry="7.5" fill="#1a0840" />
      {/* Left eye iris */}
      <ellipse cx="23" cy="28" rx="6" ry={eyeRY} fill="url(#eyeGrad)" />
      {/* Left pupil */}
      <ellipse cx="23" cy="28" rx="3" ry={blinking ? 0.5 : 4.5} fill="#0b1e38" />
      {/* Left eye shine */}
      <circle cx="25" cy="25" r="1.8" fill="white" opacity="0.9" />
      <circle cx="21" cy="30" r="0.9" fill="white" opacity="0.5" />

      {/* ── Right eye socket ── */}
      <ellipse cx="41" cy="28" rx="7" ry="7.5" fill="#1a0840" />
      {/* Right eye iris */}
      <ellipse cx="41" cy="28" rx="6" ry={eyeRY} fill="url(#eyeGrad)" />
      {/* Right pupil */}
      <ellipse cx="41" cy="28" rx="3" ry={blinking ? 0.5 : 4.5} fill="#0b1e38" />
      {/* Right eye shine */}
      <circle cx="43" cy="25" r="1.8" fill="white" opacity="0.9" />
      <circle cx="39" cy="30" r="0.9" fill="white" opacity="0.5" />

      {/* ── Nose ── */}
      <path d="M 30.5 34 L 32 36 L 33.5 34 Z" fill="#e080c0" />

      {/* ── Mouth ── */}
      <path d={mouthPath} stroke="#c060a8" strokeWidth="1.4" fill="none" strokeLinecap="round" />

      {/* ── Whiskers left ── */}
      <line x1="5"  y1="32" x2="22" y2="33" stroke="#d0a8ff" strokeWidth="0.8" opacity="0.7" strokeLinecap="round" />
      <line x1="6"  y1="36" x2="22" y2="35" stroke="#d0a8ff" strokeWidth="0.8" opacity="0.6" strokeLinecap="round" />
      <line x1="7"  y1="29" x2="22" y2="31" stroke="#d0a8ff" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />

      {/* ── Whiskers right ── */}
      <line x1="59" y1="32" x2="42" y2="33" stroke="#d0a8ff" strokeWidth="0.8" opacity="0.7" strokeLinecap="round" />
      <line x1="58" y1="36" x2="42" y2="35" stroke="#d0a8ff" strokeWidth="0.8" opacity="0.6" strokeLinecap="round" />
      <line x1="57" y1="29" x2="42" y2="31" stroke="#d0a8ff" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />

      {/* ── Crescent moon on forehead ── */}
      <g filter="url(#glow)" transform="translate(28, 12)">
        {/* Outer circle of crescent */}
        <circle cx="4" cy="4" r="4.5" fill="url(#moonGrad)" />
        {/* Inner cutout to form crescent */}
        <circle cx="6.2" cy="3" r="3.5" fill="url(#bodyGrad)" />
        {/* Inner highlight */}
        <circle cx="2.5" cy="5.5" r="0.9" fill="#fff8d0" opacity="0.8" />
      </g>

      {/* ── Front paws ── */}
      <ellipse cx="23" cy="67" rx="6" ry="4" fill="url(#bodyGrad)" />
      <ellipse cx="41" cy="67" rx="6" ry="4" fill="url(#bodyGrad)" />
      {/* Paw toe lines */}
      <path d="M 20 67 Q 23 69 26 67" stroke="#9060c8" strokeWidth="0.8" fill="none" opacity="0.6" />
      <path d="M 38 67 Q 41 69 44 67" stroke="#9060c8" strokeWidth="0.8" fill="none" opacity="0.6" />

      {/* ── Tiny star particles (static decoration) ── */}
      <circle cx="6"  cy="14" r="1"   fill="#e0c0ff" opacity="0.6" />
      <circle cx="58" cy="10" r="0.8" fill="#e0c0ff" opacity="0.5" />
      <circle cx="55" cy="52" r="1"   fill="#c0a0ff" opacity="0.4" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Sparkle burst on tap
───────────────────────────────────────────── */
function SparkleParticle({ id, onDone }) {
  const angle  = Math.random() * 2 * Math.PI;
  const dist   = 20 + Math.random() * 22;
  const sx     = `${Math.cos(angle) * dist}px`;
  const sy     = `${Math.sin(angle) * dist}px`;

  useEffect(() => {
    const t = setTimeout(onDone, 750);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <span
      className="lumi-sparkle"
      style={{ "--sx": sx, "--sy": sy, left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}
    />
  );
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
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [blinking,    setBlinking]    = useState(false);
  const [tapped,      setTapped]      = useState(false);
  const [expression,  setExpression]  = useState("neutral");
  const [tooltip,     setTooltip]     = useState(null);
  const [sparkles,    setSparkles]    = useState([]);

  /* ── Long-press timer ── */
  const longPressTimer = useRef(null);

  /* ─────────────────────────────────────────
     Blink loop (random interval 3-7 s)
  ───────────────────────────────────────── */
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 3000 + Math.random() * 4000;
      return setTimeout(() => {
        setBlinking(true);
        setTimeout(() => setBlinking(false), 140);
        blinkRef.current = scheduleBlink();
      }, delay);
    };
    const blinkRef = { current: scheduleBlink() };
    return () => clearTimeout(blinkRef.current);
  }, []);

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
     Pointer drag handlers
  ───────────────────────────────────────── */
  const onPointerDown = useCallback((e) => {
    // Only left-click / touch
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

    // Long press → menu
    longPressTimer.current = setTimeout(() => {
      if (!hasMoved.current) {
        setMenuOpen(true);
        isDragging.current = false;
      }
    }, LONG_PRESS_MS);
  }, [pos]);

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current) return;

    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;

    if (!hasMoved.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      hasMoved.current = true;
      clearTimeout(longPressTimer.current);
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
    isDragging.current = false;

    if (!hasMoved.current) {
      // Tap
      handleTap();
    } else {
      // Drag ended → snap save
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
     Tap handler — sparkles + expression cycle
  ───────────────────────────────────────── */
  const tapCount = useRef(0);

  const MESSAGES = [
    "Meow! 🌙",
    "Don't forget to save your memories! ✨",
    "I'm watching over your capsules 🔮",
    "Time is precious… 💜",
    "You're doing great! ⭐",
  ];

  const handleTap = useCallback(() => {
    setTapped(true);
    setTimeout(() => setTapped(false), 300);

    // Sparkles
    const ids = Array.from({ length: 5 }, (_, i) => Date.now() + i);
    setSparkles(ids);

    // Expression
    setExpression("happy");
    setTimeout(() => setExpression("neutral"), 1200);

    // Tooltip
    const msg = MESSAGES[tapCount.current % MESSAGES.length];
    tapCount.current += 1;
    setTooltip(msg);
    setTimeout(() => setTooltip(null), 2200);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  };

  const breatheVariants = {
    animate: {
      scaleX: [1, 1.03, 1, 1.025, 1],
      scaleY: [1, 0.97, 1, 0.975, 1],
      transition: {
        duration: 3.6,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };

  const tapVariant = {
    scale: tapped ? [1, 1.22, 0.92, 1.08, 1] : 1,
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
      {/* ── Floating + breathing pet ── */}
      <motion.div variants={floatVariants} animate="animate">
        <motion.div
          className={`lumi-pet ${tapped ? "tapped" : ""}`}
          variants={breatheVariants}
          animate={{ ...breatheVariants.animate, ...tapVariant }}
        >
          {/* Aura ring */}
          <div className="lumi-aura" />

          {/* Cat SVG */}
          <LumiSVG blinking={blinking} expression={expression} />

          {/* Sparkles */}
          {sparkles.map((id) => (
            <SparkleParticle
              key={id}
              id={id}
              onDone={() => setSparkles((s) => s.filter((x) => x !== id))}
            />
          ))}
        </motion.div>
      </motion.div>

      {/* ── Tooltip ── */}
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
