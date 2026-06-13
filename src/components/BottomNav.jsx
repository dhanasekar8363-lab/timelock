import { useNavigate, useLocation } from "react-router-dom";
import "./BottomNav.css";

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { icon: "🏠", label: "Home",     path: "/" },
    { icon: "➕", label: "Create",   path: "/create" },
    { icon: "🔍", label: "Search",   path: "/search" },
    { icon: "💬", label: "Messages", path: "/messages" },
    { icon: "👤", label: "Profile",  path: "/profile" },
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
          <span className="nav-icon">{tab.icon}</span>
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default BottomNav;
