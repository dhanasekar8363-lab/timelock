import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { getPetProfile, createPetProfile, updatePetProfile } from "../services/petService";
import { supabase } from "../services/supabase";
import { playSound } from "../utils/sounds";
import { logger } from "../utils/logger";

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

const XP_STORAGE_KEY               = "lumi_pet_xp";
const HAPPINESS_STORAGE_KEY        = "lumi_pet_happiness";
const MOOD_STORAGE_KEY             = "lumi_pet_mood";
const FEED_COUNT_STORAGE_KEY       = "lumi_feed_count";
const GIFT_COUNT_STORAGE_KEY       = "lumi_gift_count";
const INTERACTION_COUNT_STORAGE_KEY = "lumi_interaction_count";
const SEEN_LEVELS_STORAGE_KEY      = "lumi_seen_levels";
const COOLDOWNS_STORAGE_KEY        = "lumi_cooldowns";
const UNLOCK_REWARD_EVENT_KEY      = "lumi_unlock_reward_event";
const MIGRATION_COMPLETE_KEY       = "lumi_supabase_migration_complete";

const DEFAULT_HAPPINESS = 100;

/* ─────────────────────────────────────────────
   Small localStorage read helpers (used only as a
   fallback while Supabase is the source of truth).
───────────────────────────────────────────── */
function readNumberFromStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored !== null ? Number(stored) : fallback;
  } catch {
    return fallback;
  }
}

function readStringFromStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored !== null ? stored : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Reads every locally-stored pet stat at once. Used to seed a brand-new
 * Supabase profile the first time a user logs in (migration from
 * localStorage-only storage to Supabase-backed storage).
 */
function readPetDataFromLocalStorage() {
  const mood = readStringFromStorage(MOOD_STORAGE_KEY, "happy");

  return {
    petXP:            readNumberFromStorage(XP_STORAGE_KEY, 0),
    happiness:        readNumberFromStorage(HAPPINESS_STORAGE_KEY, DEFAULT_HAPPINESS),
    mood:             MOODS[mood] ? mood : "happy",
    feedCount:        readNumberFromStorage(FEED_COUNT_STORAGE_KEY, 0),
    giftCount:        readNumberFromStorage(GIFT_COUNT_STORAGE_KEY, 0),
    interactionCount: readNumberFromStorage(INTERACTION_COUNT_STORAGE_KEY, 0),
  };
}

/* ══════════════════════════════════════════
   Food & Gift cooldown durations (minutes)
══════════════════════════════════════════ */
export const FOOD_COOLDOWNS = {
  snack: 5,
  fish: 15,
  premiumMeal: 60,
};

export const GIFT_COOLDOWNS = {
  toy: 20,
  crystal: 40,
  cosmicStar: 90,
};

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
  const { user } = useAuth();

  const [activeEvent, setActiveEvent]   = useState(null);

  // ── Profile fields (now backed by Supabase, localStorage = fallback) ──
  const [mood, setMood] = useState(() =>
    readStringFromStorage(MOOD_STORAGE_KEY, "happy")
  );
  const [petXP, setPetXP] = useState(() =>
    readNumberFromStorage(XP_STORAGE_KEY, 0)
  );
  const [happiness, setHappiness] = useState(() =>
    readNumberFromStorage(HAPPINESS_STORAGE_KEY, DEFAULT_HAPPINESS)
  );
  const [feedCount, setFeedCount] = useState(() =>
    readNumberFromStorage(FEED_COUNT_STORAGE_KEY, 0)
  );
  const [giftCount, setGiftCount] = useState(() =>
    readNumberFromStorage(GIFT_COUNT_STORAGE_KEY, 0)
  );
  const [interactionCount, setInteractionCount] = useState(() =>
    readNumberFromStorage(INTERACTION_COUNT_STORAGE_KEY, 0)
  );

  // True once we've attempted to load/create the Supabase profile for the
  // current user. Prevents the sync effect from firing (and overwriting the
  // freshly-loaded row) before the initial load has completed.
  const [petProfileLoaded, setPetProfileLoaded] = useState(false);
  const profileLoadedForUserRef = useRef(null);

  // True if this session migrated existing localStorage pet data into a
  // brand-new Supabase profile (first login on this device for this user).
  const [petDataMigrated, setPetDataMigrated] = useState(false);

  // { level: number } when a level-up just occurred; null otherwise
  const [levelUpReward, setLevelUpReward] = useState(null);

  const eventIdRef          = useRef(0);
  const celebrationTimerRef = useRef(null);
  const prevMoodRef         = useRef(mood);

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

  /**
   * Cooldowns: itemId -> end timestamp (ms since epoch).
   * Loaded once from localStorage on startup so cooldowns persist
   * across page refreshes.
   */
  const cooldownsRef = useRef(
    (() => {
      try {
        const raw = localStorage.getItem(COOLDOWNS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    })()
  );

  const persistCooldowns = useCallback(async () => {
    try {
      if (user?.id) {
        await updatePetProfile(user.id, {
          cooldowns: cooldownsRef.current,
        });
      }

      localStorage.setItem(
        COOLDOWNS_STORAGE_KEY,
        JSON.stringify(cooldownsRef.current),
      );
    } catch (err) {
      logger.error("Failed to save cooldowns", err);
    }
  }, [user]);

  /**
   * Starts (or restarts) a cooldown for `itemId` lasting `durationMinutes`.
   * Stores the absolute end timestamp so it survives page refreshes.
   */
  const startCooldown = useCallback((itemId, durationMinutes) => {
    if (!itemId || typeof durationMinutes !== "number" || durationMinutes <= 0) {
      logger.warn(
        `[PetContext] startCooldown expects (itemId, positiveDurationMinutes), got: (${itemId}, ${durationMinutes})`,
      );
      return;
    }
    const endTimestamp = Date.now() + durationMinutes * 60 * 1000;
    cooldownsRef.current = { ...cooldownsRef.current, [itemId]: endTimestamp };
    persistCooldowns();
  }, [persistCooldowns]);

  /**
   * Returns the remaining cooldown time for `itemId` in whole seconds.
   * Returns 0 if there is no active cooldown.
   */
  const getRemainingCooldown = useCallback((itemId) => {
    const endTimestamp = cooldownsRef.current[itemId];
    if (!endTimestamp) return 0;
    const remainingMs = endTimestamp - Date.now();
    if (remainingMs <= 0) {
      // Cooldown has expired — clean it up
      if (itemId in cooldownsRef.current) {
        const { [itemId]: _removed, ...rest } = cooldownsRef.current;
        cooldownsRef.current = rest;
        persistCooldowns();
      }
      return 0;
    }
    return Math.ceil(remainingMs / 1000);
  }, [persistCooldowns]);

  /**
   * Returns true if `itemId` currently has an active (non-expired) cooldown.
   */
  const isCooldownActive = useCallback((itemId) => {
    return getRemainingCooldown(itemId) > 0;
  }, [getRemainingCooldown]);

  /* ══════════════════════════════════════════
     Supabase profile loading (on login)
     ──────────────────────────────────────────
     1. Get current user (from AuthContext).
     2. Load pet profile from Supabase.
     3. If no profile exists, create one — seeded with whatever values
        we currently have (e.g. carried over from localStorage / defaults).
     localStorage values above are used as the *initial* state and as a
     fallback if the user is logged out or the Supabase call fails.
  ══════════════════════════════════════════ */
  useEffect(() => {
    if (!user?.id) {
      // No logged-in user — fall back to whatever is in localStorage.
      profileLoadedForUserRef.current = null;
      setPetProfileLoaded(false);
      return;
    }

    // Avoid re-running the load for the same user (e.g. on re-renders).
    if (profileLoadedForUserRef.current === user.id) return;

    let cancelled = false;

    const applyProfile = (profile) => {
      if (!profile || cancelled) return;
      if (profile.cooldowns) {
        cooldownsRef.current = profile.cooldowns;
      }
      if (typeof profile.pet_xp === "number") setPetXP(profile.pet_xp);
      if (typeof profile.happiness === "number") setHappiness(profile.happiness);
      if (typeof profile.mood === "string" && MOODS[profile.mood]) {
        prevMoodRef.current = profile.mood;
        setMood(profile.mood);
      }
      if (typeof profile.feed_count === "number") setFeedCount(profile.feed_count);
      if (typeof profile.gift_count === "number") setGiftCount(profile.gift_count);
      if (typeof profile.interaction_count === "number") setInteractionCount(profile.interaction_count);
    };

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();

      const { data, error } = await getPetProfile(user.id);

      if (cancelled) return;

      if (error) {
        logger.error("[PetContext] Failed to load pet profile from Supabase, using localStorage fallback.", error);
        // Don't mark as loaded for this user — we'll retry on next mount/user change,
        // and in the meantime the sync effect stays disabled so we don't clobber
        // a row we couldn't read.
        return;
      }

      if (!data) {
        // No profile yet for this user — first login on Supabase.
        //
        // ── Migration step ────────────────────────────────────────────
        // Read whatever pet data already exists in localStorage (from
        // earlier localStorage-only usage) and use it to seed the new
        // Supabase row. localStorage itself is left untouched so it
        // continues to work as the offline fallback.
        const localData = readPetDataFromLocalStorage();

        const { data: created, error: createError } = await createPetProfile(user.id, {
          pet_xp: localData.petXP,
          happiness: localData.happiness,
          mood: localData.mood,
          feed_count: localData.feedCount,
          gift_count: localData.giftCount,
          interaction_count: localData.interactionCount,
          cooldowns: {},
        });

        if (cancelled) return;

        if (createError) {
          logger.error("[PetContext] Failed to create pet profile in Supabase, using localStorage fallback.", createError);
          return;
        }

        applyProfile(created);

        // Mark the migration as complete for this device/browser. We do
        // NOT delete the original localStorage values — they remain as a
        // fallback (e.g. if the user is briefly offline or logged out).
        try {
          localStorage.setItem(MIGRATION_COMPLETE_KEY, "true");
        } catch {
          logger.warn("[PetContext] Could not persist migration-complete flag.");
        }

        setPetDataMigrated(true);
        logger.debug("[PetContext] Migrated local pet data to new Supabase profile for user", user.id);
      } else {
        applyProfile(data);
      }

      profileLoadedForUserRef.current = user.id;
      setPetProfileLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally only re-run when the user identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* ══════════════════════════════════════════
     Persist to localStorage (fallback store)
     — kept for offline / logged-out support.
  ══════════════════════════════════════════ */
  useEffect(() => {
    try {
      localStorage.setItem(XP_STORAGE_KEY, String(petXP));
    } catch {
      logger.warn("[PetContext] Could not save XP to localStorage.");
    }
  }, [petXP]);

  useEffect(() => {
    try {
      localStorage.setItem(HAPPINESS_STORAGE_KEY, String(happiness));
    } catch {
      logger.warn("[PetContext] Could not save happiness to localStorage.");
    }
  }, [happiness]);

  useEffect(() => {
    try {
      localStorage.setItem(MOOD_STORAGE_KEY, mood);
    } catch {
      logger.warn("[PetContext] Could not save mood to localStorage.");
    }
  }, [mood]);

  useEffect(() => {
    try {
      localStorage.setItem(FEED_COUNT_STORAGE_KEY, String(feedCount));
    } catch {
      logger.warn("[PetContext] Could not save feed count to localStorage.");
    }
  }, [feedCount]);

  useEffect(() => {
    try {
      localStorage.setItem(GIFT_COUNT_STORAGE_KEY, String(giftCount));
    } catch {
      logger.warn("[PetContext] Could not save gift count to localStorage.");
    }
  }, [giftCount]);

  useEffect(() => {
    try {
      localStorage.setItem(INTERACTION_COUNT_STORAGE_KEY, String(interactionCount));
    } catch {
      logger.warn("[PetContext] Could not save interaction count to localStorage.");
    }
  }, [interactionCount]);

  /* ══════════════════════════════════════════
     Sync profile fields back to Supabase
     ──────────────────────────────────────────
     Debounced so rapid successive changes (e.g. addXP + mood change)
     collapse into a single update. Only runs once the initial
     Supabase load/create for the current user has completed.
  ══════════════════════════════════════════ */
  const syncTimeoutRef = useRef(null);

  useEffect(() => {
    if (!user?.id || !petProfileLoaded) return;

    clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      updatePetProfile(user.id, {
        pet_xp: petXP,
        happiness,
        mood,
        feed_count: feedCount,
        gift_count: giftCount,
        interaction_count: interactionCount,
      }).then(({ error }) => {
        if (error) {
          logger.error("[PetContext] Failed to sync pet profile to Supabase.", error);
        }
      });
    }, 800);

    return () => clearTimeout(syncTimeoutRef.current);
  }, [user?.id, petProfileLoaded, petXP, happiness, mood, feedCount, giftCount, interactionCount]);

  const clearLevelUpReward = useCallback(() => {
    setLevelUpReward(null);
  }, []);

  const clearPetDataMigrated = useCallback(() => {
    setPetDataMigrated(false);
  }, []);

  const addXP = useCallback((amount) => {
    if (typeof amount !== "number" || amount <= 0) {
      logger.warn(`[PetContext] addXP expects a positive number, got: ${amount}`);
      return;
    }
    setPetXP((prev) => {
      const next        = prev + amount;
      const prevLevel   = getLevel(prev);
      const nextLevel   = getLevel(next);

      if (nextLevel > prevLevel) {
        // 🔊 Level-up sound — lives here (not in PetCompanion) so it fires
        // exactly once per addXP() call, even if this single XP reward
        // pushes the pet up multiple levels at once.
        playSound("lumiSpark");

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
              logger.warn("[PetContext] Could not persist seen levels.");
            }
            // Schedule outside the setState updater to avoid React warnings
            setTimeout(() => setLevelUpReward({ level: lv }), 0);
          }
        }
      }

      return next;
    });
  }, []);

  /* ─────────────────────────────────────────
     Happiness / feed / gift / interaction helpers
     - These are the new fields now tracked alongside petXP & mood,
       and are loaded from / synced to Supabase like the rest of
       the profile above.
  ───────────────────────────────────────── */
  const adjustHappiness = useCallback((delta) => {
    if (typeof delta !== "number") {
      logger.warn(`[PetContext] adjustHappiness expects a number, got: ${delta}`);
      return;
    }
    setHappiness((prev) => Math.max(0, Math.min(100, prev + delta)));
  }, []);

  const incrementFeedCount = useCallback((amount = 1) => {
    setFeedCount((prev) => prev + amount);
  }, []);

  const incrementGiftCount = useCallback((amount = 1) => {
    setGiftCount((prev) => prev + amount);
  }, []);

  const incrementInteractionCount = useCallback((amount = 1) => {
    setInteractionCount((prev) => prev + amount);
  }, []);

  const triggerPetEvent = useCallback((type) => {
    const config = PET_EVENTS[type];
    if (!config) {
      logger.warn(`[PetContext] Unknown pet event: "${type}"`);
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
      logger.warn(`[PetContext] Unknown mood: "${newMood}"`);
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

  /**
   * Awards Lumi XP when a capsule is unlocked, then fires the
   * "capsuleUnlocked" pet event so the companion can react.
   *
   * Reward formula:
   *   rewardXP = Math.ceil(getNextLevelXP(currentXP) * 0.5)
   *
   * A temporary record is written to localStorage under
   * UNLOCK_REWARD_EVENT_KEY so other surfaces can inspect it.
   * The record is not cleared here — the caller is responsible
   * for reading / clearing it when needed.
   */
  const triggerCapsuleUnlockReward = useCallback(() => {
    // Read XP synchronously from localStorage so we don't rely on
    // stale closure state. Falls back to 0 if nothing is stored yet.
    const storedXP = (() => {
      try {
        const raw = localStorage.getItem(XP_STORAGE_KEY);
        return raw !== null ? Number(raw) : 0;
      } catch {
        return 0;
      }
    })();

    const xpNeededThisLevel = getNextLevelXP(storedXP);
    const rewardXP          = Math.ceil(xpNeededThisLevel * 0.5);

    // Persist the reward event so other surfaces can read it
    try {
      localStorage.setItem(
        UNLOCK_REWARD_EVENT_KEY,
        JSON.stringify({
          type:      "capsule_unlocked",
          rewardXP,
          timestamp: Date.now(),
        }),
      );
    } catch {
      logger.warn("[PetContext] Could not persist unlock reward event.");
    }

    // Grant the XP and fire the pet event
    addXP(rewardXP);
    triggerPetEvent("capsuleUnlocked");
  }, [addXP, triggerPetEvent]);

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
        happiness,
        adjustHappiness,
        feedCount,
        incrementFeedCount,
        giftCount,
        incrementGiftCount,
        interactionCount,
        incrementInteractionCount,
        petProfileLoaded,
        petDataMigrated,
        clearPetDataMigrated,
        levelUpReward,
        clearLevelUpReward,
        startCooldown,
        getRemainingCooldown,
        isCooldownActive,
        triggerCapsuleUnlockReward,
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