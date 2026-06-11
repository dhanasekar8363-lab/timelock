import "./CapsuleCard.css";

/* ─── Cover config ─────────────────────────────────────────────── */
const COVER_CONFIG = {
  bottle:   { emoji: "🫙", gradient: "linear-gradient(135deg,#7c3aed,#a855f7,#ec4899)", glow: "rgba(168,85,247,0.50)" },
  balloon:  { emoji: "🎈", gradient: "linear-gradient(135deg,#f97316,#ec4899,#a855f7)", glow: "rgba(249,115,22,0.45)" },
  letter:   { emoji: "💌", gradient: "linear-gradient(135deg,#ec4899,#f43f5e,#a855f7)", glow: "rgba(236,72,153,0.45)" },
  moon:     { emoji: "🌙", gradient: "linear-gradient(135deg,#1e3a5f,#3b82f6,#6366f1)", glow: "rgba(99,102,241,0.45)" },
  gift:     { emoji: "🎁", gradient: "linear-gradient(135deg,#10b981,#3b82f6,#a855f7)", glow: "rgba(16,185,129,0.45)" },
  default:  { emoji: "⏳", gradient: "linear-gradient(135deg,#6366f1,#a855f7,#ec4899)", glow: "rgba(99,102,241,0.45)" },
};

/* ─── Status config ─────────────────────────────────────────────── */
const STATUS_CONFIG = {
  locked:   { label: "🔒 Locked",   cls: "cc-status--locked"   },
  unlocked: { label: "🔓 Unlocked", cls: "cc-status--unlocked" },
  pending:  { label: "⏳ Pending",  cls: "cc-status--pending"  },
  draft:    { label: "✏️ Draft",    cls: "cc-status--draft"    },
};

/* ─── Helpers ───────────────────────────────────────────────────── */
function formatUnlockDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
         " · " +
         d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  if (isNaN(diff) || diff < 0) return null;
  return Math.ceil(diff / 86_400_000);
}

/* ─── Component ─────────────────────────────────────────────────── */
function CapsuleCard({
  title      = "Untitled Capsule",
  receiver   = "Someone",
  unlockDate = null,
  coverType  = "default",
  status     = "locked",
  onClick,
}) {
  const cover  = COVER_CONFIG[coverType]  ?? COVER_CONFIG.default;
  const badge  = STATUS_CONFIG[status]    ?? STATUS_CONFIG.locked;
  const days   = daysUntil(unlockDate);
  const isOpen = status === "unlocked";

  return (
    <article
      className={`cc-card ${isOpen ? "cc-card--open" : ""}`}
      style={{ "--cc-glow": cover.glow }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick(e) : undefined}
      aria-label={`${title} — ${badge.label}`}
    >
      {/* Ambient glow */}
      <div className="cc-glow" />

      {/* Cover thumbnail */}
      <div className="cc-cover" style={{ background: cover.gradient }}>
        <div className="cc-cover-shine" />
        <span className="cc-cover-emoji" aria-hidden="true">{cover.emoji}</span>
        {/* Floating particle */}
        <span className="cc-cover-orb" aria-hidden="true">✨</span>
      </div>

      {/* Content */}
      <div className="cc-content">
        <div className="cc-top">
          <p className="cc-receiver">To: <strong>{receiver}</strong></p>
          <span className={`cc-status ${badge.cls}`}>{badge.label}</span>
        </div>

        <h3 className="cc-title">{title}</h3>

        <div className="cc-meta">
          <span className="cc-meta-item">
            <span className="cc-meta-icon">📅</span>
            {formatUnlockDate(unlockDate)}
          </span>
          {days !== null && (
            <span className="cc-meta-item cc-days-pill">
              {days === 0 ? "Opens today" : `${days}d left`}
            </span>
          )}
        </div>
      </div>

      {/* Chevron */}
      <div className="cc-arrow" aria-hidden="true">›</div>
    </article>
  );
}

export default CapsuleCard;
