import { useEffect, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  supabase,
  followUser,
  unfollowUser,
  checkIfFollowing,
  getFollowCounts,
  getFollowers,
  getFollowing,
} from "../services/supabase";
import { useAuth } from "../contexts/AuthContext";
import homeBg from "../assets/backgrounds/home-bg.jpg";
import "./Profile.css";

/* ─── Level System ─── */
const LEVEL_THRESHOLDS = [0, 5, 10, 20, 40, 80, 150, 280, 500, 900, 1500, 2500, 4000, 6500, 10000];
const LEVEL_TITLES = [
  "Time Starter","Time Starter","Memory Keeper","Memory Keeper",
  "Future Explorer","Future Explorer","Time Traveler","Time Traveler",
  "Time Traveler","Chrono Master","Chrono Master","Chrono Master",
  "Chrono Master","Chrono Master","Time Lord",
];

function getLevel(count) {
  let lvl = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (count >= LEVEL_THRESHOLDS[i]) lvl = i + 1; else break;
  }
  lvl = Math.min(lvl, 15);
  const cur = LEVEL_THRESHOLDS[lvl - 1];
  const next = lvl < 15 ? LEVEL_THRESHOLDS[lvl] : cur + 1;
  const pct = next === cur ? 100 : Math.round(((count - cur) / (next - cur)) * 100);
  return { level: lvl, title: LEVEL_TITLES[lvl - 1], progress: Math.min(100, Math.max(0, pct)) };
}

/* ─── Achievements ─── */
function computeAchievements(stats, followCounts) {
  return [
    {
      id: "first_capsule", icon: "⭐", label: "First Capsule",
      color: "#a855f7", unlocked: stats.created >= 1,
      progress: Math.min(1, stats.created), total: 1,
    },
    {
      id: "first_message", icon: "💌", label: "First Message",
      color: "#ec4899", unlocked: followCounts.following >= 1,
      progress: Math.min(1, followCounts.following), total: 1,
    },
    {
      id: "ten_locked", icon: "🔐", label: "10 Locked",
      color: "#f59e0b", unlocked: stats.locked >= 10,
      progress: Math.min(10, stats.locked), total: 10,
    },
    {
      id: "future_master", icon: "⭐", label: "Future Master",
      color: "#7c5cff", unlocked: stats.created >= 50,
      progress: Math.min(50, stats.created), total: 50,
    },
  ];
}

/* ─── Relative time ─── */
function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/* ─── Main Component ─── */
export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useParams();
  const { user, loading } = useAuth();

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ created: 0, locked: 0, opened: 0, pending: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [followLoading, setFollowLoading] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  const [recentActivity, setRecentActivity] = useState([]);

  // Follow sheet
  const [activeList, setActiveList] = useState(null);
  const [listUsers, setListUsers] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listFollowMap, setListFollowMap] = useState({});

  const viewingUserId = userId || user?.id;

  useEffect(() => {
    if (loading) return;
    if (!user && !userId) { navigate("/login"); return; }

    const fetchData = async () => {
      const targetUserId = userId || user?.id;
      setIsOwnProfile(targetUserId === user?.id);
      await loadProfile(targetUserId);
      await loadStats(targetUserId);
      await loadRecentActivity(targetUserId);
      const { followers, following: followingCount } = await getFollowCounts(targetUserId);
      setFollowCounts({ followers, following: followingCount });
      if (userId && user && userId !== user.id) {
        const { isFollowing: following } = await checkIfFollowing(user.id, userId);
        setIsFollowing(following);
      }
    };
    fetchData();
  }, [location, userId, navigate, user, loading]);

  const loadProfile = async (targetUserId) => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", targetUserId).single();
      if (error) throw error;
      setProfile(data);
    } catch (e) { console.error(e); }
  };

  const loadStats = async (targetUserId) => {
    try {
      setStatsLoading(true); setStatsError(null);
      const now = new Date().toISOString();
      const [r1, r2, r3] = await Promise.all([
        supabase.from("capsules").select("*", { count: "exact", head: true }).eq("sender_id", targetUserId),
        supabase.from("capsules").select("*", { count: "exact", head: true }).eq("sender_id", targetUserId).gt("unlock_date", now),
        supabase.from("capsules").select("*", { count: "exact", head: true }).eq("sender_id", targetUserId).lte("unlock_date", now),
      ]);
      const created = r1.count || 0;
      const locked = r2.count || 0;
      const opened = r3.count || 0;
      setStats({ created, locked, opened, pending: locked });
    } catch (e) {
      console.error(e);
      setStatsError("Failed to load stats.");
      setStats({ created: 0, locked: 0, opened: 0, pending: 0 });
    } finally { setStatsLoading(false); }
  };

  const loadRecentActivity = async (targetUserId) => {
    try {
      const { data: capsules } = await supabase
        .from("capsules").select("id, title, created_at, unlock_date")
        .eq("sender_id", targetUserId).order("created_at", { ascending: false }).limit(5);
      const now = new Date();
      const acts = (capsules || []).map((c) => {
        const isOpened = new Date(c.unlock_date) <= now;
        return {
          id: c.id, icon: isOpened ? "🔓" : "📦",
          text: isOpened ? "Opened a capsule" : "Created a capsule",
          date: c.created_at, color: isOpened ? "#22c55e" : "#7c5cff",
        };
      });
      setRecentActivity(acts.slice(0, 4));
    } catch (e) { console.error(e); }
  };

  const handleFollow = async () => {
    if (!userId || !user) return;
    try {
      setFollowLoading(true);
      if (isFollowing) {
        const { error } = await unfollowUser(user.id, userId);
        if (error) throw error;
        setIsFollowing(false);
        setFollowCounts(p => ({ ...p, followers: p.followers - 1 }));
      } else {
        const { error } = await followUser(user.id, userId);
        if (error) throw error;
        setIsFollowing(true);
        setFollowCounts(p => ({ ...p, followers: p.followers + 1 }));
      }
    } catch (e) { console.error(e); alert("Failed to update follow status"); }
    finally { setFollowLoading(false); }
  };

  const openFollowList = async (type) => {
    setActiveList(type); setListLoading(true); setListUsers([]); setListFollowMap({});
    try {
      const { data } = type === "followers"
        ? await getFollowers(viewingUserId) : await getFollowing(viewingUserId);
      const users = data || [];
      setListUsers(users);
      if (user) {
        const entries = await Promise.all(
          users.map(async (u) => {
            if (u.id === user.id) return [u.id, true];
            const { isFollowing: f } = await checkIfFollowing(user.id, u.id);
            return [u.id, f];
          })
        );
        setListFollowMap(Object.fromEntries(entries));
      }
    } catch (e) { console.error(e); }
    finally { setListLoading(false); }
  };

  const closeFollowList = () => { setActiveList(null); setListUsers([]); setListFollowMap({}); };

  const handleListFollow = async (targetId) => {
    if (!user || targetId === user.id) return;
    const currently = listFollowMap[targetId];
    try {
      if (currently) { await unfollowUser(user.id, targetId); }
      else { await followUser(user.id, targetId); }
      setListFollowMap(p => ({ ...p, [targetId]: !currently }));
      if (isOwnProfile && activeList === "following")
        setFollowCounts(p => ({ ...p, following: p.following + (currently ? -1 : 1) }));
    } catch (e) { console.error(e); alert("Failed to update follow status"); }
  };

  const handleListMessage = (targetUser) => {
    closeFollowList();
    navigate(`/messages?userId=${targetUser.id}&userName=${encodeURIComponent(targetUser.display_name || "User")}`);
  };
  const handleSendMessage = () => { if (userId && profile) navigate(`/messages?userId=${userId}&userName=${profile.display_name}`); };
  const handleSendCapsule = () => { if (userId && profile) navigate(`/create?shareWith=${userId}&shareWithName=${profile.display_name}`); };
  const handleShareProfile = () => {
    if (navigator.share) navigator.share({ title: profile?.display_name, url: window.location.href });
    else { navigator.clipboard?.writeText(window.location.href); alert("Profile link copied!"); }
  };
  const logout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  /* derived */
  const { level, title: levelTitle } = getLevel(stats.created);
  const achievements = computeAchievements(stats, followCounts);
  const avatarSrc = profile?.avatar_url
    || (isOwnProfile && user?.user_metadata?.picture)
    || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.display_name || "User")}&background=7c5cff&color=fff&size=200`;

  if (loading) return (
    <div className="tl-page"><div className="tl-loader"><div className="tl-dots"><span/><span/><span/></div></div></div>
  );
  if (!user && !userId) return (
    <div className="tl-page"><p style={{color:"#fff",textAlign:"center",paddingTop:"40vh"}}>Please log in.</p></div>
  );

  const statCards = [
    { key: "created", icon: "📦", label: "CREATED",  sub: "Capsules", color: "#a855f7", track: "#a855f722" },
    { key: "locked",  icon: "🔒", label: "LOCKED",   sub: "Capsules", color: "#f59e0b", track: "#f59e0b22" },
    { key: "opened",  icon: "🔓", label: "OPENED",   sub: "Capsules", color: "#22c55e", track: "#22c55e22" },
    { key: "pending", icon: "⏳", label: "PENDING",  sub: "Capsules", color: "#7c5cff", track: "#7c5cff22" },
  ];

  return (
    <div className="tl-page" style={{ backgroundImage: `url(${homeBg})` }}>
      <div className="tl-overlay" />

      <div className="tl-scroll">

        {/* TOP NAV */}
        <div className="tl-topnav">
          {isOwnProfile ? (
            <button className="tl-nav-btn" onClick={() => navigate("/settings")} aria-label="Settings">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          ) : (
            <button className="tl-nav-btn" onClick={() => navigate(-1)} aria-label="Back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          <button className="tl-nav-btn" onClick={handleShareProfile} aria-label="Share">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
        </div>

        {/* HERO */}
        <div className="tl-hero">
          <div className="tl-avatar-ring">
            <div className="tl-avatar-glow" />
            <img
              className="tl-avatar"
              src={avatarSrc}
              alt="Avatar"
              onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.display_name || "User")}&background=7c5cff&color=fff&size=200`; }}
            />
            {isOwnProfile && (
              <button className="tl-edit-float" onClick={() => navigate("/profile/edit")} aria-label="Edit">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}
          </div>

          <h1 className="tl-username">
            {profile?.display_name || (isOwnProfile && user?.user_metadata?.full_name) || "User"}
            <span className="tl-sparkle">✦</span>
          </h1>

          <div className="tl-level-badge">
            <span className="tl-lv-num">Lv. {level}</span>
            <span className="tl-lv-title">{levelTitle}</span>
          </div>

          {isOwnProfile && <p className="tl-email">{user?.email}</p>}
          {profile?.bio && <p className="tl-bio">{profile.bio}</p>}
          <p className="tl-tagline">✦ Messages to the future ✦</p>
        </div>

        {/* SOCIAL STATS */}
        <div className="tl-social-row">
          <div className="tl-social-card" onClick={() => openFollowList("followers")}>
            <div className="tl-social-icon tl-si-purple">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="tl-social-info">
              <span className="tl-social-num">{followCounts.followers}</span>
              <span className="tl-social-label">FOLLOWERS</span>
            </div>
          </div>
          <div className="tl-social-card" onClick={() => openFollowList("following")}>
            <div className="tl-social-icon tl-si-pink">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
            <div className="tl-social-info">
              <span className="tl-social-num">{followCounts.following}</span>
              <span className="tl-social-label">FOLLOWING</span>
            </div>
          </div>
        </div>

        {/* CAPSULE STATS GRID */}
        {statsError && <p className="tl-stats-error">{statsError}</p>}
        <div className="tl-stats-grid">
          {statCards.map(({ key, icon, label, sub, color, track }) => (
            <div key={key} className="tl-stat-card" style={{"--sc": color, "--sc-track": track}}>
              <div className="tl-stat-icon-wrap" style={{ background: track }}>
                <span className="tl-stat-icon">{icon}</span>
              </div>
              <div className="tl-stat-body">
                <span className="tl-stat-num">{statsLoading ? "—" : stats[key]}</span>
                <span className="tl-stat-label">{label}</span>
                <span className="tl-stat-sub">{sub}</span>
              </div>
              <div className="tl-stat-bar-track">
                <div
                  className="tl-stat-bar-fill"
                  style={{
                    width: statsLoading || !stats.created ? "0%" : `${Math.min(100, Math.round((stats[key] / Math.max(stats.created, 1)) * 100))}%`,
                    background: color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ACHIEVEMENTS */}
        <div className="tl-section-header">
          <span className="tl-section-title">🏆 Achievements <span className="tl-dot-accent">✦</span></span>
          <button className="tl-view-all">View All &rsaquo;</button>
        </div>
        <div className="tl-achievements-row">
          {achievements.map((a) => (
            <div key={a.id} className={`tl-ach-card ${a.unlocked ? "tl-ach-unlocked" : "tl-ach-locked"}`} style={{"--ac": a.color}}>
              <div className="tl-ach-hex">
                <span className="tl-ach-icon">{a.icon}</span>
                {a.unlocked && <span className="tl-ach-glow" />}
              </div>
              <span className="tl-ach-label">{a.label}</span>
              {!a.unlocked && (
                <div className="tl-ach-prog-track">
                  <div className="tl-ach-prog-fill" style={{ width: `${Math.round((a.progress / a.total) * 100)}%`, background: a.color }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* RECENT ACTIVITY */}
        <div className="tl-section-header">
          <span className="tl-section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:6,verticalAlign:"middle"}}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Recent Activity
          </span>
          <button className="tl-view-all">View All &rsaquo;</button>
        </div>
        <div className="tl-activity-card">
          {recentActivity.length === 0 ? (
            <p className="tl-activity-empty">No recent activity yet</p>
          ) : recentActivity.map((act, i) => (
            <div key={act.id + i} className="tl-activity-row">
              <div className="tl-activity-dot-col">
                <div className="tl-activity-dot" style={{ background: act.color, boxShadow: `0 0 6px ${act.color}` }} />
                {i < recentActivity.length - 1 && <div className="tl-activity-line" />}
              </div>
              <span className="tl-activity-icon">{act.icon}</span>
              <span className="tl-activity-text">{act.text}</span>
              <span className="tl-activity-time">{relativeTime(act.date)}</span>
            </div>
          ))}
        </div>

        {/* ACTION BUTTONS */}
        <div className="tl-actions">
          {!isOwnProfile ? (
            <>
              <button
                className={`tl-action-btn tl-btn-primary ${isFollowing ? "tl-btn-following" : ""}`}
                onClick={handleFollow} disabled={followLoading}
              >
                {followLoading ? "···" : isFollowing ? "✓ Following" : "+ Follow"}
              </button>
              <div className="tl-btn-row">
                <button className="tl-action-btn tl-btn-secondary" onClick={handleSendMessage}>💬 Message</button>
                <button className="tl-action-btn tl-btn-secondary" onClick={handleSendCapsule}>📬 Send Capsule</button>
              </div>
            </>
          ) : (
            <>
              <button className="tl-action-btn tl-btn-edit" onClick={() => navigate("/profile/edit")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Edit Profile
                <svg className="tl-btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <button className="tl-action-btn tl-btn-insights" onClick={() => navigate("/insights")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                Your Insights
                <svg className="tl-btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <button className="tl-action-btn tl-btn-logout" onClick={logout}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Logout
                <svg className="tl-btn-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </>
          )}
        </div>

        <div style={{ height: "20px" }} />
      </div>

      {/* FOLLOW SHEET */}
      {activeList && (
        <div className="tl-sheet-overlay" onClick={closeFollowList}>
          <div className="tl-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="tl-sheet-handle" />
            <div className="tl-sheet-header">
              <span>{activeList === "followers" ? "Followers" : "Following"}</span>
              <button className="tl-sheet-close" onClick={closeFollowList}>✕</button>
            </div>
            <div className="tl-sheet-list">
              {listLoading ? (
                <div className="tl-sheet-loader"><div className="tl-dots"><span/><span/><span/></div></div>
              ) : listUsers.length === 0 ? (
                <div className="tl-sheet-empty">
                  <p>{activeList === "followers" ? "No followers yet" : "Not following anyone yet"}</p>
                </div>
              ) : listUsers.map((u) => (
                <div key={u.id} className="tl-sheet-user">
                  <img
                    className="tl-sheet-avatar"
                    src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.display_name || "User")}&background=7c5cff&color=fff`}
                    alt={u.display_name}
                    onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.display_name || "User")}&background=7c5cff&color=fff`; }}
                  />
                  <span className="tl-sheet-name">{u.display_name || "User"}</span>
                  <div className="tl-sheet-actions">
                    <button className="tl-sheet-btn tl-sb-msg" onClick={() => handleListMessage(u)}>Message</button>
                    {user && u.id !== user.id && !listFollowMap[u.id] && (
                      <button className="tl-sheet-btn tl-sb-follow" onClick={() => handleListFollow(u.id)}>Follow</button>
                    )}
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
