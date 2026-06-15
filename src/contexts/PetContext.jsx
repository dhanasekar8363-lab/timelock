import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

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

const XP_STORAGE_KEY           = "lumi_pet_xp";
const SEEN_LEVELS_STORAGE_KEY  = "lumi_seen_levels";

/* ══════════════════════════════════════════
   XP / Level utilities
   ──────────────────────────────────────────
   The XP cost to advance each level increases by +50 XP over the previous:
     L1 → L2 :  100 XP  (base)
     L2 → L3 :  150 XP
     L3 → L4 :  200 XP
     L4 → L5 :  250 XP  … and so on indefinitely.

   Total XP required to reach level N (N ≥ 2) is the sum of that series:
     xpForLevel(N) = 25 * (N - 1) * (N + 2)

   Derivation — arithmetic series Σ_{k=1}^{N-1} (50 + 50k):
     = (N-1)*100 + 50*(N-1)*(N-2)/2  =  25*(N-1)*(N+2)
══════════════════════════════════════════ */

/**
 * Total XP required to *reach* `level` from zero (level 1 costs 0 XP).
 * Scales infinitely — no level cap.
 */
export function xpForLevel(level) {
  if (level <= 1) return 0;
  return 25 * (level - 1) * (level + 2);
}

/**
 * Returns the pet's current level given total accumulated XP.
 * Minimum level is 1.
 */
export function getLevel(xp) {
  if (xp < 0) return 1;
  // Invert xpForLevel: solve 25*(N-1)*(N+2) ≤ xp for the largest integer N.
  // Rearranges to N² + N - 2 ≤ xp/25, solved via the quadratic formula.
  const n = Math.floor((-1 + Math.sqrt(1 + 4 * (xp / 25 + 2))) / 2);
  return Math.max(1, n);
}

/**
 * XP earned within the current level (resets to 0 on level-up).
 * Useful as the current value of a level progress bar.
 */
export function getCurrentLevelXP(xp) {
  return xp - xpForLevel(getLevel(xp));
}

/**
 * Total XP required to complete the current level (i.e. advance to the next).
 * Useful as the max value of a level progress bar.
 */
export function getNextLevelXP(xp) {
  const level = getLevel(xp);
  return xpForLevel(level + 1) - xpForLevel(level);
}

export function PetProvider({ children }) {
  const [activeEvent, setActiveEvent]   = useState(null);
  const [mood, setMood]                 = useState("happy");
  const [petXP, setPetXP]              = useState(() => {
    try {
      const stored = localStorage.getItem(XP_STORAGE_KEY);
      return stored !== null ? Number(stored) : 0;
    } catch {
      return 0;
    }
  });
  // { level: number } when a level-up just occurred; null otherwise
  const [levelUpReward, setLevelUpReward] = useState(null);

  const eventIdRef          = useRef(0);
  const celebrationTimerRef = useRef(null);
  const prevMoodRef         = useRef("happy");

  /**
   * Tracks which levels have already fired the level-up reward so it fires
   * exactly once per level, permanently, even across page reloads.
   * Stored as a JSON array of integers in localStorage.
   */
  const seenLevelsRef = useRef(
    (() => {
      try {
        const raw = localStorage.getItem(SEEN_LEVELS_STORAGE_KEY);
        return new Set(raw ? JSON.parse(raw) : [1]);
      } catch {
        return new Set([1]);
      }
    })()
  );

  // Persist XP to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(XP_STORAGE_KEY, String(petXP));
    } catch {
      console.warn("[PetContext] Could not save XP to localStorage.");
    }
  }, [petXP]);

  const clearLevelUpReward = useCallback(() => {
    setLevelUpReward(null);
  }, []);

  const addXP = useCallback((amount) => {
    if (typeof amount !== "number" || amount <= 0) {
      console.warn(`[PetContext] addXP expects a positive number, got: ${amount}`);
      return;
    }
    setPetXP((prev) => {
      const next        = prev + amount;
      const prevLevel   = getLevel(prev);
      const nextLevel   = getLevel(next);

      if (nextLevel > prevLevel) {
        // Walk every level gained in this single addXP call (rare but safe)
        for (let lv = prevLevel + 1; lv <= nextLevel; lv++) {
          if (!seenLevelsRef.current.has(lv)) {
            seenLevelsRef.current.add(lv);
            // Persist the updated seen-levels set
            try {
              localStorage.setItem(
                SEEN_LEVELS_STORAGE_KEY,
                JSON.stringify([...seenLevelsRef.current]),
              );
            } catch {
              console.warn("[PetContext] Could not persist seen levels.");
            }
            // Schedule outside the setState updater to avoid React warnings
            setTimeout(() => setLevelUpReward({ level: lv }), 0);
          }
        }
      }

      return next;
    });
  }, []);

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
        petXP,
        addXP,
        levelUpReward,
        clearLevelUpReward,
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
