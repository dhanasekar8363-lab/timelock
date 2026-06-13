/**
 * useNotifications — shared hook
 *
 * Returns { unreadCount, userId } and keeps the count in sync via
 * Supabase Realtime.  Import this anywhere you need the badge count
 * (e.g. BottomNav, Home header) instead of duplicating the channel logic.
 *
 * Usage:
 *   import { useNotifications } from "../hooks/useNotifications";
 *   const { unreadCount } = useNotifications();
 */

import { useEffect, useState } from "react";
import { supabase, getUnreadNotificationCount } from "../services/supabase";

export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [userId,      setUserId]      = useState(null);

  useEffect(() => {
    let channel = null;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) return;

      const uid = data.user.id;
      setUserId(uid);

      // Initial count
      const { count } = await getUnreadNotificationCount(uid);
      setUnreadCount(count);

      // Realtime subscription
      channel = supabase
        .channel(`notif-hook-${uid}`)
        // New notification → increment
        .on(
          "postgres_changes",
          {
            event:  "INSERT",
            schema: "public",
            table:  "notifications",
            filter: `user_id=eq.${uid}`,
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
            filter: `user_id=eq.${uid}`,
          },
          async () => {
            const { count: fresh } = await getUnreadNotificationCount(uid);
            setUnreadCount(fresh);
          }
        )
        .subscribe();
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return { unreadCount, userId };
}
