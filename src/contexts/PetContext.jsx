import { createContext, useContext, useState, useCallback, useRef } from "react";

/* ══════════════════════════════════════════
   PetContext — drives Lumi's reactive events + mood system
══════════════════════════════════════════ */

const PetContext = createContext(null);

// Central config for each supported event type.
export const PET_EVENTS = {
  capsuleCreated: {
    animation: "jump",
    effect: "confetti",
    message: "Yay! New capsule created! 🎉",
    duration: 3500,
  },
  capsuleReceived: {
    animation: "bounce",
    effect: "floatingHearts",
    message: "Someone sent you a capsule! 💌",
    duration: 3500,
  },
  newMessage: {
    animation: "bounce",
    effect: "heart",
    message: "Someone sent you something! 💌",
    duration: 3000,
  },
  capsuleUnlocked: {
    animation: "celebrate",
    effect: "sparkleBurst",
    message: "Time to open it! 🎉",
    duration: 3500,
  },
};

/* ─────────────────────────────────────────────
   Mood definitions
   Each mood carries its own speech pool and visual hints
   that PetCompanion reads to adjust its rendering.
───────────────────────────────────────────── */
export const MOODS = {
  happy: {
    speeches: [
      "✨ Another memory saved!",
      "💜 I'm watching over your capsules.",
      "🌙 Time feels peaceful today.",
      "🔮 Your memories are in good hands.",
    ],
    glowStrength: "normal",   // "normal" | "strong" | "dim" | "off"
    idleSpeed: 1,             // multiplier for float/breathe animation duration
    sideWiggle: false,
  },
  excited: {
    speeches: [
      "🚀 Let's create something for the future!",
      "✨ A new capsule awaits!",
      "🎉 I love it when we make new memories!",
      "💫 What will you send to the future?",
    ],
    glowStrength: "strong",
    idleSpeed: 0.72,          // faster float
    sideWiggle: false,
  },
  sleepy: {
    speeches: [
      "😴 It's quiet…",
      "💫 Wake me if you need me.",
      "🌙 Drifting through memories…",
      "💤 So peaceful…",
    ],
    glowStrength: "dim",
    idleSpeed: 1.4,           // slower, heavier float
    sideWiggle: false,
  },
  curious: {
    speeches: [
      "👀 Any new messages?",
      "📬 I wonder what's inside.",
      "🤔 Something new is coming…",
      "✉️ Did someone leave you a capsule?",
    ],
    glowStrength: "normal",
    idleSpeed: 1,
    sideWiggle: true,         // subtle left-right oscillation
  },
  celebration: {
    speeches: [
      "🎉 Capsule sent successfully!",
      "✨ Time has accepted your message!",
      "🚀 Your memory is on its way!",
      "💌 The future is waiting for it!",
    ],
    glowStrength: "strong",
    idleSpeed: 0.65,
    sideWiggle: false,
  },
};

export function PetProvider({ children }) {
  const [activeEvent, setActiveEvent]   = useState(null);
  const [mood, setMood]                 = useState("happy");
  const eventIdRef                      = useRef(0);
  const celebrationTimerRef             = useRef(null);
  const prevMoodRef                     = useRef("happy");

  const triggerPetEvent = useCallback((type) => {
    const config = PET_EVENTS[type];
    if (!config) {
      console.warn(`[PetContext] Unknown pet event: "${type}"`);
      return;
    }
    eventIdRef.current += 1;
    setActiveEvent({ id: eventIdRef.current, type, ...config });
  }, []);

  const clearPetEvent = useCallback(() => {
    setActiveEvent(null);
  }, []);

  /* ─────────────────────────────────────────
     Mood API
     - setMoodForPage  : called by page components on mount
     - triggerCelebration: fires "celebration" for 8 s then restores
  ───────────────────────────────────────── */
  const setMoodForPage = useCallback((newMood) => {
    if (!MOODS[newMood]) {
      console.warn(`[PetContext] Unknown mood: "${newMood}"`);
      return;
    }
    // Don't override an active celebration
    if (celebrationTimerRef.current) return;
    prevMoodRef.current = newMood;
    setMood(newMood);
  }, []);

  const triggerCelebration = useCallback(() => {
    // Cancel any pending restoration
    clearTimeout(celebrationTimerRef.current);

    setMood("celebration");

    celebrationTimerRef.current = setTimeout(() => {
      setMood(prevMoodRef.current);
      celebrationTimerRef.current = null;
    }, 8000);
  }, []);

  return (
    <PetContext.Provider
      value={{
        activeEvent,
        triggerPetEvent,
        clearPetEvent,
        mood,
        setMoodForPage,
        triggerCelebration,
      }}
    >
      {children}
    </PetContext.Provider>
  );
}

export function usePet() {
  const ctx = useContext(PetContext);
  if (!ctx) throw new Error("usePet must be used within a PetProvider");
  return ctx;
}

export default PetContext;
