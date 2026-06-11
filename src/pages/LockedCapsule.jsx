import { useState, useEffect } from "react";
import lockedBg from "../assets/backgrounds/locked-bg.png";
import "./LockedCapsule.css";

/* ── Inline SVG lock illustration ─────────────── */
const LockIllustration = () => (
  <svg
    className="lc-lock-svg"
    viewBox="0 0 160 180"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#A855F7" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="bodyGrad" cx="40%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#FDE68A" />
        <stop offset="60%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#B45309" />
      </radialGradient>
      <radialGradient id="shackleGrad" cx="50%" cy="0%" r="100%">
        <stop offset="0%" stopColor="#FCD34D" />
        <stop offset="100%" stopColor="#D97706" />
      </radialGradient>
      <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F472B6" />
        <stop offset="100%" stopColor="#A855F7" />
      </linearGradient>
      <filter id="lockGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* Outer halo */}
    <ellipse cx="80" cy="110" rx="68" ry="62" fill="url(#haloGrad)" />

    {/* Shackle (U-arch) */}
    <path
      d="M 52 92 L 52 62 Q 52 32 80 32 Q 108 32 108 62 L 108 92"
      fill="none"
      stroke="url(#shackleGrad)"
      strokeWidth="16"
      strokeLinecap="round"
      filter="url(#subtleGlow)"
    />

    {/* Lock body */}
    <rect
      x="28"
      y="88"
      width="104"
      height="78"
      rx="18"
      fill="url(#bodyGrad)"
      filter="url(#lockGlow)"
    />

    {/* Subtle body shine */}
    <ellipse cx="80" cy="98" rx="36" ry="10" fill="rgba(255,255,255,0.18)" />

    {/* Heart keyhole */}
    <path
      d="M 68 128
         C 68 121 58 117 58 124
         C 58 129 68 137 80 144
         C 92 137 102 129 102 124
         C 102 117 92 121 92 128
         C 88 123 72 123 68 128 Z"
      fill="url(#heartGrad)"
      filter="url(#subtleGlow)"
    />

    {/* Sparkle dots */}
    <circle cx="20" cy="48" r="3" fill="#FDE68A" opacity="0.9" />
    <circle cx="140" cy="38" r="2" fill="#F9A8D4" opacity="0.85" />
    <circle cx="148" cy="90" r="2.5" fill="#C084FC" opacity="0.8" />
    <circle cx="14" cy="110" r="2" fill="#FDE68A" opacity="0.7" />

    {/* ✦ Star sparkles */}
    <text x="10"  y="30"  fontSize="14" fill="#FDE68A" opacity="0.9">✦</text>
    <text x="134" y="60"  fontSize="10" fill="#F9A8D4" opacity="0.85">✦</text>
    <text x="130" y="115" fontSize="8"  fill="#C084FC" opacity="0.75">✦</text>
  </svg>
);

/* ── Countdown card ────────────────────────────── */
const CountCard = ({ value, label }) => (
  <div className="lc-count-card">
    <span className="lc-count-num">{String(value).padStart(2, "0")}</span>
    <span className="lc-count-label">{label}</span>
  </div>
);

/* ── Helpers ───────────────────────────────────── */
function calcTimeLeft(unlockDate) {
  if (!unlockDate) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const diff = new Date(unlockDate).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

/* ── Build the shareable link ── */
function buildShareLink(slug) {
  if (!slug) return window.location.href;
  // Web URL — works in browser and can be converted to deep link on the native side
  const origin = window.location.origin;
  return `${origin}/capsule/${slug}`;
}

/* ── Component ─────────────────────────────────── */
function LockedCapsule({
  /* Existing unlock logic props — unchanged */
  unlockDate,
  onUnlock,

  /* Display props */
  capsuleTitle = "Time Capsule",
  senderName = "Dhanush 💜",
  recipientName = "Ananya ❤️",
  recipientEmail = "ananya@email.com",
  hint = null,
  coverImage = null,

  /* Share prop — passed from CapsuleViewer */
  slug = null,
}) {
  const [timeLeft, setTimeLeft] = useState(calcTimeLeft(unlockDate));
  const [notifySet, setNotifySet] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shared, setShared] = useState(false);

  /* Tick every second */
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    setTimeLeft(calcTimeLeft(unlockDate));
    const id = setInterval(() => {
      const tl = calcTimeLeft(unlockDate);
      setTimeLeft(tl);

      /* Existing unlock logic — unchanged */
      const allZero = Object.values(tl).every((v) => v === 0);
      if (allZero && unlockDate && typeof onUnlock === "function") {
        onUnlock();
      }
    }, 1_000);
    return () => clearInterval(id);
  }, [unlockDate, onUnlock]);

  /* ── Share handler ── */
  const shareCapsule = async () => {
    const link = buildShareLink(slug);
    const shareData = {
      title: `TimeLock Capsule: ${capsuleTitle}`,
      text: "I'm sending you a time capsule — open it when the time comes 🔒",
      url: link,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(link);
        setShared(true);
        setTimeout(() => setShared(false), 2500);
      }
    } catch (_) {
      // User cancelled share — no-op
    }
  };

  return (
    <div
      className="locked-page"
      style={{ backgroundImage: `url(${lockedBg})` }}
    >
      <div className="locked-overlay">
        <div className={`locked-content${visible ? " locked-content--visible" : ""}`}>

          {/* ── Sender label ─────────────────── */}
          <p className="lc-sender">From: {senderName}</p>

          {/* ── Floating lock ────────────────── */}
          <div className="lc-lock-wrapper">
            <div className="lc-lock-halo" />
            <LockIllustration />
          </div>

          {/* ── Cover + title block ───────────── */}
          {(coverImage || capsuleTitle) && (
            <div className="lc-capsule-id">
              {coverImage && (
                <img
                  className="lc-cover-thumb"
                  src={coverImage}
                  alt="Capsule cover"
                />
              )}
              {capsuleTitle && (
                <span className="lc-capsule-title">{capsuleTitle}</span>
              )}
            </div>
          )}

          {/* ── Main heading ──────────────────── */}
          <h1 className="lc-heading">This capsule is locked 🔒</h1>
          <p className="lc-subheading">It will be available on</p>

          {/* ── Countdown ────────────────────── */}
          <div className="lc-countdown">
            <CountCard value={timeLeft.days}    label="Days"    />
            <CountCard value={timeLeft.hours}   label="Hours"   />
            <CountCard value={timeLeft.minutes} label="Minutes" />
            <CountCard value={timeLeft.seconds} label="Seconds" />
          </div>

          {/* ── Receiver info ─────────────────── */}
          <div className="lc-info-row">
            <span className="lc-info-icon">👤</span>
            <div className="lc-info-body">
              <span className="lc-info-primary">{recipientName}</span>
              {recipientEmail && (
                <span className="lc-info-secondary">{recipientEmail}</span>
              )}
            </div>
          </div>

          {/* ── Hint ─────────────────────────── */}
          {hint && (
            <div className="lc-info-row">
              <span className="lc-info-icon lc-info-icon--hint">💡</span>
              <div className="lc-info-body">
                <span className="lc-info-label">Hint</span>
                <span className="lc-info-primary">{hint}</span>
              </div>
              <span className="lc-info-chevron">›</span>
            </div>
          )}

          {/* ── Notify banner ─────────────────── */}
          <div className="lc-notify-banner">
            <span className="lc-notify-bell">🔔</span>
            <p className="lc-notify-text">
              We'll notify you when the capsule is ready to open.
            </p>
            <span className="lc-info-chevron">›</span>
          </div>

          {/* ── CTA row ──────────────────────── */}
          <button
            className={`lc-btn${notifySet ? " lc-btn--done" : ""}`}
            onClick={() => setNotifySet(true)}
            aria-label={notifySet ? "Notification set" : "Set notification"}
          >
            {notifySet ? "✅  Notification Set!" : "Notify Me  🔔"}
          </button>

          {/* ── Share button ─────────────────── */}
          {slug && (
            <button
              className="lc-btn lc-btn--share"
              onClick={shareCapsule}
              aria-label="Share capsule"
            >
              {shared ? "✅ Link Copied!" : "🔗 Share Capsule"}
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

export default LockedCapsule;
