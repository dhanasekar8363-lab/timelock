import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  supabase,
  getNotifications,
  markNotificationsRead,
  createNotification,
} from "../services/supabase";
import homeBg from "../assets/backgrounds/main-bg.jpg";
import "./Notifications.css";

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function getIcon(title = "") {
  const t = title.toLowerCase();
  if (t.includes("message"))                      return { emoji: "💬", color: "#60a5fa" };
  if (t.includes("follower") || t.includes("follow")) return { emoji: "👤", color: "#a78bfa" };
  if (t.includes("unlock"))                        return { emoji: "🔓", color: "#34d399" };
  if (t.includes("capsule") || t.includes("share")) return { emoji: "📬", color: "#f59e0b" };
  return { emoji: "🔔", color: "#a78bfa" };
}

function getDestination(title = "") {
  const t = title.toLowerCase();
  if (t.includes("message"))  return "/messages";
  if (t.includes("follower")) return "/profile";
  if (t.includes("capsule"))  return "/";
  return null;
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="notif-skeleton-list">
      {[1, 2, 3, 4].map((i) => (
        <div className="notif-skeleton-item" key={i}>
          <div className="sk-icon" />
          <div className="sk-body">
            <div className="sk-line long" />
            <div className="sk-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Notifications() {
  const navigate = useNavigate();
  const [user, setUser]               = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]         = useState(true);

  // ── Check for newly unlocked capsules and create notifications if needed
  const checkUnlockedCapsules = useCallback(async (userId) => {
    try {
      const now = new Date().toISOString();
      const { data: capsules } = await supabase
        .from("capsules")
        .select("id, title, slug, unlock_date")
        .or(`user_id.eq.${userId},sender_id.eq.${userId}`)
        .lte("unlock_date", now)
        .order("unlock_date", { ascending: false })
        .limit(20);

      if (!capsules || capsules.length === 0) return;

      // Fetch existing "Capsule Unlocked" notifications to avoid dupes
      const { data: existingNotifs } = await supabase
        .from("notifications")
        .select("message")
        .eq("user_id", userId)
        .eq("title", "Capsule Unlocked");

      const notifiedMsgs = new Set(existingNotifs?.map((n) => n.message) || []);

      for (const cap of capsules) {
        const msg = `"${cap.title}" is now unlocked and ready to open!`;
        if (!notifiedMsgs.has(msg)) {
          await createNotification(userId, "Capsule Unlocked", msg);
        }
      }
    } catch (err) {
      console.error("checkUnlockedCapsules:", err);
    }
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { navigate("/login"); return; }
      setUser(data.user);

      const userId = data.user.id;

      // Check for newly unlocked capsules first
      await checkUnlockedCapsules(userId);

      // Mark all unread as read (silently)
      markNotificationsRead(userId);

      // Fetch all notifications
      const { data: notifs } = await getNotifications(userId);
      setNotifications(notifs || []);
      setLoading(false);
    };

    init();
  }, [navigate, checkUnlockedCapsules]);

  // ── Real-time — prepend new notifications as they arrive ─────────────────
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notif-page-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) => {
            if (prev.find((n) => n.id === payload.new.id)) return prev;
            return [{ ...payload.new, is_read: true }, ...prev];
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const handleNotifClick = (notif) => {
    const dest = getDestination(notif.title);
    if (dest) navigate(dest);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="notif-page"
      style={{ backgroundImage: `url(${homeBg})` }}
    >
      <div className="notif-overlay" />

      <div className="notif-container">
        {/* Header */}
        <div className="notif-header">
          <button className="notif-back-btn" onClick={() => navigate(-1)} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="notif-title">Notifications</h1>
          <div className="notif-header-spacer" />
        </div>

        {/* Body */}
        <div className="notif-body">
          {loading ? (
            <Skeleton />
          ) : notifications.length === 0 ? (
            <div className="notif-empty">
              <div className="notif-empty-bell">🔔</div>
              <h3>All quiet here</h3>
              <p>You'll see messages, follows,<br />and capsule updates here.</p>
            </div>
          ) : (
            <div className="notif-list">
              {notifications.map((notif) => {
                const { emoji, color } = getIcon(notif.title);
                const clickable = !!getDestination(notif.title);
                return (
                  <div
                    key={notif.id}
                    className={`notif-item ${!notif.is_read ? "notif-unread" : ""} ${clickable ? "notif-clickable" : ""}`}
                    style={{ "--notif-accent": color }}
                    onClick={() => clickable && handleNotifClick(notif)}
                  >
                    <div className="notif-icon" style={{ background: `${color}22`, color }}>
                      {emoji}
                    </div>
                    <div className="notif-content">
                      <div className="notif-item-header">
                        <span className="notif-item-title">{notif.title}</span>
                        <span className="notif-item-time">{timeAgo(notif.created_at)}</span>
                      </div>
                      <p className="notif-item-msg">{notif.message}</p>
                    </div>
                    {!notif.is_read && <span className="notif-dot" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
