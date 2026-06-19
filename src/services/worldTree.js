import { supabase } from "./supabase";
import {
  getActiveStorm,
  calculateStormGrowth,
} from "./stormService";

// ==================== WORLD TREE (extended with Memory Storm) ====================
//
// getWorldTree() now also reports any currently active Memory Storm and
// its derived bonus growth, in ADDITION to the original fields. Nothing
// about the original community growth logic changes:
//
//   - `growth`            -> UNCHANGED, the raw DB value (community growth only)
//   - `community_growth`  -> NEW, same value as `growth`, named explicitly
//   - `storm_growth`       -> NEW, computed on the fly, never written to the DB
//   - `total_growth`       -> NEW, community_growth + storm_growth
//   - `active_storm`       -> NEW, the active storm row, or null
//
// Existing callers that only read `data.growth` keep working exactly as
// before. Callers that want the live, storm-boosted total should read
// `data.total_growth` instead.
export async function getWorldTree() {
  const response = await supabase
    .from("world_tree")
    .select("*")
    .single();

  if (response.error || !response.data) {
    return response;
  }

  const { data: storm } = await getActiveStorm();
  const stormGrowth = storm ? calculateStormGrowth(storm) : 0;
  const communityGrowth = response.data.growth;

  return {
    ...response,
    data: {
      ...response.data,
      community_growth: communityGrowth,
      storm_growth: stormGrowth,
      total_growth: communityGrowth + stormGrowth,
      active_storm: storm || null,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Everything below is UNCHANGED from the original file. Memory Storm growth
// is never written here — addTreeGrowth() continues to only persist
// community growth from real user actions, exactly as before.
// ──────────────────────────────────────────────────────────────────────────

export async function addTreeGrowth(
  userId,
  amount,
  reason
) {
  const { data: tree } = await supabase
    .from("world_tree")
    .select("*")
    .single();

  const newGrowth =
    tree.growth + amount;

  await supabase
    .from("world_tree")
    .update({
      growth: newGrowth,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tree.id);

  await supabase
    .from("world_tree_contributions")
    .insert({
      user_id: userId,
      amount,
      reason,
    });
}
