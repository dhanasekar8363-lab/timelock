import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import Countdown from "../components/Countdown";
import BottomNav from "../components/BottomNav";
import { Share } from "@capacitor/share";
import "./CapsuleDetail.css";
import lockedBg from "../assets/backgrounds/locked-bg.png";
import unlockBg from "../assets/backgrounds/unlock-bg.png";

function CapsuleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [capsule, setCapsule] = useState(null);

  useEffect(() => {
    loadCapsule();
  }, []);

  const loadCapsule = async () => {
    const { data } = await supabase
      .from("capsules")
      .select("*")
      .eq("id", id)
      .single();
    setCapsule(data);
  };

  if (!capsule) {
    return (
      <div className="cd-page cd-loading">
        <div className="cd-overlay" />
        <div className="cd-spinner">🫙</div>
        <p className="cd-loading-text">Opening capsule…</p>
      </div>
    );
  }

  const unlockTime = new Date(capsule.unlock_date);
  const now = new Date();
  const isUnlocked = now >= unlockTime;

  const shareCapsule = async () => {
    const shareUrl = `${window.location.origin}/capsule/${capsule.id}`;
    await Share.share({
      title: "TimeLock Capsule",
      text: "Someone sent you a Time Capsule 📦",
      url: shareUrl,
    });
  };

  const saveCapsule = () => {
    // Placeholder for save logic
    console.log("Save capsule", capsule.id);
  };

  const unlockDateDisplay = unlockTime.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
  const unlockTimeDisplay = unlockTime.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });

  // Determine media arrays (expects arrays or undefined)
  const photos = capsule.photos || [];
  const videos = capsule.videos || [];
  const hasMedia = photos.length > 0 || videos.length > 0;

  return (
    <div
      className="cd-page"
      style={{ backgroundImage: `url(${isUnlocked ? unlockBg : lockedBg})` }}
    >
      <div className="cd-overlay" />

      {/* Header */}
      <div className="cd-header">
        <button className="cd-back-btn" onClick={() => navigate(-1)} aria-label="Back">←</button>
        <span className="cd-header-title">
          {isUnlocked ? "Capsule Opened" : "Capsule Detail"}
        </span>
        <button className="cd-more-btn" aria-label="More">⋯</button>
      </div>

      {/* ══ LOCKED ══ */}
      {!isUnlocked && (
        <div className="cd-body">

          {/* Lock illustration */}
          <div className="cd-lock-wrap">
            <div className="cd-lock-ring cd-ring-3" />
            <div className="cd-lock-ring cd-ring-2" />
            <div className="cd-lock-ring cd-ring-1" />
            <div className="cd-lock-emoji">🔒</div>
            <div className="cd-lock-orb orb-a">✨</div>
            <div className="cd-lock-orb orb-b">💜</div>
          </div>

          {/* Sender */}
          <p className="cd-from-label">
            From: <span className="cd-from-name">{capsule.sender_name} 💜</span>
          </p>

          {/* Lock heading */}
          <h1 className="cd-locked-title">This capsule is locked 🔒</h1>
          <p className="cd-locked-sub">It will be available on</p>

          {/* Countdown */}
          <Countdown targetDate={capsule.unlock_date} />

          {/* Unlock date/time */}
          <div className="cd-unlock-info">
            <div className="cd-unlock-row">
              <span className="cd-unlock-icon">📅</span>
              <div>
                <p className="cd-unlock-date">{unlockDateDisplay}</p>
              </div>
            </div>
            <div className="cd-divider" />
            <div className="cd-unlock-row">
              <span className="cd-unlock-icon">🕙</span>
              <p className="cd-unlock-date">{unlockTimeDisplay}</p>
            </div>
          </div>

          {/* Hint */}
          {capsule.hint && (
            <div className="cd-hint-card">
              <span className="cd-hint-icon">💡</span>
              <div className="cd-hint-body">
                <p className="cd-hint-label">Hint</p>
                <p className="cd-hint-text">{capsule.hint}</p>
              </div>
              <span className="cd-hint-chevron">›</span>
            </div>
          )}

          {/* Notify row */}
          <div className="cd-notify-card">
            <span className="cd-notify-icon">🔔</span>
            <p className="cd-notify-text">We'll notify you when<br />the capsule is ready to open.</p>
            <span className="cd-hint-chevron">›</span>
          </div>

          {/* CTA */}
          <button className="cd-primary-btn" onClick={shareCapsule}>
            Notify Me 🔔
          </button>

        </div>
      )}

      {/* ══ UNLOCKED ══ */}
      {isUnlocked && (
        <div className="cd-body cd-body--unlocked">

          {/* Celebration illustration */}
          <div className="cd-celebrate-wrap">
            {/* Ambient glow layers */}
            <div className="cd-celebrate-glow cd-glow--gold" />
            <div className="cd-celebrate-glow cd-glow--pink" />
            {/* Particle ring */}
            <div className="cd-particle-ring">
              {[...Array(8)].map((_, i) => (
                <div key={i} className={`cd-particle cd-particle--${i}`} />
              ))}
            </div>
            {/* Chest emoji */}
            <div className="cd-chest-emoji">🎁</div>
            {/* Floating sparkles */}
            <span className="cd-sparkle sp-1">✨</span>
            <span className="cd-sparkle sp-2">⭐</span>
            <span className="cd-sparkle sp-3">💫</span>
            <span className="cd-sparkle sp-4">🌟</span>
          </div>

          {/* Title + subtitle */}
          <div className="cd-unlocked-heading">
            <h1 className="cd-unlocked-title">🎉 Capsule Unlocked!</h1>
            <p className="cd-unlocked-sub">This capsule is now open for you</p>
          </div>

          {/* Sender pill */}
          <div className="cd-sender-pill">
            <div className="cd-sender-avatar">
              {capsule.sender_avatar ? (
                <img src={capsule.sender_avatar} alt={capsule.sender_name} />
              ) : (
                <span className="cd-sender-initials">
                  {(capsule.sender_name || "?")[0].toUpperCase()}
                </span>
              )}
            </div>
            <div className="cd-sender-info">
              <p className="cd-sender-name">{capsule.sender_name} 💜</p>
              {capsule.sender_email && (
                <p className="cd-sender-email">{capsule.sender_email}</p>
              )}
            </div>
            <div className="cd-sender-badge">
              <span className="cd-badge-dot" />
              Sent this
            </div>
          </div>

          {/* Message card */}
          <div className="cd-message-card">
            {/* Card glow */}
            <div className="cd-message-card-glow" />
            <div className="cd-message-card-inner">
              <div className="cd-message-card-tag">💌 Personal Message</div>
              <p className="cd-message-greeting">Hey!</p>
              <p className="cd-message-body">{capsule.message}</p>
            </div>
          </div>

          {/* Media preview */}
          {hasMedia && (
            <div className="cd-media-section">
              <p className="cd-media-label">📎 Attached Media</p>
              <div className="cd-media-grid">
                {photos.map((url, i) => (
                  <div key={`photo-${i}`} className="cd-media-item cd-media-item--photo">
                    <img src={url} alt={`Attachment ${i + 1}`} loading="lazy" />
                    <div className="cd-media-overlay">
                      <span className="cd-media-type-icon">🖼</span>
                    </div>
                  </div>
                ))}
                {videos.map((url, i) => (
                  <div key={`video-${i}`} className="cd-media-item cd-media-item--video">
                    <video src={url} preload="metadata" />
                    <div className="cd-media-overlay cd-media-overlay--video">
                      <div className="cd-play-btn">▶</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audio waveform placeholder */}
          {capsule.audio_url && (
            <div className="cd-audio-card">
              <button className="cd-audio-play" aria-label="Play audio">
                <span>▶</span>
              </button>
              <div className="cd-audio-waveform">
                {[...Array(28)].map((_, i) => (
                  <div
                    key={i}
                    className="cd-wave-bar"
                    style={{ "--bar-height": `${20 + Math.sin(i * 0.8) * 14 + Math.random() * 10}px` }}
                  />
                ))}
              </div>
              <span className="cd-audio-duration">
                {capsule.audio_duration || "—"}
              </span>
            </div>
          )}

          {/* Open date info */}
          <div className="cd-opened-info">
            <span className="cd-opened-icon">🔓</span>
            <p className="cd-opened-text">
              Unlocked on <strong>{unlockDateDisplay}</strong> at <strong>{unlockTimeDisplay}</strong>
            </p>
          </div>

          {/* Action bar */}
          <div className="cd-action-bar">
            <button className="cd-action-btn cd-action-btn--save" onClick={saveCapsule}>
              <span className="cd-action-icon">⬇️</span>
              <span>Save</span>
            </button>
            <button className="cd-action-btn cd-action-btn--share" onClick={shareCapsule}>
              <span className="cd-action-icon">⬆️</span>
              <span>Share</span>
            </button>
          </div>

        </div>
      )}

      <div className="cd-spacer" />
      <BottomNav />
    </div>
  );
}

export default CapsuleDetail;
