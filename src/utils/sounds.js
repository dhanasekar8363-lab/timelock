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
 * ── Android / Capacitor notes (READ ME) ─────────────────────────────────────
 *  Root cause of "works in browser, silent on Android APK":
 *    Howler's default mode (html5:false) uses the Web Audio API, which
 *    fetches the MP3 as an ArrayBuffer and runs it through
 *    AudioContext.decodeAudioData(). Desktop Chrome decodes almost any MP3.
 *    Android WebView's decodeAudioData() is much stricter and can fail
 *    SILENTLY on otherwise-valid MP3s (no audible error, no thrown
 *    exception — it just plays nothing).
 *
 *    <audio> elements (html5:true) use Android's native MediaPlayer /
 *    ExoPlayer, which decodes the same files fine.
 *
 *  Fix applied below:
 *    1. Detect Capacitor native platform via the `window.Capacitor` global
 *       (no hard dependency on @capacitor/core import, so this never throws
 *       even if the package path differs).
 *    2. Force html5:true for every sound when running inside the Capacitor
 *       native app (Android/iOS). Web stays on Web Audio (html5:false) for
 *       lowest latency.
 *    3. Disable Howler.autoSuspend — on Android the AudioContext can be
 *       auto-suspended after ~30s idle and never cleanly resumed, which
 *       breaks sounds fired from useEffect (e.g. the "unlock" sound) with
 *       no fresh user gesture.
 *    4. Added primeAudio() — call once on the very first user tap
 *       (e.g. in App.jsx) to force-unlock the audio pipeline early.
 *    5. preload changed false → true so load failures (e.g. file missing
 *       from the Android asset bundle) surface immediately in the console
 *       instead of only on first play().
 *    6. Verbose `[sounds]` console logs at every step — view them on a real
 *       device via chrome://inspect/#devices (USB debugging must be on;
 *       Capacitor enables WebView debugging by default in debug builds).
 *
 *  Also verify (cannot be fixed from this file alone):
 *    - After ANY change to /public/sounds, you must rebuild AND resync:
 *        npm run build
 *        npx cap sync android
 *      Then confirm the files actually landed in the APK assets:
 *        ls -la android/app/src/main/assets/public/sounds/
 *      If that folder is empty/missing the mp3s, Capacitor never copied
 *      them — usually because `npx cap sync` was run without a fresh
 *      `npm run build` first, or `webDir` in capacitor.config.ts doesn't
 *      point at your Vite output folder (default "dist").
 *    - File names are case-sensitive on Android's asset filesystem
 *      (unlike some dev setups). Confirm exact casing matches
 *      "capsule-send.mp3", "notification.mp3", "unlock.mp3",
 *      "achievement.mp3".
 */

import { Howl, Howler } from "howler";

// ── Capacitor platform detection (no import required) ──────────────────────
// Capacitor injects `window.Capacitor` at runtime in native builds, so this
// works without importing @capacitor/core (and degrades gracefully to "web"
// if Capacitor isn't present at all, e.g. during plain browser dev).
function detectPlatform() {
  try {
    if (window?.Capacitor?.getPlatform) {
      return window.Capacitor.getPlatform(); // "android" | "ios" | "web"
    }
  } catch (e) {
    console.warn("[sounds] Capacitor platform detection failed:", e);
  }
  return "web";
}

function detectIsNative() {
  try {
    return !!window?.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

const PLATFORM = detectPlatform();
const IS_NATIVE = detectIsNative();

// ── Debug logging ────────────────────────────────────────────────────────────
// Flip to false to silence. Logs are visible on-device via chrome://inspect.
const DEBUG = true;
const log = (...args) => {
  if (DEBUG) console.log("[sounds]", ...args);
};

log(
  `init — platform="${PLATFORM}", isNativePlatform=${IS_NATIVE}, ` +
    `Howler.usingWebAudio(default)=${Howler.usingWebAudio}`
);

// ── Howler global config ──────────────────────────────────────────────────────
Howler.volume(0.6);
Howler.autoUnlock = true; // default true — explicit for clarity
Howler.autoSuspend = false; // ANDROID FIX: prevent AudioContext auto-suspend
// killing sounds fired without a fresh user gesture (e.g. unlock countdown).

// ANDROID FIX: force native <audio> playback inside the Capacitor app.
// Web Audio's decodeAudioData() is unreliable for MP3 on Android WebView;
// html5:true routes through Android's MediaPlayer instead.
const FORCE_HTML5 = IS_NATIVE;
log(`FORCE_HTML5 = ${FORCE_HTML5} (${FORCE_HTML5 ? "native <audio>" : "Web Audio API"})`);

// ── Sound definitions ─────────────────────────────────────────────────────────
/**
 * Each entry:
 *   src   – path(s) tried in order; Howler picks the first the browser can play.
 *   volume – per-sound override (0–1).
 *   html5  – true forces an <audio> element fallback (Android-safe).
 */
const SOUND_CONFIG = {
  capsuleSend: {
    src: ["/sounds/capsule-send.mp3"],
    volume: 0.7,
    html5: FORCE_HTML5,
  },
  notification: {
    src: ["/sounds/notification.mp3"],
    volume: 0.55,
    html5: FORCE_HTML5,
  },
  unlock: {
    src: ["/sounds/unlock.mp3"],
    volume: 0.8,
    html5: FORCE_HTML5,
  },
  achievement: {
    src: ["/sounds/achievement.mp3"],
    volume: 0.75,
    html5: FORCE_HTML5,
  },
};

// ── Lazy-loaded Howl instances ────────────────────────────────────────────────
// We only create a Howl the first time it is played so that missing files
// do not throw during module initialisation.
const _instances = {};

function getHowl(name) {
  if (_instances[name]) {
    log(`getHowl("${name}") — reusing cached instance (state="${_instances[name].state()}")`);
    return _instances[name];
  }

  const cfg = SOUND_CONFIG[name];
  if (!cfg) {
    console.warn(`[sounds] Unknown sound: "${name}"`);
    return null;
  }

  log(`getHowl("${name}") — creating new Howl`, {
    src: cfg.src,
    html5: cfg.html5 ?? FORCE_HTML5,
    platform: PLATFORM,
  });

  try {
    const howl = new Howl({
      src: cfg.src,
      volume: cfg.volume ?? 0.6,
      html5: cfg.html5 ?? FORCE_HTML5,
      // DEBUG FIX: preload immediately so a missing/undecodable file logs
      // onloaderror right away instead of only on first play().
      preload: true,
      onload: () => {
        log(`"${name}" — loaded OK (src="${cfg.src[0]}", html5=${cfg.html5 ?? FORCE_HTML5})`);
      },
      onloaderror: (_id, err) => {
        // Missing file, bad path, or undecodable format on this platform.
        console.warn(`[sounds] LOAD ERROR "${name}" (src="${cfg.src[0]}"):`, err);
        // Remove the broken instance so the next call retries.
        delete _instances[name];
      },
      onplay: (id) => {
        log(`"${name}" — playing (id=${id}, ctxState=${Howler.ctx?.state ?? "n/a (html5)"})`);
      },
      onplayerror: (_id, err) => {
        // Autoplay blocked or decode error – attempt to unlock then retry.
        console.warn(`[sounds] PLAY ERROR "${name}":`, err);
        howl.once("unlock", () => {
          log(`"${name}" — retrying playback after audio unlock`);
          howl.play();
        });
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
  log(
    `playSound("${name}") called — platform="${PLATFORM}", ` +
      `usingWebAudio=${Howler.usingWebAudio}, ctxState=${Howler.ctx?.state ?? "n/a"}`
  );

  try {
    const howl = getHowl(name);
    if (!howl) {
      log(`playSound("${name}") — aborted, no Howl instance`);
      return null;
    }

    const id = howl.play();
    log(`playSound("${name}") — howl.play() returned id=${id}, state="${howl.state()}"`);
    return id;
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

/**
 * ANDROID FIX: Call once on the very first user interaction (e.g. the first
 * tap anywhere in the app) to proactively unlock the audio pipeline before
 * any sound needs to play. This is cheap and safe to call multiple times.
 *
 * Suggested usage in App.jsx:
 *
 *   import { primeAudio } from "./utils/sounds";
 *
 *   useEffect(() => {
 *     const handler = () => {
 *       primeAudio();
 *       window.removeEventListener("touchend", handler);
 *       window.removeEventListener("click", handler);
 *     };
 *     window.addEventListener("touchend", handler, { once: true });
 *     window.addEventListener("click", handler, { once: true });
 *     return () => {
 *       window.removeEventListener("touchend", handler);
 *       window.removeEventListener("click", handler);
 *     };
 *   }, []);
 */
export function primeAudio() {
  log("primeAudio() called — unlocking audio pipeline");
  try {
    if (Howler.ctx && Howler.ctx.state === "suspended") {
      Howler.ctx.resume().then(() => log("AudioContext resumed"));
    }
    // Touch each sound briefly at volume 0 so its underlying <audio> element
    // / buffer is created and unlocked while we still have a user gesture.
    Object.keys(SOUND_CONFIG).forEach((name) => {
      const howl = getHowl(name);
      if (!howl) return;
      const id = howl.play();
      howl.volume(0, id);
      howl.stop(id);
      howl.volume(SOUND_CONFIG[name].volume ?? 0.6, id);
    });
  } catch (e) {
    console.warn("[sounds] primeAudio threw:", e);
  }
}

// Convenience re-export so callers can do:
//   import { sounds } from "../utils/sounds";
//   sounds.capsuleSend();
export const sounds = {
  capsuleSend: () => playSound("capsuleSend"),
  notification: () => playSound("notification"),
  unlock: () => playSound("unlock"),
  achievement: () => playSound("achievement"),
};

export default sounds;
