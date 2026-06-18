import { supabase } from "./supabase";

// ==================== MEMORY STORM SERVICE ====================
//
// A "Memory Storm" is a timed World Tree event that grants bonus growth
// every second for the duration of the storm (e.g. +5 growth/sec for 2
// hours = 36,000 bonus growth).
//
// IMPORTANT: storm growth is NEVER written to Supabase on a per-second
// basis. It is purely derived/computed from elapsed time whenever it's
// needed (page load, polling tick, etc.):
//
//     storm_growth = elapsed_seconds * growth_per_second
//
// This keeps the existing `world_tree.growth` column (community growth)
// completely untouched. Storm growth is only ever combined with it at
// READ time — see the extended `getWorldTree()` in worldTree.js.
//
// Expected Supabase table:
//
//   CREATE TABLE IF NOT EXISTS public.memory_storms (
//     id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     name              text NOT NULL,
//     growth_per_second numeric NOT NULL,
//     start_time        timestamptz NOT NULL,
//     end_time          timestamptz NOT NULL,
//     active            boolean NOT NULL DEFAULT true,
//     created_at        timestamptz NOT NULL DEFAULT now()
//   );
//
//   ALTER TABLE public.memory_storms ENABLE ROW LEVEL SECURITY;
//
//   CREATE POLICY "Memory storms are viewable by everyone"
//   ON public.memory_storms
//   FOR SELECT
//   TO authenticated, anon
//   USING (true);
//
// `active` is a manual/admin kill-switch (e.g. an admin can end a storm
// early). Whether a storm is "currently happening" is still always
// re-checked against start_time/end_time, never just the active flag
// alone — see getActiveStorm() below.

/**
 * Fetch the storm that is currently happening right now, if any.
 *
 * A storm counts as "currently active" only when ALL of the following
 * are true:
 *   - active === true
 *   - start_time <= now
 *   - end_time   >= now
 *
 * If multiple rows somehow qualify, the most recently started one wins.
 *
 * @returns {{ data: object|null, error: object|null }}
 *          `data` is the storm row, or null if no storm is running.
 */
export const getActiveStorm = async () => {
  try {
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("memory_storms")
      .select("*")
      .eq("active", true)
      .lte("start_time", nowIso)
      .gte("end_time", nowIso)
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return { data: data || null, error: null };
  } catch (error) {
    console.error("[getActiveStorm]", error);
    return { data: null, error };
  }
};

/**
 * Calculate how much bonus growth a storm has generated so far, purely
 * from elapsed time. This NEVER writes to Supabase — it's a pure
 * function safe to call every second on the client (e.g. in a render
 * loop or interval) without hammering the database.
 *
 * Elapsed time is clamped to the storm's own window:
 *   - before start_time  -> 0 elapsed, 0 growth
 *   - after end_time      -> full duration counted, growth stops growing
 *
 * @param {{ start_time: string, end_time: string,
 *           growth_per_second: number, active: boolean }} storm
 * @param {Date} [now]  Optional override (mainly for testing).
 * @returns {number} Total storm growth generated, rounded down to a whole number.
 */
export const calculateStormGrowth = (storm, now = new Date()) => {
  if (!storm || !storm.active) return 0;

  const start = new Date(storm.start_time).getTime();
  const end = new Date(storm.end_time).getTime();
  const current = now.getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) return 0;

  // Clamp "now" into [start, end] so growth never goes negative and
  // never exceeds the storm's total possible duration.
  const clampedNow = Math.min(Math.max(current, start), end);
  const elapsedSeconds = Math.max(0, (clampedNow - start) / 1000);

  const growthPerSecond = Number(storm.growth_per_second) || 0;

  return Math.floor(elapsedSeconds * growthPerSecond);
};

/**
 * Seconds remaining until a storm ends. Returns 0 once the storm is over
 * (never negative), and the full duration if the storm hasn't started yet.
 *
 * @param {{ end_time: string }} storm
 * @param {Date} [now]  Optional override (mainly for testing).
 * @returns {number} Seconds left in the storm.
 */
export const getStormTimeLeft = (storm, now = new Date()) => {
  if (!storm) return 0;

  const end = new Date(storm.end_time).getTime();
  const current = now.getTime();

  if (Number.isNaN(end)) return 0;

  return Math.max(0, Math.floor((end - current) / 1000));
};
