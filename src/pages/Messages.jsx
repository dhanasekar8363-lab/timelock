import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, getConversations, getMessages, sendMessage } from "../services/supabase";
import "./Messages.css";

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

function avatarUrl(name, url) {
  return url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "User")}&background=7c5cff&color=fff`;
}

// Preview text for conversation list — detect capsule JSON
function getPreviewText(msg) {
  if (!msg) return "Start a conversation";
  try {
    const obj = JSON.parse(msg);
    if (obj?.type === "capsule") return `💌 ${obj.title || "Time Capsule"}`;
  } catch {}
  return msg;
}

// Parse message — detect capsule JSON
function parseMessage(content) {
  try {
    const obj = JSON.parse(content);
    if (obj?.type === "capsule") return { isCapsule: true, ...obj };
  } catch {}
  return { isCapsule: false, text: content };
}

// Capsule bubble inside chat
function CapsuleBubble({ data, navigate }) {
  const coverEmojis = { love: "💌", birthday: "🎂", future: "🚀", graduation: "🎓" };
  const emoji = coverEmojis[data.cover_type] || "📦";
  return (
    <div className="capsule-bubble" onClick={() => navigate(`/capsule/${data.slug}`)}>
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
}

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
  const userRef = useRef(null); // stable ref so callbacks always have current user

  const initialUserId = searchParams.get("userId");
  const initialUserName = searchParams.get("userName");

  // Load conversations — always fresh from DB
  const loadConversations = useCallback(async (uid, targetUserId, targetUserName) => {
    if (!uid) {
      console.warn("loadConversations called with no uid — skipping");
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await getConversations(uid);
      console.log("getConversations data:", data, "error:", error);
      const convs = data || [];
      setConversations(convs);

      if (targetUserId) {
        const existing = convs.find(c => c.user_id === targetUserId);
        if (existing) {
          openConversation(existing, uid);
        } else {
          const tempConv = {
            user_id: targetUserId,
            user: { display_name: targetUserName || "User", avatar_url: null },
            last_message: "",
            last_message_at: null,
            unread: false,
          };
          setConversations(prev => [tempConv, ...prev]);
          openConversation(tempConv, uid);
        }
        setSearchParams({});
      }
    } catch (err) {
      console.error("Error loading conversations:", err);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate("/login"); return; }
      setUser(data.user);
      userRef.current = data.user;
      await loadConversations(data.user.id, initialUserId, initialUserName);
    };
    checkAuth();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const openConversation = async (conv, uid) => {
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
  };

  const handleSelectConv = (conv) => {
    const uid = userRef.current?.id;
    if (uid) openConversation(conv, uid);
  };

  const handleBack = () => {
    setSelectedConv(null);
    setMessages([]);
    const uid = userRef.current?.id;
    if (uid) loadConversations(uid, null, null);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConv || !userRef.current) return;
    const msgText = newMessage.trim();
    setNewMessage("");
    setSending(true);
    try {
      const { data, error } = await sendMessage(userRef.current.id, selectedConv.user_id, msgText);
      if (error) throw error;
      if (data) setMessages(prev => prev.find(m => m.id === data.id) ? prev : [...prev, data]);
      const now = new Date().toISOString();
      setConversations(prev => {
        const exists = prev.find(c => c.user_id === selectedConv.user_id);
        if (exists) return prev.map(c => c.user_id === selectedConv.user_id ? { ...c, last_message: msgText, last_message_at: now } : c);
        return [{ ...selectedConv, last_message: msgText, last_message_at: now }, ...prev];
      });
    } catch (err) {
      console.error("Error sending message:", err);
      setNewMessage(msgText);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Real-time subscription
  useEffect(() => {
    if (!user || !selectedConv) return;
    const channel = supabase
      .channel(`msg-${user.id}-${selectedConv.user_id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `recipient_id=eq.${user.id}`
      }, (payload) => {
        if (payload.new.sender_id !== selectedConv.user_id) return;
        setMessages(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user, selectedConv]);

  if (!user) return null;

  return (
    <div className="messages-page">
      {!selectedConv ? (
        <div className="conv-panel">
          <div className="msg-header">
            <h1>Messages</h1>
          </div>

          {loading ? <SkeletonConv /> : conversations.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>No conversations yet</p>
              <span className="hint">Find someone to message</span>
              <button className="find-btn" onClick={() => navigate("/search")}>Find People</button>
            </div>
          ) : (
            <div className="conv-list">
              {conversations.map(conv => (
                <div key={conv.user_id} className="conv-item" onClick={() => handleSelectConv(conv)}>
                  <div className="conv-avatar-wrap">
                    <img
                      src={avatarUrl(conv.user?.display_name, conv.user?.avatar_url)}
                      alt={conv.user?.display_name}
                      className="conv-avatar"
                      onError={e => { e.target.src = avatarUrl(conv.user?.display_name, null); }}
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
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="chat-panel">
          <div className="chat-header">
            <button className="back-btn" onClick={handleBack}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <img
              src={avatarUrl(selectedConv.user?.display_name, selectedConv.user?.avatar_url)}
              alt={selectedConv.user?.display_name}
              className="chat-avatar"
              onError={e => { e.target.src = avatarUrl(selectedConv.user?.display_name, null); }}
            />
            <div className="chat-user-meta">
              <span className="chat-name">{selectedConv.user?.display_name || "User"}</span>
            </div>
            <button className="profile-btn" onClick={() => navigate(`/profile/${selectedConv.user_id}`)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </button>
          </div>

          <div className="msg-list">
            {messagesLoading ? (
              <div className="msg-loading">
                <div className="dots"><span /><span /><span /></div>
              </div>
            ) : messages.length === 0 ? (
              <div className="empty-chat">
                <div className="chat-avatar-lg">
                  <img src={avatarUrl(selectedConv.user?.display_name, selectedConv.user?.avatar_url)} alt="" />
                </div>
                <p>{selectedConv.user?.display_name || "User"}</p>
                <span>Say hello 👋</span>
              </div>
            ) : (
              messages.map(msg => {
                const parsed = parseMessage(msg.content);
                const isMine = msg.sender_id === user.id;
                return (
                  <div key={msg.id} className={`msg ${isMine ? "sent" : "received"}`}>
                    {parsed.isCapsule ? (
                      <div className={`capsule-msg-wrap ${isMine ? "sent" : "received"}`}>
                        <CapsuleBubble data={parsed} navigate={navigate} />
                        <span className="msg-time cap-time">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ) : (
                      <div className="bubble">
                        <p>{msg.content}</p>
                        <span className="msg-time">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-row">
            {/* Capsule send button */}
            <button
              type="button"
              className="capsule-send-btn"
              onClick={() => navigate(`/create?shareWith=${selectedConv.user_id}&shareWithName=${encodeURIComponent(selectedConv.user?.display_name || "User")}`)}
              disabled={sending}
              title="Send a capsule"
            >
              {/* Capsule icon */}
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
                onChange={e => setNewMessage(e.target.value)}
                disabled={sending}
                autoComplete="off"
              />
              <button type="submit" className="send-btn" disabled={!newMessage.trim() || sending}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
