// ============================================================
// FloatingBadge.jsx
// Legendary floating badge that orbits the World Tree.
// Appears when a milestone is available and nobody has claimed it.
// Disappears permanently the instant someone wins it.
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import "./FloatingBadge.css";

// ── Sparkle burst on claim ─────────────────────────────────────────────────
function SparkleParticles({ active }) {
  const SPARKS = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    angle: (i / 16) * 360,
    distance: 50 + (i % 4) * 18,
    size: 6 + (i % 3) * 4,
    emoji: ["✨", "⭐", "💫", "🌟", "✦"][i % 5],
    delay: (i * 40),
  }));

  return (
    <div className="fb-sparks" aria-hidden="true">
      {SPARKS.map((s) => (
        <span
          key={s.id}
          className={`fb-spark ${active ? "fb-spark--burst" : ""}`}
          style={{
            "--angle": `${s.angle}deg`,
            "--dist": `${s.distance}px`,
            fontSize: `${s.size}px`,
            animationDelay: `${s.delay}ms`,
          }}
        >
          {s.emoji}
        </span>
      ))}
    </div>
  );
}

// ── Orbit ring ────────────────────────────────────────────────────────────
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

// ── Claim success overlay ─────────────────────────────────────────────────
function ClaimOverlay({ badge, visible, winner }) {
  return (
    <div className={`fb-claim-overlay ${visible ? "fb-claim-overlay--visible" : ""}`} aria-live="assertive">
      <div className="fb-claim-content">
        <div className="fb-claim-emoji">{badge?.fallbackIcon || "🏅"}</div>
        <p className="fb-claim-headline">
          {winner === "you" ? `🎉 You claimed ${badge?.name}!` : `${badge?.name} was claimed!`}
        </p>
        {winner === "you" && (
          <p className="fb-claim-sub">First Discoverer · Added to your collection</p>
        )}
        {winner === "other" && (
          <p className="fb-claim-sub">Another guardian was faster…</p>
        )}
      </div>
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
 *                  Should call claimWorldTreeBadge from supabase.js
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

  const handleClick = useCallback(async () => {
    if (!userId || claimingRef.current || phase !== "idle") return;
    claimingRef.current = true;
    setPhase("claiming");

    try {
      const result = await onClaim(badge);

      if (result.claimed) {
        // WE WON
        setShowSparks(true);
        setWinner("you");
        setPhase("won");
        setTimeout(() => setShowSparks(false), 1800);
        setTimeout(() => setPhase("gone"), 3200);
      } else {
        // Someone else beat us
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

  const isActive = phase === "idle";

  return (
    <div className={`fb-root fb-root--${phase}`} aria-label={`Claim ${badge.name} badge`}>
      {/* Glow halo */}
      <div className="fb-halo" aria-hidden="true" />
      <div className="fb-halo fb-halo--2" aria-hidden="true" />

      {/* Orbit ring */}
      {isActive && <OrbitRing />}

      {/* The badge itself */}
      <button
        className={`fb-badge ${!userId ? "fb-badge--locked" : ""} ${phase === "claiming" ? "fb-badge--claiming" : ""}`}
        onClick={handleClick}
        disabled={!userId || !isActive}
        aria-disabled={!userId || !isActive}
      >
        <div className="fb-badge-inner">
          {badge.image ? (
            <img
              src={badge.image}
              alt={badge.name}
              className="fb-badge-img"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <span className="fb-badge-emoji">{badge.fallbackIcon}</span>
          )}
        </div>

        {/* Shimmer sweep */}
        <div className="fb-shimmer" aria-hidden="true" />

        {/* Rarity label */}
        {isActive && (
          <div className="fb-rarity-tag" aria-hidden="true">
            ✦ LEGENDARY
          </div>
        )}
      </button>

      {/* Sparkle burst */}
      <SparkleParticles active={showSparks} />

      {/* Badge name tooltip */}
      {isActive && (
        <div className="fb-tooltip" role="tooltip">
          <span className="fb-tooltip-name">{badge.name}</span>
          <span className="fb-tooltip-hint">
            {userId ? "Tap to claim forever" : "Log in to claim"}
          </span>
        </div>
      )}

      {/* Claim overlay */}
      <ClaimOverlay
        badge={badge}
        visible={phase === "won" || phase === "lost"}
        winner={winner}
      />
    </div>
  );
}
