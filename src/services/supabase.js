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

// ==================== FOLLOW FUNCTIONS ====================

export const followUser = async (followerId, followingId) => {
  try {
    const { data, error } = await supabase
      .from('follows')
      .insert([{ follower_id: followerId, following_id: followingId, created_at: new Date().toISOString() }])
      .select()
    if (error) throw error
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
    const { data, error } = await supabase.from('follows')
      .select('follower:follower_id(id, display_name, avatar_url, bio)').eq('following_id', userId)
    if (error) throw error
    return { data: data?.map(f => f.follower) || [], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

export const getFollowing = async (userId) => {
  try {
    const { data, error } = await supabase.from('follows')
      .select('following:following_id(id, display_name, avatar_url, bio)').eq('follower_id', userId)
    if (error) throw error
    return { data: data?.map(f => f.following) || [], error: null }
  } catch (error) {
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

// ==================== MESSAGE FUNCTIONS ====================

export const sendMessage = async (senderId, recipientId, content, messageType = 'text', capsuleData = null) => {
  try {
    const row = {
      sender_id: senderId,
      recipient_id: recipientId,
      content: content,
      created_at: new Date().toISOString(),
      read_at: null,
    }
    // Store capsule metadata as JSON in content if type is capsule
    if (messageType === 'capsule' && capsuleData) {
      row.content = JSON.stringify({ type: 'capsule', ...capsuleData })
    }
    const { data, error } = await supabase.from('messages').insert([row]).select()
    if (error) throw error
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
        convMap.set(otherId, {
          user_id: otherId,
          user: otherUser,
          last_message: msg.content,
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

// Get user's own capsules for sharing
export const getMyCapsules = async (userId) => {
  try {
    // Try with user_id field first
    const { data, error } = await supabase
      .from('capsules')
      .select('id, title, slug, cover_type, unlock_date, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error && error.code !== 'PGRST116') {
      // If no user_id column, fall back to sender_name match via profiles
      const { data: profile } = await supabase
        .from('profiles').select('display_name').eq('id', userId).single()
      if (profile) {
        const { data: caps, error: e2 } = await supabase
          .from('capsules')
          .select('id, title, slug, cover_type, unlock_date, created_at')
          .eq('sender_name', profile.display_name)
          .order('created_at', { ascending: false })
          .limit(20)
        if (e2) throw e2
        return { data: caps || [], error: null }
      }
    }
    return { data: data || [], error: null }
  } catch (error) {
    console.error('Error getting capsules:', error)
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
