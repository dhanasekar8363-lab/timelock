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

  // type: "sparkle" | "heart" | "star"
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

/* ─────────────────────────────────────────────
   Helper — burst N particles
───────────────────────────────────────────── */
function makeBurst(n) {
  return Array.from({ length: n }, (_, i) => ({ id: Date.now() + i, type: "sparkle" }));
}
function makeHearts(n) {
  return Array.from({ length: n }, (_, i) => ({ id: Date.now() + i, type: "heart" }));
}
function makeStars(n) {
  return Array.from({ length: n }, (_, i) => ({ id: Date.now() + i, type: "star" }));
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
  const [tapped,      setTapped]      = useState(false);
  const [tooltip,     setTooltip]     = useState(null);
  const [particles,   setParticles]   = useState([]);

  /* ── Animation state for the image ── */
  // "idle" | "tap" | "bounce"
  const [animState,   setAnimState]   = useState("idle");

  /* ── Long-press timer ── */
  const longPressTimer = useRef(null);

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
     Tap handler — sparkles + jump
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

    // Jump animation
    setAnimState("tap");
    setTimeout(() => setAnimState("idle"), 500);

    // Sparkles
    setParticles(makeBurst(6));

    // Tooltip
    const msg = MESSAGES[tapCount.current % MESSAGES.length];
    tapCount.current += 1;
    setTooltip(msg);
    setTimeout(() => setTooltip(null), 2200);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─────────────────────────────────────────
     Public event API — capsule / message hooks
     Dispatch custom DOM events from anywhere in the app:
       window.dispatchEvent(new CustomEvent("lumi:capsule-created"))
       window.dispatchEvent(new CustomEvent("lumi:capsule-unlocked"))
       window.dispatchEvent(new CustomEvent("lumi:message-received"))
  ───────────────────────────────────────── */
  useEffect(() => {
    const onCapsuleCreated = () => {
      setParticles(makeHearts(7));
      setTooltip("Capsule sealed! 💜");
      setTimeout(() => setTooltip(null), 2200);
    };
    const onCapsuleUnlocked = () => {
      setParticles(makeStars(7));
      setAnimState("bounce");
      setTimeout(() => setAnimState("idle"), 800);
      setTooltip("Capsule unlocked! ⭐");
      setTimeout(() => setTooltip(null), 2200);
    };
    const onMessageReceived = () => {
      setAnimState("bounce");
      setTimeout(() => setAnimState("idle"), 800);
      setParticles(makeBurst(5));
      setTooltip("New message! 📬");
      setTimeout(() => setTooltip(null), 2200);
    };

    window.addEventListener("lumi:capsule-created",  onCapsuleCreated);
    window.addEventListener("lumi:capsule-unlocked", onCapsuleUnlocked);
    window.addEventListener("lumi:message-received", onMessageReceived);
    return () => {
      window.removeEventListener("lumi:capsule-created",  onCapsuleCreated);
      window.removeEventListener("lumi:capsule-unlocked", onCapsuleUnlocked);
      window.removeEventListener("lumi:message-received", onMessageReceived);
    };
  }, []);

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
