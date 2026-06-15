/**
 * PetPage.jsx — Lumi's Profile Page
 * Full pet dashboard for TimeLock's cosmic cat companion.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import lumi from "../assets/lumi.png";
import {
  usePet, MOODS, getLevel, getCurrentLevelXP, getNextLevelXP,
  FOOD_COOLDOWNS, GIFT_COOLDOWNS,
} from "../contexts/PetContext";
import "./PetPage.css";

/* ─────────────────────────────────────────────
   Constants & helpers
───────────────────────────────────────────── */
const STORAGE_KEY = "lumi_pet_data";

const DEFAULT_DATA = {
  level: 12,
  xp: 650,
  xpForNext: 1200,
  happiness: 78,
  interactions: 24,
  feedCount: 12,
  giftCount: 8,
  playtimeMin: 15,
  lastGiftDate: null,
  recentActivity: [
    { id: 1, icon: "🚀", label: "You created a capsule", xp: 50,  time: "2h ago"  },
    { id: 2, icon: "💌", label: "You sent a capsule",    xp: 80,  time: "5h ago"  },
    { id: 3, icon: "🍖", label: "You fed Lumi",          xp: 20,  time: "1d ago"  },
    { id: 4, icon: "🎁", label: "You received a gift",   xp: 30,  time: "1d ago"  },
  ],
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_DATA, ...JSON.parse(raw) };
  } catch (_) {}
  return { ...DEFAULT_DATA };
}

function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
}

/* ─────────────────────────────────────────────
   Food types for the Feed Lumi system
───────────────────────────────────────────── */
const FOOD_TYPES = [
  {
    id:         "snack",
    emoji:      "🍗",
    name:       "Snack",
    xp:         5,
    happiness:  2,
    desc:       "A little nibble",
    rarity:     "common",
  },
  {
    id:         "fish",
    emoji:      "🐟",
    name:       "Fish",
    xp:         15,
    happiness:  5,
    desc:       "Lumi's favourite",
    rarity:     "rare",
  },
  {
    id:         "premiumMeal",
    emoji:      "🍖",
    name:       "Premium Meal",
    xp:         30,
    happiness:  10,
    desc:       "A cosmic feast",
    rarity:     "legendary",
  },
];

/* ─────────────────────────────────────────────
   Gift types for the Gift Lumi system
───────────────────────────────────────────── */
const GIFT_TYPES = [
  {
    id:        "toy",
    emoji:     "🧶",
    name:      "Toy",
    xp:        20,
    happiness: 8,
    desc:      "A fun little toy",
    rarity:    "common",
    message:   "Lumi is playing with the toy! 🧶",
  },
  {
    id:        "crystal",
    emoji:     "💎",
    name:      "Crystal",
    xp:        40,
    happiness: 15,
    desc:      "Glows with cosmic energy",
    rarity:    "rare",
    message:   "Lumi loves the crystal! 💎",
  },
  {
    id:        "cosmicStar",
    emoji:     "🌟",
    name:      "Cosmic Star",
    xp:        75,
    happiness: 25,
    desc:      "A gift from the cosmos",
    rarity:    "legendary",
    message:   "Lumi is over the moon! 🌟",
  },
];

const MOOD_EMOJI = {
  happy:       "😊",
  excited:     "🚀",
  sleepy:      "😴",
  curious:     "👀",
  celebration: "🎉",
};

const MOOD_LABEL = {
  happy:       "Happy",
  excited:     "Excited",
  sleepy:      "Sleepy",
  curious:     "Curious",
  celebration: "Celebrating",
};

const MOOD_DESC = {
  happy:       "Lumi is feeling great today!",
  excited:     "Lumi is buzzing with energy!",
  sleepy:      "Lumi is taking a little nap…",
  curious:     "Lumi wonders what's coming next.",
  celebration: "Lumi is over the moon right now!",
};

/* XP milestones around current level — one behind, current, two ahead */
function getMilestones(level) {
  const prev1 = Math.max(1, level - 1);
  const next1 = level + 1;
  const next2 = level + 2;
  return [prev1, level, next1, next2];
}

/* Format remaining seconds as "Xm Ys remaining" or "Xh Ym remaining" */
function formatCooldown(totalSeconds) {
  if (totalSeconds <= 0) return "Ready";
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m ${seconds}s remaining`;
}

/* Circular progress SVG */
function CircleProgress({ pct }) {
  const r    = 44;
  const circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);

  return (
    <svg className="bond-ring-svg" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="bond-ring-track" />
      <circle
        cx="50" cy="50" r={r}
        className="bond-ring-fill"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Feed Menu — bottom-sheet food picker
───────────────────────────────────────────── */
function FeedMenu({ onSelect, onClose, getRemainingCooldown, isEating, isClosing }) {
  return (
    <div
      className={`pet-feed-overlay ${isClosing ? "pet-feed-overlay--closing" : ""}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose food for Lumi"
    >
      <div className={`pet-feed-sheet ${isClosing ? "pet-feed-sheet--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="pet-feed-sheet-handle" aria-hidden="true" />
        <p className="pet-feed-sheet-eyebrow">Time to eat! 🐱</p>
        <h2 className="pet-feed-title">What should Lumi eat?</h2>

        <div className="pet-food-grid">
          {FOOD_TYPES.map((food) => {
            const remaining = getRemainingCooldown(food.id);
            const onCooldown = remaining > 0;
            const disabled = onCooldown || isEating;
            return (
              <button
                key={food.id}
                className={`pet-food-btn pet-food-btn--${food.rarity} ${onCooldown ? "pet-food-btn--cooldown" : ""}`}
                onClick={(e) => !disabled && onSelect(food, e)}
                disabled={disabled}
              >
                <span className="pet-food-emoji" aria-hidden="true">{food.emoji}</span>
                <span className="pet-food-name">{food.name}</span>
                <span className="pet-food-desc">{food.desc}</span>
                <span className="pet-food-xp-badge">+{food.xp} XP</span>
                <span className="pet-food-happiness">+{food.happiness} 💜</span>
                <span className={`pet-food-cooldown-badge ${onCooldown ? "pet-food-cooldown-badge--active" : "pet-food-cooldown-badge--ready"}`}>
                  {formatCooldown(remaining)}
                </span>
              </button>
            );
          })}
        </div>

        <button className="pet-feed-cancel-btn" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Gift Menu — bottom-sheet gift picker
───────────────────────────────────────────── */
function GiftMenu({ onSelect, onClose, getRemainingCooldown }) {
  return (
    <div
      className="pet-feed-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a gift for Lumi"
    >
      <div className="pet-feed-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pet-feed-sheet-handle" aria-hidden="true" />
        <p className="pet-feed-sheet-eyebrow">Spoil Lumi! 🎁</p>
        <h2 className="pet-feed-title">Choose a gift for Lumi</h2>

        <div className="pet-food-grid">
          {GIFT_TYPES.map((gift) => {
            const remaining = getRemainingCooldown(gift.id);
            const onCooldown = remaining > 0;
            return (
              <button
                key={gift.id}
                className={`pet-food-btn pet-food-btn--${gift.rarity} ${onCooldown ? "pet-food-btn--cooldown" : ""}`}
                onClick={() => !onCooldown && onSelect(gift)}
                disabled={onCooldown}
              >
                <span className="pet-food-emoji" aria-hidden="true">{gift.emoji}</span>
                <span className="pet-food-name">{gift.name}</span>
                <span className="pet-food-desc">{gift.desc}</span>
                <span className="pet-food-xp-badge">+{gift.xp} XP</span>
                <span className="pet-food-happiness">+{gift.happiness} 💜</span>
                <span className={`pet-food-cooldown-badge ${onCooldown ? "pet-food-cooldown-badge--active" : "pet-food-cooldown-badge--ready"}`}>
                  {formatCooldown(remaining)}
                </span>
              </button>
            );
          })}
        </div>

        <button className="pet-feed-cancel-btn" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Gift Opening Modal — 3-stage animation
   shake (1.4 s) → open (0.8 s) → reveal
───────────────────────────────────────────── */
function GiftOpeningModal({ gift, onCollect }) {
  const [stage, setStage] = useState("shake");

  useEffect(() => {
    const t1 = setTimeout(() => setStage("open"),   1400);
    const t2 = setTimeout(() => setStage("reveal"), 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const SPARKLES = ["✨", "⭐", "💫", "🌟", "✨", "💜", "⭐", "💫"];

  return (
    <div className="pet-gift-overlay" role="dialog" aria-modal="true" aria-label="Gift opening">
      <div className="pet-gift-modal">

        {/* ── Stage: shake / open ── */}
        {stage !== "reveal" && (
          <div className="pet-gift-box-scene">
            <div className={`pet-gift-box-wrap pet-gift-box-wrap--${stage}`}>
              <span className="pet-gift-box-emoji" aria-hidden="true">
                {stage === "open" ? "✨" : "🎁"}
              </span>
            </div>
            <p className="pet-gift-stage-label">
              {stage === "shake" && "Lumi is opening the gift…"}
            </p>
            {/* Animated dots */}
            <div className="pet-gift-dots" aria-hidden="true">
              <span /><span /><span />
            </div>
          </div>
        )}

        {/* ── Stage: reveal ── */}
        {stage === "reveal" && (
          <div className="pet-gift-reveal">
            {/* Sparkle particles */}
            <div className="pet-gift-sparkles" aria-hidden="true">
              {SPARKLES.map((s, i) => (
                <span key={i} className={`pet-gift-sparkle pet-gift-sparkle--${i}`}>{s}</span>
              ))}
            </div>

            <div className="pet-gift-reveal-emoji">{gift.emoji}</div>
            <p className="pet-gift-reveal-eyebrow">Lumi received a gift!</p>
            <h2 className="pet-gift-reveal-name">{gift.name}</h2>
            <p className="pet-gift-reveal-desc">{gift.desc}</p>

            <div className="pet-gift-reward-row">
              <div className="pet-gift-reward-pill pet-gift-reward-pill--xp">
                +{gift.xp} XP
              </div>
              <div className="pet-gift-reward-pill pet-gift-reward-pill--happiness">
                +{gift.happiness} 💜
              </div>
            </div>

            <button className="pet-gift-collect-btn" onClick={onCollect}>
              Collect! 🎉
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Food reaction config — maps each food id to
   how Lumi reacts once the flying food lands
───────────────────────────────────────────── */
const FOOD_REACTIONS = {
  snack: {
    bounces: 1,
    glow: false,
    hearts: 4,
    sparkles: 0,
  },
  fish: {
    bounces: 2,
    glow: false,
    hearts: 8,
    sparkles: 0,
  },
  premiumMeal: {
    bounces: 1,
    glow: true,
    hearts: 8,
    sparkles: 6,
  },
};

/* ─────────────────────────────────────────────
   Reusable: Heart particle
   Floats upward and fades out from a center point
───────────────────────────────────────────── */
function HeartParticle({ index, total }) {
  // Spread hearts across an arc above Lumi
  const angle  = -90 + (index - (total - 1) / 2) * 22; // degrees, fan out around "up"
  const rad    = (angle * Math.PI) / 180;
  const dist   = 60 + (index % 3) * 20;
  const dx     = Math.cos(rad) * dist;
  const dy     = Math.sin(rad) * dist;
  const delay  = index * 0.06;
  const size   = 14 + (index % 3) * 6;

  return (
    <motion.span
      className="pet-reaction-heart"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        fontSize: `${size}px`,
        pointerEvents: "none",
        willChange: "transform, opacity",
      }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
      animate={{
        x: dx,
        y: dy - 30,
        opacity: [0, 1, 1, 0],
        scale: [0.4, 1, 1, 0.7],
      }}
      transition={{
        duration: 1.1,
        delay,
        ease: "easeOut",
        times: [0, 0.2, 0.7, 1],
      }}
    >
      💜
    </motion.span>
  );
}

/* ─────────────────────────────────────────────
   Reusable: Sparkle particle
   Pops and rotates outward, used for premium meals
───────────────────────────────────────────── */
function SparkleParticle({ index, total }) {
  const angle = (360 / total) * index;
  const rad   = (angle * Math.PI) / 180;
  const dist  = 50 + (index % 2) * 25;
  const dx    = Math.cos(rad) * dist;
  const dy    = Math.sin(rad) * dist;
  const delay = 0.15 + index * 0.05;
  const size  = 12 + (index % 3) * 5;

  return (
    <motion.span
      className="pet-reaction-sparkle"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        fontSize: `${size}px`,
        pointerEvents: "none",
        willChange: "transform, opacity",
      }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0, rotate: 0 }}
      animate={{
        x: dx,
        y: dy,
        opacity: [0, 1, 1, 0],
        scale: [0, 1.2, 1, 0.5],
        rotate: 180,
      }}
      transition={{
        duration: 0.9,
        delay,
        ease: "easeOut",
        times: [0, 0.3, 0.7, 1],
      }}
    >
      ✨
    </motion.span>
  );
}

/* Build a y-position keyframe sequence for N bounces: [0,-16,0, 0,-16,0, ...] */
function buildBounceFrames(bounces) {
  const count  = Math.max(1, bounces || 1);
  const frames = [];
  for (let i = 0; i < count; i++) frames.push(0, -16, 0);
  return frames;
}

/* ─────────────────────────────────────────────
   FloatingRewardLabels — shows "+N XP" and "+N ❤️"
   floating upward near Lumi after the reaction
   animation finishes. Auto-removed by parent.
───────────────────────────────────────────── */
function FloatingRewardLabels({ xp, happiness }) {
  return (
    <>
      {/* +XP label — floats up-right */}
      <motion.span
        className="pet-reward-float pet-reward-float--xp"
        style={{
          position: "absolute",
          left: "60%",
          top: "20%",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
        initial={{ opacity: 0, y: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 1, 0], y: -56, scale: [0.6, 1.1, 1, 0.9] }}
        transition={{ duration: 1.4, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
        exit={{ opacity: 0 }}
      >
        +{xp} XP
      </motion.span>

      {/* +❤️ label — floats up-left */}
      <motion.span
        className="pet-reward-float pet-reward-float--heart"
        style={{
          position: "absolute",
          right: "60%",
          top: "20%",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
        initial={{ opacity: 0, y: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 1, 0], y: -56, scale: [0.6, 1.1, 1, 0.9] }}
        transition={{ duration: 1.4, ease: "easeOut", delay: 0.12, times: [0, 0.15, 0.7, 1] }}
        exit={{ opacity: 0 }}
      >
        +{happiness} ❤️
      </motion.span>
    </>
  );
}

/* ─────────────────────────────────────────────
   Lumi Reaction layer — glow pulse + floating
   heart/sparkle particles, rendered as an
   absolutely-positioned overlay inside Lumi's
   image wrapper. Bounce is handled separately
   on the image's motion.div.
───────────────────────────────────────────── */
function LumiReaction({ reaction, fadingOut }) {
  if (!reaction) return null;

  const { glow, hearts, sparkles } = reaction;

  return (
    <motion.div
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      animate={{ opacity: fadingOut ? 0 : 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* Glow pulse for premium meals */}
      {glow && (
        <motion.div
          className="pet-reaction-glow"
          style={{
            position: "absolute",
            inset: "-12px",
            borderRadius: "50%",
            pointerEvents: "none",
            background: "radial-gradient(circle, rgba(255,223,128,0.55) 0%, rgba(255,223,128,0) 70%)",
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 1, 0], scale: [0.8, 1.25, 1] }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        />
      )}

      {/* Heart particles */}
      {Array.from({ length: hearts || 0 }).map((_, i) => (
        <HeartParticle key={`heart-${i}`} index={i} total={hearts} />
      ))}

      {/* Sparkle particles */}
      {Array.from({ length: sparkles || 0 }).map((_, i) => (
        <SparkleParticle key={`sparkle-${i}`} index={i} total={sparkles} />
      ))}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function PetPage() {
  const navigate  = useNavigate();
  const {
    mood, petXP, addXP, triggerCelebration, setMoodForPage,
    startCooldown, getRemainingCooldown, isCooldownActive,
  } = usePet();

  const [data, setData]                 = useState(loadData);

  /* Sound effects — created once, reused for all feed/gift actions */
  const feedSoundRef = useRef(null);
  const giftSoundRef = useRef(null);
  if (feedSoundRef.current === null) {
    feedSoundRef.current = new Audio("/sounds/lumi-feed.mp3");
  }
  if (giftSoundRef.current === null) {
    giftSoundRef.current = new Audio("/sounds/lumi-gift.mp3");
  }

  const [giftClaimed, setGiftClaimed]   = useState(false);
  const [feedFlash,   setFeedFlash]     = useState(false);
  const [giftFlash,   setGiftFlash]     = useState(false);
  const [showXpToast, setShowXpToast]   = useState(null);   // "+N XP"
  const [showFeedMenu, setShowFeedMenu] = useState(false);  // food picker open?
  const [feedSuccess,  setFeedSuccess]  = useState(null);   // { emoji, name, xp }
  const [showGiftMenu, setShowGiftMenu] = useState(false);  // gift picker open?
  const [giftOpening,  setGiftOpening]  = useState(null);   // gift being opened
  const [giftSuccess,  setGiftSuccess]  = useState(null);   // post-collect toast

  /* ── Flying food animation state ── */
  const [isEating,      setIsEating]      = useState(false); // blocks new food clicks during animation
  const [eatingFood,    setEatingFood]    = useState(null);   // the food object being animated
  const [foodAnimation, setFoodAnimation] = useState(null);   // { startX, startY, endX, endY }
  const [foodFadingOut, setFoodFadingOut] = useState(false);  // triggers fade-out on the flying food

  /* ── Food reaction state (plays after flying food lands) ── */
  const [activeReaction,    setActiveReaction]    = useState(null); // reaction config object
  const [reactionKey,        setReactionKey]       = useState(0);    // forces remount so animation replays
  const [particlesFadingOut, setParticlesFadingOut] = useState(false); // fades particles before clearing

  /* ── Floating reward labels (XP + happiness) shown after reaction ── */
  const [floatingRewards, setFloatingRewards] = useState([]); // [{ id, xp, happiness }]

  /* ── Success glow around Lumi after rewards applied ── */
  const [successGlow, setSuccessGlow] = useState(false);

  /* ── Feed menu closing state for smooth slide-down exit ── */
  const [feedMenuClosing, setFeedMenuClosing] = useState(false);

  const lumiImageRef = useRef(null); // ref to Lumi's avatar image, used as the animation target

  /* Ticks once per second so cooldown countdowns stay live */
  const [, setCooldownTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setCooldownTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  /* Check if daily gift already claimed today */
  useEffect(() => {
    try {
      const today = new Date().toDateString();
      const raw   = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.lastGiftDate === today) setGiftClaimed(true);
      }
    } catch (_) {}
  }, []);

  /* Set page mood on mount */
  useEffect(() => {
    setMoodForPage("happy");
  }, [setMoodForPage]);

  const awardXP = useCallback((amount) => {
    // 1. Update canonical PetContext XP — drives hero level + progress bar
    addXP(amount);

    // 2. Keep local `data` state in sync for stats display
    setData((prev) => {
      let xp        = prev.xp + amount;
      let level     = prev.level;
      let xpForNext = prev.xpForNext;

      while (xp >= xpForNext) {
        xp        -= xpForNext;
        level     += 1;
        xpForNext  = Math.round(xpForNext * 1.35);
      }
      const next = { ...prev, xp, level, xpForNext };
      saveData(next);
      return next;
    });

    setShowXpToast(`+${amount} XP`);
    setTimeout(() => setShowXpToast(null), 1800);
  }, [addXP]);

  /* ── Feed Lumi ──────────────────────────────
     Opens the food picker; actual feeding happens
     in handleFoodSelect once the player picks a food.
  ─────────────────────────────────────────── */
  /* Smoothly close the Feed menu: slide it down, then unmount */
  const closeFeedMenuSmooth = useCallback(() => {
    setFeedMenuClosing(true);
    setTimeout(() => {
      setShowFeedMenu(false);
      setFeedMenuClosing(false);
    }, 320);
  }, []);

  const handleFoodSelect = useCallback((food, event) => {
    if (isCooldownActive(food.id)) return;
    if (isEating) return; // block additional food clicks while animation is running

    // ── 1. Smoothly close the Feed Lumi modal ──────────────────────────
    closeFeedMenuSmooth();

    // Capture start position (the clicked food card) and end position (Lumi's avatar)
    const startEl = event?.currentTarget;
    const startRect = startEl ? startEl.getBoundingClientRect() : null;
    const endRect   = lumiImageRef.current ? lumiImageRef.current.getBoundingClientRect() : null;

    if (startRect && endRect) {
      setFoodAnimation({
        startX: startRect.left + startRect.width / 2,
        startY: startRect.top  + startRect.height / 2,
        endX:   endRect.left + endRect.width / 2,
        endY:   endRect.top  + endRect.height / 2,
      });
      setEatingFood(food);
      setIsEating(true);

      // ── 2. Flying food lands (~800ms) → fade it out, start reaction ──
      setTimeout(() => {
        // Fade out the flying food element before unmounting
        setFoodFadingOut(true);
        setTimeout(() => {
          setIsEating(false);
          setEatingFood(null);
          setFoodAnimation(null);
          setFoodFadingOut(false);
        }, 200);

        const reaction = FOOD_REACTIONS[food.id];
        if (reaction) {
          setActiveReaction(reaction);
          setReactionKey((k) => k + 1);

          // ── 3. Reaction plays (~1.5s) → fade particles, show success glow ──
          setTimeout(() => {
            // Fade out particles smoothly before clearing them
            setParticlesFadingOut(true);
            setTimeout(() => {
              setActiveReaction(null);
              setParticlesFadingOut(false);
            }, 300);

            // ── 4. Show purple success glow around Lumi ──────────────────
            setSuccessGlow(true);
            setTimeout(() => setSuccessGlow(false), 900);

            // ── 5. Show floating XP + happiness reward labels ─────────────
            const rewardId = Date.now();
            setFloatingRewards((prev) => [...prev, { id: rewardId, xp: food.xp, happiness: food.happiness }]);
            // Auto-remove after the float animation completes (~1.6s)
            setTimeout(() => {
              setFloatingRewards((prev) => prev.filter((r) => r.id !== rewardId));
            }, 1600);
          }, 1500);
        }
      }, 800);
    }

    // Play feed sound effect
    const feedSound = feedSoundRef.current;
    feedSound.currentTime = 0;
    feedSound.play().catch(() => {});

    // Start the cooldown immediately so the UI updates right away
    startCooldown(food.id, FOOD_COOLDOWNS[food.id]);

    // Flash animation on the action card
    setFeedFlash(true);
    setTimeout(() => setFeedFlash(false), 600);

    // Update stats + persist (happiness capped at 100)
    setData((prev) => {
      const newEntry = {
        id:    Date.now(),
        icon:  food.emoji,
        label: `You fed Lumi ${food.name}`,
        xp:    food.xp,
        time:  "Just now",
      };
      const next = {
        ...prev,
        feedCount:      prev.feedCount + 1,
        interactions:   prev.interactions + 1,
        happiness:      Math.min(100, prev.happiness + food.happiness),
        recentActivity: [newEntry, ...prev.recentActivity].slice(0, 10),
      };
      saveData(next);
      return next;
    });

    // Award XP to both local state and PetContext (updates level + progress bar)
    awardXP(food.xp);

    // Trigger celebration mood on Lumi
    triggerCelebration();

    // Success message (stays 2.5 s)
    setFeedSuccess(food);
    setTimeout(() => setFeedSuccess(null), 2500);
  }, [awardXP, triggerCelebration, startCooldown, isCooldownActive, isEating, closeFeedMenuSmooth]);

  /* ── Gift Lumi ─────────────────────────────
     1. User picks a gift  → opens the opening animation
     2. Animation completes → user taps Collect
     3. Stats saved to localStorage
  ─────────────────────────────────────────── */
  const handleGiftSelect = useCallback((gift) => {
    if (isCooldownActive(gift.id)) return;
    setShowGiftMenu(false);
    setGiftFlash(true);
    setTimeout(() => setGiftFlash(false), 600);

    // Play gift sound effect
    const giftSound = giftSoundRef.current;
    giftSound.currentTime = 0;
    giftSound.play().catch(() => {});

    // Start the cooldown immediately so the UI updates right away
    startCooldown(gift.id, GIFT_COOLDOWNS[gift.id]);

    // Store the chosen gift; modal will call handleGiftCollect
    setGiftOpening(gift);
  }, [startCooldown, isCooldownActive]);

  const handleGiftCollect = useCallback(() => {
    const gift = giftOpening;
    if (!gift) return;
    setGiftOpening(null);

    // Update stats + persist
    setData((prev) => {
      const newEntry = {
        id:    Date.now(),
        icon:  gift.emoji,
        label: `You gifted Lumi ${gift.name}`,
        xp:    gift.xp,
        time:  "Just now",
      };
      const next = {
        ...prev,
        giftCount:      prev.giftCount + 1,
        interactions:   prev.interactions + 1,
        happiness:      Math.min(100, prev.happiness + gift.happiness),
        recentActivity: [newEntry, ...prev.recentActivity].slice(0, 10),
      };
      saveData(next);
      return next;
    });

    awardXP(gift.xp);

    // Trigger celebration mood on Lumi
    triggerCelebration();

    // Success toast (2.5 s)
    setGiftSuccess(gift);
    setTimeout(() => setGiftSuccess(null), 2500);
  }, [giftOpening, awardXP, triggerCelebration]);

  /* Claim daily gift */
  const handleClaimGift = useCallback(() => {
    if (giftClaimed) return;
    setGiftClaimed(true);
    const today = new Date().toDateString();
    setData((prev) => {
      const next = {
        ...prev,
        lastGiftDate: today,
        interactions: prev.interactions + 1,
        happiness:    Math.min(100, prev.happiness + 8),
      };
      saveData(next);
      return next;
    });
    awardXP(50);
  }, [giftClaimed, awardXP]);

  // Derive level info from the canonical petXP stored in PetContext
  const lumiLevel     = getLevel(petXP);
  const lumiCurrentXP = getCurrentLevelXP(petXP);
  const lumiNextXP    = getNextLevelXP(petXP);
  const lumiXpPct     = lumiNextXP > 0 ? Math.min(100, Math.round((lumiCurrentXP / lumiNextXP) * 100)) : 100;
  const lumiXpToNext  = lumiNextXP - lumiCurrentXP;

  const milestones    = getMilestones(lumiLevel);
  const xpPct         = Math.round((data.xp / data.xpForNext) * 100);
  const moodLabel     = MOOD_LABEL[mood]  ?? "Happy";
  const moodEmoji     = MOOD_EMOJI[mood]  ?? "😊";
  const moodDesc      = MOOD_DESC[mood]   ?? "Lumi is feeling great today!";

  return (
    <div className="pet-page">

      {/* ── Flying food animation ── */}
      <AnimatePresence>
        {isEating && eatingFood && foodAnimation && (
          <motion.div
            className="pet-flying-food"
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              zIndex: 9999,
              pointerEvents: "none",
              fontSize: "2rem",
            }}
            initial={{
              x: foodAnimation.startX,
              y: foodAnimation.startY,
              opacity: 1,
              scale: 1,
            }}
            animate={{
              x: foodAnimation.endX,
              y: foodAnimation.endY,
              opacity: foodFadingOut ? 0 : 0,
              scale: foodFadingOut ? 0.6 : 1.4,
            }}
            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          >
            {eatingFood.emoji}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Gift picker overlay ── */}
      {showGiftMenu && (
        <GiftMenu
          onSelect={handleGiftSelect}
          onClose={() => setShowGiftMenu(false)}
          getRemainingCooldown={getRemainingCooldown}
        />
      )}

      {/* ── Gift opening animation ── */}
      {giftOpening && (
        <GiftOpeningModal
          gift={giftOpening}
          onCollect={handleGiftCollect}
        />
      )}

      {/* ── Gift success toast ── */}
      {giftSuccess && (
        <div className="pet-feed-success-toast pet-gift-success-toast" aria-live="polite">
          <span className="pet-feed-success-emoji">{giftSuccess.emoji}</span>
          <span className="pet-feed-success-text">
            {giftSuccess.message}
          </span>
        </div>
      )}

      {/* ── Food picker overlay ── */}
      {(showFeedMenu || feedMenuClosing) && (
        <FeedMenu
          onSelect={handleFoodSelect}
          onClose={closeFeedMenuSmooth}
          getRemainingCooldown={getRemainingCooldown}
          isEating={isEating}
          isClosing={feedMenuClosing}
        />
      )}

      {/* ── XP toast ── */}
      {showXpToast && (
        <div className="pet-xp-toast" aria-live="polite">{showXpToast}</div>
      )}

      {/* ── Feed success toast ── */}
      {feedSuccess && (
        <div className="pet-feed-success-toast" aria-live="polite">
          <span className="pet-feed-success-emoji">{feedSuccess.emoji}</span>
          <span className="pet-feed-success-text">
            Lumi loved the <strong>{feedSuccess.name}</strong>! 😻
          </span>
        </div>
      )}

      {/* ── Header ── */}
      <header className="pet-header">
        <button
          className="pet-header-btn"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <h1 className="pet-header-title">My Pet 🐾</h1>

        <button
          className="pet-header-btn"
          aria-label="Settings"
          onClick={() => navigate("/pet/settings")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      {/* ── Pet Hero ── */}
      <section className="pet-hero">
        <div className="pet-hero-image-wrap" style={{ position: "relative" }}>
          <div className="pet-hero-glow" />
          <div className="pet-hero-ring" />

          {/* Lumi's image — wrapped in motion.div so reactions can bounce it */}
          <motion.div
            key={reactionKey}
            animate={
              activeReaction
                ? { y: buildBounceFrames(activeReaction.bounces) }
                : { y: 0 }
            }
            transition={
              activeReaction
                ? {
                    duration: 0.35 * Math.max(1, activeReaction.bounces || 1),
                    ease: "easeOut",
                  }
                : { duration: 0 }
            }
          >
            <img ref={lumiImageRef} src={lumi} alt="Lumi the cosmic cat" className="pet-hero-image" />
          </motion.div>

          {/* ── Food reaction overlay: glow, hearts, sparkles ── */}
          <AnimatePresence>
            {activeReaction && (
              <LumiReaction key={`fx-${reactionKey}`} reaction={activeReaction} fadingOut={particlesFadingOut} />
            )}
          </AnimatePresence>

          {/* ── Success glow: purple magical ring that appears after rewards land ── */}
          <AnimatePresence>
            {successGlow && (
              <motion.div
                className="pet-success-glow"
                style={{
                  position: "absolute",
                  inset: "-20px",
                  borderRadius: "50%",
                  pointerEvents: "none",
                  zIndex: 10,
                }}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: [0, 1, 0.85, 0], scale: [0.7, 1.15, 1.25, 1.4] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut", times: [0, 0.25, 0.6, 1] }}
              />
            )}
          </AnimatePresence>

          {/* ── Floating reward labels: +XP and +❤️ after reaction ── */}
          <AnimatePresence>
            {floatingRewards.map((reward) => (
              <FloatingRewardLabels key={reward.id} xp={reward.xp} happiness={reward.happiness} />
            ))}
          </AnimatePresence>
        </div>

        <div className="pet-hero-info">
          <div className="pet-hero-name-row">
            <h2 className="pet-hero-name">Lumi</h2>
            <button className="pet-edit-btn" aria-label="Rename Lumi">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>

          <div className="pet-title-badge">
            <span className="pet-title-crown">👑</span>
            Time Guardian
          </div>

          <p className="pet-level-label">Level {lumiLevel}</p>

          <div className="pet-xp-bar-wrap">
            <div className="pet-xp-bar">
              <div
                className="pet-xp-bar-fill"
                style={{ width: `${lumiXpPct}%` }}
                role="progressbar"
                aria-valuenow={lumiCurrentXP}
                aria-valuemax={lumiNextXP}
                aria-label={`${lumiCurrentXP} of ${lumiNextXP} XP`}
              />
            </div>
            <div className="pet-xp-bar-labels">
              <span className="pet-xp-text">{lumiCurrentXP.toLocaleString()} / {lumiNextXP.toLocaleString()} XP</span>
              <span className="pet-xp-to-next">{lumiXpToNext.toLocaleString()} XP to next level</span>
            </div>
          </div>

          <p className="pet-hero-desc">
            Lumi protects your memories<br />and travels through time with you.
          </p>
        </div>

        {/* Mood card */}
        <div className="pet-mood-card">
          <div className="pet-mood-left">
            <span className="pet-mood-emoji">{moodEmoji}</span>
            <div>
              <p className="pet-mood-title">Mood: {moodLabel}</p>
              <p className="pet-mood-desc">{moodDesc}</p>
            </div>
          </div>
          <span className="pet-mood-chevron">›</span>
        </div>
      </section>

      {/* ── Action Cards ── */}
      <section className="pet-actions-grid">
        {/* Feed Lumi — opens the food picker */}
        <button
          className={`pet-action-card pet-action-feed ${feedFlash ? "pet-action-flash" : ""}`}
          onClick={() => setShowFeedMenu(true)}
          aria-haspopup="dialog"
        >
          <div className="pet-action-icon-wrap">
            <span className="pet-action-icon">🍽️</span>
            {data.feedCount > 0 && <span className="pet-action-badge" />}
          </div>
          <p className="pet-action-label">Feed Lumi</p>
          <p className="pet-action-sub">3 food types</p>
        </button>

        <button
          className={`pet-action-card pet-action-gift ${giftFlash ? "pet-action-flash" : ""}`}
          onClick={() => setShowGiftMenu(true)}
          aria-haspopup="dialog"
        >
          <div className="pet-action-icon-wrap">
            <span className="pet-action-icon">🎁</span>
            <span className="pet-action-badge" />
          </div>
          <p className="pet-action-label">Gift Lumi</p>
          <p className="pet-action-sub">3 gift tiers</p>
        </button>

        <button
          className="pet-action-card pet-action-stats"
          onClick={() => document.getElementById("pet-stats-section").scrollIntoView({ behavior: "smooth" })}
        >
          <span className="pet-action-icon">📊</span>
          <p className="pet-action-label">Stats</p>
          <p className="pet-action-sub">View progress</p>
        </button>

        <button
          className="pet-action-card pet-action-settings"
          onClick={() => navigate("/pet/settings")}
        >
          <span className="pet-action-icon">⚙️</span>
          <p className="pet-action-label">Settings</p>
          <p className="pet-action-sub">Pet preferences</p>
        </button>
      </section>

      {/* ── Bottom sections wrapper ── */}
      <div className="pet-sections">

        {/* Daily Gift + Level Progress */}
        <div className="pet-row-two">

          {/* Daily Gift */}
          <div className="pet-card pet-daily-gift">
            <div className="pet-card-header">
              <span className="pet-card-icon">🎁</span>
              <h3 className="pet-card-title">Daily Gift</h3>
            </div>
            <p className="pet-card-desc">
              Come back every day<br />for a special reward!
            </p>
            <div className="pet-daily-gift-visual" aria-hidden="true">✨🎁✨</div>
            <button
              className={`pet-claim-btn ${giftClaimed ? "pet-claim-btn--done" : ""}`}
              onClick={handleClaimGift}
              disabled={giftClaimed}
            >
              {giftClaimed ? "✓ Claimed!" : "Claim Gift"}
            </button>
          </div>

          {/* Level Progress */}
          <div className="pet-card pet-level-progress">
            <div className="pet-card-header">
              <span className="pet-card-icon">⭐</span>
              <h3 className="pet-card-title">Level Progress</h3>
            </div>

            <div className="pet-milestone-track">
              {milestones.map((lv, idx) => {
                const isPast    = lv < lumiLevel;
                const isCurrent = lv === lumiLevel;
                const isNext    = lv > lumiLevel;
                return (
                  <div key={lv} className="pet-milestone-item">
                    <div
                      className={`pet-milestone-node
                        ${isPast    ? "pet-milestone-node--done"    : ""}
                        ${isCurrent ? "pet-milestone-node--current" : ""}
                        ${isNext    ? "pet-milestone-node--locked"  : ""}
                      `}
                      aria-label={`Level ${lv}${isCurrent ? " (current)" : ""}`}
                    >
                      {isPast    ? "✓" : ""}
                      {isCurrent ? "🐱" : ""}
                      {isNext    ? "🔒" : ""}
                    </div>
                    <span className="pet-milestone-label">Lv. {lv}</span>
                    {idx < milestones.length - 1 && (
                      <div className={`pet-milestone-line ${isPast ? "pet-milestone-line--done" : ""}`} />
                    )}
                  </div>
                );
              })}
            </div>

            <p className="pet-level-hint">
              Keep earning XP by creating capsules,<br />sending messages and coming back daily!
            </p>
            <button className="pet-xp-guide-btn">
              How to Earn XP? ⭐
            </button>
          </div>
        </div>

        {/* Bond & Happiness + Recent Activity */}
        <div className="pet-row-two" id="pet-stats-section">

          {/* Bond & Happiness */}
          <div className="pet-card pet-bond">
            <div className="pet-card-header">
              <span className="pet-card-icon">💜</span>
              <h3 className="pet-card-title">Bond &amp; Happiness</h3>
              <button className="pet-info-btn" aria-label="More info">ℹ</button>
            </div>

            <div className="pet-bond-body">
              {/* Ring */}
              <div className="pet-bond-ring-wrap">
                <CircleProgress pct={data.happiness} />
                <div className="pet-bond-ring-inner">
                  <span className="pet-bond-heart">💜</span>
                  <p className="pet-bond-pct">{data.happiness}%</p>
                </div>
                <p className="pet-bond-label">Best Friends 💜</p>
              </div>

              {/* Stats list */}
              <ul className="pet-bond-stats">
                {[
                  { icon: "🤝", label: "Interactions", value: `${data.interactions} today` },
                  { icon: "🍽️", label: "Feed",         value: `${data.feedCount} times`   },
                  { icon: "🎁", label: "Gifts",         value: `${data.giftCount} times`   },
                  { icon: "⏱",  label: "Playtime",      value: `${data.playtimeMin} min`   },
                ].map((s) => (
                  <li key={s.label} className="pet-bond-stat-row">
                    <span className="pet-bond-stat-icon">{s.icon}</span>
                    <span className="pet-bond-stat-label">{s.label}</span>
                    <span className="pet-bond-stat-value">{s.value}</span>
                    <span className="pet-bond-stat-arrow">›</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="pet-card pet-activity">
            <div className="pet-card-header">
              <span className="pet-card-icon">🕐</span>
              <h3 className="pet-card-title">Recent Activity</h3>
              <button className="pet-view-all-btn">View all</button>
            </div>

            <ul className="pet-activity-list">
              {data.recentActivity.map((item) => (
                <li key={item.id} className="pet-activity-row">
                  <span className="pet-activity-icon">{item.icon}</span>
                  <span className="pet-activity-label">{item.label}</span>
                  <span className="pet-activity-xp">+{item.xp} XP</span>
                  <span className="pet-activity-time">{item.time}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>

      <div className="pet-bottom-spacer" />
    </div>
  );
}
