import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import treeImg from "../assets/worldTree/tree.png";
import worldTreeBg from "../assets/worldTree/world-tree-bg.jpg";
import { supabase, getWorldTree, feedWorldTree, getTopContributors } from "../services/supabase";
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

// ── Feed Tree Button ───────────────────────────────────────────────────────────
function FeedTreeBtn({ userId, onFed }) {
  const [ripple,  setRipple]  = useState(false);
  const [fed,     setFed]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const handleFeed = async () => {
    if (fed || loading) return;
    setError(null);
    setRipple(true);
    setTimeout(() => setRipple(false), 700);

    setLoading(true);
    const { data, error: feedError } = await feedWorldTree(userId);
    setLoading(false);

    if (feedError) {
      setError("Could not feed the tree. Try again.");
      return;
    }

    setFed(true);
    onFed(data.growth); // bubble up the new global growth value
    setTimeout(() => setFed(false), 2200);
  };

  return (
    <div className="wt-feed-wrap">
      <button
        className={`wt-feed-btn ${ripple ? "wt-feed-btn--ripple" : ""} ${fed ? "wt-feed-btn--fed" : ""}`}
        onClick={handleFeed}
        disabled={loading}
        aria-label="Feed the Tree"
      >
        <span className="wt-feed-glow" aria-hidden="true" />
        <span className="wt-feed-inner">
          {loading ? "🌿 Feeding…" : fed ? "🌳 Tree Fed! +1 Growth" : "🌱 Feed The Tree"}
        </span>
      </button>
      {error && <p className="wt-feed-error">{error}</p>}
      <p className="wt-feed-hint">Every feed grows the World Tree by 1 point</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function WorldTree() {
  const navigate = useNavigate();

  // ── Auth state
  const [userId, setUserId] = useState(null);

  // ── Supabase data
  const [growth,       setGrowth]       = useState(0);
  const [contributors, setContributors] = useState([]);
  const [myContrib,    setMyContrib]    = useState(0);
  const [dataLoading,  setDataLoading]  = useState(true);

  // ── UI toggles
  const [showContributors, setShowContributors] = useState(false);
  const [showHowItWorks,   setShowHowItWorks]   = useState(false);

  // ── Derived values
  const level       = calcLevel(growth);
  const tier        = calcTier(level);
  const growthInLvl = growth % GROWTH_PER_LEVEL;
  const progressPct = Math.round((growthInLvl / GROWTH_PER_LEVEL) * 100);

  // ── Load session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load tree + contributors
  const loadData = useCallback(async () => {
    setDataLoading(true);
    const [treeRes, contribRes] = await Promise.all([
      getWorldTree(),
      getTopContributors(10),
    ]);

    if (treeRes.data)    setGrowth(treeRes.data.growth);
    if (contribRes.data) setContributors(contribRes.data);
    setDataLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Keep "my contribution" in sync whenever contributors list or userId changes
  useEffect(() => {
    if (!userId || contributors.length === 0) return;
    const me = contributors.find(c => c.user_id === userId);
    setMyContrib(me ? me.growth : myContrib);
  }, [contributors, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Called by FeedTreeBtn after a successful feed
  const handleFed = useCallback(async (newGrowth) => {
    setGrowth(newGrowth);
    setMyContrib(prev => prev + 1);
    // Refresh leaderboard in background
    const { data } = await getTopContributors(10);
    if (data) setContributors(data);
  }, []);

  // ── My contribution card data
  const myEntry = contributors.find(c => c.user_id === userId);

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
        <div className="wt-tree-glow" aria-hidden="true" />
        <div className="wt-tree-glow wt-tree-glow--2" aria-hidden="true" />
        <img src={treeImg} alt="World Memory Tree" className="wt-tree-img" />

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
              <span className="wt-growth-current">{growthInLvl.toLocaleString()}</span>
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

        {/* 2 ── Feed Tree Button */}
        <FadeCard delay={60}>
          <FeedTreeBtn userId={userId} onFed={handleFed} />
        </FadeCard>

        {/* 3 ── Community Stats */}
        <FadeCard delay={120}>
          <div className="wt-card">
            <p className="wt-card-eyebrow">🌍 Community Stats</p>
            <div className="wt-stats-grid">
              <div className="wt-stat">
                <span className="wt-stat-icon">👥</span>
                <span className="wt-stat-value">{MOCK_COMMUNITY.totalContributors.toLocaleString()}</span>
                <span className="wt-stat-label">Contributors</span>
              </div>
              <div className="wt-stat">
                <span className="wt-stat-icon">🌱</span>
                <span className="wt-stat-value">{growth >= 1000 ? `${(growth / 1000).toFixed(1)}k` : growth}</span>
                <span className="wt-stat-label">Total Growth</span>
              </div>
              <div className="wt-stat">
                <span className="wt-stat-icon">🕰️</span>
                <span className="wt-stat-value">{MOCK_COMMUNITY.treeAgeDays}</span>
                <span className="wt-stat-label">Days Old</span>
              </div>
            </div>
          </div>
        </FadeCard>

        {/* 4 ── Top Contributors (full list) */}
        <FadeCard delay={180}>
          <div className="wt-card">
            <div className="wt-contrib-header">
              <p className="wt-card-eyebrow" style={{ margin: 0 }}>
                🏆 Top Contributors <span className="wt-week">(All Time)</span>
              </p>
              <button className="wt-arrow-btn" onClick={() => setShowContributors(true)}>›</button>
            </div>
            {dataLoading ? (
              <p className="wt-loading-hint">Loading contributors…</p>
            ) : contributors.length === 0 ? (
              <p className="wt-loading-hint">Be the first to feed the tree! 🌱</p>
            ) : (
              <ul className="wt-contrib-list wt-contrib-list--full">
                {contributors.slice(0, 5).map((c, i) => (
                  <li
                    key={c.user_id}
                    className="wt-contrib-row wt-contrib-row--full"
                    style={{ animationDelay: `${i * 80}ms` }}
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
                    <span className="wt-contrib-name">{c.name}</span>
                    <div className="wt-contrib-right">
                      <span className="wt-contrib-score">{c.growth}</span>
                      <span className="wt-contrib-leaf">🌱</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </FadeCard>

        {/* 5 ── Reward Card (locked) */}
        <FadeCard delay={240}>
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

        {/* 6 ── My contribution + footer row */}
        <FadeCard delay={300}>
          <div className="wt-row-cards">
            <div className="wt-card wt-card--mine">
              <p className="wt-card-eyebrow">Your Contribution</p>
              {myEntry?.avatar && myEntry.avatar.startsWith("http") ? (
                <img src={myEntry.avatar} alt="You" className="wt-my-avatar-img" />
              ) : (
                <div className="wt-my-avatar">{myEntry?.avatar || "🌱"}</div>
              )}
              <p className="wt-my-growth">
                {myContrib} <span className="wt-leaf">🌱</span>
              </p>
              <p className="wt-my-label">Total Growth</p>
              {myContrib > 0 && <div className="wt-thank-you">Thank you! ✨</div>}
            </div>

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
                  <li key={c.user_id} className="wt-modal-row">
                    <span className="wt-modal-rank">
                      {c.rank === 1 ? "🥇" : c.rank === 2 ? "🥈" : c.rank === 3 ? "🥉" : `#${c.rank}`}
                    </span>
                    {c.avatar && c.avatar.startsWith("http") ? (
                      <img src={c.avatar} alt={c.name} className="wt-contrib-avatar-img" />
                    ) : (
                      <span className="wt-contrib-avatar">{c.avatar || "🌱"}</span>
                    )}
                    <span className="wt-contrib-name">{c.name}</span>
                    <span className="wt-contrib-score">{c.growth} 🌱</span>
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
