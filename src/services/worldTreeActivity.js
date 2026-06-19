import { supabase } from "./supabase";

// ==================== WORLD TREE ACTIVITY LOG ====================
//
// Reusable logging helpers for the `world_tree_activity` table.
// These are PURELY additive — they do not touch growth totals, the
// `world_tree` row, or `world_tree_contributions`. Call them alongside
// (after) your existing growth logic, e.g. alongside addTreeGrowth(),
// not instead of it.
//
// Table shape expected (already exists in Supabase):
//   user_id        uuid
//   username       text
//   activity_type  text   -- one of the ACTIVITY_TYPES below
//   growth_amount  numeric|null
//   message        text
//   created_at     timestamptz
//
// All helpers return { data, error } and never throw — callers can
// fire-and-forget these without wrapping every call site in try/catch.

export const ACTIVITY_TYPES = {
  CAPSULE_SENT: "capsule_sent",
  CAPSULE_OPENED: "capsule_opened",
  TREE_FED: "tree_fed",
  STORM_GROWTH: "storm_growth",
  BADGE_CLAIMED: "badge_claimed",
};

/**
 * Internal helper — inserts a single row into world_tree_activity.
 * Not exported; all public logging functions below funnel through this
 * so the insert shape and error handling stay consistent in one place.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.username
 * @param {string} params.activityType  one of ACTIVITY_TYPES values
 * @param {number|null} params.growthAmount
 * @param {string} params.message
 * @returns {{ data: object|null, error: object|null }}
 */
const logActivity = async ({ userId, username, activityType, growthAmount = null, message }) => {
  try {
    if (!activityType) throw new Error("logActivity: activityType is required");
    if (!message) throw new Error("logActivity: message is required");

    const { data, error } = await supabase
      .from("world_tree_activity")
      .insert({
        user_id: userId ?? null,
        username: username ?? null,
        activity_type: activityType,
        growth_amount: growthAmount,
        message,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error(
        "WORLD_TREE_ACTIVITY INSERT FAILED",
        error
      );
      throw error;
    }

    console.log(
      "WORLD_TREE_ACTIVITY INSERT SUCCESS",
      data
    );
    return { data, error: null };
  } catch (error) {
    console.error(`[logActivity:${activityType}]`, error);
    return { data: null, error };
  }
};

/**
 * Log that a user sent a capsule.
 *
 * @param {string} userId
 * @param {string} username
 * @param {number} growthAmount  e.g. 150
 * @example logCapsuleSent(user.id, "DhanaSekar", 150)
 *          -> "DhanaSekar sent a capsule (+150 Growth)"
 */
export const logCapsuleSent = async (userId, username, growthAmount) => {
  const message = `${username} sent a capsule (+${growthAmount} Growth)`;
  return logActivity({
    userId,
    username,
    activityType: ACTIVITY_TYPES.CAPSULE_SENT,
    growthAmount,
    message,
  });
};

/**
 * Log that a user opened a memory capsule.
 *
 * @param {string} userId
 * @param {string} username
 * @param {number} growthAmount  e.g. 200
 * @example logCapsuleOpened(user.id, "Arjun", 200)
 *          -> "Arjun opened a memory (+200 Growth)"
 */
export const logCapsuleOpened = async (userId, username, growthAmount) => {
  const message = `${username} opened a memory (+${growthAmount} Growth)`;
  return logActivity({
    userId,
    username,
    activityType: ACTIVITY_TYPES.CAPSULE_OPENED,
    growthAmount,
    message,
  });
};

/**
 * Log that a user fed the World Tree.
 *
 * @param {string} userId
 * @param {string} username
 * @param {number} growthAmount  e.g. 35
 * @example logTreeFed(user.id, "Priya", 35)
 *          -> "Priya fed the World Tree (+35 Growth)"
 */
export const logTreeFed = async (userId, username, growthAmount) => {
  const message = `${username} fed the World Tree (+${growthAmount} Growth)`;
  return logActivity({
    userId,
    username,
    activityType: ACTIVITY_TYPES.TREE_FED,
    growthAmount,
    message,
  });
};

/**
 * Log a Memory Storm growth contribution.
 *
 * Note: per the activity feed copy, storm contributions are shown
 * without a username prefix (e.g. "Storm contribution (+50 Growth)").
 * userId/username are still stored on the row for attribution/auditing,
 * just not echoed into the message text.
 *
 * @param {string} userId
 * @param {string} username
 * @param {number} growthAmount  e.g. 50
 * @example logStormContribution(user.id, "DhanaSekar", 50)
 *          -> "Storm contribution (+50 Growth)"
 */
export const logStormContribution = async (userId, username, growthAmount) => {
  const message = `Storm contribution (+${growthAmount} Growth)`;
  return logActivity({
    userId,
    username,
    activityType: ACTIVITY_TYPES.STORM_GROWTH,
    growthAmount,
    message,
  });
};

/**
 * Log that a user claimed a World Tree badge.
 *
 * Badge claims have no growth_amount (badges don't grant growth), so
 * growth_amount is stored as null.
 *
 * @param {string} userId
 * @param {string} username
 * @param {string} badgeName  e.g. "Seed Pioneer"
 * @example logBadgeClaimed(user.id, "DhanaSekar", "Seed Pioneer")
 *          -> "DhanaSekar claimed Seed Pioneer"
 */
export const logBadgeClaimed = async (userId, username, badgeName) => {
  const message = `${username} claimed ${badgeName}`;
  return logActivity({
    userId,
    username,
    activityType: ACTIVITY_TYPES.BADGE_CLAIMED,
    growthAmount: null,
    message,
  });
};
