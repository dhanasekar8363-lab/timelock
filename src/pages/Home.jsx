import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase, getUnreadNotificationCount } from "../services/supabase";
import BottomNav from "../components/BottomNav";
import homeBg from "../assets/backgrounds/home-bg.jpg";
import coverLove       from "../covers/love.png";
import coverBirthday   from "../covers/birthday.png";
import coverFuture     from "../covers/future.png";
import coverGraduation from "../covers/graduation.png";
import "./Home.css";

const COVER_IMAGES = {
  love:       coverLove,
  birthday:   coverBirthday,
  future:     coverFuture,
  graduation: coverGraduation,
};

function getCapsuleEmoji(title = "") {
  const t = title.toLowerCase();
  if (t.includes("anniversary") || t.includes("love") || t.includes("ananya")) return "❤️";
  if (t.includes("college") || t.includes("friend") || t.includes("school")) return "🎓";
  if (t.includes("future") || t.includes("self")) return "🎁";
  if (t.includes("mom") || t.includes("dad") || t.includes("parent") || t.includes("family")) return "👨‍👩‍👧";
  return "📦";
}

function getCapsuleAccent(index) {
  const accents = [
    { bg: "rgba(255,100,100,0.15)", border: "rgba(255,100,100,0.35)", icon: "#ff6b6b" },
    { bg: "rgba(100,180,255,0.15)", border: "rgba(100,180,255,0.35)", icon: "#64b4ff" },
    { bg: "rgba(255,180,80,0.15)",  border: "rgba(255,180,80,0.35)",  icon: "#ffb450" },
    { bg: "rgba(100,220,180,0.15)", border: "rgba(100,220,180,0.35)", icon: "#64dca0" },
  ];
  return accents[index % accents.length];
}

function Home() {
  const [capsules, setCapsules]         = useState([]);
  const [activeTab, setActiveTab]       = useState("sent");
  const [loading, setLoading]           = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [openMenuId, setOpenMenuId]     = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [unreadCount, setUnreadCount]     = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCapsules();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data?.user?.id ?? null);
    });
  }, []);

  // ── Notification bell — fetch count + live updates ────────────────────────
  useEffect(() => {
    let channel = null;

    const initBell = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) return;
      const userId = data.user.id;

      const { count } = await getUnreadNotificationCount(userId);
      setUnreadCount(count);

      channel = supabase
        .channel(`home-notif-bell-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          () => setUnreadCount((prev) => prev + 1)
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          async () => {
            const { count: fresh } = await getUnreadNotificationCount(userId);
            setUnreadCount(fresh);
          }
        )
        .subscribe();
    };

    initBell();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  const fetchCapsules = async () => {
    setLoading(true);

    // ── Always scope to the authenticated user ──────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      console.error("fetchCapsules: not authenticated", authErr);
      setLoading(false);
      return;
    }
    console.log("📦 Fetching capsules for user:", user.id);
    // ────────────────────────────────────────────────────────────────────────

    const { data, error } = await supabase
      .from("capsules")
      .select("*")
      .or(`user_id.eq.${user.id},sender_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch capsules error:", error);
      setLoading(false);
      return;
    }

    console.log("📦 Fetched capsules:", data);
    setCapsules(data);
    setLoading(false);
  };

  // ── handleDelete ──────────────────────────────────────────────────────────
  const handleDelete = async (capsuleId) => {
    try {
      setDeleting(true);

      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        alert("You must be logged in to delete capsules.");
        return;
      }

      const capsule = capsules.find((c) => c.id === capsuleId);
      console.log("👤 user.id        :", user.id);
      console.log("🫙 capsule.id     :", capsule?.id);
      console.log("🫙 capsule.user_id:", capsule?.user_id);
      console.log("🫙 capsule.sender_id:", capsule?.sender_id);

      const { data, error } = await supabase
        .from("capsules")
        .delete()
        .eq("id", capsuleId)
        .select();

      console.log("Delete result:", data);
      console.log("Delete error :", error);

      if (error) {
        console.error("Supabase delete error:", error);
        alert(`Delete failed: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        console.warn(
          `⚠️ No rows deleted — RLS blocked the operation.\n` +
          `   Ensure your Supabase DELETE policy is:\n` +
          `   (auth.uid() = user_id) OR (auth.uid() = sender_id)`
        );
        alert("Delete blocked by Supabase RLS. Check the browser console for details.");
        return;
      }

      console.log(`✅ Deleted ${data.length} capsule(s)`);
      setCapsules((prev) => prev.filter((c) => c.id !== capsuleId));
      setDeleteTarget(null);
    } catch (err) {
      console.error("Unexpected delete error:", err);
      alert(`Unexpected error: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };
  // ──────────────────────────────────────────────────────────────────────────

  const sentCapsules     = capsules.filter((c) => !c.is_received);
  const receivedCapsules = capsules.filter((c) => c.is_received);
  const displayCapsules  = activeTab === "sent" ? sentCapsules : receivedCapsules;
  const receivedCount    = receivedCapsules.length;

  return (
    <div
      className="home"
      style={{ backgroundImage: `url(${homeBg})` }}
      onClick={() => setOpenMenuId(null)}
    >
      {/* Overlay gradient */}
      <div className="home-overlay" />

      {/* Header */}
      <div className="home-header">
        <div className="header-left">
          <button className="menu-btn" aria-label="Menu">
            <span /><span /><span />
          </button>
          <button
            className="notif-bell-btn"
            onClick={() => navigate("/notifications")}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          >
            🔔
            {unreadCount > 0 && (
              <span className="notif-bell-badge">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>
        <div className="crown-btn" aria-label="Premium">👑</div>
      </div>

      {/* Hero */}
      <div className="hero-section">
        <h1 className="timelock-logo">
          <span className="logo-time">Time</span><span className="logo-lock">Lock</span>
          <span className="logo-flourish">✦</span>
        </h1>
        <p className="hero-tagline">
          Send a message to the future.<br />
          They can open it only when<br />
          the time arrives. ✨
        </p>

        <div className="hero-illustration" aria-hidden="true">
          <div className="bottle-glow" />
          <div className="bottle-emoji">🫙</div>
          <div className="float-orb orb-1">✨</div>
          <div className="float-orb orb-2">🏮</div>
          <div className="float-orb orb-3">⭐</div>
        </div>

        <button
          className="create-btn"
          onClick={() => navigate("/create")}
        >
          <span className="create-btn-plus">＋</span>
          Create Capsule
        </button>
      </div>

      {/* My Capsules */}
      <div className="capsules-section">
        <h2 className="section-title">My Capsules</h2>

        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === "sent" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("sent")}
          >
            Sent
          </button>
          <button
            className={`tab-btn ${activeTab === "received" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("received")}
          >
            Received
            {receivedCount > 0 && (
              <span className="tab-badge">{receivedCount}</span>
            )}
          </button>
        </div>

        <div className="capsule-list">
          {loading ? (
            <div className="empty-state">Loading capsules…</div>
          ) : displayCapsules.length === 0 ? (
            <div className="empty-state">
              {activeTab === "sent"
                ? "No capsules sent yet. Create your first one!"
                : "No capsules received yet."}
            </div>
          ) : (
            displayCapsules.map((capsule, i) => {
              const accent = getCapsuleAccent(i);
              const emoji  = getCapsuleEmoji(capsule.title);
              return (
                <div
                  key={capsule.id}
                  className="capsule-card"
                  style={{
                    "--card-bg":     accent.bg,
                    "--card-border": accent.border,
                    "--card-icon":   accent.icon,
                    position: "relative",
                  }}
                  onClick={() => navigate(`/capsule/${capsule.slug}`)}
                >
                  <div className="card-icon-wrap">
                    {COVER_IMAGES[capsule.cover_type] ? (
                      <img
                        src={COVER_IMAGES[capsule.cover_type]}
                        alt={capsule.cover_type}
                        className="card-cover-img"
                      />
                    ) : (
                      <span className="card-icon">{emoji}</span>
                    )}
                  </div>
                  <div className="card-body">
                    <p className="card-to">
                      {activeTab === "sent" ? "To:" : "From:"}{" "}
                      <strong>{capsule.receiver_email || capsule.title}</strong>
                    </p>
                    <p className="card-opens">
                      Opens on{" "}
                      {new Date(capsule.unlock_date).toLocaleDateString("en-GB", {
                        day:   "2-digit",
                        month: "short",
                        year:  "numeric",
                      })}
                      {", "}
                      {new Date(capsule.unlock_date).toLocaleTimeString("en-US", {
                        hour:   "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {new Date() >= new Date(capsule.unlock_date) ? (
                      <span className="card-lock-badge card-lock-badge--open">🔓 Unlocked</span>
                    ) : (
                      <span className="card-lock-badge">🔒 Locked</span>
                    )}
                  </div>

                  {/* ⋮ menu — only for own capsules */}
                  {(!capsule.user_id ||
                    capsule.user_id === currentUserId ||
                    capsule.sender_id === currentUserId) && (
                    <div className="card-menu-wrap">
                      <button
                        className="card-menu-btn"
                        aria-label="More options"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === capsule.id ? null : capsule.id);
                        }}
                      >
                        ⋮
                      </button>
                      {openMenuId === capsule.id && (
                        <div
                          className="card-menu-dropdown"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            className="card-menu-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              setDeleteTarget(capsule);
                            }}
                          >
                            🗑️ Delete
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="delete-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-icon">🗑️</div>
            <h3>Delete Capsule?</h3>
            <p>"{deleteTarget.title}" will be permanently deleted.</p>
            <div className="delete-actions">
              <button className="cancel-btn" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="confirm-delete-btn"
                onClick={() => handleDelete(deleteTarget.id)}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bottom-spacer" />
      <BottomNav />
    </div>
  );
}

export default Home;
