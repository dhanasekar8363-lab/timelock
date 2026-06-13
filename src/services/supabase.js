import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'

const supabaseUrl = 'https://yaezgmlmjkmqvifonhty.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhZXpnbWxtamttcXZpZm9uaHR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTE0ODAsImV4cCI6MjA5NjY2NzQ4MH0.zmojrG4HT3l24RX65YzEVvg5Vut6obIVcohml80lid4'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // PKCE is required for mobile OAuth — implicit flow doesn't work with deep links
    flowType: 'pkce',
    // On native Capacitor the redirect URL is a custom scheme, not a real page,
    // so Supabase must NOT try to auto-detect the session from the URL on load.
    // We handle session restoration manually in AuthContext via appUrlOpen.
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

// A v4-style UUID, e.g. "3fa85f64-5717-4562-b3fc-2c963f66afa6"
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

  // 1. Prefer receiver_name — must exist and must not be a raw UUID
  if (capsule.receiver_name && !isUUID(capsule.receiver_name)) {
    return capsule.receiver_name
  }

  // 2. Fall back to receiver_email ONLY if it is a real email address
  //    (never use it when it holds a UUID or a plain display name)
  if (capsule.receiver_email && isEmail(capsule.receiver_email)) {
    return capsule.receiver_email
  }

  // 3. Generic fallback — never a capsule title or UUID
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

// ==================== FOLLOW FUNCTIONS ====================

export const followUser = async (followerId, followingId) => {
  try {
    const { data, error } = await supabase
      .from('follows')
      .insert([{ follower_id: followerId, following_id: followingId, created_at: new Date().toISOString() }])
      .select()
    if (error) throw error
    // Notify the user being followed (fire-and-forget)
    createNotification(followingId, 'New Follower', 'Someone started following you')
    return { data, error: null }
  } catch (error) {
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
    return { isFollowing: false, error }
  }
}

export const getFollowers = async (userId) => {
  try {
    // Step 1: get all follower IDs for this user
    const { data: follows, error } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!follows || follows.length === 0) return { data: [], error: null }

    const ids = follows.map(f => f.follower_id)

    // Step 2: fetch profiles — use maybeSingle-style .in() which tolerates missing rows
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio')
      .in('id', ids)

    if (profileError) throw profileError

    // Step 3: preserve follow-order and filter out any ids with no profile row
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
    // Step 1: get all following IDs for this user
    const { data: follows, error } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!follows || follows.length === 0) return { data: [], error: null }

    const ids = follows.map(f => f.following_id)

    // Step 2: fetch profiles — tolerates missing rows (e.g. deleted accounts)
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio')
      .in('id', ids)

    if (profileError) throw profileError

    // Step 3: preserve follow-order and filter out any ids with no profile row
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
    return { data: new Set((data || []).map(r => r.following_id)), error: null }
  } catch (error) {
    console.error('getFollowingIds error:', error)
    return { data: new Set(), error }
  }
}

// ==================== MESSAGE FUNCTIONS ====================

/**
 * Send a message between two users.
 *
 * For capsule shares, pass messageType = 'capsule' and capsuleData = { id, title, slug, ... }.
 * The row's `content` column will hold the JSON payload so the chat UI can render
 * a capsule card instead of plain text.
 *
 * IMPORTANT: messageType must be 'capsule' (not 'text') when sharing a capsule.
 * Passing 'text' with capsuleData will lose the structured data.
 */
export const sendMessage = async (senderId, recipientId, content, messageType = 'text', capsuleData = null) => {
  try {
    const row = {
      sender_id: senderId,
      recipient_id: recipientId,
      // Default to whatever plain-text content was passed
      content: content || '',
      created_at: new Date().toISOString(),
      read_at: null,
    }

    // FIX: Only overwrite content with JSON when messageType is explicitly 'capsule'
    // AND capsuleData is provided. This prevents blank messages in the chat log.
    if (messageType === 'capsule' && capsuleData) {
      row.content = JSON.stringify({ type: 'capsule', ...capsuleData })
    }

    const { data, error } = await supabase.from('messages').insert([row]).select()
    if (error) throw error
    // Notify recipient (fire-and-forget)
    createNotification(recipientId, 'New Message', 'You have a new message')
    return { data: data?.[0], error: null }
  } catch (error) {
    console.error('Error sending message:', error)
    return { data: null, error }
  }
}

// Robust getConversations — no FK joins, avoids RLS issues on `profiles`
export const getConversations = async (userId) => {
  try {
    if (!userId) return { data: [], error: null }

    // Step 1: Fetch all messages involving this user, no joins
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, sender_id, recipient_id, content, created_at, read_at')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!messages || messages.length === 0) return { data: [], error: null }

    // Step 2: Collect unique "other user" IDs from those messages
    const otherIds = new Set()
    messages.forEach(msg => {
      const isMe = msg.sender_id === userId
      const otherId = isMe ? msg.recipient_id : msg.sender_id
      if (otherId) otherIds.add(otherId)
    })

    // Step 3: Fetch profiles for those IDs in a separate query
    let profilesById = {}
    if (otherIds.size > 0) {
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', Array.from(otherIds))

      if (profErr) {
        console.error('Error fetching profiles for conversations:', profErr)
      } else if (profiles) {
        profilesById = profiles.reduce((acc, p) => {
          acc[p.id] = p
          return acc
        }, {})
      }
    }

    // Step 4: Group messages by conversation partner, attach profile data
    const convMap = new Map()
    messages.forEach(msg => {
      const isMe = msg.sender_id === userId
      const otherId = isMe ? msg.recipient_id : msg.sender_id
      const otherUser = profilesById[otherId] || { id: otherId, display_name: 'User', avatar_url: null }

      if (!convMap.has(otherId)) {
        // FIX: For capsule messages, show a friendlier preview instead of raw JSON
        let preview = msg.content || ''
        try {
          const parsed = JSON.parse(preview)
          if (parsed?.type === 'capsule') {
            preview = `📦 Time Capsule: ${parsed.title || 'Untitled'}`
          }
        } catch (_) {
          // not JSON — use as-is
        }

        convMap.set(otherId, {
          user_id: otherId,
          user: otherUser,
          last_message: preview,
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
        await supabase.from('messages').update({ read_at: new Date().toISOString() })
          .in('id', unread.map(m => m.id))
      }
    }

    return { data: data || [], error: null }
  } catch (error) {
    console.error('Error getting messages:', error)
    return { data: [], error }
  }
}

export const markMessageAsRead = async (messageId) => {
  try {
    const { error } = await supabase.from('messages')
      .update({ read_at: new Date().toISOString() }).eq('id', messageId)
    if (error) throw error
    return { error: null }
  } catch (error) {
    return { error }
  }
}

// Get capsules CREATED BY this user (i.e. they are the sender/owner).
// Used for things like "share a capsule you made" pickers.
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

// Get capsules SHARED WITH this user (i.e. they are the recipient).
// Used to populate the "Received" tab.
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
    const { data, error } = await supabase.from('capsule_shares')
      .insert([{ capsule_id: capsuleId, sender_id: senderId, recipient_id: recipientId, message, created_at: new Date().toISOString() }])
      .select()
    if (error) throw error
    // Notify recipient (fire-and-forget)
    createNotification(recipientId, 'Capsule Shared', 'A time capsule has been shared with you')
    return { data: data?.[0], error: null }
  } catch (error) {
    return { data: null, error }
  }
}

export const getSharedCapsules = async (userId) => {
  try {
    const { data, error } = await supabase.from('capsule_shares')
      .select('*, capsule:capsule_id(*), sender:sender_id(id, display_name, avatar_url)')
      .eq('recipient_id', userId).order('created_at', { ascending: false })
    if (error) throw error
    return { data: data || [], error: null }
  } catch (error) {
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
    return { data: null, error }
  }
}
