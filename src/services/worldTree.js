import { supabase } from "./supabase";

export async function getWorldTree() {
  return await supabase
    .from("world_tree")
    .select("*")
    .eq("id", 1)
    .single();
}
export async function addTreeGrowth(
  userId,
  amount,
  reason
) {
  const { data: tree } = await supabase
    .from("world_tree")
    .select("*")
    .eq("id", 1)
    .single();

  const newGrowth =
    tree.growth + amount;

  await supabase
    .from("world_tree")
    .update({
      growth: newGrowth,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  await supabase
    .from("world_tree_contributions")
    .insert({
      user_id: userId,
      amount,
      reason,
    });
}