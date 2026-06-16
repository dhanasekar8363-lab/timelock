import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase, getRecipientDisplayName, getRecipientEmail, awardCapsuleOpened } from "../services/supabase";
import { playSound } from "../utils/sounds";
import { usePet } from "../contexts/PetContext";
import { useAuth } from "../contexts/AuthContext";
import LockedCapsule from "./LockedCapsule";
import UnlockedCapsule from "./UnlockedCapsule";

/* ── Loading screen ── */
function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
        color: "#fff",
        gap: "1rem",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: "3rem", animation: "spin 1.5s linear infinite" }}>⏳</div>
      <p style={{ opacity: 0.7, fontSize: "0.95rem", letterSpacing: "0.05em" }}>
        Opening your capsule…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Error screen ── */
function ErrorScreen({ message }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
        color: "#fff",
        gap: "1rem",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: "3rem" }}>🔍</div>
      <h2 style={{ margin: 0, fontWeight: 700 }}>Capsule Not Found</h2>
      <p style={{ opacity: 0.65, maxWidth: 300 }}>
        {message || "This link may be invalid or the capsule has been removed."}
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════
   CapsuleViewer — loads by slug
══════════════════════════════════════════ */
function CapsuleViewer() {
  const { slug } = useParams();
  const [capsule, setCapsule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  // 🌳 Tracks whether the open-capsule award fired this session to prevent
  //    a race condition if the page loads exactly as the unlock date passes.
  const treeAwardFiredRef = useRef(false);
  const { triggerPetEvent } = usePet();
  const { user } = useAuth();

  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return; }

    (async () => {
      const { data, error } = await supabase
        .from("capsules")
        .select("*")
        .eq("slug", slug)
        .single();

      setLoading(false);

      if (error || !data) { setNotFound(true); return; }

      setCapsule(data);

      /* Determine lock state immediately */
      const unlockDate = data.unlock_date || data.unlockDate;
      const unlocked = unlockDate
        ? new Date(unlockDate).getTime() <= Date.now()
        : true; // no date set → treat as open

      // 🔊 Play unlock sound when capsule is already open on arrival
      if (unlocked) {
        playSound("unlock");
        // 🐾 Lumi celebrates the capsule being unlocked
        triggerPetEvent("capsuleUnlocked");
        // 🌳 World Tree — +200 growth for opening the capsule (on-load path).
        // Only fires when the capsule data loaded successfully AND the unlock
        // date has passed AND the viewer is authenticated. The dedup guard in
        // awardCapsuleOpened prevents re-awarding on refresh or revisit.
        if (user?.id && data.id) {
          treeAwardFiredRef.current = true;
          awardCapsuleOpened(user.id, data.id).catch((e) =>
            console.warn("[WorldTree] awardCapsuleOpened (on-load) failed silently:", e)
          );
        }
      }

      setIsUnlocked(unlocked);
    })();
  }, [slug]);

  /* Callback from LockedCapsule when countdown hits zero */
  const handleUnlock = () => {
    // 🔊 Play unlock sound when countdown reaches zero mid-session
    playSound("unlock");
    // 🐾 Lumi celebrates the capsule unlocking live
    triggerPetEvent("capsuleUnlocked");
    // 🌳 World Tree — +200 growth for opening the capsule (live unlock path).
    // Session guard: skip if the on-load path already fired this session to
    // prevent a double-award race. Server-side dedup is the final backstop.
    if (user?.id && capsule?.id && !treeAwardFiredRef.current) {
      treeAwardFiredRef.current = true;
      awardCapsuleOpened(user.id, capsule.id).catch((e) =>
        console.warn("[WorldTree] awardCapsuleOpened (live unlock) failed silently:", e)
      );
    }
    setIsUnlocked(true);
  };

  if (loading)   return <LoadingScreen />;
  if (notFound)  return <ErrorScreen />;

  if (isUnlocked) {
    return <UnlockedCapsule capsule={capsule} />;
  }

  return (
    <LockedCapsule
      unlockDate={capsule.unlock_date || capsule.unlockDate}
      onUnlock={handleUnlock}
      capsuleTitle={capsule.title}
      senderName={capsule.sender_name || capsule.senderName}
      recipientName={getRecipientDisplayName(capsule)}
      recipientEmail={getRecipientEmail(capsule)}
      hint={capsule.hint || null}
      coverImage={capsule.cover_image || capsule.coverImage || null}
      slug={capsule.slug}
    />
  );
}

export default CapsuleViewer;
