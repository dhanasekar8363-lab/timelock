import { useEffect, useState, useRef, useCallback } from "react";
import unlockBg from "../assets/backgrounds/unlock-bg.png";
import { usePet } from "../contexts/PetContext";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../services/supabase";
import { logCapsuleOpened } from "../services/worldTreeActivity";
import "./UnlockedCapsule.css";

/* ── Sparkle particle ── */
function Sparkle({ style }) {
  return <div className="sparkle" style={style} />;
}

function generateSparkles(count = 24) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 3}s`,
    animationDuration: `${1.5 + Math.random() * 2}s`,
    width: `${4 + Math.random() * 8}px`,
    height: `${4 + Math.random() * 8}px`,
  }));
}

/* ── Lightbox ── */
function Lightbox({ photos, startIndex, onClose }) {
  const [current, setCurrent] = useState(startIndex);

  const prev = useCallback(() =>
    setCurrent((i) => (i - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() =>
    setCurrent((i) => (i + 1) % photos.length), [photos.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, prev, next]);

  return (
    <div className="uc-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button className="uc-lightbox-close" onClick={onClose} aria-label="Close">✕</button>

      {photos.length > 1 && (
        <>
          <button
            className="uc-lightbox-nav uc-lightbox-nav--prev"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label="Previous"
          >‹</button>
          <button
            className="uc-lightbox-nav uc-lightbox-nav--next"
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label="Next"
          >›</button>
        </>
      )}

      <div className="uc-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <img
          src={photos[current].url}
          alt={photos[current].name || `Photo ${current + 1}`}
          className="uc-lightbox-img"
        />
        {photos.length > 1 && (
          <p className="uc-lightbox-counter">{current + 1} / {photos.length}</p>
        )}
      </div>
    </div>
  );
}

/* ── Media section ── */
function MediaSection({ mediaUrls, mediaTypes }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const media = (mediaUrls || []).map((url, i) => ({
    url,
    type: (mediaTypes && mediaTypes[i]) || "",
    name: url.split("/").pop().split("?")[0] || `File ${i + 1}`,
  }));

  if (media.length === 0) return null;

  const photos = media.filter((m) => m.type.startsWith("image"));
  const videos = media.filter((m) => m.type.startsWith("video"));
  const audios = media.filter((m) => m.type.startsWith("audio"));
  const files  = media.filter(
    (m) => !m.type.startsWith("image") && !m.type.startsWith("video") && !m.type.startsWith("audio")
  );

  return (
    <>
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      <div className="uc-media-section">
        <p className="uc-section-label">📎 Attachments</p>

        {/* ── Photos ── */}
        {photos.length > 0 && (
          <div className="uc-media-block">
            <p className="uc-media-type-label">🖼️ Photos</p>
            <div className={`uc-photo-grid uc-photo-grid--${Math.min(photos.length, 3)}`}>
              {photos.map((p, i) => (
                <button
                  key={i}
                  className="uc-photo-thumb"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`View ${p.name}`}
                >
                  <img src={p.url} alt={p.name} loading="lazy" />
                  <div className="uc-photo-overlay">
                    <span className="uc-photo-zoom">🔍</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Videos ── */}
        {videos.length > 0 && (
          <div className="uc-media-block">
            <p className="uc-media-type-label">▶️ Videos</p>
            <div className="uc-video-list">
              {videos.map((v, i) => (
                <div key={i} className="uc-video-wrap">
                  <video
                    src={v.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="uc-video"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Audio ── */}
        {audios.length > 0 && (
          <div className="uc-media-block">
            <p className="uc-media-type-label">🎵 Audio</p>
            <div className="uc-audio-list">
              {audios.map((a, i) => (
                <div key={i} className="uc-audio-card">
                  <div className="uc-audio-card-top">
                    <div className="uc-audio-waveform" aria-hidden="true">
                      {Array.from({ length: 18 }, (_, j) => (
                        <div
                          key={j}
                          className="uc-audio-bar"
                          style={{ animationDelay: `${j * 0.07}s` }}
                        />
                      ))}
                    </div>
                    <span className="uc-audio-name" title={a.name}>{a.name}</span>
                  </div>
                  <audio src={a.url} controls className="uc-audio-player" preload="metadata" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Files ── */}
        {files.length > 0 && (
          <div className="uc-media-block">
            <p className="uc-media-type-label">📄 Files</p>
            <div className="uc-file-list">
              {files.map((f, i) => (
                <a
                  key={i}
                  href={f.url}
                  download={f.name}
                  target="_blank"
                  rel="noreferrer"
                  className="uc-file-card"
                >
                  <div className="uc-file-card-icon">
                    <span>{getFileIcon(f.type, f.name)}</span>
                  </div>
                  <div className="uc-file-card-info">
                    <span className="uc-file-card-name">{f.name}</span>
                    <span className="uc-file-card-action">Tap to download ↓</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function getFileIcon(type, name) {
  if (type.includes("pdf") || name.endsWith(".pdf")) return "📕";
  if (type.includes("word") || name.match(/\.(docx?)$/i)) return "📝";
  if (type.includes("sheet") || name.match(/\.(xlsx?)$/i)) return "📊";
  if (type.includes("zip") || type.includes("rar") || name.match(/\.(zip|rar|7z)$/i)) return "🗜️";
  return "📄";
}

/* ── Build the shareable link ── */
function buildShareLink(slug) {
  if (!slug) return window.location.href;
  return `${window.location.origin}/capsule/${slug}`;
}

/* ── Main component ── */
function UnlockedCapsule({ capsule }) {
  const [sparkles] = useState(() => generateSparkles(28));
  const [visible, setVisible] = useState(false);
  const [shared, setShared] = useState(false);
  const cardRef = useRef(null);

  const { triggerCapsuleUnlockReward } = usePet();
  const { user } = useAuth();

  // Guards against firing the activity-log insert twice for the same
  // capsule-open event (StrictMode double-invoke, fast re-renders, etc).
  // Cross-refresh dedup is handled separately via localStorage below.
  const activityLoggedRef = useRef(false);

  // Fire the XP reward exactly once when this component mounts,
  // i.e. when the user has successfully opened the capsule.
  useEffect(() => {
    triggerCapsuleUnlockReward();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — reward fires once per mount

  const title        = capsule?.title || "A Message From The Past";
  const senderName   = capsule?.sender_name   || capsule?.senderName   || "Someone Special";
  const receiverName = capsule?.receiver_name || capsule?.receiverName || capsule?.receiver_email || "";
  const unlockDate   = capsule?.unlock_date   || capsule?.unlockDate   || capsule?.opened_at;
  const message      = capsule?.message       || capsule?.content      || "";
  const coverImage   = capsule?.cover_image   || capsule?.coverImage   || null;
  const slug         = capsule?.slug          || null;

  const mediaUrls  = capsule?.media_urls  || capsule?.media?.map((m) => m.url)  || [];
  const mediaTypes = capsule?.media_types || capsule?.media?.map((m) => m.type) || [];

  // 📝 Activity feed — log that this capsule was opened.
  // This component only renders once the unlock has already succeeded
  // (mirrors the XP reward effect above), so by the time this runs the
  // "open" action is already done — this is logging only, it does not
  // award growth itself, so it can't double-count whatever growth (if
  // any) is granted elsewhere for opening a capsule.
  //
  // The Live Feed should show the *account* username (matching the
  // capsule-sent flow), not the capsule's receiver/sender display name —
  // so we resolve `profiles.username` for the logged-in user instead of
  // falling back to receiverName/senderName.
  useEffect(() => {
    const capsuleId = capsule?.id;
    if (!capsuleId) return; // nothing to dedup against / log meaningfully

    // Dedup guard #1 — same-mount re-entry (e.g. StrictMode double effect).
    if (activityLoggedRef.current) return;

    // Dedup guard #2 — across refreshes/revisits in this browser.
    // Mirrors the intent of the awardCapsuleOpened session guard in
    // CapsuleViewer.jsx, but since this component doesn't persist across
    // mounts, we use localStorage keyed by capsule id instead of a ref.
    // NOTE: this is a client-side guard only. If a server-side dedup
    // mechanism exists (e.g. a unique constraint backing
    // awardCapsuleOpened), this should ideally check/set that instead of
    // (or in addition to) localStorage for cross-device correctness.
    const dedupKey = `tl_capsule_opened_logged:${capsuleId}`;
    if (localStorage.getItem(dedupKey)) return;

    activityLoggedRef.current = true;
    localStorage.setItem(dedupKey, "1");

    (async () => {
      const openerId = capsule?.receiver_id || capsule?.receiverId || user?.id || null;

      let openerName = "Someone";

      if (user?.id) {
        // Resolve the logged-in account's username from `profiles`,
        // matching how capsule-sent activity logging attributes the actor.
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        if (profileError) {
          console.warn("[WorldTreeActivity] profile username lookup failed:", profileError);
        }

        openerName = profile?.username || user?.email || receiverName || senderName || "Someone";
      } else {
        // No authenticated user available — fall back to capsule display
        // names so the feed still has something readable.
        openerName = receiverName || senderName || "Someone";
      }

      logCapsuleOpened(openerId, openerName, 200).catch((e) =>
        console.warn("[WorldTreeActivity] logCapsuleOpened failed silently:", e)
      );
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capsule?.id]); // re-evaluate only if the capsule identity changes

  const formattedDate = unlockDate
    ? new Date(unlockDate).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      })
    : null;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  /* ── Share handler — uses slug link ── */
  const handleShare = async () => {
    const link = buildShareLink(slug);
    const shareData = {
      title: `TimeLock Capsule: ${title}`,
      text: `A time capsule has been unlocked — "${title}"`,
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
    } catch (_) {}
  };

  return (
    <div
      className={`uc-root ${visible ? "uc-root--visible" : ""}`}
      style={{ backgroundImage: `url(${unlockBg})` }}
    >
      <div className="uc-glow uc-glow--a" />
      <div className="uc-glow uc-glow--b" />

      <div className="uc-sparkles" aria-hidden="true">
        {sparkles.map((s) => (
          <Sparkle
            key={s.id}
            style={{
              top: s.top, left: s.left,
              width: s.width, height: s.height,
              animationDelay: s.animationDelay,
              animationDuration: s.animationDuration,
            }}
          />
        ))}
      </div>

      <div className="uc-scroll-area">
        {/* Hero */}
        <div className="uc-hero">
          <div className="uc-unlock-ring">
            <span className="uc-unlock-emoji">🔓</span>
          </div>
          <p className="uc-eyebrow">Time Capsule Unlocked</p>
        </div>

        {/* Cover */}
        {coverImage && (
          <div className="uc-cover-wrap">
            <img src={coverImage} alt="Capsule cover" className="uc-cover-img" />
            <div className="uc-cover-glow" />
          </div>
        )}

        {/* Main card */}
        <div className="uc-glass-card" ref={cardRef}>
          <h1 className="uc-title">{title}</h1>

          <div className="uc-meta-grid">
            <div className="uc-meta-cell">
              <span className="uc-meta-label">From</span>
              <span className="uc-meta-value">{senderName}</span>
            </div>
            {receiverName && (
              <div className="uc-meta-cell">
                <span className="uc-meta-label">To</span>
                <span className="uc-meta-value">{receiverName}</span>
              </div>
            )}
            {formattedDate && (
              <div className="uc-meta-cell">
                <span className="uc-meta-label">Unlocked</span>
                <span className="uc-meta-value">{formattedDate}</span>
              </div>
            )}
          </div>

          <div className="uc-divider" />

          <p className="uc-section-label">✉️ Message From The Past</p>
          {message ? (
            <p className="uc-message">{message}</p>
          ) : (
            <p className="uc-message uc-message--empty">No message was left in this capsule.</p>
          )}

          {/* Media viewer */}
          <MediaSection mediaUrls={mediaUrls} mediaTypes={mediaTypes} />

          <div className="uc-actions">
            <button className="uc-share-btn" onClick={handleShare}>
              {shared ? "✅ Link Copied!" : "🔗 Share This Capsule"}
            </button>
          </div>
        </div>

        <p className="uc-footer">Created with TimeLock · Moments sealed in time</p>
      </div>
    </div>
  );
}

export default UnlockedCapsule;
