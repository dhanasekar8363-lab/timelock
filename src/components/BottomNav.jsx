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

  return (
    <nav className="bottom-nav">
      <div className="nav-container">
        {tabs.map((tab) => (
          <button
            key={tab.path}
            className={`nav-item ${location.pathname === tab.path ? "nav-active" : ""}`}
            onClick={() => navigate(tab.path)}
            aria-label={tab.label}
            title={tab.label}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export default BottomNav;
