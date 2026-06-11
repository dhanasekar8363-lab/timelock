import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../services/supabase";
import LockedCapsule from "./LockedCapsule";
import UnlockedCapsule from "./UnlockedCapsule";
import "./CapsulePage.css";

/* ─────────────────────────────────────────────
   Derive the canonical shareable URL for a slug.
   Works in web and is ready for Capacitor deep
   links — swap APP_SCHEME for your app's scheme.
───────────────────────────────────────────────── */
const WEB_BASE = window.location.origin;
const APP_SCHEME = "timeclock"; // Capacitor deep-link scheme — change to match capacitor.config.ts

export function getCapsuleUrl(slug) {
  return `${WEB_BASE}/capsule/${slug}`;
}

export function getCapsuleDeepLink(slug) {
  // e.g. timeclock://capsule/my-title-abc123
  return `${APP_SCHEME}://capsule/${slug}`;
}

/* ─────────────────────────────────────────────
   ShareButton — copy + navigator.share
───────────────────────────────────────────────── */
function ShareButton({ slug, title }) {
  const [status, setStatus] = useState("idle"); // idle | copied | shared | error

  const handleShare = useCallback(async () => {
    const url   = getCapsuleUrl(slug);
    const text  = `Open my time capsule: "${title}"`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        setStatus("shared");
      } catch (e) {
        // user cancelled — not an error
        if (e?.name !== "AbortError") setStatus("error");
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setStatus("copied");
      } catch {
        // Clipboard blocked (e.g. http) — fallback: select a temp input
        const inp = document.createElement("input");
        inp.value = url;
        document.body.appendChild(inp);
        inp.select();
        document.execCommand("copy");
        document.body.removeChild(inp);
        setStatus("copied");
      }
    }

    if (status !== "idle") return;
    setTimeout(() => setStatus("idle"), 2800);
  }, [slug, title, status]);

  const label =
    status === "copied" ? "✅ Link copied!"  :
    status === "shared" ? "✅ Shared!"        :
    status === "error"  ? "⚠️ Couldn't share" :
    "🔗 Share Capsule";

  return (
    <button
      className={`cp-share-btn cp-share-btn--${status}`}
      onClick={handleShare}
      aria-live="polite"
    >
      {label}
    </button>
  );
}

/* ─────────────────────────────────────────────
   Loading skeleton
───────────────────────────────────────────────── */
function LoadingScreen() {
  return (
    <div className="cp-loading">
      <div className="cp-loading-ring" />
      <p className="cp-loading-text">Opening capsule…</p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Error screen
───────────────────────────────────────────────── */
function ErrorScreen({ message }) {
  return (
    <div className="cp-error-screen">
      <span className="cp-error-icon">📭</span>
      <h2 className="cp-error-title">Capsule not found</h2>
      <p className="cp-error-msg">{message || "This link may be invalid or expired."}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main page component
───────────────────────────────────────────────── */
function CapsulePage() {
  const { slug } = useParams();
  const [capsule,  setCapsule]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  /* Load capsule by slug */
  useEffect(() => {
    if (!slug) {
      setErrorMsg("No capsule identifier in URL.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("capsules")
        .select("*")
        .eq("slug", slug)
        .single();

      if (cancelled) return;

      if (error || !data) {
        setErrorMsg(error?.message || "Capsule not found.");
        setLoading(false);
        return;
      }

      setCapsule(data);

      // Determine locked/unlocked from unlock_date
      const unlockAt = data.unlock_date ? new Date(data.unlock_date) : null;
      setUnlocked(!unlockAt || Date.now() >= unlockAt.getTime());
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [slug]);

  /* Called by LockedCapsule countdown when timer hits zero */
  const handleUnlock = useCallback(() => setUnlocked(true), []);

  if (loading)  return <LoadingScreen />;
  if (errorMsg) return <ErrorScreen message={errorMsg} />;

  return (
    <div className="cp-root">
      {/* Floating share button — always visible */}
      <div className="cp-share-fab">
        <ShareButton slug={capsule.slug || slug} title={capsule.title} />
      </div>

      {unlocked ? (
        <UnlockedCapsule capsule={capsule} />
      ) : (
        <LockedCapsule
          unlockDate={capsule.unlock_date}
          onUnlock={handleUnlock}
          capsuleTitle={capsule.title}
          senderName={capsule.sender_name}
          recipientName={capsule.receiver_name || ""}
          recipientEmail={capsule.receiver_email || ""}
          hint={capsule.hint || null}
          coverImage={capsule.cover_image || null}
        />
      )}
    </div>
  );
}

export default CapsulePage;
