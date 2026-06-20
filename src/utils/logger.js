/**
 * Centralized logging utility.
 *
 * Why this exists:
 *  - Raw `console.log` calls left in by mistake get shipped straight to
 *    every user's browser console in production — including ones that
 *    print payloads (emails, user IDs, DB rows) that shouldn't be visible
 *    there.
 *  - `console.warn` / `console.error` calls are *intentional* error
 *    reporting and must keep working in production so real problems are
 *    still visible (and so they can be wired up to a monitoring service
 *    later without touching every call site again).
 *
 * Usage:
 *   import { logger } from "../utils/logger";
 *
 *   logger.debug("[CreateCapsule] upload result", result); // dev-only, silent in prod
 *   logger.warn("[PetContext] could not persist X", err);  // always logs
 *   logger.error("[PetContext] failed to sync", err);      // always logs
 *
 * `import.meta.env.DEV` is provided by Vite: true in `vite dev`, false in
 * a production build (`vite build`), so debug/info noise is automatically
 * stripped from production bundles' runtime output without needing a
 * build-time plugin.
 */
const isDev = import.meta.env.DEV;

export const logger = {
  /** Verbose diagnostic logging. Dev-only — silent in production. */
  debug: (...args) => {
    if (isDev) console.log(...args);
  },

  /** Informational logging. Dev-only — silent in production. */
  info: (...args) => {
    if (isDev) console.info(...args);
  },

  /** Recoverable problems (e.g. a fallback was used). Always logs. */
  warn: (...args) => {
    console.warn(...args);
    // Hook point: send to an error-reporting service in production, e.g.
    // if (!isDev) Sentry.captureMessage(args[0], { level: "warning", extra: args });
  },

  /** Failures that affect correctness (e.g. a write to Supabase failed). Always logs. */
  error: (...args) => {
    console.error(...args);
    // Hook point: send to an error-reporting service in production, e.g.
    // if (!isDev) Sentry.captureException(args[args.length - 1]);
  },
};
