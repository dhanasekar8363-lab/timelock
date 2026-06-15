/**
 * PetPage.jsx — Lumi's Profile Page
 * Full pet dashboard for TimeLock's cosmic cat companion.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import lumi from "../assets/lumi.png";
import { usePet, MOODS } from "../contexts/PetContext";
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

/* XP milestones around current level */
function getMilestones(level) {
  const prev2 = Math.max(1, level - 2);
  const prev1 = Math.max(1, level - 1);
  const next1 = level + 1;
  return [prev2, prev1, level, next1];
}

/* Circular progress SVG */
function CircleProgress({ pct }) {
  const r   = 44;
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
   Main component
───────────────────────────────────────────── */
export default function PetPage() {
  const navigate  = useNavigate();
  const { mood }  = usePet();

  const [data, setData]           = useState(loadData);
  const [giftClaimed, setGiftClaimed] = useState(false);
  const [feedFlash,   setFeedFlash]   = useState(false);
  const [giftFlash,   setGiftFlash]   = useState(false);
  const [showXpToast, setShowXpToast] = useState(null); // "+N XP"

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

  const awardXP = useCallback((amount, label) => {
    setData((prev) => {
      let xp    = prev.xp + amount;
      let level = prev.level;
      let xpForNext = prev.xpForNext;

      while (xp >= xpForNext) {
        xp       -= xpForNext;
        level    += 1;
        xpForNext = Math.round(xpForNext * 1.35);
      }
      const next = { ...prev, xp, level, xpForNext };
      saveData(next);
      return next;
    });
    setShowXpToast(`+${amount} XP`);
    setTimeout(() => setShowXpToast(null), 1800);
  }, []);

  /* Feed Lumi */
  const handleFeed = useCallback(() => {
    setFeedFlash(true);
    setTimeout(() => setFeedFlash(false), 600);
    setData((prev) => {
      const next = {
        ...prev,
        feedCount:    prev.feedCount + 1,
        interactions: prev.interactions + 1,
        happiness:    Math.min(100, prev.happiness + 3),
      };
      saveData(next);
      return next;
    });
    awardXP(20, "Fed Lumi");
  }, [awardXP]);

  /* Gift Lumi */
  const handleGift = useCallback(() => {
    setGiftFlash(true);
    setTimeout(() => setGiftFlash(false), 600);
    setData((prev) => {
      const next = {
        ...prev,
        giftCount:    prev.giftCount + 1,
        interactions: prev.interactions + 1,
        happiness:    Math.min(100, prev.happiness + 5),
      };
      saveData(next);
      return next;
    });
    awardXP(30, "Gifted Lumi");
  }, [awardXP]);

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
    awardXP(50, "Daily gift");
  }, [giftClaimed, awardXP]);

  const milestones = getMilestones(data.level);
  const xpPct      = Math.round((data.xp / data.xpForNext) * 100);
  const moodLabel  = MOOD_LABEL[mood]  ?? "Happy";
  const moodEmoji  = MOOD_EMOJI[mood]  ?? "😊";
  const moodDesc   = MOOD_DESC[mood]   ?? "Lumi is feeling great today!";

  return (
    <div className="pet-page">
      {/* ── XP toast ── */}
      {showXpToast && (
        <div className="pet-xp-toast" aria-live="polite">{showXpToast}</div>
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
        <div className="pet-hero-image-wrap">
          <div className="pet-hero-glow" />
          <div className="pet-hero-ring" />
          <img src={lumi} alt="Lumi the cosmic cat" className="pet-hero-image" />
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

          <p className="pet-level-label">Level {data.level}</p>

          <div className="pet-xp-bar-wrap">
            <div className="pet-xp-bar">
              <div
                className="pet-xp-bar-fill"
                style={{ width: `${xpPct}%` }}
                role="progressbar"
                aria-valuenow={data.xp}
                aria-valuemax={data.xpForNext}
                aria-label={`${data.xp} of ${data.xpForNext} XP`}
              />
            </div>
            <span className="pet-xp-text">{data.xp.toLocaleString()} / {data.xpForNext.toLocaleString()} XP</span>
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
        <button
          className={`pet-action-card pet-action-feed ${feedFlash ? "pet-action-flash" : ""}`}
          onClick={handleFeed}
        >
          <div className="pet-action-icon-wrap">
            <span className="pet-action-icon">🍖</span>
            {data.feedCount > 0 && <span className="pet-action-badge" />}
          </div>
          <p className="pet-action-label">Feed Lumi</p>
          <p className="pet-action-sub">Make Lumi happy</p>
        </button>

        <button
          className={`pet-action-card pet-action-gift ${giftFlash ? "pet-action-flash" : ""}`}
          onClick={handleGift}
        >
          <div className="pet-action-icon-wrap">
            <span className="pet-action-icon">🎁</span>
            <span className="pet-action-badge" />
          </div>
          <p className="pet-action-label">Gift</p>
          <p className="pet-action-sub">Give a surprise</p>
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
                const isPast    = lv < data.level;
                const isCurrent = lv === data.level;
                const isNext    = lv > data.level;
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
                  { icon: "🍖", label: "Feed",          value: `${data.feedCount} times`   },
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
