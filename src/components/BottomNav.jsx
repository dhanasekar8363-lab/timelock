import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "./BottomNav.css";

// XP amounts granted per reward type
const REWARD_XP = {
  capsule_created: 70,
  capsule_unlocked: 140,
};

// Unique key we write & clear in localStorage
const REWARD_KEY = "pet_xp_reward";

function XpPopup({ xp, onDone }) {
  return (
    <motion.div
      className="xp-popup"
      initial={{ opacity: 0, y: 0, scale: 0.8 }}
      animate={{ opacity: 1, y: -52, scale: 1 }}
      exit={{ opacity: 0, y: -90, scale: 0.9 }}
      transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
      onAnimationComplete={(def) => {
        // "exit" phase finishes → tell parent we're done
        if (def === "exit") onDone?.();
      }}
    >
      <motion.span
        animate={{ opacity: [1, 1, 0] }}
        transition={{ duration: 2, times: [0, 0.55, 1], ease: "easeInOut" }}
      >
        +{xp} XP
      </motion.span>
    </motion.div>
  );
}

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  // Each popup gets a unique id so duplicates never merge
  const [popups, setPopups] = useState([]);
  const seenRef = useRef(new Set());

  const tabs = [
    { icon: "🏠", label: "Home",     path: "/" },
    { icon: "➕", label: "Create",   path: "/create" },
    { icon: "🔍", label: "Search",   path: "/search" },
    { icon: "💬", label: "Messages", path: "/messages" },
    { icon: "🐱", label: "Pet",      path: "/pet" },
    { icon: "👤", label: "Profile",  path: "/profile" },
  ];

  const petIndex = tabs.findIndex((t) => t.path === "/pet");

  const isActive = (path) => {
    const pathname = location.pathname;
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname.startsWith(path)) return true;
    return false;
  };

  // Poll localStorage for new reward events
  const checkReward = useCallback(() => {
    try {
      const raw = localStorage.getItem(REWARD_KEY);
      if (!raw) return;

      const event = JSON.parse(raw);
      const { type, id } = event ?? {};

      // Deduplicate by event id (caller must supply one)
      const dedupKey = id ?? raw;
      if (seenRef.current.has(dedupKey)) return;
      seenRef.current.add(dedupKey);

      const xp = REWARD_XP[type];
      if (!xp) return;

      // Remove from localStorage immediately so other tabs don't re-fire
      localStorage.removeItem(REWARD_KEY);

      const popupId = `${dedupKey}-${Date.now()}`;
      setPopups((prev) => [...prev, { id: popupId, xp }]);

      // Auto-remove after the animation window (2.4 s)
      setTimeout(() => {
        setPopups((prev) => prev.filter((p) => p.id !== popupId));
      }, 2400);
    } catch {
      // Malformed JSON — clear and move on
      localStorage.removeItem(REWARD_KEY);
    }
  }, []);

  useEffect(() => {
    // Check immediately on mount
    checkReward();

    // Poll every 300 ms
    const interval = setInterval(checkReward, 300);

    // Also react to storage events from other tabs
    const onStorage = (e) => {
      if (e.key === REWARD_KEY) checkReward();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, [checkReward]);

  return (
    <nav className="bottom-nav">
      {tabs.map((tab, idx) => (
        <div
          key={tab.path}
          className="nav-item-wrapper"
          style={{ position: "relative", flex: 1, maxWidth: 84 }}
        >
          {/* XP popups float above the Pet tab only */}
          {idx === petIndex && (
            <AnimatePresence>
              {popups.map((popup) => (
                <XpPopup
                  key={popup.id}
                  xp={popup.xp}
                  onDone={() =>
                    setPopups((prev) => prev.filter((p) => p.id !== popup.id))
                  }
                />
              ))}
            </AnimatePresence>
          )}

          <button
            className={`nav-item ${isActive(tab.path) ? "nav-active" : ""}`}
            onClick={() => navigate(tab.path)}
            aria-label={tab.label}
            title={tab.label}
            style={{ width: "100%" }}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        </div>
      ))}
    </nav>
  );
}

export default BottomNav;
