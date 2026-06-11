import { useNavigate, useLocation } from "react-router-dom";

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { icon: "🏠", label: "Home",     path: "/" },
    { icon: "➕", label: "Create",   path: "/create" },
    { icon: "💬", label: "Messages", path: "/messages" },
    { icon: "👤", label: "Profile",  path: "/profile" },
  ];

  return (
    <div className="bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.path}
          className={location.pathname === tab.path ? "nav-active" : ""}
          onClick={() => navigate(tab.path)}
          aria-label={tab.label}
        >
          <span className="nav-icon">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default BottomNav;
