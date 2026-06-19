import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'

const supabaseUrl = 'https://yaezgmlmjkmqvifonhty.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhZXpnbWxtamttcXZpZm9uaHR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTE0ODAsImV4cCI6MjA5NjY2NzQ4MH0.zmojrG4HT3l24RX65YzEVvg5Vut6obIVcohml80lid4'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: !Capacitor.isNativePlatform(),
    persistSession: true,
    autoRefreshToken: true,
  },
})

// ==================== CAPSULE IDENTITY MODEL ====================
//
// The `capsules` table uses the following columns to track ownership
// and recipients. This is the single source of truth — keep all
// capsule-related code consistent with this model:
//
//   sender_id      uuid  — auth user who CREATED the capsule (owner).
//   sender_name    text  — display name of the sender, free text,
//                           shown as "From:" on the capsule.
//   receiver_id    uuid  — auth user id of the recipient, IF the
//                           recipient is a registered TimeLock user.
//                           Used to show the capsule in their
//                           "Received" tab. May be null for capsules
//                           sent to people without an account.
//   receiver_name  text  — human-readable name of the recipient,
//                           shown as "To:" on the capsule. Free text,
//                           NEVER a UUID.
//   receiver_email text  — the recipient's actual email address, if
//                           known. NEVER a UUID and NEVER a display
//                           name — leave it null if no real email is
//                           available.
//
// NOTE: if `receiver_name` does not exist yet on your `capsules`
// table, run this once in the Supabase SQL editor:
//
//   ALTER TABLE public.capsules ADD COLUMN IF NOT EXISTS receiver_name text;
//
// Also make sure your RLS SELECT policy on `capsules` allows a user
// to read capsules where they are EITHER the sender or the receiver,
// e.g.:
//
//   (auth.uid() = sender_id) OR (auth.uid() = receiver_id)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isUUID = (value) =>
  typeof value === 'string' && UUID_RE.test(value.trim())

export const isEmail = (value) =>
  typeof value === 'string' && EMAIL_RE.test(value.trim())

/**
 * Returns a human-friendly recipient name for display — NEVER a UUID.
 *
 * Priority:
 *   1. receiver_name  (if present and not a UUID)
 *   2. receiver_email (only if it is a real email — shown as-is)
 *   3. fallback string
 *
 * We deliberately do NOT fall back to capsule title or any field that
 * could leak a UUID into the UI.
 */
export const getRecipientDisplayName = (capsule, fallback = 'Someone special') => {
  if (!capsule) return fallback

  if (capsule.receiver_name && !isUUID(capsule.receiver_name)) {
    return capsule.receiver_name
  }

  if (capsule.receiver_email && isEmail(capsule.receiver_email)) {
    return capsule.receiver_email
  }

  return fallback
}

// Returns the recipient's email ONLY if it's a real email address.
export const getRecipientEmail = (capsule) => {
  if (!capsule) return ''
  if (capsule.receiver_email && isEmail(capsule.receiver_email)) {
    return capsule.receiver_email
  }
  return ''
}

// ==================== PROFILE SEARCH FUNCTIONS ====================
//
// ROOT CAUSE NOTE (recipient search returning no results):
// `searchProfiles` below is used by CreateCapsule's "Who is this for?"
// recipient search. If this query returns an empty array for every query
// (even though the input updates fine and no JS error is thrown), the
// most likely cause is the RLS SELECT policy on `profiles`.
//
// A common default policy is:
//
//   USING (auth.uid() = id)   -- "users can only read their own profile row"
//
// Under that policy, searching for ANY OTHER user's profile returns an
// empty array — Postgres/PostgREST does not raise an error for rows that
// RLS filters out, it just silently omits them. The query "succeeds" with
// `data = []`, which is indistinguishable from "no matches" unless you
// already know to suspect RLS.
//
// FIX: add (or replace with) a policy that allows any authenticated user
// to read the public-facing columns of other profiles, e.g.:
//
//   CREATE POLICY "Profiles are viewable by authenticated users"
//   ON public.profiles
//   FOR SELECT
//   TO authenticated
//   USING (true);
//
// If you'd rather not expose every column to everyone, restrict via a
// view or `security_invoker` policy that only exposes
// (id, username, display_name, avatar_url, email) — the columns
// `searchProfiles` actually selects.

/**
 * Search profiles by username or display name (case-insensitive, partial
 * match). Used by the "Who is this for?" recipient picker in CreateCapsule.
 *
 * Matches BOTH `username` and `display_name` — the search box is labelled
 * "Search by username…", but many profiles only have `display_name`
 * populated, so matching on `display_name` alone misses real users.
 *
 * @param {string} query             Search text typed by the user.
 * @param {string|null} [excludeUserId] Caller's own id, so they don't show
 *                                       up as a result when searching.
 * @param {number} [limit=8]
 * @returns {{ data: Array, error: object|null }}
 *          `error` is null both when the query succeeds with zero rows AND
 *          when RLS filters everything out — see note above. A non-null
 *          `error` means the request itself failed (bad column, network,
 *          auth, etc.) and is logged to the console for debugging.
 */
export const searchProfiles = async (query, excludeUserId = null, limit = 8) => {
  try {
    const trimmed = (query || '').trim()
    if (!trimmed) return { data: [], error: null }

    // `,` and `()` are structural characters in PostgREST's `or=()` filter
    // syntax. Strip them from the search term so a username/display name
    // containing them can't break the filter (these characters are not
    // expected in usernames or display names anyway).
    const safe = trimmed.replace(/[,()]/g, '')
    if (!safe) return { data: [], error: null }

    let q = supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .limit(limit)

    if (excludeUserId) {
      q = q.neq('id', excludeUserId)
    }

    const { data, error } = await q
    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
    console.error('[searchProfiles]', error)
    return { data: [], error }
  }
}

// ==================== FOLLOW FUNCTIONS ====================

export const followUser = async (followerId, followingId) => {
  try {
    const { data, error } = await supabase
      .from('follows')
      .insert([{ follower_id: followerId, following_id: followingId, created_at: new Date().toISOString() }])
      .select()
    if (error) throw error
    createNotification(followingId, 'New Follower', 'Someone started following you')
    return { data, error: null }
  } catch (error) {
    console.error('Error following user:', error)
    return { data: null, error }
  }
}

export const unfollowUser = async (followerId, followingId) => {
  try {
    const { error } = await supabase.from('follows').delete()
      .eq('follower_id', followerId).eq('following_id', followingId)
    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Error unfollowing user:', error)
    return { error }
  }
}

export const checkIfFollowing = async (followerId, followingId) => {
  try {
    const { data, error } = await supabase.from('follows').select('id')
      .eq('follower_id', followerId).eq('following_id', followingId).single()
    if (error && error.code !== 'PGRST116') throw error
    return { isFollowing: !!data, error: null }
  } catch (error) {
    console.error('Error checking follow status:', error)
    return { isFollowing: false, error }
  }
}

export const getFollowers = async (userId) => {
  try {
    const { data: follows, error } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!follows || follows.length === 0) return { data: [], error: null }

    const ids = follows.map(f => f.follower_id)

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio')
      .in('id', ids)

    if (profileError) throw profileError

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
    const ordered = ids.map(id => profileMap[id]).filter(Boolean)

    return { data: ordered, error: null }
  } catch (error) {
    console.error('getFollowers error:', error)
    return { data: [], error }
  }
}

export const getFollowing = async (userId) => {
  try {
    const { data: follows, error } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!follows || follows.length === 0) return { data: [], error: null }

    const ids = follows.map(f => f.following_id)

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio')
      .in('id', ids)

    if (profileError) throw profileError

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))
    const ordered = ids.map(id => profileMap[id]).filter(Boolean)

    return { data: ordered, error: null }
  } catch (error) {
    console.error('getFollowing error:', error)
    return { data: [], error }
  }
}

export const getFollowCounts = async (userId) => {
  try {
    const { count: followers, error: e1 } = await supabase.from('follows')
      .select('*', { count: 'exact', head: true }).eq('following_id', userId)
    const { count: following, error: e2 } = await supabase.from('follows')
      .select('*', { count: 'exact', head: true }).eq('follower_id', userId)
    if (e1) throw e1
    if (e2) throw e2
    return { followers: followers || 0, following: following || 0, error: null }
  } catch (error) {
    console.error('getFollowCounts error:', error)
    return { followers: 0, following: 0, error }
  }
}

/**
 * Returns a Set of user IDs that `followerId` is currently following,
 * filtered to only the IDs in `candidateIds`.
 * Used to batch-check follow status for a list of users in one query.
 */
export const getFollowingIds = async (followerId, candidateIds) => {
  try {
    if (!candidateIds || candidateIds.length === 0) return { data: new Set(), error: null }
    const { data, error } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', followerId)
      .in('following_id', candidateIds)
    if (error) throw error
    const ids = new Set((data || []).map(f => f.following_id))
    return { data: ids, error: null }
  } catch (error) {
    console.error('getFollowingIds error:', error)
    return { data: new Set(), error }
  }
}

// ==================== MESSAGE FUNCTIONS ====================

/**
 * Helper to parse capsule JSON from message content
 */
function tryParseCapsule(content) {
  if (!content) return null
  try {
    const obj = JSON.parse(content)
    if (obj?.type === 'capsule') return obj
  } catch {}
  return null
}

/**
 * Get a friendly preview text for a message (handles capsules)
 */
function getMessagePreview(content) {
  if (!content) return ''
  const capsule = tryParseCapsule(content)
  if (capsule) return `💌 ${capsule.title || 'Time Capsule'}`
  return content
}

/**
 * Get conversations for a user.
 * Returns array of { user_id, user, last_message, last_message_at, unread }
 * grouped and ordered by most recent message.
 */
export const getConversations = async (userId) => {
  try {
    // Step 1: Get all messages involving this user, ordered by recency
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, content, created_at, read_at')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!messages || messages.length === 0) return { data: [], error: null }

    // Step 2: Extract unique conversation partners
    const otherIds = new Set()
    messages.forEach(msg => {
      const otherId = msg.sender_id === userId ? msg.recipient_id : msg.sender_id
      if (otherId) otherIds.add(otherId)
    })

    // Step 3: Fetch profiles in bulk
    let profilesById = {}
    if (otherIds.size > 0) {
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', Array.from(otherIds))

      if (profErr) {
        console.error('Error fetching profiles for conversations:', profErr)
      } else if (profiles) {
        profilesById = Object.fromEntries(profiles.map(p => [p.id, p]))
      }
    }

    // Step 4: Build conversation map, grouping by partner
    const convMap = new Map()
    messages.forEach(msg => {
      const otherId = msg.sender_id === userId ? msg.recipient_id : msg.sender_id
      if (!otherId) return

      // Only process if we haven't seen this conversation yet
      if (!convMap.has(otherId)) {
        const otherUser = profilesById[otherId] || { id: otherId, display_name: 'User', avatar_url: null }
        convMap.set(otherId, {
          user_id: otherId,
          user: otherUser,
          last_message: getMessagePreview(msg.content),
          last_message_at: msg.created_at,
          unread: !msg.read_at && msg.recipient_id === userId,
        })
      }
    })

    return { data: Array.from(convMap.values()), error: null }
  } catch (error) {
    console.error('Error getting conversations:', error)
    return { data: [], error }
  }
}

/**
 * Get all messages between two users, ordered by date
 */
export const getMessages = async (userId, otherUserId) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`)
      .order('created_at', { ascending: true })

    if (error) throw error

    // Mark received messages as read
    if (data && data.length > 0) {
      const unread = data.filter(m => m.recipient_id === userId && !m.read_at)
      if (unread.length > 0) {
        const readAt = new Date().toISOString()
        const { error: updateError } = await supabase
          .from('messages')
          .update({ read_at: readAt })
          .in('id', unread.map(m => m.id))
        if (updateError) {
          console.error('Error marking messages as read:', updateError)
        }
      }
    }

    return { data: data || [], error: null }
  } catch (error) {
    console.error('Error getting messages:', error)
    return { data: [], error }
  }
}

/**
 * Send a message from one user to another.
 *
 * @param {string} senderId
 * @param {string} recipientId
 * @param {string} content        Human-readable text (always required).
 *                                Shown in notifications and conversation previews.
 * @param {'text'|'capsule'} [messageType='text']
 *                                Pass 'capsule' when the message carries a time-capsule
 *                                payload so the chat UI renders a rich capsule card
 *                                instead of plain text.
 * @param {object|null} [metadata=null]
 *                                Structured data merged into the JSON payload when
 *                                messageType === 'capsule'.  Expected shape:
 *                                { id, title, slug, cover_type, unlock_date }
 *
 * Storage contract
 * ─────────────────
 * • messageType === 'text'    → content column = the plain text string.
 * • messageType === 'capsule' → content column = JSON string:
 *     { type: 'capsule', text: '<human text>', id, title, slug, cover_type, unlock_date }
 *   The existing `tryParseCapsule()` helper already knows how to read this shape.
 */
export const sendMessage = async (
  senderId,
  recipientId,
  content,
  messageType = 'text',
  metadata = null,
) => {
  try {
    if (!senderId || !recipientId) {
      throw new Error('senderId and recipientId are required')
    }
    if (!content || !content.trim()) {
      throw new Error('Message content cannot be empty')
    }

    // For capsule messages store a JSON envelope so the chat UI can render a
    // rich capsule card.  Plain-text messages are stored as-is.
    const storedContent =
      messageType === 'capsule' && metadata
        ? JSON.stringify({ type: 'capsule', text: content.trim(), ...metadata })
        : content.trim()

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        sender_id:    senderId,
        recipient_id: recipientId,
        content:      storedContent,
        created_at:   new Date().toISOString(),
        read_at:      null,
      }])
      .select()

    if (error) throw error
    if (!data || !data[0]) throw new Error('No data returned from insert')

    // Notify recipient (fire-and-forget)
    createNotification(recipientId, 'New Message', 'You have a new message')

    return { data: data[0], error: null }
  } catch (error) {
    console.error('Error sending message:', error)
    return { data: null, error }
  }
}

export const markMessageAsRead = async (messageId) => {
  try {
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', messageId)
    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Error marking message as read:', error)
    return { error }
  }
}

// ==================== CAPSULE FUNCTIONS ====================

/**
 * Get capsules created by this user
 */
export const getMyCapsules = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('capsules')
      .select('id, title, slug, cover_type, unlock_date, created_at, sender_id, receiver_id, receiver_name')
      .eq('sender_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
    console.error('Error getting capsules:', error)
    return { data: [], error }
  }
}

/**
 * Get capsules shared with this user (as recipient)
 */
export const getReceivedCapsules = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('capsules')
      .select('*')
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
    console.error('Error getting received capsules:', error)
    return { data: [], error }
  }
}

// ==================== CAPSULE SHARING FUNCTIONS ====================

export const shareCapsule = async (capsuleId, senderId, recipientId, message = '') => {
  try {
    const { data, error } = await supabase
      .from('capsule_shares')
      .insert([{
        capsule_id: capsuleId,
        sender_id: senderId,
        recipient_id: recipientId,
        message,
        created_at: new Date().toISOString(),
      }])
      .select()
    if (error) throw error
    createNotification(recipientId, 'Capsule Shared', 'A time capsule has been shared with you')
    return { data: data?.[0], error: null }
  } catch (error) {
    console.error('Error sharing capsule:', error)
    return { data: null, error }
  }
}

export const getSharedCapsules = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('capsule_shares')
      .select('*, capsule:capsule_id(*), sender:sender_id(id, display_name, avatar_url)')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
    console.error('Error getting shared capsules:', error)
    return { data: [], error }
  }
}

// ==================== NOTIFICATION FUNCTIONS ====================

export const getNotifications = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
    console.error('Error getting notifications:', error)
    return { data: [], error }
  }
}

export const getUnreadNotificationCount = async (userId) => {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    if (error) throw error
    return { count: count || 0, error: null }
  } catch (error) {
    console.error('Error getting unread notification count:', error)
    return { count: 0, error }
  }
}

export const markNotificationsRead = async (userId) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)
    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Error marking notifications as read:', error)
    return { error }
  }
}

export const createNotification = async (userId, title, message) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        title,
        message,
        is_read: false,
        created_at: new Date().toISOString(),
      }])
      .select()
    if (error) throw error
    return { data: data?.[0], error: null }
  } catch (error) {
    console.error('Error creating notification:', error)
    return { data: null, error }
  }
}

// ==================== WORLD TREE FUNCTIONS ====================
//
// Backend overview
// ─────────────────
// • `world_tree`            — single shared row holding total growth.
// • `tree_contributions`    — per-user ledger of every growth-earning
//                              action (action_type + amount).
// • `tree_feed_cooldowns`   — one row per user, last "Feed Tree" timestamp.
//
// The 3-hour Feed Tree cooldown is enforced INSIDE the `feed_world_tree`
// Postgres function (SECURITY DEFINER), not just in this client code. That
// means even if the UI's local cooldown timer is stale (or someone calls
// the RPC directly), the database is still the source of truth and a
// second feed within the window will be rejected. Run
// `sql/world_tree_schema.sql` once in the Supabase SQL editor to create
// these tables + functions before using anything below.

/** Growth points awarded per action — mirrors the SQL functions. */
export const GROWTH_REWARDS = Object.freeze({
  FEED_TREE:      35,
  CREATE_CAPSULE: 100,
  SEND_CAPSULE:   150,
  OPEN_CAPSULE:   200,
})

/** Feed Tree cooldown window, mirrors the 3-hour interval in SQL. */
export const FEED_COOLDOWN_MS = 3 * 60 * 60 * 1000

/**
 * Format a duration in seconds as a short "Xh Ym" string for display.
 * Examples: 8100 -> "2h 15m", 600 -> "10m", 0 -> "0m".
 */
export const formatCooldown = (totalSeconds) => {
  const seconds = Math.max(0, Math.ceil(totalSeconds || 0))
  const totalMinutes = Math.ceil(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}

/**
 * Fetch the single shared World Tree row.
 * Returns { data: { id, growth, created_at, updated_at } | null, error }
 */
export const getWorldTree = async () => {
  try {
    const { data, error } = await supabase
      .from('world_tree')
      .select('*')
      .limit(1)
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('[getWorldTree]', error)
    return { data: null, error }
  }
}

/**
 * Look up a user's current Feed Tree cooldown state WITHOUT attempting to
 * feed. Use this to render "Next feed in Xh Ym" on page load.
 *
 * @param {string} userId
 * @returns {{ data: { lastFedAt: string|null, nextFeedAt: string|null,
 *                      secondsRemaining: number, canFeed: boolean } | null,
 *             error }}
 */
export const getFeedCooldown = async (userId) => {
  try {
    if (!userId) throw new Error('userId is required')

    const { data, error } = await supabase
      .rpc('get_feed_cooldown', { p_user_id: userId })

    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data

    if (!row) {
      return { data: { lastFedAt: null, nextFeedAt: null, secondsRemaining: 0, canFeed: true }, error: null }
    }

    return {
      data: {
        lastFedAt:        row.last_fed_at,
        nextFeedAt:       row.next_feed_at,
        secondsRemaining: row.seconds_remaining ?? 0,
        canFeed:          !!row.can_feed,
      },
      error: null,
    }
  } catch (error) {
    console.error('[getFeedCooldown]', error)
    return { data: null, error }
  }
}

/**
 * Convenience wrapper around getFeedCooldown() that also returns a
 * ready-to-render "Xh Ym" string for the remaining cooldown.
 *
 * @param {string} userId
 * @returns {{ data: { canFeed: boolean, secondsRemaining: number,
 *                      formatted: string|null, nextFeedAt: string|null } | null,
 *             error }}
 */
export const getRemainingFeedTime = async (userId) => {
  const { data, error } = await getFeedCooldown(userId)

  if (error || !data) {
    return { data: { canFeed: false, secondsRemaining: 0, formatted: null, nextFeedAt: null }, error }
  }

  if (data.canFeed) {
    return { data: { canFeed: true, secondsRemaining: 0, formatted: null, nextFeedAt: data.nextFeedAt }, error: null }
  }

  return {
    data: {
      canFeed:          false,
      secondsRemaining: data.secondsRemaining,
      formatted:        formatCooldown(data.secondsRemaining),
      nextFeedAt:       data.nextFeedAt,
    },
    error: null,
  }
}

/**
 * Feed the World Tree: +35 growth, once every 3 hours per user.
 *
 * The cooldown check happens atomically inside the `feed_world_tree`
 * Postgres function, so this is safe to call even without checking
 * getFeedCooldown() first — but the UI should still check first so it can
 * show a countdown instead of letting the user click a doomed button.
 *
 * @param {string} userId  The authenticated user's id
 * @returns {{
 *   data: { fed: boolean, growth: number, nextFeedAt: string, secondsRemaining: number } | null,
 *   error: object | null,
 *   cooldownActive: boolean   // true if the feed was rejected due to cooldown
 * }}
 */
export const feedWorldTree = async (userId) => {
  try {
    if (!userId) throw new Error('userId is required to feed the tree')

    const { data, error } = await supabase
      .rpc('feed_world_tree', { p_user_id: userId })

    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('No data returned from feed_world_tree')

    return {
      data: {
        fed:              !!row.fed,
        growth:           row.growth,
        nextFeedAt:       row.next_feed_at,
        secondsRemaining: row.seconds_remaining ?? 0,
      },
      error: null,
      cooldownActive: !row.fed,
    }
  } catch (error) {
    console.error('[feedWorldTree]', error)
    return { data: null, error, cooldownActive: false }
  }
}

/**
 * Check whether a user has already received a specific growth reward for a
 * given capsule, preventing duplicate payouts.
 *
 * Queries `tree_contributions` for a row matching (user_id, action_type,
 * reference_id).  The `reference_id` column must exist on that table — run
 * the migration below once in the Supabase SQL editor if it doesn't yet:
 *
 *   ALTER TABLE public.tree_contributions
 *     ADD COLUMN IF NOT EXISTS action_type   text,
 *     ADD COLUMN IF NOT EXISTS reference_id  text;
 *   CREATE UNIQUE INDEX IF NOT EXISTS tree_contributions_dedup
 *     ON public.tree_contributions (user_id, action_type, reference_id)
 *     WHERE reference_id IS NOT NULL;
 *
 * @param {string} userId
 * @param {string} actionType  e.g. 'create_capsule'
 * @param {string} referenceId  The capsule's UUID or slug
 * @returns {boolean}  true → already awarded (skip); false → safe to award
 */
const _hasBeenAwarded = async (userId, actionType, referenceId) => {
  try {
    const { data, error } = await supabase
      .from('tree_contributions')
      .select('id')
      .eq('user_id', userId)
      .eq('action_type', actionType)
      .eq('reference_id', referenceId)
      .maybeSingle()

    if (error) {
      // If the column doesn't exist yet, fail open so the award still fires.
      console.warn('[_hasBeenAwarded] query failed — failing open:', error.message)
      return false
    }
    return !!data   // null → not awarded yet; row → already awarded
  } catch (err) {
    console.warn('[_hasBeenAwarded] unexpected error — failing open:', err)
    return false
  }
}

/**
 * Generic, cooldown-free growth award used by the three capsule-action
 * reward triggers. Each call is dedup-guarded: a user never receives the
 * same reward more than once for the same capsule.
 *
 * Public API (call these after their respective actions succeed):
 *
 *   await awardCapsuleCreated(userId, capsuleId)  // +100, after capsule insert
 *   await awardCapsuleSent(userId, capsuleId)     // +150, after capsule is sent/shared
 *   await awardCapsuleOpened(userId, capsuleId)   // +200, after capsule unlocks
 *
 * `capsuleId` is the capsule's UUID (data[0].id from the DB insert) or slug.
 * Passing the same capsuleId twice for the same actionType is a no-op.
 *
 * The `award_tree_growth` RPC should also accept an optional `p_reference_id`
 * param so the DB can enforce the uniqueness constraint server-side.  Add it
 * to the function signature in SQL if not already present:
 *
 *   CREATE OR REPLACE FUNCTION award_tree_growth(
 *     p_user_id     uuid,
 *     p_action_type text,
 *     p_amount      int,
 *     p_reference_id text DEFAULT NULL
 *   ) ...
 *
 * @returns {{ data: { growth: number } | null, error, skipped: boolean }}
 *   `skipped` is true when the reward was already granted (duplicate guard hit).
 */
const awardTreeGrowth = async (userId, actionType, amount, referenceId = null) => {
  try {
    if (!userId) throw new Error('userId is required')

    // ── Duplicate-prevention guard ──────────────────────────────────────────
    // If we have a referenceId (capsule id/slug), check tree_contributions
    // before firing the RPC so we never double-award the same capsule event.
    if (referenceId) {
      const alreadyAwarded = await _hasBeenAwarded(userId, actionType, referenceId)
      if (alreadyAwarded) {
        console.info(`[awardTreeGrowth] skipping duplicate: ${actionType} / ${referenceId}`)
        return { data: null, error: null, skipped: true }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── 1. Write contribution row with reference_id for dedup ────────────────
    // This ensures _hasBeenAwarded() can find the row on the next page load
    // even if the RPC does not populate reference_id itself.
    if (referenceId) {
      const { error: contribError } = await supabase
        .from('tree_contributions')
        .insert({
          user_id:      userId,
          contribution: amount,
          action_type:  actionType,
          reference_id: referenceId,
        })

      // A unique-constraint violation (code 23505) means the row already exists
      // — treat it as a duplicate and bail silently.
      if (contribError) {
        if (contribError.code === '23505') {
          console.info(`[awardTreeGrowth] DB dedup hit: ${actionType} / ${referenceId}`)
          return { data: null, error: null, skipped: true }
        }
        // Log but continue — the RPC is the authoritative growth writer.
        console.warn('[awardTreeGrowth] contribution insert warning:', contribError.message)
      }
    }

    // ── 2. Call the RPC to atomically increment world_tree.growth ────────────
    const { data: newGrowth, error } = await supabase
      .rpc('award_tree_growth', {
        p_user_id:      userId,
        p_action_type:  actionType,
        p_amount:       amount,
        // Pass reference_id so the DB function can enforce dedup server-side
        // if it supports the optional param (ignored otherwise).
        ...(referenceId ? { p_reference_id: referenceId } : {}),
      })

    if (error) throw error
    return { data: { growth: newGrowth }, error: null, skipped: false }
  } catch (error) {
    console.error(`[awardTreeGrowth:${actionType}]`, error)
    return { data: null, error, skipped: false }
  }
}

/**
 * Reusable helper: record a growth contribution row AND increment the
 * world_tree.growth counter in a single atomic operation.
 *
 * Usage (call ONLY after the triggering action has succeeded):
 *
 *   await addTreeGrowth(user.id, 100, 'create_capsule')
 *
 * The function:
 *   1. Inserts a row into `tree_contributions`
 *      { user_id, contribution, action_type }
 *   2. Increments `world_tree.growth` by `growthAmount`
 *
 * Both writes are attempted; if either fails the error is logged and
 * re-thrown so the caller can decide whether to surface it.
 *
 * For dedup-guarded capsule rewards prefer the typed wrappers below
 * (awardCapsuleCreated / awardCapsuleSent / awardCapsuleOpened) which
 * also prevent double-awarding via the `award_tree_growth` RPC.
 *
 * @param {string} userId        Authenticated user's UUID.
 * @param {number} growthAmount  Points to add (e.g. 100).
 * @param {string} actionType    Label stored in tree_contributions
 *                               (e.g. 'create_capsule').
 * @returns {{ data: { growth: number } | null, error: object | null }}
 */
export const addTreeGrowth = async (userId, growthAmount, actionType) => {
  try {
    if (!userId)       throw new Error('addTreeGrowth: userId is required')
    if (!growthAmount) throw new Error('addTreeGrowth: growthAmount is required')
    if (!actionType)   throw new Error('addTreeGrowth: actionType is required')

    // ── 1. Record the contribution row ──────────────────────────────────────
    const { error: contribError } = await supabase
      .from('tree_contributions')
      .insert({
        user_id:      userId,
        contribution: growthAmount,
        action_type:  actionType,
      })

    if (contribError) throw contribError

    // ── 2. Increment world_tree.growth ───────────────────────────────────────
    // Fetch the single shared row first so we can do a safe increment.
    const { data: treeRow, error: fetchError } = await supabase
      .from('world_tree')
      .select('id, growth')
      .limit(1)
      .single()

    if (fetchError) throw fetchError

    const newGrowth = (treeRow.growth || 0) + growthAmount

    const { error: updateError } = await supabase
      .from('world_tree')
      .update({ growth: newGrowth, updated_at: new Date().toISOString() })
      .eq('id', treeRow.id)

    if (updateError) throw updateError

    return { data: { growth: newGrowth }, error: null }
  } catch (error) {
    console.error(`[addTreeGrowth:${actionType}]`, error)
    return { data: null, error }
  }
}

/**
 * Award +100 growth when a capsule is successfully created (inserted into DB).
 *
 * @param {string} userId     The authenticated creator's user id.
 * @param {string} capsuleId  The capsule's UUID (data[0].id from the insert).
 *                            Used to prevent duplicate rewards for the same capsule.
 */
export const awardCapsuleCreated = (userId, capsuleId) =>
  awardTreeGrowth(userId, 'create_capsule', GROWTH_REWARDS.CREATE_CAPSULE, capsuleId)

/**
 * Award +150 growth when a capsule is sent / shared with a recipient.
 *
 * Call this after the capsule is successfully delivered (in-app message sent,
 * WhatsApp link opened, or Instagram link copied).
 *
 * @param {string} userId     The authenticated sender's user id.
 * @param {string} capsuleId  The capsule's UUID.
 */
export const awardCapsuleSent = (userId, capsuleId) =>
  awardTreeGrowth(userId, 'send_capsule', GROWTH_REWARDS.SEND_CAPSULE, capsuleId)

/**
 * Award +200 growth when a locked capsule is opened / unlocked.
 *
 * Call this for whichever user is viewing the capsule at unlock time — either
 * because it was already past its unlock date when they arrived, or because the
 * live countdown just hit zero.
 *
 * @param {string} userId     The authenticated viewer's user id.
 * @param {string} capsuleId  The capsule's UUID or slug (used as reference_id).
 */
export const awardCapsuleOpened = (userId, capsuleId) =>
  awardTreeGrowth(userId, 'open_capsule', GROWTH_REWARDS.OPEN_CAPSULE, capsuleId)

// ==================== WORLD TREE ACTIVITY ====================

export const getWorldTreeActivity = async (limit = 50) => {
  try {
    const { data, error } = await supabase
      .from('world_tree_activity')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return {
      data: data || [],
      error: null,
    }
  } catch (error) {
    console.error('[getWorldTreeActivity]', error)
    return {
      data: [],
      error,
    }
  }
}

export const subscribeToWorldTreeActivity = (onActivity) => {
  const channel = supabase
    .channel('world-tree-activity')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'world_tree_activity',
      },
      (payload) => {
        if (payload.new) {
          onActivity(payload.new)
        }
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// ==================== WORLD TREE BADGE FUNCTIONS ====================
//
// GLOBAL FIRST-CLAIM MODEL: each badge_level can be won by exactly ONE
// user across the whole app (first to reach the milestone gets it).
// This replaces the old per-user model where every user could earn
// every badge independently.
//
// SQL to run ONCE in the Supabase SQL editor before using this code:
//
//   -- 1. Table -----------------------------------------------------------
//   CREATE TABLE IF NOT EXISTS public.world_tree_badges (
//     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
//     badge_level integer NOT NULL,
//     badge_key   text NOT NULL,
//     badge_name  text NOT NULL,
//     claimed_at  timestamptz NOT NULL DEFAULT now(),
//     UNIQUE (badge_level)   -- GLOBAL: only one winner per level, app-wide
//   );
//
//   ALTER TABLE public.world_tree_badges ENABLE ROW LEVEL SECURITY;
//
//   CREATE POLICY "Anyone can read claimed badges"
//     ON public.world_tree_badges FOR SELECT
//     TO authenticated
//     USING (true);
//
//   -- No direct INSERT policy needed for authenticated users — all
//   -- inserts go through the SECURITY DEFINER function below, which
//   -- runs with elevated privileges and enforces the one-winner rule
//   -- atomically via an advisory lock (prevents two simultaneous
//   -- requests from both thinking they won the same badge).
//
//   -- 2. Atomic claim function --------------------------------------------
//   CREATE OR REPLACE FUNCTION public.claim_world_tree_badge_atomic(
//     p_user_id     uuid,
//     p_badge_level integer,
//     p_badge_name  text,
//     p_badge_key   text
//   )
//   RETURNS jsonb
//   LANGUAGE plpgsql
//   SECURITY DEFINER
//   SET search_path = public
//   AS $$
//   DECLARE
//     v_existing public.world_tree_badges;
//   BEGIN
//     -- Serialize concurrent claims for this specific badge level.
//     PERFORM pg_advisory_xact_lock(hashtext('world_tree_badge_' || p_badge_level));
//
//     SELECT * INTO v_existing
//     FROM public.world_tree_badges
//     WHERE badge_level = p_badge_level;
//
//     IF FOUND THEN
//       RETURN jsonb_build_object(
//         'claimed', false,
//         'already_claimed_by', v_existing.user_id
//       );
//     END IF;
//
//     INSERT INTO public.world_tree_badges (user_id, badge_level, badge_name, badge_key)
//     VALUES (p_user_id, p_badge_level, p_badge_name, p_badge_key);
//
//     RETURN jsonb_build_object('claimed', true, 'already_claimed_by', NULL);
//   END;
//   $$;
//
//   -- Let authenticated users call the function (it runs as the function
//   -- owner, not the caller, so this is the only privilege they need):
//   GRANT EXECUTE ON FUNCTION public.claim_world_tree_badge_atomic
//     TO authenticated;
//
// MIGRATING FROM THE OLD PER-USER TABLE: if `world_tree_badges` already
// exists from the previous (per-user) version, you'll need to decide who
// "wins" each level among existing claimants, drop the old
// UNIQUE(user_id, badge_level) constraint, add `badge_key`, and add the
// new UNIQUE(badge_level) constraint before running the function above.

// ── Badge metadata (keep in sync with WorldTree.jsx) ──────────────────────
export const WORLD_TREE_BADGE_META = [
  { level: 5,  key: 'seed_pioneer',     name: 'Seed Pioneer'     },
  { level: 10, key: 'nature_guardian',  name: 'Nature Guardian'  },
  { level: 15, key: 'tree_keeper',      name: 'Tree Keeper'      },
  { level: 20, key: 'forest_protector', name: 'Forest Protector' },
  { level: 25, key: 'memory_guardian',  name: 'Memory Guardian'  },
]

/**
 * Fetch the current global claim status for ALL World Tree badges.
 * Returns every badge that has EVER been claimed (by any user).
 * Used to know which floating badges should be hidden for everyone.
 *
 * @returns {{ data: Array<{ id, user_id, badge_level, badge_key, badge_name, claimed_at }>, error }}
 */
export const getAllWorldTreeBadgeClaims = async () => {
  try {
    const { data, error } = await supabase
      .from('world_tree_badges')
      .select('id, user_id, badge_level, badge_key, badge_name, claimed_at')
      .order('claimed_at', { ascending: true })

    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
    console.error('[getAllWorldTreeBadgeClaims]', error)
    return { data: [], error }
  }
}

/**
 * Fetch all World Tree badges already claimed by a specific user.
 *
 * @param {string} userId  Authenticated user's UUID.
 * @returns {{ data: Array<{ id, user_id, badge_level, badge_key, badge_name, claimed_at }>, error }}
 *          `data` is an empty array when the user has no badges yet.
 */
export const getClaimedWorldTreeBadges = async (userId) => {
  try {
    if (!userId) return { data: [], error: null }

    const { data, error } = await supabase
      .from('world_tree_badges')
      .select('id, user_id, badge_level, badge_key, badge_name, claimed_at')
      .eq('user_id', userId)
      .order('badge_level', { ascending: true })

    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
    console.error('[getClaimedWorldTreeBadges]', error)
    return { data: [], error }
  }
}

/**
 * Attempt to claim a World Tree milestone badge — GLOBAL first-claim only.
 *
 * Calls the atomic `claim_world_tree_badge_atomic` stored procedure (see SQL
 * above), which uses a Postgres advisory lock so two users hitting the same
 * milestone at the same instant can't both "win" it.
 *
 * @param {string} userId      Authenticated user's UUID.
 * @param {number} badgeLevel  Milestone level (5 / 10 / 15 / 20 / 25).
 * @param {string} badgeName   Human-readable display name.
 * @param {string} badgeKey    snake_case key, e.g. "seed_pioneer".
 * @returns {{
 *   claimed: boolean,           // true = the CURRENT user won it
 *   alreadyClaimed: boolean,    // true = someone else got there first
 *   claimedBy: string|null,     // uuid of whoever actually claimed it
 *   data: object|null,
 *   error: object|null,
 * }}
 */
export const claimWorldTreeBadge = async (userId, badgeLevel, badgeName, badgeKey) => {
  try {
    if (!userId)     throw new Error('claimWorldTreeBadge: userId is required')
    if (!badgeLevel) throw new Error('claimWorldTreeBadge: badgeLevel is required')
    if (!badgeName)  throw new Error('claimWorldTreeBadge: badgeName is required')
    if (!badgeKey)   throw new Error('claimWorldTreeBadge: badgeKey is required')

    const { data, error } = await supabase.rpc('claim_world_tree_badge_atomic', {
      p_user_id:     userId,
      p_badge_level: badgeLevel,
      p_badge_name:  badgeName,
      p_badge_key:   badgeKey,
    })

    if (error) throw error

    const result = data // jsonb → JS object
    if (result.claimed) {
      return { claimed: true, alreadyClaimed: false, claimedBy: userId, data: result, error: null }
    } else {
      return { claimed: false, alreadyClaimed: true, claimedBy: result.already_claimed_by, data: result, error: null }
    }
  } catch (error) {
    console.error('[claimWorldTreeBadge]', error)
    return { claimed: false, alreadyClaimed: false, claimedBy: null, data: null, error }
  }
}

/**
 * Subscribe to real-time badge claim events.
 * Fires onClaim whenever ANY user claims a badge.
 *
 * @param {function} onClaim  Called with the new row payload:
 *                             { badge_level, badge_key, badge_name, user_id, claimed_at }
 * @returns {function}  Call the returned function to unsubscribe.
 *
 * Usage:
 *   const unsub = subscribeToWorldTreeBadges((row) => {
 *     setBadgeClaims(prev => new Map(prev).set(row.badge_level, row))
 *   })
 *   return () => unsub()
 */
export const subscribeToWorldTreeBadges = (onClaim) => {
  const channel = supabase
    .channel('world-tree-badge-claims')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'world_tree_badges' },
      (payload) => {
        if (payload.new) onClaim(payload.new)
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

/**
 * Subscribe to live World Tree growth updates.
 * Fires onGrowth whenever the world_tree row is updated.
 *
 * @param {function} onGrowth  Called with { growth, updated_at }.
 * @returns {function}  Unsubscribe.
 */
export const subscribeToWorldTree = (onGrowth) => {
  const channel = supabase
    .channel('world-tree-growth')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'world_tree' },
      (payload) => {
        if (payload.new) onGrowth(payload.new)
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

/**
 * Return the top N contributors, joined with their profile display name
 * and avatar.  The leaderboard is all-time (sum of contribution column).
 *
 * @param {number} [limit=10]
 * @returns {{ data: Array<{ rank, user_id, name, avatar, growth }>, error }}
 */
export const getTopContributors = async (limit = 10) => {
  try {
    // Aggregate contributions per user
    const { data: rows, error } = await supabase
      .from('tree_contributions')
      .select('user_id, contribution')

    if (error) throw error
    if (!rows || rows.length === 0) return { data: [], error: null }

    // Sum contributions per user in JS (Supabase JS v2 doesn't expose GROUP BY directly)
    const totals = {}
    rows.forEach(({ user_id, contribution }) => {
      totals[user_id] = (totals[user_id] || 0) + contribution
    })

    // Sort and take top N
    const sorted = Object.entries(totals)
      .map(([user_id, total]) => ({ user_id, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit)

    if (sorted.length === 0) return { data: [], error: null }

    // Fetch profiles for display names / avatars
    const ids = sorted.map(r => r.user_id)
    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', ids)

    if (profError) throw profError

    const profMap = Object.fromEntries((profiles || []).map(p => [p.id, p]))

    const contributors = sorted.map((r, i) => {
      const profile = profMap[r.user_id] || {}
      return {
        rank:    i + 1,
        user_id: r.user_id,
        name:    profile.display_name || profile.username || 'Anonymous',
        avatar:  profile.avatar_url   || '🌱',
        growth:  r.total,
      }
    })

    return { data: contributors, error: null }
  } catch (error) {
    console.error('[getTopContributors]', error)
    return { data: [], error }
  }
}
