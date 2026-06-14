import { createContext, useContext, useState, useCallback, useRef } from "react";

/* ══════════════════════════════════════════
   PetContext — drives Lumi's reactive events
══════════════════════════════════════════ */

const PetContext = createContext(null);

// Central config for each supported event type.
// PetCompanion reads `activeEvent` and looks these up to decide
// which animation / effect / speech bubble to show.
export const PET_EVENTS = {
  capsuleCreated: {
    animation: "jump",
    effect: "sparkle",
    message: "Memory saved! ✨",
    duration: 3000,
  },
  newMessage: {
    animation: "tailWag",
    effect: "heart",
    message: "Someone sent you something! 💌",
    duration: 3000,
  },
  capsuleUnlocked: {
    animation: "celebrate",
    effect: "confetti",
    message: "Time to open it! 🎉",
    duration: 3500,
  },
};

export function PetProvider({ children }) {
  const [activeEvent, setActiveEvent] = useState(null);
  // incrementing key lets PetCompanion re-trigger the same
  // animation even if the same event type fires again quickly
  const eventIdRef = useRef(0);

  const triggerPetEvent = useCallback((type) => {
    const config = PET_EVENTS[type];
    if (!config) {
      console.warn(`[PetContext] Unknown pet event: "${type}"`);
      return;
    }

    eventIdRef.current += 1;

    setActiveEvent({
      id: eventIdRef.current,
      type,
      ...config,
    });
  }, []);

  const clearPetEvent = useCallback(() => {
    setActiveEvent(null);
  }, []);

  return (
    <PetContext.Provider value={{ activeEvent, triggerPetEvent, clearPetEvent }}>
      {children}
    </PetContext.Provider>
  );
}

export function usePet() {
  const ctx = useContext(PetContext);
  if (!ctx) {
    throw new Error("usePet must be used within a PetProvider");
  }
  return ctx;
}

export default PetContext;
