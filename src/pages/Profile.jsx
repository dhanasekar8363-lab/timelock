import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import "./Profile.css";

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    created: 0,
    locked: 0,
    opened: 0,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      console.log(data.user);
      console.log(data.user?.user_metadata);
      setUser(data.user);
    });

    const loadStats = async () => {
      const { count: created } = await supabase
        .from("capsules")
        .select("*", { count: "exact", head: true });

      const now = new Date().toISOString();

      const { count: locked } = await supabase
        .from("capsules")
        .select("*", { count: "exact", head: true })
        .gt("unlock_date", now);

      const { count: opened } = await supabase
        .from("capsules")
        .select("*", { count: "exact", head: true })
        .lte("unlock_date", now);

      setStats({
        created: created || 0,
        locked: locked || 0,
        opened: opened || 0,
      });
    };

    loadStats();
  }, []);

  const login = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (!user) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <h2>Welcome to TimeLock</h2>

          <button
            className="google-btn"
            onClick={login}
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-card">

        <img
          src={
            user.user_metadata?.avatar_url ||
            user.user_metadata?.picture
          }
          alt="Profile"
          className="avatar"
          onError={(e) => {
            e.target.src =
              "https://ui-avatars.com/api/?name=" +
              encodeURIComponent(
                user.user_metadata?.full_name || "User"
              );
          }}
        />

        <h2>{user.user_metadata?.full_name}</h2>

        <p className="email">
          {user.email}
        </p>

        <div className="divider" />

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

        <div className="divider" />

        <button onClick={() => console.log(user)}>
          Show User Data
        </button>

        <button
          className="setting-btn"
          onClick={() => navigate("/profile/edit")}
        >
          ⚙️ Edit Profile
        </button>

        <button
          className="logout-btn"
          onClick={logout}
        >
          🚪 Logout
        </button>

      </div>
    </div>
  );
}