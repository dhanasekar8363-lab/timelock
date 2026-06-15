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
      .select('id, username, display_name, avatar_url, email')
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
