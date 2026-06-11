import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
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
    { bg: "rgba(255,180,80,0.15)", border: "rgba(255,180,80,0.35)", icon: "#ffb450" },
    { bg: "rgba(100,220,180,0.15)", border: "rgba(100,220,180,0.35)", icon: "#64dca0" },
  ];
  return accents[index % accents.length];
}

function Home() {
  const [capsules, setCapsules] = useState([]);
  const [activeTab, setActiveTab] = useState("sent");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCapsules();
  }, []);

  const fetchCapsules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("capsules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.log(error);
      setLoading(false);
      return;
    }

    setCapsules(data);
    setLoading(false);
  };

  const sentCapsules = capsules.filter((c) => !c.is_received);
  const receivedCapsules = capsules.filter((c) => c.is_received);
  const displayCapsules = activeTab === "sent" ? sentCapsules : receivedCapsules;
  const receivedCount = receivedCapsules.length;

  return (
    <div
      className="home"
      style={{ backgroundImage: `url(${homeBg})` }}
    >
      {/* Overlay gradient */}
      <div className="home-overlay" />

      {/* Header */}
      <div className="home-header">
        <button className="menu-btn" aria-label="Menu">
          <span /><span /><span />
        </button>
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
              const emoji = getCapsuleEmoji(capsule.title);
              return (
                <div
                  key={capsule.id}
                  className="capsule-card"
                  style={{
                    "--card-bg": accent.bg,
                    "--card-border": accent.border,
                    "--card-icon": accent.icon,
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
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {", "}
                      {new Date(capsule.unlock_date).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {new Date() >= new Date(capsule.unlock_date) ? (
                      <span className="card-lock-badge card-lock-badge--open">🔓 Unlocked</span>
                    ) : (
                      <span className="card-lock-badge">🔒 Locked</span>
                    )}
                  </div>
                  <div className="card-chevron">›</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="bottom-spacer" />
      <BottomNav />
    </div>
  );
}

export default Home;
