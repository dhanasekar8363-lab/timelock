/**
 * sounds.js — TimeLock sound system powered by Howler.js
 *
 * Usage:
 *   import { playSound } from "../utils/sounds";
 *   playSound("capsuleSend");
 *
 * All sounds fail silently when the audio file is missing or the browser
 * blocks autoplay. No error is ever thrown to the caller.
 *
 * Mobile / Android notes:
 *  - Howler.js handles the AudioContext unlock on first user-gesture automatically.
 *  - html5: true is set as a fallback for Android WebView / older Chromium builds
 *    that struggle with Web Audio decoding of certain MP3s.
 *  - volume is kept at 0.6 to avoid harsh spikes on mobile speakers.
 */

import { Howl, Howler } from "howler";

// ── Howler global config ──────────────────────────────────────────────────────
// Keep a reasonable master volume; the user's OS volume controls the rest.
Howler.volume(0.6);

// ── Sound definitions ─────────────────────────────────────────────────────────
/**
 * Each entry:
 *   src   – path(s) tried in order; Howler picks the first the browser can play.
 *   volume – per-sound override (0–1).
 *   html5  – true forces an <audio> element fallback (helps Android WebView).
 */
const SOUND_CONFIG = {
  capsuleSend: {
    src: ["/sounds/capsule-send.mp3"],
    volume: 0.7,
    html5: false,
  },
  notification: {
    src: ["/sounds/notification.mp3"],
    volume: 0.55,
    html5: false,
  },
  unlock: {
    src: ["/sounds/unlock.mp3"],
    volume: 0.8,
    html5: false,
  },
  achievement: {
    src: ["/sounds/achievement.mp3"],
    volume: 0.75,
    html5: false,
  },
};

// ── Lazy-loaded Howl instances ────────────────────────────────────────────────
// We only create a Howl the first time it is played so that missing files
// do not throw during module initialisation.
const _instances = {};

function getHowl(name) {
  if (_instances[name]) return _instances[name];

  const cfg = SOUND_CONFIG[name];
  if (!cfg) {
    console.warn(`[sounds] Unknown sound: "${name}"`);
    return null;
  }

  try {
    const howl = new Howl({
      src: cfg.src,
      volume: cfg.volume ?? 0.6,
      html5: cfg.html5 ?? false,
      preload: false, // load on first play, not on import
      onloaderror: (_id, err) => {
        // Missing file or network error – fail silently.
        console.warn(`[sounds] Could not load "${name}":`, err);
        // Remove the broken instance so the next call retries.
        delete _instances[name];
      },
      onplayerror: (_id, err) => {
        // Autoplay blocked or decode error – attempt html5 fallback then give up.
        console.warn(`[sounds] Could not play "${name}":`, err);
        howl.once("unlock", () => howl.play());
      },
    });

    _instances[name] = howl;
    return howl;
  } catch (e) {
    console.warn(`[sounds] Howl creation failed for "${name}":`, e);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Play a named sound.
 *
 * @param {"capsuleSend"|"notification"|"unlock"|"achievement"} name
 * @returns {number|null} Howl sound id, or null on failure.
 */
export function playSound(name) {
  try {
    const howl = getHowl(name);
    if (!howl) return null;
    return howl.play();
  } catch (e) {
    // Belt-and-suspenders: never crash the caller.
    console.warn(`[sounds] playSound("${name}") threw:`, e);
    return null;
  }
}

/**
 * Stop a currently playing sound (optional – pass the id returned by playSound).
 *
 * @param {"capsuleSend"|"notification"|"unlock"|"achievement"} name
 * @param {number} [id]
 */
export function stopSound(name, id) {
  try {
    const howl = _instances[name];
    if (!howl) return;
    id != null ? howl.stop(id) : howl.stop();
  } catch (e) {
    console.warn(`[sounds] stopSound("${name}") threw:`, e);
  }
}

/**
 * Mute / unmute all TimeLock sounds without destroying instances.
 *
 * @param {boolean} muted
 */
export function setMuted(muted) {
  try {
    Howler.mute(muted);
  } catch (e) {
    console.warn("[sounds] setMuted threw:", e);
  }
}

/**
 * Set master volume for all TimeLock sounds.
 *
 * @param {number} level  0–1
 */
export function setVolume(level) {
  try {
    Howler.volume(Math.max(0, Math.min(1, level)));
  } catch (e) {
    console.warn("[sounds] setVolume threw:", e);
  }
}

// Convenience re-export so callers can do:
//   import { sounds } from "../utils/sounds";
//   sounds.capsuleSend();
export const sounds = {
  capsuleSend:  () => playSound("capsuleSend"),
  notification: () => playSound("notification"),
  unlock:       () => playSound("unlock"),
  achievement:  () => playSound("achievement"),
};

export default sounds;
