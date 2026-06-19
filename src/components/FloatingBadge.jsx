// ============================================================
// FloatingBadge.jsx
// MMORPG-style achievement popup for World Tree badge claims.
//
// CHANGES (badge artwork sizing):
//   • FloatingBadge.css now provides explicit fixed dimensions
//     (--fb-icon-size: 80px mobile / 96px desktop) on .fb-icon-frame.
//   • .fb-badge-img uses width/height 100% + object-fit:contain so the
//     full artwork is always visible and never overflows the card.
//   • .fb-icon-wrap mirrors those dimensions so halo / orbit decorations
//     remain perfectly centred around the constrained icon frame.
//   • No reward-modal badge grid styles were touched.
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import "./FloatingBadge.css";

// ── Sparkle burst on claim ─────────────────────────────────────────────────
function SparkleParticles({ active }) {
  const SPARKS = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    angle: (i / 16) * 360,
    distance: 50 + (i % 4) * 18,
    size: 6 + (i % 3) * 4,
    emoji: ["✨", "⭐", "💫", "🌟", "✦"][i % 5],
    delay: i * 40,
  }));

  return (
    <div className="fb-sparks" aria-hidden="true">
      {SPARKS.map((s) => (
        <span
          key={s.id}
          className={`fb-spark ${active ? "fb-spark--burst" : ""}`}
          style={{
            "--angle":  `${s.angle}deg`,
            "--dist":   `${s.distance}px`,
            fontSize:   `${s.size}px`,
            animationDelay: `${s.delay}ms`,
          }}
        >
          {s.emoji}
        </span>
      ))}
    </div>
  );
}

// ── Orbit ring around the badge icon ─────────────────────────────────────
function OrbitRing() {
  return (
    <div className="fb-orbit-ring" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className="fb-orbit-dot"
          style={{ "--i": i, animationDelay: `${i * 0.375}s` }}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
/**
 * FloatingBadge
 *
 * Props:
 *   badge        — { level, key, name, description, image, fallbackIcon }
 *   userId       — current user's UUID (null if logged out)
 *   onClaim      — async (badge) => { claimed, alreadyClaimed }
 *   visible      — boolean: show the badge (false = hide immediately)
 */
export default function FloatingBadge({ badge, userId, onClaim, visible }) {
  const [phase, setPhase]           = useState("idle");   // idle | claiming | won | lost | gone
  const [showSparks, setShowSparks] = useState(false);
  const [winner, setWinner]         = useState(null);     // "you" | "other"
  const claimingRef                 = useRef(false);

  // When visible flips to false externally (realtime removal), play vanish
  useEffect(() => {
    if (!visible && phase !== "won" && phase !== "lost" && phase !== "gone") {
      setWinner("other");
      setPhase("lost");
      setTimeout(() => setPhase("gone"), 2600);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClaim = useCallback(async () => {
    if (!userId || claimingRef.current || phase !== "idle") return;
    claimingRef.current = true;
    setPhase("claiming");

    try {
      const result = await onClaim(badge);

      if (result.claimed) {
        setShowSparks(true);
        setWinner("you");
        setPhase("won");
        setTimeout(() => setShowSparks(false), 1800);
        setTimeout(() => setPhase("gone"), 3200);
      } else {
        setWinner("other");
        setPhase("lost");
        setTimeout(() => setPhase("gone"), 2600);
      }
    } catch {
      setPhase("idle");
    } finally {
      claimingRef.current = false;
    }
  }, [badge, onClaim, phase, userId]);

  if (phase === "gone" || (!visible && phase === "idle")) return null;

  const isIdle     = phase === "idle";
  const isClaiming = phase === "claiming";
  const isWon      = phase === "won";
  const isLost     = phase === "lost";

  const resultState = isWon ? "won" : isLost ? "lost" : null;

  // Portal to document.body so the fixed backdrop escapes every stacking
  // context (including wt-tree-section's z-index:5), preventing wt-cards /
  // wt-header from painting over the modal.
  return createPortal(
    /* Full-screen backdrop — centres the card and dims the tree behind it */
    <div
      className={`fb-backdrop fb-backdrop--${phase}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Claim ${badge.name} badge`}
    >

      {/* ── Achievement card ── */}
      <div className={`fb-card fb-card--${phase}`}>

        {/* Top eyebrow */}
        <div className="fb-eyebrow" aria-hidden="true">
          <span className="fb-eyebrow-icon">🏅</span>
          <span className="fb-eyebrow-label">Badge Unlocked</span>
        </div>

        {/* ── Badge icon area ────────────────────────────────────────────
            .fb-icon-wrap has a fixed size matching --fb-icon-size so
            halo / orbit rings are always centred.
            .fb-icon-frame is the hard size cap: no child can make it grow.
            .fb-badge-img fills the frame with object-fit:contain so the
            full artwork is visible without overflow.
        ──────────────────────────────────────────────────────────────── */}
        <div className="fb-icon-wrap">
          {isIdle && <OrbitRing />}

          {/* Glow halo rings — positioned relative to fb-icon-wrap */}
          <div className="fb-halo"    aria-hidden="true" />
          <div className="fb-halo fb-halo--2" aria-hidden="true" />

          {/*
            fb-icon-frame: fixed width/height set by CSS custom property
            --fb-icon-size (80px mobile, 96px ≥480px). overflow:hidden
            clips anything that tries to escape. The <img> inside uses
            width:100% height:100% object-fit:contain so it scales to fit.
          */}
          <div
            className={[
              "fb-icon-frame",
              isClaiming ? "fb-icon-frame--claiming" : "",
              isWon      ? "fb-icon-frame--won"      : "",
            ].join(" ").trim()}
          >
            {badge.image ? (
              <img
                src={badge.image}
                alt={badge.name}
                className="fb-badge-img"
                /* On error: hide broken img and show emoji fallback below */
                onError={(e) => {
                  e.target.style.display = "none";
                  e.target.nextSibling.style.display = "flex";
                }}
              />
            ) : null}

            {/* Emoji fallback — visible when image is absent or fails */}
            <span
              className="fb-badge-emoji"
              style={{ display: badge.image ? "none" : "flex" }}
            >
              {badge.fallbackIcon || "🏅"}
            </span>
          </div>

          {/* Sparkle burst on win — renders above everything in icon-wrap */}
          <SparkleParticles active={showSparks} />
        </div>

        {/* Badge name & description — only in idle / claiming states */}
        {!resultState && (
          <div className="fb-meta">
            <h2 className="fb-badge-name">{badge.name}</h2>
            {badge.description && (
              <p className="fb-badge-desc">{badge.description}</p>
            )}
            {isIdle && (
              <span className="fb-rarity-tag" aria-hidden="true">
                ✦ LEGENDARY
              </span>
            )}
          </div>
        )}

        {/* Result state — shown after claim attempt resolves */}
        {resultState && (
          <div className="fb-result" aria-live="assertive">
            {isWon ? (
              <>
                <p className="fb-result-headline fb-result-headline--won">
                  🎉 You claimed it!
                </p>
                <p className="fb-result-sub">
                  First Discoverer · Added to your collection
                </p>
              </>
            ) : (
              <>
                <p className="fb-result-headline fb-result-headline--lost">
                  Another guardian was faster…
                </p>
                <p className="fb-result-sub">{badge.name} has been claimed.</p>
              </>
            )}
          </div>
        )}

        {/* Claim button */}
        {isIdle && (
          <button
            className={`fb-claim-btn ${!userId ? "fb-claim-btn--locked" : ""}`}
            onClick={handleClaim}
            disabled={!userId}
            aria-disabled={!userId}
          >
            <span className="fb-btn-shimmer" aria-hidden="true" />
            {userId ? "Claim Badge" : "Log in to Claim"}
          </button>
        )}

        {/* Claiming spinner */}
        {isClaiming && (
          <div className="fb-claiming-indicator" aria-live="polite">
            <span className="fb-spinner" aria-hidden="true" />
            Claiming…
          </div>
        )}

        {/* Logged-out hint */}
        {isIdle && !userId && (
          <p className="fb-login-hint">Log in to be the First Discoverer</p>
        )}
      </div>
    </div>,
    document.body
  );
}
