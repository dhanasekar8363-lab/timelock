/**
 * useNotifications — shared hook
 *
 * Returns { unreadCount, userId } and keeps the count in sync via
 * Supabase Realtime. Import this anywhere you need the badge count
 * (e.g. BottomNav, Home header) instead of duplicating the channel logic.
 *
 * Auth state comes from AuthContext (single source of truth) — the
 * realtime subscription is torn down and rebuilt whenever the logged-in
 * user changes, so it can never leak one user's notifications into
 * another user's session.
 *
 * Usage:
 *   import { useNotifications } from "../hooks/useNotifications";
 *   const { unreadCount } = useNotifications();
 */

import { useEffect, useState } from "react";
import { supabase, getUnreadNotificationCount } from "../services/supabase";
import { useAuth } from "../context/AuthContext"; // adjust path to match your project structure

export function useNotifications() {
  const { user, loading: authLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const userId = user?.id ?? null;

  useEffect(() => {
    // Auth hasn't resolved yet — don't treat "unknown" as "logged out".
    if (authLoading) return;

    if (!userId) {
      // No active session (e.g. just logged out) — clear any
      // previous user's count instead of leaving stale data on screen.
      setUnreadCount(0);
      return;
    }

    let cancelled = false;
    let channel = null;

    const init = async () => {
      // Initial count
      const { count } = await getUnreadNotificationCount(userId);
      if (cancelled) return;
      setUnreadCount(count);

      // Realtime subscription
      channel = supabase
        .channel(`notif-hook-${userId}`)
        // New notification → increment
        .on(
          "postgres_changes",
          {
            event:  "INSERT",
            schema: "public",
            table:  "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => setUnreadCount((prev) => prev + 1)
        )
        // Notification updated (mark-read) → recount from DB for accuracy
        .on(
          "postgres_changes",
          {
            event:  "UPDATE",
            schema: "public",
            table:  "notifications",
            filter: `user_id=eq.${userId}`,
          },
          async () => {
            const { count: fresh } = await getUnreadNotificationCount(userId);
            if (!cancelled) setUnreadCount(fresh);
          }
        )
        .subscribe();
    };

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, authLoading]);

  return { unreadCount, userId };
}