import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, getConversations, getMessages, sendMessage } from "../services/supabase";
import homeBg from "../assets/backgrounds/main-bg.jpg";
import "./Messages.css";

// ==================== UTILITY FUNCTIONS ====================

/**
 * Parse capsule JSON from message content.
 * Returns { type: 'capsule', ...parsed } or null
 */
function tryParseCapsule(content) {
  if (!content) return null;
  try {
    const obj = JSON.parse(content);
    if (obj?.type === "capsule") return obj;
  } catch {}
  return null;
}

/**
 * Get preview text for conversation list — handles capsule detection
 */
function getPreviewText(msg) {
  if (!msg) return "Start a conversation";
  const capsule = tryParseCapsule(msg);
  if (capsule) return `💌 ${capsule.title || "Time Capsule"}`;
  return msg;
}

/**
 * Parse message content — detects capsule JSON
 */
function parseMessage(content) {
  const capsule = tryParseCapsule(content);
  if (capsule) return { isCapsule: true, ...capsule };
  return { isCapsule: false, text: content };
}

/**
 * Generate avatar URL with fallback
 */
const getAvatarUrl = (name, url) => {
  return url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "User")}&background=7c5cff&color=fff`;
};

/**
 * Memoized avatar component
 */
const Avatar = memo(({ name, url, className, onError }) => (
  <img
    src={getAvatarUrl(name, url)}
    alt={name}
    className={className}
    onError={onError}
  />
));
Avatar.displayName = "Avatar";

// ==================== LOADING SKELETON ====================

function SkeletonConv() {
  return (
    <div className="skeleton-list">
      {[1, 2, 3].map(i => (
        <div className="skeleton-conv" key={i}>
          <div className="sk-avatar" />
          <div className="sk-lines">
            <div className="sk-line" />
            <div className="sk-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ==================== CAPSULE BUBBLE ====================

/**
 * Capsule message bubble — memoized for performance
 */
const CapsuleBubble = memo(({ data, navigate }) => {
  const coverEmojis = { love: "💌", birthday: "🎂", future: "🚀", graduation: "🎓" };
  const emoji = coverEmojis[data.cover_type] || "📦";
  
  const handleClick = useCallback(() => {
    navigate(`/capsule/${data.slug}`);
  }, [navigate, data.slug]);

  return (
    <div className="capsule-bubble" onClick={handleClick}>
      <div className="cap-bubble-icon">{emoji}</div>
      <div className="cap-bubble-info">
        <span className="cap-bubble-label">Time Capsule</span>
        <span className="cap-bubble-title">{data.title || "Untitled Capsule"}</span>
        {data.unlock_date && (
          <span className="cap-bubble-date">
            Unlocks {new Date(data.unlock_date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
      </div>
      <svg className="cap-bubble-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  );
});
CapsuleBubble.displayName = "CapsuleBubble";

// ==================== CONVERSATION ITEM ====================

/**
 * Single conversation list item — memoized for performance
 */
const ConversationItem = memo(({ conv, onSelect }) => {
  const handleClick = useCallback(() => onSelect(conv), [conv, onSelect]);
  
  const onAvatarError = useCallback((e) => {
    e.target.src = getAvatarUrl(conv.user?.display_name, null);
  }, [conv.user?.display_name]);

  return (
    <div className="conv-item" onClick={handleClick}>
      <div className="conv-avatar-wrap">
        <Avatar
          name={conv.user?.display_name}
          url={conv.user?.avatar_url}
          className="conv-avatar"
          onError={onAvatarError}
        />
        {conv.unread && <span className="unread-dot" />}
      </div>
      <div className="conv-info">
        <div className="conv-name-row">
          <span className="conv-name">{conv.user?.display_name || "User"}</span>
          {conv.last_message_at && (
            <span className="conv-time">
              {new Date(conv.last_message_at).toLocaleDateString([], { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
        <p className="conv-preview">{getPreviewText(conv.last_message)}</p>
      </div>
    </div>
  );
});
ConversationItem.displayName = "ConversationItem";

// ==================== MESSAGE BUBBLE ====================

/**
 * Single message bubble — memoized for performance
 */
const MessageBubble = memo(({ msg, user, navigate }) => {
  const parsed = parseMessage(msg.content);
  const isMine = msg.sender_id === user.id;
  const timeStr = useMemo(
    () => new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [msg.created_at]
  );

  return (
    <div className={`msg ${isMine ? "sent" : "received"}`}>
      {parsed.isCapsule ? (
        <div className={`capsule-msg-wrap ${isMine ? "sent" : "received"}`}>
          <CapsuleBubble data={parsed} navigate={navigate} />
          <span className="msg-time cap-time">{timeStr}</span>
        </div>
      ) : (
        <div className="bubble">
          <p>{msg.content}</p>
          <span className="msg-time">{timeStr}</span>
        </div>
      )}
    </div>
  );
});
MessageBubble.displayName = "MessageBubble";

// ==================== MAIN COMPONENT ====================

export default function Messages() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const userRef = useRef(null);
  const subscriptionRef = useRef(null);

  // Get initial params once
  const initialParams = useMemo(() => ({
    userId: searchParams.get("userId"),
    userName: searchParams.get("userName"),
  }), [searchParams]);

  // ==================== LOAD CONVERSATIONS ====================

  const loadConversations = useCallback(async (uid) => {
    if (!uid) {
      console.warn("loadConversations called with no uid");
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await getConversations(uid);
      if (error) throw error;
      setConversations(data || []);
    } catch (err) {
      console.error("Error loading conversations:", err);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== OPEN CONVERSATION ====================
  // Declared before handleInitialDeepLink so it can be referenced in its deps.

  const openConversation = useCallback(async (conv, uid) => {
    setSelectedConv(conv);
    setMessages([]);
    try {
      setMessagesLoading(true);
      const { data } = await getMessages(uid, conv.user_id);
      setMessages(data || []);
    } catch (err) {
      console.error("Error loading messages:", err);
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // ==================== HANDLE INITIAL DEEP LINK ====================

  const handleInitialDeepLink = useCallback(async (uid, targetUserId, targetUserName) => {
    if (!targetUserId) return;

    try {
      // Load fresh conversations
      const { data: convs, error } = await getConversations(uid);
      if (error) throw error;

      const existing = convs?.find(c => c.user_id === targetUserId);
      if (existing) {
        await openConversation(existing, uid);
      } else {
        // Create temporary conversation
        const tempConv = {
          user_id: targetUserId,
          user: { display_name: targetUserName || "User", avatar_url: null },
          last_message: "",
          last_message_at: null,
          unread: false,
        };
        await openConversation(tempConv, uid);
      }
      // Clear params after handling
      setSearchParams({});
    } catch (err) {
      console.error("Error handling deep link:", err);
    }
  }, [openConversation, setSearchParams]);

  // ==================== AUTH CHECK & INIT ====================

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          navigate("/login");
          return;
        }
        setUser(data.user);
        userRef.current = data.user;

        // Load conversations
        await loadConversations(data.user.id);

        // Handle deep link if present
        if (initialParams.userId) {
          await handleInitialDeepLink(data.user.id, initialParams.userId, initialParams.userName);
        }
      } catch (err) {
        console.error("Auth check error:", err);
        navigate("/login");
      }
    };

    checkAuth();
  }, [navigate, loadConversations, initialParams, handleInitialDeepLink]);

  // ==================== SEND MESSAGE ====================

  const handleSend = useCallback(async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConv || !userRef.current) return;

    const msgText = newMessage.trim();
    setNewMessage("");
    setSending(true);

    try {
      const { data, error } = await sendMessage(userRef.current.id, selectedConv.user_id, msgText);
      if (error) throw error;

      // Add message to list if not already there
      if (data) {
        setMessages(prev =>
          prev.find(m => m.id === data.id) ? prev : [...prev, data]
        );
      }

      // Update conversation list
      const now = new Date().toISOString();
      setConversations(prev => {
        const exists = prev.find(c => c.user_id === selectedConv.user_id);
        if (exists) {
          return prev.map(c =>
            c.user_id === selectedConv.user_id
              ? { ...c, last_message: msgText, last_message_at: now }
              : c
          );
        }
        return [{ ...selectedConv, last_message: msgText, last_message_at: now }, ...prev];
      });
    } catch (err) {
      console.error("Error sending message:", err);
      // Restore message on error
      setNewMessage(msgText);
    } finally {
      setSending(false);
    }
  }, [selectedConv, newMessage]);

  // ==================== AUTO SCROLL ====================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ==================== REAL-TIME SUBSCRIPTIONS ====================

  useEffect(() => {
    if (!user || !selectedConv) {
      // Clean up existing subscription
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      return;
    }

    // Subscribe to new messages
    const channel = supabase
      .channel(`msg-${user.id}-${selectedConv.user_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          // Only add if it's from the current conversation partner
          if (payload.new.sender_id !== selectedConv.user_id) return;
          
          setMessages(prev => {
            // Prevent duplicates
            if (prev.find(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });

          // Update conversation list with new message
          setConversations(prev =>
            prev.map(c =>
              c.user_id === selectedConv.user_id
                ? {
                    ...c,
                    last_message: getPreviewText(payload.new.content),
                    last_message_at: payload.new.created_at,
                    unread: true,
                  }
                : c
            )
          );
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [user, selectedConv]);

  // ==================== UI HANDLERS ====================

  const handleSelectConv = useCallback((conv) => {
    const uid = userRef.current?.id;
    if (uid) openConversation(conv, uid);
  }, [openConversation]);

  const handleBack = useCallback(() => {
    setSelectedConv(null);
    setMessages([]);
  }, []);

  const handleSendCapsule = useCallback(() => {
    if (!selectedConv) return;
    navigate(
      `/create?shareWith=${selectedConv.user_id}&shareWithName=${encodeURIComponent(
        selectedConv.user?.display_name || "User"
      )}`
    );
  }, [navigate, selectedConv]);

  const handleViewProfile = useCallback(() => {
    if (!selectedConv) return;
    navigate(`/profile/${selectedConv.user_id}`);
  }, [navigate, selectedConv]);

  // ==================== RENDER ====================

  if (!user) return null;

  return (
    <div className="messages-page" style={{ backgroundImage: `url(${homeBg})` }}>
      {/* Overlay gradient */}
      <div className="messages-overlay" />

      {!selectedConv ? (
        // ==================== CONVERSATIONS LIST VIEW ====================
        <div className="conv-panel">
          <div className="msg-header">
            <h1>Messages</h1>
          </div>

          {loading ? (
            <SkeletonConv />
          ) : conversations.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>No conversations yet</p>
              <span className="hint">Find someone to message</span>
              <button className="find-btn" onClick={() => navigate("/search")}>
                Find People
              </button>
            </div>
          ) : (
            <div className="conv-list">
              {conversations.map(conv => (
                <ConversationItem
                  key={conv.user_id}
                  conv={conv}
                  onSelect={handleSelectConv}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        // ==================== CHAT VIEW ====================
        <div className="chat-panel">
          {/* Chat Header */}
          <div className="chat-header">
            <button className="back-btn" onClick={handleBack}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <Avatar
              name={selectedConv.user?.display_name}
              url={selectedConv.user?.avatar_url}
              className="chat-avatar"
              onError={(e) => {
                e.target.src = getAvatarUrl(selectedConv.user?.display_name, null);
              }}
            />
            <div className="chat-user-meta">
              <span className="chat-name">
                {selectedConv.user?.display_name || "User"}
              </span>
            </div>
            <button className="profile-btn" onClick={handleViewProfile}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </button>
          </div>

          {/* Messages List */}
          <div className="msg-list">
            {messagesLoading ? (
              <div className="msg-loading">
                <div className="dots">
                  <span /><span /><span />
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="empty-chat">
                <div className="chat-avatar-lg">
                  <Avatar
                    name={selectedConv.user?.display_name}
                    url={selectedConv.user?.avatar_url}
                  />
                </div>
                <p>{selectedConv.user?.display_name || "User"}</p>
                <span>Say hello 👋</span>
              </div>
            ) : (
              messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  user={user}
                  navigate={navigate}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Row */}
          <div className="input-row">
            {/* Capsule send button */}
            <button
              type="button"
              className="capsule-send-btn"
              onClick={handleSendCapsule}
              disabled={sending}
              title="Send a capsule"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="7" y="2" width="10" height="20" rx="5" ry="5"/>
                <line x1="7" y1="12" x2="17" y2="12"/>
                <circle cx="12" cy="7" r="1.2" fill="currentColor" stroke="none"/>
              </svg>
            </button>

            {/* Message form */}
            <form className="msg-form" onSubmit={handleSend}>
              <input
                className="msg-input"
                type="text"
                placeholder="Message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={sending}
                autoComplete="off"
              />
              <button
                type="submit"
                className="send-btn"
                disabled={!newMessage.trim() || sending}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
