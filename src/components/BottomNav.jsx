import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase, getUnreadNotificationCount } from "../services/supabase";
import "./BottomNav.css";

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let channel = null;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) return;
      const userId = data.user.id;

      // Initial fetch
      const { count } = await getUnreadNotificationCount(userId);
      setUnreadCount(count);

      // Real-time subscription — increment on new INSERT, refetch on UPDATE
      channel = supabase
        .channel(`notif-badge-${userId}`)
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

    init();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Reset badge when landing on notifications page
  useEffect(() => {
    if (location.pathname === "/notifications") {
      setUnreadCount(0);
    }
  }, [location.pathname]);

  const tabs = [
    { icon: "🏠", label: "Home",          path: "/" },
    { icon: "➕", label: "Create",        path: "/create" },
    { icon: "🔍", label: "Search",        path: "/search" },
    { icon: "💬", label: "Messages",      path: "/messages" },
    { icon: "🔔", label: "Alerts",        path: "/notifications", badge: unreadCount },
    { icon: "👤", label: "Profile",       path: "/profile" },
  ];

  const isActive = (path) => {
    const pathname = location.pathname;
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.path}
          className={`nav-item ${isActive(tab.path) ? "nav-active" : ""}`}
          onClick={() => navigate(tab.path)}
          aria-label={tab.label}
          title={tab.label}
        >
          <span className="nav-icon-wrap">
            <span className="nav-icon">{tab.icon}</span>
            {tab.badge > 0 && (
              <span className="nav-badge">
                {tab.badge > 9 ? "9+" : tab.badge}
              </span>
            )}
          </span>
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default BottomNav;
