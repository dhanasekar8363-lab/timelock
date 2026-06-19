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
//     finalized         boolean NOT NULL DEFAULT false,
//     created_at        timestamptz NOT NULL DEFAULT now()
//   );
//
//   -- Migration for existing tables:
//   -- ALTER TABLE public.memory_storms
//   --   ADD COLUMN IF NOT EXISTS finalized boolean NOT NULL DEFAULT false;
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
//
// `finalized` is set to true by finalizeStormGrowth() after the storm's
// total growth has been permanently committed to the world_tree table.
// This prevents double-finalization on subsequent poll ticks.

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
 * Fetch the most recent storm that has already started but has NOT yet
 * been finalized. Used exclusively by finalizeStormGrowth() so it can
 * still find a storm in the window between end_time passing and the
 * finalize call running — a window where getActiveStorm() returns null
 * because end_time < now.
 *
 * Filters:
 *   - active    === true   (admin-cancelled storms are skipped)
 *   - finalized === false  (already-committed storms are skipped)
 *   - start_time <= now    (scheduled-future storms are skipped)
 *   - NO filter on end_time — intentionally catches expired storms
 *
 * Requires the `finalized` boolean column on memory_storms (default false).
 *
 * @returns {{ data: object|null, error: object|null }}
 */
export const getLatestUnfinalizedStorm = async () => {
  try {
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("memory_storms")
      .select("*")
      .eq("active", true)
      .eq("finalized", false)
      .lte("start_time", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return { data: data || null, error: null };
  } catch (error) {
    console.error("[getLatestUnfinalizedStorm]", error);
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

/**
 * Permanently commit a just-ended storm's growth into world_tree.growth.
 *
 * Called by WorldTree.jsx on every loadData() run. Safe to call repeatedly:
 *   - getLatestUnfinalizedStorm() skips already-finalized storms (finalized=true)
 *   - The `finalized` flag is set atomically after writing, so a second
 *     call in the same session finds nothing to process and exits immediately.
 *
 * Flow:
 *   1. Fetch the latest storm where active=true AND finalized=false
 *   2. If none found, or storm hasn't ended yet → exit (success: false)
 *   3. Calculate total storm growth from elapsed time
 *   4. Add that growth to world_tree.growth in Supabase
 *   5. Mark the storm: active=false, finalized=true → never processed again
 *
 * Storm growth is added to community growth exactly ONCE per storm lifetime.
 * User-action growth (addTreeGrowth in worldTree.js) is never touched here.
 *
 * @returns {{ success: boolean, addedGrowth?: number, error?: object }}
 */
export const finalizeStormGrowth = async () => {
  console.log("FINALIZE STORM CALLED");
  try {
    // Use getLatestUnfinalizedStorm instead of getActiveStorm.
    //
    // getActiveStorm() filters end_time >= now, so it returns null the
    // instant a storm expires — exactly when this function needs to run.
    // getLatestUnfinalizedStorm() intentionally omits the end_time filter
    // so it catches storms in the just-expired window, while the
    // finalized=false guard prevents double-committing on repeat calls.
    const { data: storm } = await getLatestUnfinalizedStorm();

    console.log("Storm found:", storm);
    console.log("Now:", new Date());
    if (storm) console.log("End:", new Date(storm.end_time));

    // No unfinalized storm found
    if (!storm) return { success: false };

    const endTime = new Date(storm.end_time).getTime();

    // Only finalize after storm has actually ended
    if (Date.now() < endTime) {
      return { success: false };
    }

    // Already finalized (double-call safety, belt-and-suspenders)
    if (storm.finalized) {
      return { success: false };
    }

    const finalGrowth = calculateStormGrowth(storm);

    // Get current tree
    const { data: tree } = await supabase
      .from("world_tree")
      .select("*")
      .eq("id", 1)
      .single();

    const newGrowth = tree.growth + finalGrowth;

    // Commit storm growth permanently to community total
    await supabase
      .from("world_tree")
      .update({
        growth: newGrowth,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    // Mark storm as inactive and finalized so it's never picked up again
    await supabase
      .from("memory_storms")
      .update({
        active: false,
        finalized: true,
      })
      .eq("id", storm.id);

    return {
      success: true,
      addedGrowth: finalGrowth,
    };
  } catch (error) {
    console.error("[finalizeStormGrowth]", error);
    return {
      success: false,
      error,
    };
  }
};
