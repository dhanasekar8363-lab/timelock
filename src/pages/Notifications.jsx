import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  supabase,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationsRead,
} from "../services/supabase";
import "./Notifications.css";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Infer notification type from title so we can colour-code the icon bubble
 * without adding a `type` column to the DB.
 */
function getNotifType(title = "") {
  const t = title.toLowerCase();
  if (t.includes("follower") || t.includes("following")) return "follower";
  if (t.includes("message"))                               return "message";
  if (t.includes("shared") || t.includes("share"))        return "shared";
  if (t.includes("unlock") || t.includes("opened"))       return "unlocked";
  return "default";
}

const TYPE_ICON = {
  follower: "👤",
  message:  "💬",
  shared:   "📦",
  unlocked: "🔓",
  default:  "🔔",
};

/** Relative time string ("2 m ago", "3 h ago", etc.) */
function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/** Group notifications into "Today" and "Earlier" */
function groupByDay(notifications) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const today   = [];
  const earlier = [];

  notifications.forEach((n) => {
    if (new Date(n.created_at) >= todayStart) today.push(n);
    else earlier.push(n);
  });

  return { today, earlier };
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className="notif-skeleton-list">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="notif-skeleton-item">
          <div className="skeleton-bubble" />
          <div className="skeleton-lines">
            <div className="skeleton-line w-60" />
            <div className="skeleton-line w-80" />
            <div className="skeleton-line w-35" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Single notification row ────────────────────────────────────────────────

function NotifItem({ notif, onRead }) {
  const type = getNotifType(notif.title);

  return (
    <div
      className={`notif-item ${!notif.is_read ? "notif-unread" : ""}`}
      onClick={() => onRead(notif)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onRead(notif)}
      aria-label={`${notif.title}: ${notif.message}`}
    >
      <div className={`notif-icon-bubble type-${type}`}>
        {TYPE_ICON[type]}
        {!notif.is_read && <span className="notif-unread-dot" aria-hidden="true" />}
      </div>
      <div className="notif-content">
        <p className="notif-title">{notif.title}</p>
        <p className="notif-message">{notif.message}</p>
        <p className="notif-time">{relativeTime(notif.created_at)}</p>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Notifications() {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [userId,        setUserId]        = useState(null);
  const [marking,       setMarking]       = useState(false);
  const [toast,         setToast]         = useState("");

  // ── Show a brief toast ──────────────────────────────────────────────────
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // ── Fetch all notifications for the current user ────────────────────────
  const fetchNotifications = useCallback(async (uid) => {
    const { data } = await getNotifications(uid);
    setNotifications(data || []);
    const { count } = await getUnreadNotificationCount(uid);
    setUnreadCount(count);
  }, []);

  // ── On mount: resolve user, load data, subscribe to realtime ───────────
  useEffect(() => {
    let channel = null;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { navigate("/login"); return; }

      const uid = data.user.id;
      setUserId(uid);

      await fetchNotifications(uid);
      setLoading(false);

      // ── Supabase Realtime ──────────────────────────────────────────────
      channel = supabase
        .channel(`notifications-page-${uid}`)
        // New notification arrives → prepend it
        .on(
          "postgres_changes",
          {
            event:  "INSERT",
            schema: "public",
            table:  "notifications",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            setNotifications((prev) => [payload.new, ...prev]);
            setUnreadCount((prev) => prev + 1);
          }
        )
        // Notification updated (e.g. is_read toggled) → replace in list
        .on(
          "postgres_changes",
          {
            event:  "UPDATE",
            schema: "public",
            table:  "notifications",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            setNotifications((prev) =>
              prev.map((n) => (n.id === payload.new.id ? payload.new : n))
            );
            // Re-derive count from local state rather than refetching
            setUnreadCount((prev) =>
              payload.new.is_read && !payload.old?.is_read
                ? Math.max(0, prev - 1)
                : prev
            );
          }
        )
        .subscribe();
    };

    init();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [fetchNotifications, navigate]);

  // ── Mark a single notification as read (optimistic) ────────────────────
  const handleRead = async (notif) => {
    if (notif.is_read) return;

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notif.id);
  };

  // ── Mark all as read ────────────────────────────────────────────────────
  const handleMarkAll = async () => {
    if (!userId || unreadCount === 0 || marking) return;
    setMarking(true);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    const { error } = await markNotificationsRead(userId);
    setMarking(false);

    if (error) {
      // Roll back on failure
      await fetchNotifications(userId);
    } else {
      showToast("All caught up ✓");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const { today, earlier } = groupByDay(notifications);
  const hasAny = notifications.length > 0;

  return (
    <div className="notif-page">
      {/* Toast */}
      <div className={`notif-toast ${toast ? "show" : ""}`} aria-live="polite">
        {toast}
      </div>

      {/* Header */}
      <header className="notif-header">
        <button
          className="notif-back-btn"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ←
        </button>

        <h1 className="notif-header-title">Notifications</h1>

        <div className="notif-header-right">
          <span className="notif-live-label">
            <span className="notif-live-dot" aria-hidden="true" />
            Live
          </span>
          {unreadCount > 0 && (
            <button
              className="notif-mark-all-btn"
              onClick={handleMarkAll}
              disabled={marking}
              aria-label="Mark all notifications as read"
            >
              {marking ? "Marking…" : "Mark all read"}
            </button>
          )}
        </div>
      </header>

      {/* Unread count */}
      {!loading && unreadCount > 0 && (
        <p className="notif-count-strip">
          {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
        </p>
      )}

      {/* Content */}
      {loading ? (
        <SkeletonList />
      ) : !hasAny ? (
        <div className="notif-empty" role="status">
          <span className="notif-empty-icon" aria-hidden="true">🔔</span>
          <p className="notif-empty-title">Nothing here yet</p>
          <p className="notif-empty-sub">
            When someone follows you, sends a message,<br />
            or shares a capsule — it'll show up here.
          </p>
        </div>
      ) : (
        <div className="notif-list" role="list">
          {today.length > 0 && (
            <>
              <p className="notif-section-label">Today</p>
              {today.map((n) => (
                <NotifItem key={n.id} notif={n} onRead={handleRead} />
              ))}
            </>
          )}
          {earlier.length > 0 && (
            <>
              <p className="notif-section-label">Earlier</p>
              {earlier.map((n) => (
                <NotifItem key={n.id} notif={n} onRead={handleRead} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
