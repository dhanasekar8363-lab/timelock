import { useEffect, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { supabase, followUser, unfollowUser, checkIfFollowing, getFollowCounts, getFollowers, getFollowing } from "../services/supabase";
import { useAuth } from "../contexts/AuthContext";
import homeBg from "../assets/backgrounds/main-bg.jpg";
import "./Profile.css";

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useParams();
  const { user, loading } = useAuth();

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({
    created: 0,
    locked: 0,
    opened: 0,
  });
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [followLoading, setFollowLoading] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(true);

  // Followers / Following list modal
  const [activeList, setActiveList] = useState(null); // null | "followers" | "following"
  const [listUsers, setListUsers] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listFollowMap, setListFollowMap] = useState({});

  // Determine if viewing own profile or another user's
  const viewingUserId = userId || user?.id;

  useEffect(() => {
    // If not logged in and page is loading, don't do anything yet
    if (loading) return;

    // If not logged in and trying to view own profile, redirect to login
    if (!user && !userId) {
      navigate("/login");
      return;
    }

    const fetchData = async () => {
      // Check if viewing own profile or another user's
      const targetUserId = userId || user?.id;
      setIsOwnProfile(targetUserId === user?.id);

      // Load profile and stats for the target user
      await loadProfile(targetUserId);
      await loadStats(targetUserId);

      // Load follow counts for the profile being viewed (own or other)
      const { followers, following: followingCount } = await getFollowCounts(targetUserId);
      setFollowCounts({ followers, following: followingCount });

      // If viewing another user, check follow status
      if (userId && user && userId !== user.id) {
        const { isFollowing: following } = await checkIfFollowing(user.id, userId);
        setIsFollowing(following);
      }
    };

    fetchData();
  }, [location, userId, navigate, user, loading]);

  const loadProfile = async (targetUserId) => {
    try {
      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", targetUserId)
        .single();

      if (error) throw error;
      setProfile(profileData);
    } catch (error) {
      console.error("Error loading profile:", error);
    }
  };

  const loadStats = async (targetUserId) => {
    try {
      setStatsLoading(true);
      setStatsError(null);

      const now = new Date().toISOString();

      const { count: created, error: createdError } = await supabase
        .from("capsules")
        .select("*", { count: "exact", head: true })
        .eq("sender_id", targetUserId);

      if (createdError) throw createdError;

      const { count: locked, error: lockedError } = await supabase
        .from("capsules")
        .select("*", { count: "exact", head: true })
        .eq("sender_id", targetUserId)
        .gt("unlock_date", now);

      if (lockedError) throw lockedError;

      const { count: opened, error: openedError } = await supabase
        .from("capsules")
        .select("*", { count: "exact", head: true })
        .eq("sender_id", targetUserId)
        .lte("unlock_date", now);

      if (openedError) throw openedError;

      setStats({
        created: created || 0,
        locked: locked || 0,
        opened: opened || 0,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
      setStatsError("Failed to load statistics. Please try again.");
      setStats({
        created: 0,
        locked: 0,
        opened: 0,
      });
    } finally {
      setStatsLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!userId || !user) return;

    try {
      setFollowLoading(true);

      if (isFollowing) {
        const { error } = await unfollowUser(user.id, userId);
        if (error) throw error;
        setIsFollowing(false);
        setFollowCounts(prev => ({ ...prev, followers: prev.followers - 1 }));
      } else {
        const { error } = await followUser(user.id, userId);
        if (error) throw error;
        setIsFollowing(true);
        setFollowCounts(prev => ({ ...prev, followers: prev.followers + 1 }));
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
      alert("Failed to update follow status");
    } finally {
      setFollowLoading(false);
    }
  };

  const openFollowList = async (type) => {
    setActiveList(type);
    setListLoading(true);
    setListUsers([]);
    setListFollowMap({});
    try {
      const targetUserId = viewingUserId;
      const { data } = type === "followers"
        ? await getFollowers(targetUserId)
        : await getFollowing(targetUserId);

      const users = data || [];
      setListUsers(users);

      // Determine follow status (current user -> each listed user)
      if (user) {
        const statusEntries = await Promise.all(
          users.map(async (u) => {
            if (u.id === user.id) return [u.id, true]; // never show follow for yourself
            const { isFollowing: following } = await checkIfFollowing(user.id, u.id);
            return [u.id, following];
          })
        );
        setListFollowMap(Object.fromEntries(statusEntries));
      }
    } catch (error) {
      console.error("Error loading follow list:", error);
    } finally {
      setListLoading(false);
    }
  };

  const closeFollowList = () => {
    setActiveList(null);
    setListUsers([]);
    setListFollowMap({});
  };

  const handleListFollow = async (targetId) => {
    if (!user || targetId === user.id) return;
    const currentlyFollowing = listFollowMap[targetId];
    try {
      if (currentlyFollowing) {
        const { error } = await unfollowUser(user.id, targetId);
        if (error) throw error;
      } else {
        const { error } = await followUser(user.id, targetId);
        if (error) throw error;
      }
      setListFollowMap(prev => ({ ...prev, [targetId]: !currentlyFollowing }));

      // If we're looking at our own followers/following, reflect the change in counts
      if (isOwnProfile && activeList === "following") {
        setFollowCounts(prev => ({
          ...prev,
          following: prev.following + (currentlyFollowing ? -1 : 1),
        }));
      }
    } catch (error) {
      console.error("Error toggling follow from list:", error);
      alert("Failed to update follow status");
    }
  };

  const handleListMessage = (targetUser) => {
    closeFollowList();
    navigate(`/messages?userId=${targetUser.id}&userName=${encodeURIComponent(targetUser.display_name || "User")}`);
  };

  const handleSendMessage = () => {
    if (userId && profile) {
      navigate(`/messages?userId=${userId}&userName=${profile.display_name}`);
    }
  };

  const handleSendCapsule = () => {
    if (userId && profile) {
      navigate(`/create?shareWith=${userId}&shareWithName=${profile.display_name}`);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user && !userId) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <p>Please log in to view profiles.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="profile-page"
      style={{ backgroundImage: `url(${homeBg})` }}
    >
      {/* Overlay gradient */}
      <div className="profile-overlay" />

      <div className="profile-card">
        {!isOwnProfile && (
          <button className="back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
        )}

        <img
          src={
            profile?.avatar_url ||
            (isOwnProfile && user?.user_metadata?.picture) ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.display_name || 'User')}`
          }
          alt="Profile"
          className="avatar"
          onError={(e) => {
            e.target.src =
              "https://ui-avatars.com/api/?name=" +
              encodeURIComponent(profile?.display_name || "User");
          }}
        />

        <h2>
          {profile?.display_name ||
            (isOwnProfile && user?.user_metadata?.full_name) ||
            "User"}
        </h2>

        {isOwnProfile && (
          <p className="email">{user?.email}</p>
        )}

        {profile?.bio && (
          <p className="bio">{profile.bio}</p>
        )}

        {/* Followers / Following — shown for everyone */}
        <div className="follow-stats">
          <div className="stat clickable" onClick={() => openFollowList("followers")}>
            <span className="stat-number">{followCounts.followers}</span>
            <span className="stat-label">Followers</span>
          </div>
          <div className="stat clickable" onClick={() => openFollowList("following")}>
            <span className="stat-number">{followCounts.following}</span>
            <span className="stat-label">Following</span>
          </div>
        </div>

        <div className="divider" />

        {statsError && (
          <div className="stats-error">
            <p>{statsError}</p>
          </div>
        )}

        {statsLoading ? (
          <div className="stats-loading">
            <p>Loading statistics...</p>
          </div>
        ) : (
          <div className="stats">
            <div className="stat-box">
              <span className="emoji">📦</span>
              <h3>{stats.created}</h3>
              <p>Created</p>
            </div>

            <div className="stat-box">
              <span className="emoji">🔒</span>
              <h3>{stats.locked}</h3>
              <p>Locked</p>
            </div>

            <div className="stat-box">
              <span className="emoji">🔓</span>
              <h3>{stats.opened}</h3>
              <p>Opened</p>
            </div>
          </div>
        )}

        <div className="divider" />

        {/* Action Buttons */}
        {!isOwnProfile && (
          <div className="action-buttons">
            <button
              className={`follow-btn ${isFollowing ? 'following' : ''}`}
              onClick={handleFollow}
              disabled={followLoading}
            >
              {followLoading ? '...' : (isFollowing ? '✓ Following' : '+ Follow')}
            </button>

            <button
              className="message-btn"
              onClick={handleSendMessage}
            >
              💬 Message
            </button>

            <button
              className="capsule-btn"
              onClick={handleSendCapsule}
            >
              📬 Send Capsule
            </button>
          </div>
        )}

        {isOwnProfile && (
          <>
            <button onClick={() => console.log(user)}>
              Show User Data
            </button>

            <button
              className="setting-btn"
              onClick={() => navigate("/profile/edit")}
            >
              ⚙️ Edit Profile
            </button>
          </>
        )}

        {isOwnProfile && (
          <button
            className="logout-btn"
            onClick={logout}
          >
            🚪 Logout
          </button>
        )}
      </div>

      {/* Followers / Following bottom sheet */}
      {activeList && (
        <div className="follow-sheet-overlay" onClick={closeFollowList}>
          <div className="follow-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="follow-sheet-header">
              <span>{activeList === "followers" ? "Followers" : "Following"}</span>
              <button className="follow-sheet-close" onClick={closeFollowList}>✕</button>
            </div>

            <div className="follow-sheet-list">
              {listLoading ? (
                <div className="follow-sheet-loading">
                  <div className="dots"><span /><span /><span /></div>
                </div>
              ) : listUsers.length === 0 ? (
                <div className="follow-sheet-empty">
                  <p>{activeList === "followers" ? "No followers yet" : "No following yet"}</p>
                </div>
              ) : (
                listUsers.map((u) => (
                  <div key={u.id} className="follow-user-row">
                    <img
                      className="follow-user-avatar"
                      src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.display_name || "User")}&background=7c5cff&color=fff`}
                      alt={u.display_name || "User"}
                      onError={(e) => {
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.display_name || "User")}&background=7c5cff&color=fff`;
                      }}
                    />
                    <span className="follow-user-name">{u.display_name || "User"}</span>
                    <div className="follow-user-actions">
                      <button
                        className="follow-user-btn message"
                        onClick={() => handleListMessage(u)}
                      >
                        Message
                      </button>
                      {user && u.id !== user.id && !listFollowMap[u.id] && (
                        <button
                          className="follow-user-btn follow"
                          onClick={() => handleListFollow(u.id)}
                        >
                          Follow
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}