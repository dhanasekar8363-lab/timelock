import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import treeImg from "../assets/worldTree/tree.png";
import worldTreeBg from "../assets/worldTree/world-tree-bg.jpg";
import seedPioneerBadge from "../assets/badges/seed-pioneer.png";
import natureGuardianBadge from "../assets/badges/nature-guardian.png";
import treeKeeperBadge from "../assets/badges/tree-keeper.png";
import forestProtectorBadge from "../assets/badges/forest-protector.png";
import memoryGuardianBadge from "../assets/badges/memory-guardian.png";
import {
  supabase,
  getWorldTree,
  feedWorldTree,
  getRemainingFeedTime,
  getTopContributors,
  claimWorldTreeBadge,
  getClaimedWorldTreeBadges,
  getAllWorldTreeBadgeClaims,
  subscribeToWorldTreeBadges,
  subscribeToWorldTree,
  GROWTH_REWARDS,
  FEED_COOLDOWN_MS,
} from "../services/supabase";
import {
  getActiveStorm,
  calculateStormGrowth,
  getStormTimeLeft,
} from "../services/stormService";
import worldTreeBadges from "../data/worldTreeBadges";
import FloatingBadge from "../components/FloatingBadge";
import "./WorldTree.css";

// ── Constants ──────────────────────────────────────────────────────────────────
const GROWTH_PER_LEVEL = 1000;

const MOCK_COMMUNITY = {
  totalContributors: 3_241,
  totalGrowth:       128_450,
  treeAgeDays:       94,
};

// World Tree milestone badge progression — Level 5 / 10 / 15 / 20 / 25.
// Used to drive the dynamic "Next Reward" card.
const NEXT_REWARD_BADGES = [
  {
    level:        5,
    key:          "seed_pioneer",
    name:         "Seed Pioneer",
    description:  "Awarded when World Tree reaches Level 5",
    image:        seedPioneerBadge,
    fallbackIcon: "🌱",
  },
  {
    level:        10,
    key:          "nature_guardian",
    name:         "Nature Guardian",
    description:  "Awarded when World Tree reaches Level 10",
    image:        natureGuardianBadge,
    fallbackIcon: "🌿",
  },
  {
    level:        15,
    key:          "tree_keeper",
    name:         "Tree Keeper",
    description:  "Awarded when World Tree reaches Level 15",
    image:        treeKeeperBadge,
    fallbackIcon: "🌳",
  },
  {
    level:        20,
    key:          "forest_protector",
    name:         "Forest Protector",
    description:  "Awarded when World Tree reaches Level 20",
    image:        forestProtectorBadge,
    fallbackIcon: "🌲",
  },
  {
    level:        25,
    key:          "memory_guardian",
    name:         "Memory Guardian",
    description:  "Awarded when World Tree reaches Level 25",
    image:        memoryGuardianBadge,
    fallbackIcon: "🏆",
  },
];

// Full World Tree Rewards roster — same 5 milestone badges as
// NEXT_REWARD_BADGES, but with a short emoji + flavour line for the
// Rewards modal's badge grid. Kept as its own constant so the modal's
// copy can evolve independently from the "Next Reward" card's copy.
const REWARDS_BADGES = [
  {
    level:        5,
    name:         "Seed Pioneer",
    emoji:        "🌱",
    description:  "First guardian of the World Tree",
    image:        seedPioneerBadge,
    fallbackIcon: "🌱",
  },
  {
    level:        10,
    name:         "Nature Guardian",
    emoji:        "🌿",
    description:  "Sworn protector of growing things",
    image:        natureGuardianBadge,
    fallbackIcon: "🌿",
  },
  {
    level:        15,
    name:         "Tree Keeper",
    emoji:        "🌳",
    description:  "Trusted steward of the World Tree",
    image:        treeKeeperBadge,
    fallbackIcon: "🌳",
  },
  {
    level:        20,
    name:         "Forest Protector",
    emoji:        "🌲",
    description:  "Defender of the whole forest realm",
    image:        forestProtectorBadge,
    fallbackIcon: "🌲",
  },
  {
    level:        25,
    name:         "Memory Guardian",
    emoji:        "🏆",
    description:  "Keeper of every memory the tree holds",
    image:        memoryGuardianBadge,
    fallbackIcon: "🏆",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function calcLevel(growth) {
  return Math.floor(growth / GROWTH_PER_LEVEL) + 1;
}

function calcTier(level) {
  if (level >= 50) return "Ancient Elder";
  if (level >= 25) return "World Giant";
  if (level >= 10) return "Ancient Sprout";
  if (level >= 5)  return "Young Sapling";
  return "Tiny Seedling";
}

// Given the current level, find the next badge that hasn't been reached yet.
// A badge counts as "reached" once level >= badge.level (mirrors the
// eligibility check used for claiming). Once every badge has been reached,
// returns the final (highest-level) badge with allBadgesUnlocked: true.
function getNextReward(currentLevel, badges) {
  const sorted = [...badges].sort((a, b) => a.level - b.level);
  if (sorted.length === 0) return { badge: null, allBadgesUnlocked: false };
  const next = sorted.find((b) => currentLevel < b.level);
  if (next) return { badge: next, allBadgesUnlocked: false };
  return { badge: sorted[sorted.length - 1], allBadgesUnlocked: true };
}

// Finds the next not-yet-unlocked badge level for the Rewards modal's
// top progress section. Mirrors getNextReward's "reached" rule
// (currentLevel >= badge.level) but only needs the level number back.
function getNextRewardLevel(currentLevel, badges) {
  const sorted = [...badges].sort((a, b) => a.level - b.level);
  const next = sorted.find((b) => currentLevel < b.level);
  return next ? next.level : null; // null once every badge is unlocked
}

// Live countdown formatter — "2h 15m" / "45m" / "Available now"
function formatRemaining(ms) {
  if (ms <= 0) return null;
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

// ── Memory Storm display helpers ────────────────────────────────────────────
// Storm data is fetched and computed via stormService (getActiveStorm,
// calculateStormGrowth, getStormTimeLeft). Only the rate-per-second reader
// lives here — it's used solely for the banner's "+N Growth / Second" label.
function getStormRatePerSecond(storm) {
  if (!storm) return 0;
  // growth_per_second is the canonical column name (see stormService.js);
  // the extra fallbacks guard against minor schema variations.
  const rate =
    storm.growth_per_second ??
    storm.rate_per_second ??
    storm.growth_rate ??
    storm.rate ??
    0;
  return Number(rate) || 0;
}

// hh:mm:ss countdown formatter, matching the spec's "01:42:15 Remaining"
function formatStormCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ── Stable particles ───────────────────────────────────────────────────────────
const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  id:       i,
  left:     `${(i * 4.7 + 3) % 100}%`,
  top:      `${(i * 6.3 + 8) % 82}%`,
  size:     (i % 5) + 3,
  delay:    (i * 0.41) % 6,
  duration: (i % 4) + 4,
  symbol:   ["✨", "⭐", "🌟", "💫", "✦", "·"][i % 6],
}));

function Particles() {
  return (
    <div className="wt-particles" aria-hidden="true">
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className="wt-particle"
          style={{
            left:              p.left,
            top:               p.top,
            fontSize:          `${p.size}px`,
            animationDelay:    `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          {p.symbol}
        </span>
      ))}
    </div>
  );
}

// ── Storm particles — magical purple swirl, only rendered during a storm ──────
const STORM_PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  id:       i,
  left:     `${(i * 6.1 + 6) % 100}%`,
  top:      `${(i * 7.9 + 10) % 78}%`,
  size:     (i % 4) + 6,
  delay:    (i * 0.27) % 4,
  duration: (i % 3) + 2.5,
  dx:       `${((i % 5) - 2) * 14}px`,
  symbol:   ["✨", "🌀", "⚡", "💜"][i % 4],
}));

function StormParticles() {
  return (
    <div className="wt-storm-particles" aria-hidden="true">
      {STORM_PARTICLES.map((p) => (
        <span
          key={p.id}
          className="wt-storm-particle"
          style={{
            left:              p.left,
            top:               p.top,
            fontSize:          `${p.size}px`,
            animationDelay:    `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            "--storm-dx":      p.dx,
          }}
        >
          {p.symbol}
        </span>
      ))}
    </div>
  );
}

// ── Memory Storm event banner ──────────────────────────────────────────────────
function MemoryStormBanner({ ratePerSecond, msRemaining }) {
  return (
    <div className="wt-storm-banner storm-active" role="status" aria-live="polite">
      <div className="wt-storm-banner-glow" aria-hidden="true" />
      <p className="wt-storm-banner-title">
        <span className="wt-storm-banner-icon" aria-hidden="true">🌪</span>
        MEMORY STORM ACTIVE
      </p>
      <p className="wt-storm-banner-rate">+{ratePerSecond.toLocaleString()} Growth / Second</p>
      <p className="wt-storm-banner-countdown">
        {formatStormCountdown(msRemaining)} <span className="wt-storm-banner-remaining">Remaining</span>
      </p>
    </div>
  );
}

// ── Community / Storm / Total growth breakdown card ────────────────────────────
function StormGrowthCard({ communityGrowth, stormGrowth, totalGrowth, isStormActive }) {
  const roundedStorm = Math.round(stormGrowth);
  const roundedTotal = Math.round(totalGrowth);

  return (
    <div className={`wt-card wt-storm-stats-card ${isStormActive ? "storm-active" : ""}`}>
      <p className="wt-card-eyebrow">
        {isStormActive ? "🌪 Storm Growth" : "🌱 Growth Breakdown"}
      </p>
      <div className="wt-storm-stats-grid">
        <div className="wt-storm-stat">
          <span className="wt-storm-stat-label">Community Growth</span>
          <span className="wt-storm-stat-value">{communityGrowth.toLocaleString()}</span>
        </div>
        <div className={`wt-storm-stat ${isStormActive ? "wt-storm-stat--storm" : ""}`}>
          <span className="wt-storm-stat-label">Storm Growth</span>
          <span className="wt-storm-stat-value wt-storm-stat-value--storm">
            {roundedStorm.toLocaleString()}
          </span>
        </div>
        <div className="wt-storm-stat wt-storm-stat--total">
          <span className="wt-storm-stat-label">Total Growth</span>
          <span className="wt-storm-stat-value wt-storm-stat-value--total">
            {roundedTotal.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Floating +35 Growth toast ──────────────────────────────────────────────────
function FloatingGrowthToast({ amount, visible }) {
  return (
    <div className={`wt-float-toast ${visible ? "wt-float-toast--visible" : ""}`} aria-live="polite">
      +{amount} Growth 🌱
    </div>
  );
}

// ── Fade-in wrapper ────────────────────────────────────────────────────────────
function FadeCard({ children, className = "", delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`wt-fade-card ${visible ? "wt-fade-card--visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// ── Reward badge image (with graceful emoji fallback) ──────────────────────────
function RewardBadgeImage({ badge, locked }) {
  const [imgError, setImgError] = useState(false);

  if (!badge?.image || imgError) {
    return (
      <span className={`wt-reward-shield-icon ${locked ? "wt-reward-shield-icon--dim" : ""}`}>
        {badge?.fallbackIcon || "🏅"}
      </span>
    );
  }

  return (
    <img
      src={badge.image}
      alt={badge.name}
      className={`wt-reward-shield-img ${locked ? "wt-reward-shield-img--dim" : ""}`}
      onError={() => setImgError(true)}
    />
  );
}

// ── Rewards modal: badge artwork (with graceful emoji fallback) ────────────────
function RewardsCardImage({ badge, unlocked, large = false }) {
  const [imgError, setImgError] = useState(false);

  if (!badge.image || imgError) {
    return (
      <span
        className={`wt-rewards-img-icon ${large ? "wt-rewards-img-icon--large" : ""} ${unlocked ? "" : "wt-rewards-img-icon--dim"}`}
        style={large ? { fontSize: 72, lineHeight: 1, display: "block" } : undefined}
      >
        {badge.fallbackIcon}
      </span>
    );
  }

  return (
    <img
      src={badge.image}
      alt={badge.name}
      className={`wt-rewards-img ${large ? "wt-rewards-img--large" : ""} ${unlocked ? "" : "wt-rewards-img--dim"}`}
      onError={() => setImgError(true)}
    />
  );
}

// ── Rewards modal: single square MMORPG badge card ────────────────────────────
function RewardsBadgeCard({ badge, currentLevel, delay = 0 }) {
  const unlocked    = currentLevel >= badge.level;
  const progress    = Math.min(currentLevel, badge.level);
  const progressPct = Math.round((progress / badge.level) * 100);

  return (
    <div
      className={`wt-rwc ${unlocked ? "wt-rwc--unlocked" : "wt-rwc--locked"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Ambient glow behind badge */}
      <div className="wt-rwc-glow-ring" aria-hidden="true" />

      {/* Badge image */}
      <div className={`wt-rwc-img-wrap ${unlocked ? "wt-rwc-img-wrap--unlocked" : ""}`}>
        <RewardsCardImage badge={badge} unlocked={unlocked} large />
      </div>

      {/* Text body */}
      <div className="wt-rwc-body">
        <p className="wt-rwc-name">
          <span aria-hidden="true">{badge.emoji}</span> {badge.name}
        </p>
        <p className="wt-rwc-desc">{badge.description}</p>

        {/* Unlock level box */}
        <div className={`wt-rwc-level-box wt-rwc-level-box--lv${badge.level} ${unlocked ? "wt-rwc-level-box--unlocked" : ""}`}>
          <span className="wt-rwc-level-label">Unlocks at</span>
          <span className={`wt-rwc-level-num ${unlocked ? "wt-rwc-level-num--golden" : ""}`}>
            Level {badge.level}
          </span>
        </div>

        {/* Progress bar */}
        <div className="wt-rwc-progress">
          <div className="wt-rwc-progress-track">
            <div
              className={`wt-rwc-progress-fill ${unlocked ? "wt-rwc-progress-fill--unlocked" : ""}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="wt-rwc-progress-label">
            {progress} / {badge.level}
          </span>
        </div>
      </div>

      {/* Status pill */}
      <div className={`wt-rwc-status ${unlocked ? "wt-rwc-status--unlocked" : "wt-rwc-status--locked"}`}>
        {unlocked ? "✅ Unlocked" : "🔒 Locked"}
      </div>
    </div>
  );
}

// ── Rewards modal ─────────────────────────────────────────────────────────────
function RewardsModal({ level, badges, onClose }) {
  const nextLevel   = getNextRewardLevel(level, badges);
  const allUnlocked = nextLevel === null;
  const progressPct = allUnlocked
    ? 100
    : Math.max(0, Math.min(100, Math.round((level / nextLevel) * 100)));

  return (
    <div className="wt-modal-overlay" onClick={onClose}>
      <div className="wt-modal wt-modal--rewards" onClick={(e) => e.stopPropagation()}>
        <button className="wt-modal-close" onClick={onClose} aria-label="Close rewards">✕</button>
        <h2 className="wt-modal-title">🏆 World Tree Rewards</h2>

        {/* Progress section */}
        <div className="wt-rewards-progress-card">
          <div className="wt-rewards-progress-top">
            <span className="wt-rewards-progress-label">Current Tree Level</span>
            <span className="wt-rewards-progress-level">Level {level}</span>
          </div>
          <div className="wt-rewards-progress-track">
            <div className="wt-rewards-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="wt-rewards-progress-sub">
            {allUnlocked
              ? "🏆 All rewards unlocked!"
              : `Progress to next reward: Level ${level} / ${nextLevel}`}
          </p>
        </div>

        {/* Scrollable badge grid — 3 col desktop / 2 col mobile */}
        <div className="wt-rewards-grid">
          {badges.map((badge, i) => (
            <RewardsBadgeCard
              key={badge.level}
              badge={badge}
              currentLevel={level}
              delay={i * 80}
            />
          ))}
        </div>

        {/* Global limited-rewards info banner */}
        <div className="wt-rewards-info-banner">
          <span className="wt-rewards-info-star" aria-hidden="true">⭐</span>
          <div className="wt-rewards-info-text">
            <p className="wt-rewards-info-title">World Tree Rewards are global and limited.</p>
            <p className="wt-rewards-info-desc">
              When the World Tree reaches a milestone, a rare badge appears for everyone.<br />
              The first person to claim it keeps it forever, and it disappears for all others.
            </p>
          </div>
          <img
            src={treeImg}
            alt=""
            className="wt-rewards-info-tree-deco"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}

// ── Animated progress bar ──────────────────────────────────────────────────────
function AnimatedBar({ pct }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 120);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div className="wt-progress-track">
      <div className="wt-progress-fill" style={{ width: `${width}%` }}>
        {width > 12 && <span className="wt-progress-label">{pct}%</span>}
      </div>
    </div>
  );
}

// ── Animated growth number ─────────────────────────────────────────────────────
function AnimatedGrowthNum({ value, animate }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    if (!animate) { setDisplay(value); prevRef.current = value; return; }
    const start = prevRef.current;
    const end = value;
    const diff = end - start;
    if (diff === 0) return;
    const duration = 800;
    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(tick);
      else prevRef.current = end;
    };
    requestAnimationFrame(tick);
  }, [value, animate]);

  return <span className="wt-growth-current">{display.toLocaleString()}</span>;
}

// ── Feed Tree Button (redesigned as two-card layout) ──────────────────────────
function FeedSection({ userId, onFed, treeGlowing }) {
  const [ripple,      setRipple]      = useState(false);
  const [fed,         setFed]         = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [checking,    setChecking]    = useState(true);
  const [error,       setError]       = useState(null);
  const [nextFeedAt,  setNextFeedAt]  = useState(null);
  const [msRemaining, setMsRemaining] = useState(0);
  const [showToast,   setShowToast]   = useState(false);

  // 1. On mount, check the cooldown.
  useEffect(() => {
    if (!userId) { setChecking(false); setNextFeedAt(null); setMsRemaining(0); return; }
    let cancelled = false;
    setChecking(true);
    getRemainingFeedTime(userId).then(({ data }) => {
      if (cancelled) return;
      if (data && !data.canFeed && data.nextFeedAt) {
        setNextFeedAt(new Date(data.nextFeedAt));
        setMsRemaining(Math.max(0, (data.secondsRemaining || 0) * 1000));
      } else {
        setNextFeedAt(null);
        setMsRemaining(0);
      }
      setChecking(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // 2. Tick the countdown every second.
  useEffect(() => {
    if (!nextFeedAt) return;
    const tick = () => {
      const remaining = nextFeedAt.getTime() - Date.now();
      if (remaining <= 0) { setMsRemaining(0); setNextFeedAt(null); }
      else setMsRemaining(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextFeedAt]);

  const canFeed = !!userId && !checking && !loading && msRemaining <= 0;
  const remainingLabel = formatRemaining(msRemaining);

  const handleFeed = async () => {
    if (!userId) { setError("Log in to feed the World Tree."); return; }
    if (!canFeed) return;

    setError(null);
    setRipple(true);
    setTimeout(() => setRipple(false), 700);

    setLoading(true);
    const { data, error: feedError } = await feedWorldTree(userId);
    setLoading(false);

    if (feedError) { setError("Could not feed the tree. Try again."); return; }

    if (!data.fed) {
      if (data.nextFeedAt) {
        setNextFeedAt(new Date(data.nextFeedAt));
        setMsRemaining(Math.max(0, (data.secondsRemaining || 0) * 1000));
      }
      setError("You've already fed the tree recently.");
      return;
    }

    // Success
    setFed(true);
    setShowToast(true);
    setNextFeedAt(new Date(data.nextFeedAt));
    setMsRemaining(Math.max(0, (data.secondsRemaining || 0) * 1000) || FEED_COOLDOWN_MS);
    onFed(data.growth, GROWTH_REWARDS.FEED_TREE);
    setTimeout(() => setFed(false), 2200);
    setTimeout(() => setShowToast(false), 2400);
  };

  const onCooldown = msRemaining > 0;

  return (
    <div className="wt-feed-section">
      {/* Floating toast */}
      <FloatingGrowthToast amount={GROWTH_REWARDS.FEED_TREE} visible={showToast} />

      {/* Feed Tree card */}
      <div className={`wt-card wt-feed-card ${fed ? "wt-feed-card--fed" : ""} ${treeGlowing ? "wt-feed-card--glow" : ""}`}>
        <div className="wt-feed-card-inner">
          <div className="wt-feed-card-icon">🌳</div>
          <div className="wt-feed-card-info">
            <p className="wt-feed-card-label">Feed Tree</p>
            <p className="wt-feed-card-reward">+{GROWTH_REWARDS.FEED_TREE} Growth</p>
          </div>
          <button
            className={`wt-feed-btn ${ripple ? "wt-feed-btn--ripple" : ""} ${fed ? "wt-feed-btn--fed" : ""}`}
            onClick={handleFeed}
            disabled={loading || checking || !canFeed}
            aria-label="Feed the Tree"
          >
            <span className="wt-feed-glow" aria-hidden="true" />
            <span className="wt-feed-inner">
              {!userId ? "🔒 Log in" :
               checking ? "…" :
               loading  ? "🌿 Feeding…" :
               fed      ? "🌳 Fed!" :
               "🌱 Feed"}
            </span>
          </button>
        </div>
        {error && <p className="wt-feed-error">{error}</p>}
      </div>

      {/* Cooldown card */}
      {userId && (
        <div className={`wt-card wt-cooldown-card ${onCooldown ? "wt-cooldown-card--active" : "wt-cooldown-card--ready"}`}>
          <span className="wt-cooldown-icon">{onCooldown ? "⏳" : "✅"}</span>
          <div className="wt-cooldown-info">
            <p className="wt-cooldown-label">
              {onCooldown ? "Next Feed In" : "Ready to Feed!"}
            </p>
            {onCooldown ? (
              <p className="wt-cooldown-time">{remainingLabel}</p>
            ) : (
              <p className="wt-cooldown-sub">Tree is hungry 🌱</p>
            )}
          </div>
          {onCooldown && (
            <div className="wt-cooldown-progress-wrap">
              <div
                className="wt-cooldown-progress-fill"
                style={{ width: `${100 - Math.min(100, (msRemaining / FEED_COOLDOWN_MS) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

// ── Badge Claim Section ────────────────────────────────────────────
function BadgeClaimSection({ userId, level, claimedLevels, globalBadgeClaims, onClaimed }) {
  const eligibleBadges = worldTreeBadges.filter((b) => level >= b.level);
  if (eligibleBadges.length === 0) return null;

  return (
    <div className="wt-badge-claim-section">
      {eligibleBadges.map((badge) => {
        const isClaimed          = claimedLevels.has(badge.level);
        const globalClaim        = globalBadgeClaims.get(badge.level);
        const isGloballyClaimed  = !!globalClaim;
        const claimedBy          = globalClaim?.user_id ?? null;

        return (
          <BadgeClaimRow
            key={badge.level}
            badge={badge}
            userId={userId}
            isClaimed={isClaimed}
            isGloballyClaimed={isGloballyClaimed}
            claimedBy={claimedBy}
            onClaimed={onClaimed}
          />
        );
      })}
    </div>
  );
}

function BadgeClaimRow({ badge, userId, isClaimed, isGloballyClaimed, claimedBy, onClaimed }) {
  const [claiming,  setClaiming]  = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [error,     setError]     = useState(null);

  // Already taken globally — show who got it, disable for everyone
  const isTakenByOther = isGloballyClaimed && !isClaimed;
  const isDisabled     = isClaimed || isTakenByOther || claiming || !userId;

  const handleClaim = async () => {
    if (isDisabled) return;
    setError(null);
    setClaiming(true);
    const { error: claimError, alreadyClaimed } = await claimWorldTreeBadge(
      userId, badge.level, badge.name, badge.key,
    );
    setClaiming(false);
    if (claimError) { setError("Could not claim badge. Try again."); return; }
    if (alreadyClaimed) {
      setError("Someone else just claimed this badge!");
      return;
    }
    onClaimed(badge.level);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <div className={`wt-badge-row ${isClaimed ? "wt-badge-row--claimed" : isTakenByOther ? "wt-badge-row--taken" : "wt-badge-row--available"}`}>
      <div className={`wt-badge-toast ${showToast ? "wt-badge-toast--visible" : ""}`} aria-live="polite">
        🏅 You're the First Discoverer of {badge.name}!
      </div>
      <div className="wt-badge-img-wrap">
        {badge.image ? (
          <img src={badge.image} alt={badge.name} className={`wt-badge-img ${isTakenByOther ? "wt-badge-img--taken" : ""}`} />
        ) : (
          <span className="wt-badge-emoji">🏅</span>
        )}
        {isClaimed      && <span className="wt-badge-check" aria-label="Claimed">✓</span>}
        {isTakenByOther && <span className="wt-badge-taken-icon" aria-label="Claimed by another">🔒</span>}
      </div>
      <div className="wt-badge-info">
        <p className="wt-badge-name">{badge.name}</p>
        <p className="wt-badge-desc">{badge.description}</p>
        {isClaimed      && <p className="wt-badge-rarity">✦ First Discoverer</p>}
        {isTakenByOther && <p className="wt-badge-claimed-note">Claimed by another guardian</p>}
        {error && <p className="wt-badge-error">{error}</p>}
      </div>
      <button
        className={`wt-claim-btn ${isClaimed ? "wt-claim-btn--claimed" : isTakenByOther ? "wt-claim-btn--taken" : ""}`}
        onClick={handleClaim}
        disabled={isDisabled}
        aria-label={isClaimed ? `${badge.name} claimed by you` : isTakenByOther ? `${badge.name} already taken` : `Claim ${badge.name}`}
      >
        {!userId         ? "🔒 Log in"         :
         claiming        ? "Claiming…"          :
         isClaimed       ? "✓ You claimed it"   :
         isTakenByOther  ? "✗ Already taken"    :
                           "🏅 Claim Badge"}
      </button>
    </div>
  );
}

function WorldTree() {
  const navigate = useNavigate();

  const [userId,        setUserId]        = useState(null);
  const [growth,        setGrowth]        = useState(0);
  const [treeCreatedAt, setTreeCreatedAt] = useState(null);
  const [totalContributors, setTotalContributors] = useState(0);
  const [contributors,  setContributors]  = useState([]);
  const [myContrib,     setMyContrib]     = useState(0);
  const [dataLoading,   setDataLoading]   = useState(true);
  const [showContributors, setShowContributors] = useState(false);
  const [showHowItWorks,   setShowHowItWorks]   = useState(false);
  const [showRewards,      setShowRewards]      = useState(false);
  const [treeGlowing,   setTreeGlowing]   = useState(false);
  const [growthAnimating, setGrowthAnimating] = useState(false);
  const [claimedLevels,   setClaimedLevels]   = useState(() => new Set());
  const [globalBadgeClaims, setGlobalBadgeClaims] = useState(() => new Map());

  const level       = calcLevel(growth);
  const tier        = calcTier(level);
  const growthInLvl = growth % GROWTH_PER_LEVEL;
  const progressPct = Math.round((growthInLvl / GROWTH_PER_LEVEL) * 100);

  const { badge: nextBadge, allBadgesUnlocked } = getNextReward(level, NEXT_REWARD_BADGES);
  const rewardProgressPct = !nextBadge
    ? 0
    : allBadgesUnlocked
      ? 100
      : Math.max(0, Math.min(100, Math.round((level / nextBadge.level) * 100)));

  // ── Memory Storm state (powered by stormService) ──────────────────────────
  // activeStorm  – the current storm row from Supabase, or null
  // stormGrowth  – bonus growth accumulated so far this storm (whole number)
  // stormTimeLeft – seconds until the storm ends (0 when over / no storm)
  const [activeStorm,   setActiveStorm]   = useState(null);
  const [stormGrowth,   setStormGrowth]   = useState(0);
  const [stormTimeLeft, setStormTimeLeft] = useState(0);

  // Fetch the active storm on mount, then re-poll every 15 s.
  // This is kept completely separate from `loadData()` so the existing
  // reward / community-growth logic is never touched.
  useEffect(() => {
    const fetchStorm = async () => {
      const { data } = await getActiveStorm();
      setActiveStorm(data ?? null);
      if (data) {
        setStormGrowth(calculateStormGrowth(data));
        setStormTimeLeft(getStormTimeLeft(data));
      } else {
        setStormGrowth(0);
        setStormTimeLeft(0);
      }
    };
    fetchStorm();
    const pollId = setInterval(fetchStorm, 15_000);
    return () => clearInterval(pollId);
  }, []);

  // Tick stormGrowth and stormTimeLeft every second while a storm is active.
  // When the storm ends (timeLeft hits 0) the interval keeps running but both
  // helpers clamp at the storm boundary — no negative values, no drift.
  // The cleanup resets both counters so the breakdown card stays tidy.
  useEffect(() => {
    if (!activeStorm) {
      setStormGrowth(0);
      setStormTimeLeft(0);
      return;
    }
    const tickId = setInterval(() => {
      setStormGrowth(calculateStormGrowth(activeStorm));
      setStormTimeLeft(getStormTimeLeft(activeStorm));
    }, 1000);
    return () => clearInterval(tickId);
  }, [activeStorm]);

  // A storm is "visually active" only while time remains.
  // When it expires the banner hides automatically — no extra state needed.
  const isStormActive      = !!activeStorm && stormTimeLeft > 0;
  const stormRatePerSecond = getStormRatePerSecond(activeStorm);
  const totalGrowthLive    = growth + stormGrowth;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    const [treeRes, contribRes] = await Promise.all([
      getWorldTree(),
      getTopContributors(50),
    ]);
    if (treeRes.data) {
      setGrowth(treeRes.data.growth);
      setTreeCreatedAt(treeRes.data.created_at ?? null);
    }
    if (contribRes.data) {
      setContributors(contribRes.data.slice(0, 10));
      setTotalContributors(contribRes.data.length);
    }
    setDataLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load claimed badges whenever the user changes
  useEffect(() => {
    if (!userId) { setClaimedLevels(new Set()); return; }
    getClaimedWorldTreeBadges(userId).then(({ data }) => {
      if (data) setClaimedLevels(new Set(data.map((b) => b.badge_level)));
    });
  }, [userId]);

  // Load all global badge claims, then subscribe for real-time updates
  useEffect(() => {
    // Initial fetch
    getAllWorldTreeBadgeClaims().then(({ data }) => {
      if (data) {
        const map = new Map(data.map((row) => [row.badge_level, row]));
        setGlobalBadgeClaims(map);
      }
    });

    // Real-time subscription — fires instantly when any user claims a badge
    const unsubBadges = subscribeToWorldTreeBadges((newRow) => {
      setGlobalBadgeClaims((prev) => {
        const next = new Map(prev);
        next.set(newRow.badge_level, newRow);
        return next;
      });
    });

    // Real-time subscription — fires when world_tree growth updates
    const unsubTree = subscribeToWorldTree((row) => {
      setGrowth(row.growth);
    });

    return () => {
      unsubBadges();
      unsubTree();
    };
  }, []);

  useEffect(() => {
    if (!userId || contributors.length === 0) return;
    const me = contributors.find(c => c.user_id === userId);
    setMyContrib(me ? me.growth : myContrib);
  }, [contributors, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFed = useCallback(async (newGrowth, amountAdded) => {
    // Trigger animations
    setTreeGlowing(true);
    setGrowthAnimating(true);
    setTimeout(() => setTreeGlowing(false), 2500);
    setTimeout(() => setGrowthAnimating(false), 1000);

    setGrowth(newGrowth);
    setMyContrib(prev => prev + (amountAdded ?? GROWTH_REWARDS.FEED_TREE));
    const { data } = await getTopContributors(50);
    if (data) {
      setContributors(data.slice(0, 10));
      setTotalContributors(data.length);
    }
  }, []);

  const handleBadgeClaimed = useCallback((badgeLevel) => {
    setClaimedLevels((prev) => new Set([...prev, badgeLevel]));
  }, []);

  // Called by FloatingBadge when user clicks the floating collectible
  const handleClaimBadge = useCallback(async (badge) => {
    const result = await claimWorldTreeBadge(
      userId,
      badge.level,
      badge.name,
      badge.key,
    );

    if (result.claimed) {
      // Optimistically add to local claimed set
      setClaimedLevels((prev) => new Set([...prev, badge.level]));
      // The realtime subscription will also fire and update globalBadgeClaims
    }

    return result;
  }, [userId]);

  const myEntry = contributors.find(c => c.user_id === userId);

  // Determine which badge should be floating near the tree right now:
  //   — Tree must have reached the badge's level
  //   — Badge must NOT yet be claimed by anyone globally
  const floatingBadge = (() => {
    for (const badge of NEXT_REWARD_BADGES) {
      if (level >= badge.level && !globalBadgeClaims.has(badge.level)) {
        return badge; // Show the lowest available unclaimed badge
      }
    }
    return null;
  })();

  // Compute tree age in days from real created_at.
  // Returns null while data is loading or if created_at is missing.
  const treeAgeDays = treeCreatedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(treeCreatedAt).getTime()) / 86_400_000))
    : null;

  return (
    <div className={`wt-root ${isStormActive ? "storm-active" : ""}`}>
      <div className="wt-bg" style={{ backgroundImage: `url(${worldTreeBg})` }} />
      <div className="wt-bg-stars" aria-hidden="true" />
      <Particles />

      {/* ── Header ── */}
      <header className="wt-header">
        <button className="wt-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="wt-header-center">
          <h1 className="wt-title">
            <span className="wt-title-leaf">🌿</span>
            <span className="wt-title-world">World</span>{" "}
            <span className="wt-title-memory">Memory</span>{" "}
            <span className="wt-title-tree">Tree</span>{" "}
            <span className="wt-title-leaf">🌿</span>
          </h1>
          <p className="wt-subtitle">Grow together. Unlock memories. Earn forever.</p>
        </div>
        <button className="wt-help-btn" aria-label="Help" onClick={() => setShowHowItWorks(true)}>?</button>
      </header>

      {/* ── Memory Storm banner (above the tree) ── */}
      {isStormActive && (
        <MemoryStormBanner ratePerSecond={stormRatePerSecond} msRemaining={stormTimeLeft * 1000} />
      )}

      {/* ── Tree Hero ── */}
      <section className="wt-tree-section">
        <div className={`wt-tree-glow ${treeGlowing ? "wt-tree-glow--feeding" : ""} ${isStormActive ? "wt-tree-glow--storm" : ""}`} aria-hidden="true" />
        <div className={`wt-tree-glow wt-tree-glow--2 ${treeGlowing ? "wt-tree-glow--feeding" : ""} ${isStormActive ? "wt-tree-glow--storm" : ""}`} aria-hidden="true" />
        {isStormActive && <StormParticles />}
        <img
          src={treeImg}
          alt="World Memory Tree"
          className={`wt-tree-img ${treeGlowing ? "wt-tree-img--glow" : ""} ${isStormActive ? "wt-tree-img--storm" : ""}`}
        />

        {/* Floating legendary badge — only rendered when a milestone is
            available AND nobody has claimed it yet.
            Positions itself relative to the tree. */}
        {floatingBadge && !dataLoading && (
          <FloatingBadge
            badge={floatingBadge}
            userId={userId}
            onClaim={handleClaimBadge}
            visible={!globalBadgeClaims.has(floatingBadge.level)}
          />
        )}


        <div className="wt-level-badge">
          <span className="wt-level-label">Level</span>
          <span className="wt-level-number">{dataLoading ? "…" : level}</span>
          <span className="wt-level-tier">🌱 {dataLoading ? "Loading…" : tier}</span>
        </div>

        <div className="wt-side-actions">
          <button className="wt-side-btn" onClick={() => setShowHowItWorks(true)}>
            <span className="wt-side-icon">🌿</span>
            <span>How it<br/>works</span>
          </button>
          <button className="wt-side-btn" onClick={() => setShowRewards(true)}>
            <span className="wt-side-icon">🎁</span>
            <span>Rewards</span>
          </button>
          <button className="wt-side-btn" onClick={() => setShowContributors(true)}>
            <span className="wt-side-icon">👥</span>
            <span>Top<br/>Contributors</span>
          </button>
        </div>
      </section>

      {/* ── All Cards ── */}
      <div className="wt-cards">

        {/* 1 ── Global Growth Card */}
        <FadeCard delay={0}>
          <div className="wt-card">
            <p className="wt-card-eyebrow">🌱 Global Growth 🌱</p>
            <p className="wt-growth-nums">
              <AnimatedGrowthNum value={growthInLvl} animate={growthAnimating} />
              <span className="wt-growth-sep"> / </span>
              <span className="wt-growth-total">{GROWTH_PER_LEVEL.toLocaleString()}</span>
              <span className="wt-growth-unit"> Growth</span>
            </p>
            <AnimatedBar pct={progressPct} />
            <p className="wt-until-next">
              ✨ {(GROWTH_PER_LEVEL - growthInLvl).toLocaleString()} growth until{" "}
              <span className="wt-highlight">Level {level + 1}</span>
            </p>
          </div>
        </FadeCard>

        {/* 1b ── Storm Growth Breakdown (Community / Storm / Total) */}
        <FadeCard delay={30}>
          <StormGrowthCard
            communityGrowth={growth}
            stormGrowth={stormGrowth}
            totalGrowth={totalGrowthLive}
            isStormActive={isStormActive}
          />
        </FadeCard>

        {/* 2 ── Feed Tree + Cooldown cards */}
        <FadeCard delay={60}>
          <FeedSection userId={userId} onFed={handleFed} treeGlowing={treeGlowing} />
        </FadeCard>


        {/* 3 ── Badge Claim */}
        {!dataLoading && (
          <FadeCard delay={90}>
            <div className="wt-card">
              <p className="wt-card-eyebrow">🏅 Milestone Badges</p>
              <BadgeClaimSection
                userId={userId}
                level={level}
                claimedLevels={claimedLevels}
                globalBadgeClaims={globalBadgeClaims}
                onClaimed={handleBadgeClaimed}
              />
              {level < 5 && (
                <p className="wt-badge-hint">
                  🌱 Badges unlock when the tree reaches Level 5, 10, 15, 20, and 25.
                </p>
              )}
            </div>
          </FadeCard>
        )}

        {/* 4 ── Community Stats */}
        <FadeCard delay={120}>
          <div className="wt-card">
            <p className="wt-card-eyebrow">🌍 Community Stats</p>
            <div className="wt-stats-grid">
              <div className="wt-stat">
                <span className="wt-stat-icon">👥</span>
                <span className="wt-stat-value">
                  {dataLoading ? "…" : totalContributors > 0 ? totalContributors.toLocaleString() : MOCK_COMMUNITY.totalContributors.toLocaleString()}
                </span>
                <span className="wt-stat-label">Contributors</span>
              </div>
              <div className="wt-stat">
                <span className="wt-stat-icon">🌱</span>
                <span className="wt-stat-value">
                  {dataLoading ? "…" : growth.toLocaleString()}
                </span>
                <span className="wt-stat-label">Total Growth</span>
              </div>
              <div className="wt-stat">
                <span className="wt-stat-icon">🪾</span>
                <span className="wt-stat-value">
                  {dataLoading || treeAgeDays === null ? "…" : treeAgeDays}
                </span>
                <span className="wt-stat-label">Days Old</span>
              </div>
            </div>
          </div>
        </FadeCard>

        {/* 4 ── Contribution Section: My Contribution + Global Growth */}
        <FadeCard delay={120}>
          <div className="wt-card">
            <p className="wt-card-eyebrow">📊 Contributions</p>
            <div className="wt-contribution-grid">
              {/* My Total Contribution */}
              <div className="wt-contrib-stat-card wt-contrib-stat-card--mine">
                <div className="wt-contrib-stat-icon-wrap">
                  {myEntry?.avatar && myEntry.avatar.startsWith("http") ? (
                    <img src={myEntry.avatar} alt="You" className="wt-my-avatar-img" />
                  ) : (
                    <div className="wt-my-avatar">{myEntry?.avatar || "🌱"}</div>
                  )}
                </div>
                <p className="wt-contrib-stat-label">My Total Contribution</p>
                <p className="wt-contrib-stat-value">
                  {myContrib.toLocaleString()} <span className="wt-leaf">🌱</span>
                </p>
                {myContrib > 0 && <div className="wt-thank-you">Thank you! ✨</div>}
                {!userId && <p className="wt-contrib-login-hint">Log in to track</p>}
              </div>

              {/* Global Growth */}
              <div className="wt-contrib-stat-card wt-contrib-stat-card--global">
                <div className="wt-contrib-stat-icon-wrap">
                  <span className="wt-contrib-globe">🌍</span>
                </div>
                <p className="wt-contrib-stat-label">Global Growth</p>
                <p className="wt-contrib-stat-value wt-contrib-stat-value--global">
                  {growth >= 1000 ? `${(growth / 1000).toFixed(1)}k` : growth.toLocaleString()} <span className="wt-leaf">🌱</span>
                </p>
                <div className="wt-contrib-stat-sub">
                  <span>{totalContributors > 0 ? totalContributors.toLocaleString() : MOCK_COMMUNITY.totalContributors.toLocaleString()} contributors</span>
                </div>
              </div>
            </div>
          </div>
        </FadeCard>

        {/* 5 ── Top 10 Leaderboard */}
        <FadeCard delay={240}>
          <div className="wt-card">
            <div className="wt-contrib-header">
              <p className="wt-card-eyebrow" style={{ margin: 0 }}>
                🏆 Leaderboard <span className="wt-week">(All Time · Top 10)</span>
              </p>
              <button className="wt-arrow-btn" onClick={() => setShowContributors(true)}>›</button>
            </div>
            {dataLoading ? (
              <p className="wt-loading-hint">Loading leaderboard…</p>
            ) : contributors.length === 0 ? (
              <p className="wt-loading-hint">Be the first to feed the tree! 🌱</p>
            ) : (
              <ul className="wt-contrib-list wt-contrib-list--full">
                {contributors.slice(0, 10).map((c, i) => (
                  <li
                    key={c.user_id}
                    className={`wt-contrib-row wt-contrib-row--full ${c.user_id === userId ? "wt-contrib-row--me" : ""}`}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <span className="wt-rank">
                      {c.rank === 1 ? "🥇" : c.rank === 2 ? "🥈" : c.rank === 3 ? "🥉" : `#${c.rank}`}
                    </span>
                    <div className="wt-contrib-avatar-wrap">
                      {c.avatar && c.avatar.startsWith("http") ? (
                        <img src={c.avatar} alt={c.name} className="wt-contrib-avatar-img" />
                      ) : (
                        <span className="wt-contrib-avatar">{c.avatar || "🌱"}</span>
                      )}
                    </div>
                    <span className="wt-contrib-name">
                      {c.name}
                      {c.user_id === userId && <span className="wt-contrib-you-tag"> (You)</span>}
                    </span>
                    <div className="wt-contrib-right">
                      <span className="wt-contrib-score">{c.growth.toLocaleString()}</span>
                      <span className="wt-contrib-leaf">🌱</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FadeCard>

        {/* 6 ── Next Reward Card (dynamic) */}
        <FadeCard delay={300}>
          <div className="wt-card wt-card--reward-full">
            <div className="wt-reward-full-top">
              <p className="wt-card-eyebrow" style={{ margin: 0 }}>Next Reward ✨</p>
              <div className={`wt-reward-locked-badge ${allBadgesUnlocked ? "wt-reward-locked-badge--complete" : ""}`}>
                {allBadgesUnlocked ? "🏆 Completed" : "🔒 Locked"}
              </div>
            </div>

            {nextBadge && (
              <>
                <div className="wt-reward-full-body">
                  <div className={`wt-reward-shield ${allBadgesUnlocked ? "wt-reward-shield--complete" : ""}`}>
                    <div className="wt-reward-shield-glow" aria-hidden="true" />
                    <RewardBadgeImage badge={nextBadge} locked={!allBadgesUnlocked} />
                  </div>
                  <div className="wt-reward-full-info">
                    <p className="wt-reward-name">{nextBadge.name}</p>
                    <p className="wt-reward-desc">{nextBadge.description}</p>
                  </div>
                </div>

                <div className="wt-reward-progress-wrap">
                  <div className="wt-reward-progress-track">
                    <div
                      className="wt-reward-progress-fill"
                      style={{ width: `${rewardProgressPct}%` }}
                    />
                  </div>
                  <p className="wt-reward-progress-label">
                    {allBadgesUnlocked
                      ? "🏆 All World Tree badges unlocked!"
                      : `Level ${level} / ${nextBadge.level} — Unlocks at Level ${nextBadge.level}`}
                  </p>
                </div>
              </>
            )}
          </div>
        </FadeCard>

        {/* 7 ── Bottom two-column: Your Contribution + Footer CTA */}
        <FadeCard delay={360}>
          <div className="wt-bottom-row">
            {/* Your Contribution card */}
            <div className="wt-card wt-card--your-contrib">
              <p className="wt-card-eyebrow" style={{ marginBottom: 8 }}>Your Contribution</p>
              <div className="wt-your-contrib-icon">🌱</div>
              <p className="wt-your-contrib-value">
                {myContrib.toLocaleString()} <span className="wt-leaf">🌱</span>
              </p>
              <p className="wt-stat-label" style={{ marginTop: 4 }}>Total Growth</p>
              {!userId && <p className="wt-contrib-login-hint">Log in to track</p>}
            </div>
            {/* Footer CTA card */}
            <div className="wt-card wt-card--footer">
              <span className="wt-footer-plant">🌱</span>
              <p className="wt-footer-title">Every action grows the tree!</p>
              <p className="wt-footer-desc">Send capsules, open memories, help the tree thrive.</p>
              <button className="wt-home-btn" onClick={() => navigate("/")}>🏠 Go to Home</button>
            </div>
          </div>
        </FadeCard>

      </div>{/* /wt-cards */}

      <div className="wt-bottom-spacer" />

      {/* ── All Contributors Modal ── */}
      {showContributors && (
        <div className="wt-modal-overlay" onClick={() => setShowContributors(false)}>
          <div className="wt-modal" onClick={(e) => e.stopPropagation()}>
            <button className="wt-modal-close" onClick={() => setShowContributors(false)}>✕</button>
            <h2 className="wt-modal-title">🏆 Top Contributors</h2>
            {contributors.length === 0 ? (
              <p className="wt-loading-hint">No contributions yet — be the first! 🌱</p>
            ) : (
              <ul className="wt-modal-list">
                {contributors.map((c) => (
                  <li key={c.user_id} className={`wt-modal-row ${c.user_id === userId ? "wt-modal-row--me" : ""}`}>
                    <span className="wt-modal-rank">
                      {c.rank === 1 ? "🥇" : c.rank === 2 ? "🥈" : c.rank === 3 ? "🥉" : `#${c.rank}`}
                    </span>
                    {c.avatar && c.avatar.startsWith("http") ? (
                      <img src={c.avatar} alt={c.name} className="wt-contrib-avatar-img" />
                    ) : (
                      <span className="wt-contrib-avatar">{c.avatar || "🌱"}</span>
                    )}
                    <span className="wt-contrib-name">
                      {c.name}
                      {c.user_id === userId && <span className="wt-contrib-you-tag"> (You)</span>}
                    </span>
                    <span className="wt-contrib-score">{c.growth.toLocaleString()} 🌱</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── How It Works Modal ── */}
      {showHowItWorks && (
        <div className="wt-modal-overlay" onClick={() => setShowHowItWorks(false)}>
          <div className="wt-modal" onClick={(e) => e.stopPropagation()}>
            <button className="wt-modal-close" onClick={() => setShowHowItWorks(false)}>✕</button>
            <h2 className="wt-modal-title">🌿 How It Works</h2>
            <div className="wt-how-list">
              {[
                { icon: "🫙", title: "Send Capsules",     desc: "Each capsule you create adds growth to the World Tree." },
                { icon: "🔓", title: "Open Memories",     desc: "When a capsule unlocks, it feeds the tree with memory energy." },
                { icon: "🌳", title: "Level Up Together", desc: "As the tree levels up, global rewards unlock for everyone." },
                { icon: "🏅", title: "Earn Badges",       desc: "Be the first to claim a reward when a milestone is hit." },
              ].map((item) => (
                <div key={item.title} className="wt-how-row">
                  <span className="wt-how-icon">{item.icon}</span>
                  <div>
                    <p className="wt-how-title">{item.title}</p>
                    <p className="wt-how-desc">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── World Tree Rewards Modal ── */}
      {showRewards && (
        <RewardsModal
          level={level}
          badges={REWARDS_BADGES}
          onClose={() => setShowRewards(false)}
        />
      )}
    </div>
  );
}

export default WorldTree;
