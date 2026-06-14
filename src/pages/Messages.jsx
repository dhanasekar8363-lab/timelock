import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, getConversations, getMessages, sendMessage } from "../services/supabase";
import { playSound } from "../utils/sounds";
import homeBg from "../assets/backgrounds/message.jpg";
import "./Messages.css";

// ==================== UTILITY FUNCTIONS ====================

function tryParseCapsule(content) {
  if (!content) return null;
  try {
    const obj = JSON.parse(content);
    if (obj?.type === "capsule") return obj;
  } catch {}
  return null;
}

function getPreviewText(msg) {
  if (!msg) return "Start a conversation";
  const capsule = tryParseCapsule(msg);
  if (capsule) return `💌 ${capsule.title || "Time Capsule"}`;
  return msg;
}

function parseMessage(content) {
  const capsule = tryParseCapsule(content);
  if (capsule) return { isCapsule: true, ...capsule };
  return { isCapsule: false, text: content };
}

const getAvatarUrl = (name, url) => {
  return url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "User")}&background=7c5cff&color=fff`;
};

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

const ConversationItem = memo(({ conv, onSelect }) => {
  const handleClick = useCallback(() => onSelect(conv), [conv, onSelect]);

  const onAvatarError = useCallback((e) => {
    e.target.src = getAvatarUrl(conv.user?.display_name, null);
  }, [conv.user?.display_name]);

  // Simulate online status — replace with real presence if available
  const isOnline = conv.unread;

  return (
    <div className="conv-card" onClick={handleClick}>
      <div className="conv-avatar-wrap">
        <Avatar
          name={conv.user?.display_name}
          url={conv.user?.avatar_url}
          className="conv-avatar"
          onError={onAvatarError}
        />
        <span className={`online-dot ${isOnline ? "online" : "offline"}`} />
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
      {conv.unread && <span className="unread-badge">1</span>}
    </div>
  );
});
ConversationItem.displayName = "ConversationItem";

// ==================== MESSAGE BUBBLE ====================

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
  const [filteredConvs, setFilteredConvs] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const userRef = useRef(null);
  const subscriptionRef = useRef(null);

  const initialParams = useMemo(() => ({
    userId: searchParams.get("userId"),
    userName: searchParams.get("userName"),
  }), [searchParams]);

  // Filter conversations by search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredConvs(conversations);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredConvs(conversations.filter(c =>
        (c.user?.display_name || "").toLowerCase().includes(q) ||
        (c.last_message || "").toLowerCase().includes(q)
      ));
    }
  }, [searchQuery, conversations]);

  // ==================== LOAD CONVERSATIONS ====================

  const loadConversations = useCallback(async (uid) => {
    if (!uid) return;
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
      const { data: convs, error } = await getConversations(uid);
      if (error) throw error;

      const existing = convs?.find(c => c.user_id === targetUserId);
      if (existing) {
        await openConversation(existing, uid);
      } else {
        const tempConv = {
          user_id: targetUserId,
          user: { display_name: targetUserName || "User", avatar_url: null },
          last_message: "",
          last_message_at: null,
          unread: false,
        };
        await openConversation(tempConv, uid);
      }
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

        await loadConversations(data.user.id);

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

      if (data) {
        setMessages(prev =>
          prev.find(m => m.id === data.id) ? prev : [...prev, data]
        );
      }

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
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      return;
    }

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
          if (payload.new.sender_id !== selectedConv.user_id) return;

          // 🔊 Play notification sound for incoming messages
          playSound("notification");

          setMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });

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

      {/* Floating particles */}
      <div className="particles" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} className="particle" style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 6}s`,
            animationDuration: `${6 + Math.random() * 6}s`,
            width: `${2 + Math.random() * 3}px`,
            height: `${2 + Math.random() * 3}px`,
            opacity: 0.3 + Math.random() * 0.4,
          }} />
        ))}
      </div>

      {!selectedConv ? (
        // ==================== CONVERSATIONS LIST VIEW ====================
        <div className="conv-panel">
          {/* Hero header */}
          <div className="msg-hero">
            <h1 className="msg-hero-title">Messages</h1>
            <p className="msg-hero-subtitle">Your conversations and connections</p>

            {/* Search row */}
            <div className="search-row">
              <div className="search-wrap">
                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  className="search-input"
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <button className="filter-btn" aria-label="Filter conversations">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Conversation list */}
          {loading ? (
            <SkeletonConv />
          ) : filteredConvs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>{searchQuery ? "No results found" : "No conversations yet"}</p>
              <span className="hint">{searchQuery ? "Try a different name" : "Find someone to message"}</span>
              {!searchQuery && (
                <button className="find-btn" onClick={() => navigate("/search")}>
                  Find People
                </button>
              )}
            </div>
          ) : (
            <div className="conv-list">
              {filteredConvs.map(conv => (
                <ConversationItem
                  key={conv.user_id}
                  conv={conv}
                  onSelect={handleSelectConv}
                />
              ))}
            </div>
          )}

          {/* Floating compose button */}
          <button
            className="compose-fab"
            onClick={() => navigate("/search")}
            aria-label="New conversation"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
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
            <div className="chat-avatar-wrap">
              <Avatar
                name={selectedConv.user?.display_name}
                url={selectedConv.user?.avatar_url}
                className="chat-avatar"
                onError={(e) => {
                  e.target.src = getAvatarUrl(selectedConv.user?.display_name, null);
                }}
              />
              <span className="chat-online-dot" />
            </div>
            <div className="chat-user-meta">
              <span className="chat-name">
                {selectedConv.user?.display_name || "User"}
              </span>
              <span className="chat-status">Active now</span>
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
                    className="chat-avatar-lg-img"
                    onError={(e) => {
                      e.target.src = getAvatarUrl(selectedConv.user?.display_name, null);
                    }}
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
