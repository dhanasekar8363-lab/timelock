import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import treeImg from "../assets/worldTree/tree.png";
import worldTreeBg from "../assets/worldTree/world-tree-bg.jpg";
import {
  supabase,
  getWorldTree,
  feedWorldTree,
  getRemainingFeedTime,
  getTopContributors,
  GROWTH_REWARDS,
  FEED_COOLDOWN_MS,
} from "../services/supabase";
import "./WorldTree.css";

// ── Constants ──────────────────────────────────────────────────────────────────
const GROWTH_PER_LEVEL = 1000;

const MOCK_COMMUNITY = {
  totalContributors: 3_241,
  totalGrowth:       128_450,
  treeAgeDays:       94,
};

const MOCK_NEXT_REWARD = {
  name:        "Memory Guardian Badge",
  description: "Awarded to the first person who claims it when Level 25 is reached!",
  icon:        "🛡️",
  unlocksAt:   25,
};

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
  const [treeGlowing,   setTreeGlowing]   = useState(false);
  const [growthAnimating, setGrowthAnimating] = useState(false);

  const level       = calcLevel(growth);
  const tier        = calcTier(level);
  const growthInLvl = growth % GROWTH_PER_LEVEL;
  const progressPct = Math.round((growthInLvl / GROWTH_PER_LEVEL) * 100);

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

  const myEntry = contributors.find(c => c.user_id === userId);

  // Compute tree age in days from real created_at, fall back to MOCK
  const treeAgeDays = treeCreatedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(treeCreatedAt).getTime()) / 86_400_000))
    : MOCK_COMMUNITY.treeAgeDays;

  return (
    <div className="wt-root">
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

      {/* ── Tree Hero ── */}
      <section className="wt-tree-section">
        <div className={`wt-tree-glow ${treeGlowing ? "wt-tree-glow--feeding" : ""}`} aria-hidden="true" />
        <div className={`wt-tree-glow wt-tree-glow--2 ${treeGlowing ? "wt-tree-glow--feeding" : ""}`} aria-hidden="true" />
        <img
          src={treeImg}
          alt="World Memory Tree"
          className={`wt-tree-img ${treeGlowing ? "wt-tree-img--glow" : ""}`}
        />

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
          <button className="wt-side-btn">
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

        {/* 2 ── Feed Tree + Cooldown cards */}
        <FadeCard delay={60}>
          <FeedSection userId={userId} onFed={handleFed} treeGlowing={treeGlowing} />
        </FadeCard>


        {/* 3 ── Community Stats */}
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
                <span className="wt-stat-value">{treeAgeDays}</span>
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

        {/* 6 ── Reward Card (locked) */}
        <FadeCard delay={300}>
          <div className="wt-card wt-card--reward-full">
            <div className="wt-reward-full-top">
              <p className="wt-card-eyebrow" style={{ margin: 0 }}>Next Reward ✨</p>
              <div className="wt-reward-locked-badge">🔒 Locked</div>
            </div>

            <div className="wt-reward-full-body">
              <div className="wt-reward-shield">
                <div className="wt-reward-shield-glow" aria-hidden="true" />
                <span className="wt-reward-shield-icon">{MOCK_NEXT_REWARD.icon}</span>
              </div>
              <div className="wt-reward-full-info">
                <p className="wt-reward-name">{MOCK_NEXT_REWARD.name}</p>
                <p className="wt-reward-desc">{MOCK_NEXT_REWARD.description}</p>
              </div>
            </div>

            <div className="wt-reward-progress-wrap">
              <div className="wt-reward-progress-track">
                <div
                  className="wt-reward-progress-fill"
                  style={{ width: `${Math.min(100, Math.round((level / MOCK_NEXT_REWARD.unlocksAt) * 100))}%` }}
                />
              </div>
              <p className="wt-reward-progress-label">
                Level {level} / {MOCK_NEXT_REWARD.unlocksAt} — unlocks at Level {MOCK_NEXT_REWARD.unlocksAt}
              </p>
            </div>
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
    </div>
  );
}

export default WorldTree;
