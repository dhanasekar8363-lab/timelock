// ============================================================
// FloatingBadge.jsx  — REDESIGNED
//
// NEW BEHAVIOUR:
//   1. Renders a small glowing orb floating near the World Tree.
//   2. Orb pulses softly, floats up/down, has orbiting sparkles.
//   3. Clicking/tapping the orb opens the existing claim modal.
//   4. After claim success → orb bursts away, modal shows result.
//   5. If someone else claims → orb silently vanishes.
//
// All claim / DB logic is unchanged — only the UX presentation changes.
// WorldTree.jsx needs zero modifications.
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import "./FloatingBadge.css";

// ── Fixed anchor positions for each badge (viewport %) ─────────────────────────
// Each badge gets a "home" spot near the World Tree canopy or branches.
// Positions match the red-circled areas in the design brief screenshot.
// The orb is centred on these coords via transform: translate(-50%, -50%).
const ORB_POSITIONS = {
  seed_pioneer:     { top: "32%", left: "31%" }, // upper-left branch
  nature_guardian:  { top: "22%", left: "64%" }, // upper-right canopy
  tree_keeper:      { top: "37%", left: "71%" }, // right mid-branch
  forest_protector: { top: "55%", left: "69%" }, // lower-right branch
  memory_guardian:  { top: "17%", left: "50%" }, // directly above canopy
};
const FALLBACK_ORB_POS = { top: "26%", left: "35%" };

// ── Small sparkle ring orbiting the badge disc ─────────────────────────────────
const ORB_SPARK_COUNT = 6;

function OrbSparkles() {
  return (
    <div className="fb-orb-sparkles" aria-hidden="true">
      {Array.from({ length: ORB_SPARK_COUNT }, (_, i) => (
        <span
          key={i}
          className="fb-orb-sparkle"
          style={{
            "--orb-angle":  `${(i / ORB_SPARK_COUNT) * 360}deg`,
            animationDelay: `${(i * 0.28).toFixed(2)}s`,
          }}
        >
          ✦
        </span>
      ))}
    </div>
  );
}

// ── The small floating badge collectible ──────────────────────────────────────
function FloatingOrb({ badge, onClick, vanishing }) {
  const pos = ORB_POSITIONS[badge.key] ?? FALLBACK_ORB_POS;

  return (
    <div
      className={`fb-orb-root${vanishing ? " fb-orb-root--vanish" : ""}`}
      style={{ top: pos.top, left: pos.left }}
      role="button"
      tabIndex={0}
      aria-label={`${badge.name} badge available — tap to claim`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
    >
      {/* Inner container gives positioning context to halo / sparkles */}
      <div className="fb-orb-container">

        {/* Ambient glow halos (behind everything) */}
        <div className="fb-orb-halo"            aria-hidden="true" />
        <div className="fb-orb-halo fb-orb-halo--2" aria-hidden="true" />

        {/* Orbiting sparkle ring (spins as a unit) */}
        <OrbSparkles />

        {/* The badge disc itself */}
        <div className="fb-orb-disc">
          {badge.image ? (
            <img
              src={badge.image}
              alt={badge.name}
              className="fb-orb-img"
              onError={(e) => {
                e.target.style.display = "none";
                if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
              }}
            />
          ) : null}
          <span
            className="fb-orb-emoji"
            style={{ display: badge.image ? "none" : "flex" }}
          >
            {badge.fallbackIcon || "🏅"}
          </span>
        </div>
      </div>

      {/* "Tap to Claim" label — always visible on touch, hover-revealed on desktop */}
      <div className="fb-orb-tip" aria-hidden="true">✦ Tap to Claim</div>
    </div>
  );
}

// ── Sparkle burst that fires on a successful claim (inside the modal) ──────────
function SparkleParticles({ active }) {
  const SPARKS = Array.from({ length: 16 }, (_, i) => ({
    id:       i,
    angle:    (i / 16) * 360,
    distance: 50 + (i % 4) * 18,
    size:     6  + (i % 3) * 4,
    emoji:    ["✨", "⭐", "💫", "🌟", "✦"][i % 5],
    delay:    i * 40,
  }));

  return (
    <div className="fb-sparks" aria-hidden="true">
      {SPARKS.map((s) => (
        <span
          key={s.id}
          className={`fb-spark${active ? " fb-spark--burst" : ""}`}
          style={{
            "--angle":      `${s.angle}deg`,
            "--dist":       `${s.distance}px`,
            fontSize:       `${s.size}px`,
            animationDelay: `${s.delay}ms`,
          }}
        >
          {s.emoji}
        </span>
      ))}
    </div>
  );
}

// ── Orbit ring decoration inside the claim modal ──────────────────────────────
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

// ── Main component ────────────────────────────────────────────────────────────
/**
 * FloatingBadge
 *
 * Props (unchanged from original contract):
 *   badge    — { level, key, name, description, image, fallbackIcon }
 *   userId   — current user's UUID (null if logged out)
 *   onClaim  — async (badge) => { claimed, alreadyClaimed }
 *   visible  — boolean: badge is still unclaimed globally
 */
export default function FloatingBadge({ badge, userId, onClaim, visible }) {
  const [showModal,    setShowModal]    = useState(false);
  const [phase,        setPhase]        = useState("idle"); // idle | claiming | won | lost | gone
  const [showSparks,   setShowSparks]   = useState(false);
  const [orbVanishing, setOrbVanishing] = useState(false);
  const claimingRef = useRef(false);

  // When another user claims the badge (visible → false), gracefully remove the orb.
  useEffect(() => {
    if (!visible && phase !== "won" && phase !== "lost" && phase !== "gone") {
      setOrbVanishing(true);
      setPhase("lost");
      if (showModal) {
        // Modal is open — show the "lost" result state briefly, then clean up.
        setTimeout(() => { setPhase("gone"); setShowModal(false); }, 2600);
      } else {
        // Modal not open — just silently dissolve the orb.
        setTimeout(() => setPhase("gone"), 800);
      }
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // User taps the floating orb → open the claim modal.
  const handleOrbClick = useCallback(() => {
    if (phase === "gone" || !visible) return;
    setShowModal(true);
  }, [phase, visible]);

  // Clicking the modal backdrop (outside the card) dismisses it in idle state.
  const handleBackdropClick = useCallback(() => {
    if (phase === "idle") setShowModal(false);
  }, [phase]);

  // Claim attempt.
  const handleClaim = useCallback(async () => {
    if (!userId || claimingRef.current || phase !== "idle") return;
    claimingRef.current = true;
    setPhase("claiming");

    try {
      const result = await onClaim(badge);

      if (result.claimed) {
        setShowSparks(true);
        setOrbVanishing(true);
        setPhase("won");
        setTimeout(() => setShowSparks(false), 1800);
        setTimeout(() => { setPhase("gone"); setShowModal(false); }, 3200);
      } else {
        setOrbVanishing(true);
        setPhase("lost");
        setTimeout(() => { setPhase("gone"); setShowModal(false); }, 2600);
      }
    } catch {
      setPhase("idle");
    } finally {
      claimingRef.current = false;
    }
  }, [badge, onClaim, phase, userId]);

  // Nothing left to show.
  if (phase === "gone" || (!visible && phase === "idle")) return null;

  const isIdle     = phase === "idle";
  const isClaiming = phase === "claiming";
  const isWon      = phase === "won";
  const isLost     = phase === "lost";
  const resultState = isWon ? "won" : isLost ? "lost" : null;

  return (
    <>
      {/* ── Floating orb near the World Tree ─────────────────────────────────
          Fixed-position small badge disc that floats, glows, and pulses.
          Renders directly in the component tree (no portal needed) because
          position:fixed elements escape all stacking contexts automatically.
      ─────────────────────────────────────────────────────────────────── */}
      <FloatingOrb
        badge={badge}
        onClick={handleOrbClick}
        vanishing={orbVanishing}
      />

      {/* ── Claim modal — portal to document.body ────────────────────────────
          Only mounts when the user has tapped the orb.
          Uses createPortal so the fixed backdrop clears every z-index layer.
      ─────────────────────────────────────────────────────────────────── */}
      {showModal && createPortal(
        <div
          className={`fb-backdrop fb-backdrop--${phase}`}
          role="dialog"
          aria-modal="true"
          aria-label={`Claim ${badge.name} badge`}
          onClick={handleBackdropClick}
        >
          <div
            className={`fb-card fb-card--${phase}`}
            onClick={(e) => e.stopPropagation()}
          >

            {/* Close button — idle state only */}
            {isIdle && (
              <button
                className="fb-close-btn"
                onClick={() => setShowModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            )}

            {/* Top eyebrow */}
            <div className="fb-eyebrow" aria-hidden="true">
              <span className="fb-eyebrow-icon">🏅</span>
              <span className="fb-eyebrow-label">Badge Unlocked</span>
            </div>

            {/* ── Badge icon area ──────────────────────────────────────────── */}
            <div className="fb-icon-wrap">
              {isIdle && <OrbitRing />}
              <div className="fb-halo"             aria-hidden="true" />
              <div className="fb-halo fb-halo--2"  aria-hidden="true" />
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
                    onError={(e) => {
                      e.target.style.display = "none";
                      if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
                    }}
                  />
                ) : null}
                <span
                  className="fb-badge-emoji"
                  style={{ display: badge.image ? "none" : "flex" }}
                >
                  {badge.fallbackIcon || "🏅"}
                </span>
              </div>
              <SparkleParticles active={showSparks} />
            </div>

            {/* Badge name + description (idle / claiming) */}
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

            {/* Result state (won / lost) */}
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
                className={`fb-claim-btn${!userId ? " fb-claim-btn--locked" : ""}`}
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
      )}
    </>
  );
}
