import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, followUser, unfollowUser, checkIfFollowing, getFollowCounts } from "../services/supabase";
import homeBg from "../assets/backgrounds/message.jpg";
import "./Search.css";

function SkeletonList() {
  return (
    <div className="loading-list">
      {[1, 2, 3].map((i) => (
        <div className="skeleton-item" key={i}>
          <div className="skeleton-avatar" />
          <div className="skeleton-text">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Search() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [followLoading, setFollowLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate("/login"); return; }
      setUser(data.user);
    };
    checkAuth();
  }, [navigate]);

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults([]); return; }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, bio")
        .ilike("display_name", `%${query}%`)
        .limit(20);
      if (error) throw error;
      setSearchResults(data || []);
    } catch (err) {
      console.error("Error searching users:", err);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUserClick = async (userProfile) => {
    setSelectedUser(userProfile);
    setUserDetails(null);
    try {
      setDetailsLoading(true);
      const { data: profileData, error } = await supabase
        .from("profiles").select("*").eq("id", userProfile.id).single();
      if (error) throw error;
      setUserDetails(profileData);
      const { isFollowing: following } = await checkIfFollowing(user.id, userProfile.id);
      setIsFollowing(following);
      const { followers, following: fc } = await getFollowCounts(userProfile.id);
      setFollowCounts({ followers, following: fc });
    } catch (err) {
      console.error("Error loading user details:", err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!selectedUser) return;
    try {
      setFollowLoading(true);
      if (isFollowing) {
        const { error } = await unfollowUser(user.id, selectedUser.id);
        if (error) throw error;
        setIsFollowing(false);
        setFollowCounts(p => ({ ...p, followers: p.followers - 1 }));
      } else {
        const { error } = await followUser(user.id, selectedUser.id);
        if (error) throw error;
        setIsFollowing(true);
        setFollowCounts(p => ({ ...p, followers: p.followers + 1 }));
      }
    } catch (err) {
      console.error("Error toggling follow:", err);
    } finally {
      setFollowLoading(false);
    }
  };

  const avatarUrl = (name, url) =>
    url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "User")}&background=7c5cff&color=fff`;

  if (!user) return null;

  return (
    <div
      className="search-page"
      style={{ backgroundImage: `url(${homeBg})` }}
    >
      {/* Overlay gradient */}
      <div className="search-overlay" />

      {/* Header */}
      <div className="search-header">
        <h1>Find People</h1>
        <p>Search by name to connect</p>
      </div>

      {/* Search bar */}
      <div className="search-bar-wrap">
        <div className="search-bar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="search-input"
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            autoComplete="off"
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => handleSearch("")}>✕</button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading && <SkeletonList />}

      {!loading && !searchQuery && (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <p>Search for people to follow</p>
          <span className="hint">Start typing a name above</span>
        </div>
      )}

      {!loading && searchQuery && searchResults.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <p>No users found</p>
          <span className="hint">Try a different name</span>
        </div>
      )}

      {!loading && searchResults.length > 0 && (
        <>
          <div className="section-label">Results · {searchResults.length}</div>
          <div className="results-list">
            {searchResults.map((u) => (
              <div key={u.id} className="result-item" onClick={() => handleUserClick(u)}>
                <div className="user-avatar">
                  <img
                    src={avatarUrl(u.display_name, u.avatar_url)}
                    alt={u.display_name}
                    onError={(e) => { e.target.src = avatarUrl(u.display_name, null); }}
                  />
                </div>
                <div className="result-content">
                  <h3>{u.display_name || "User"}</h3>
                  {u.bio && <p className="user-bio">{u.bio}</p>}
                </div>
                <span className="result-arrow">›</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* User Details Bottom Sheet */}
      {selectedUser && (
        <div className="user-details-modal" onClick={(e) => { if (e.target === e.currentTarget) setSelectedUser(null); }}>
          <div className="user-details-card">
            <button className="close-btn" onClick={() => setSelectedUser(null)}>✕</button>

            {detailsLoading ? (
              <div className="loading">Loading…</div>
            ) : userDetails ? (
              <>
                <div className="user-details-header">
                  <img
                    src={avatarUrl(userDetails.display_name, userDetails.avatar_url)}
                    alt={userDetails.display_name}
                    className="user-details-avatar"
                    onError={(e) => { e.target.src = avatarUrl(userDetails.display_name, null); }}
                  />
                  <h2>{userDetails.display_name || "User"}</h2>
                  {userDetails.bio && <p className="user-details-bio">{userDetails.bio}</p>}
                </div>

                <div className="user-stats">
                  <div className="stat">
                    <span className="stat-number">{followCounts.followers}</span>
                    <span className="stat-label">Followers</span>
                  </div>
                  <div className="stat">
                    <span className="stat-number">{followCounts.following}</span>
                    <span className="stat-label">Following</span>
                  </div>
                </div>

                <div className="user-actions">
                  <button
                    className={`follow-btn ${isFollowing ? "following" : ""}`}
                    onClick={handleFollow}
                    disabled={followLoading}
                  >
                    <span>{isFollowing ? "✓" : "+"}</span>
                    <span>{followLoading ? "…" : isFollowing ? "Following" : "Follow"}</span>
                  </button>
                  <button className="message-btn" onClick={() => { navigate(`/messages?userId=${selectedUser.id}&userName=${selectedUser.display_name}`); setSelectedUser(null); }}>
                    <span>💬</span>
                    <span>Message</span>
                  </button>
                  <button className="capsule-btn" onClick={() => { navigate(`/create?shareWith=${selectedUser.id}&shareWithName=${selectedUser.display_name}`); setSelectedUser(null); }}>
                    <span>📬</span>
                    <span>Capsule</span>
                  </button>
                </div>

                <button className="view-profile-btn" onClick={() => navigate(`/profile/${selectedUser.id}`)}>
                  View Full Profile →
                </button>
              </>
            ) : (
              <div className="error">Could not load profile</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
